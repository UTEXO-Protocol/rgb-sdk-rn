package com.rgbsdkrn

import java.util.Collections
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicInteger

/** Records each call; a call blocks while a gate is set for its key ("operation:handle"). */
private class FakeStore {
  val events: MutableList<String> = Collections.synchronizedList(mutableListOf())
  private val gates = ConcurrentHashMap<String, CountDownLatch>()
  private val started = ConcurrentHashMap<String, CountDownLatch>()
  private val closed = ConcurrentHashMap.newKeySet<String>()
  private val active = ConcurrentHashMap<String, AtomicInteger>()
  private val opened = AtomicInteger()
  @Volatile var overlapped = false

  fun gate(key: String) { gates[key] = CountDownLatch(1); started[key] = CountDownLatch(1) }
  fun awaitStart(key: String) = started.getValue(key).await(5, TimeUnit.SECONDS)
  fun open(key: String) = gates.remove(key)!!.countDown()
  private fun pass(key: String) {
    val gate = gates[key] ?: return
    started.getValue(key).countDown()
    gate.await()
  }
  fun execute(operation: String, params: Map<String, Any?>): Any? {
    if (operation == "openWallet") {
      pass("open:${params["dataDir"]}")
      val handle = "h${opened.incrementAndGet()}"
      events.add("open:$handle")
      return handle
    }
    val handle = params["handle"] as String
    if (handle in closed) throw IllegalStateException("closed")
    val count = active.computeIfAbsent(handle) { AtomicInteger() }
    if (count.incrementAndGet() > 1) overlapped = true
    try {
      pass("$operation:$handle")
    } finally {
      count.decrementAndGet()
    }
    events.add("$operation:$handle")
    if (operation == "closeWallet") closed.add(handle)
    return null
  }
}

private class Rejected(val code: String) : Exception(code)

private class Call : RgbLibDispatcher.Reply {
  val future = CompletableFuture<Any?>()
  override fun resolve(value: Any?) { future.complete(value) }
  override fun reject(code: String, message: String?) { future.completeExceptionally(Rejected(code)) }
  fun result(): Any? = future.get(5, TimeUnit.SECONDS)
  fun code(): String? = try { result(); null } catch (e: java.util.concurrent.ExecutionException) { (e.cause as Rejected).code }
  fun runningAfterShortWait(): Boolean = try { future.get(200, TimeUnit.MILLISECONDS); false } catch (_: TimeoutException) { true } catch (_: Exception) { false }
}

/** RgbLibModule's dispatch, driven with a gated fake store. No React Native or UniFFI needed. */
fun rgbLibDispatcherChecks() {
  val store = FakeStore()
  val dispatcher = RgbLibDispatcher(store::execute, { error ->
    (if (error is IllegalStateException) "WALLET_NOT_INITIALIZED" else "NATIVE_BRIDGE_ERROR") to error.message
  })
  fun call(operation: String, params: Map<String, Any?>) = Call().also { dispatcher.invoke(operation, params, it) }
  val h1 = call("openWallet", mapOf("dataDir" to "/a")).result() as String
  val h2 = call("openWallet", mapOf("dataDir" to "/b")).result() as String

  // A blocked call on one handle leaves the other handle free.
  store.gate("listAssets:$h1")
  val blocked = call("listAssets", mapOf("handle" to h1))
  check(store.awaitStart("listAssets:$h1")) { "Gated call did not start" }
  val queued = call("getAddress", mapOf("handle" to h1))
  check(call("getAddress", mapOf("handle" to h2)).code() == null) { "A blocked handle stalled another handle" }
  // The same handle is serialized: the queued call waits for the blocked one.
  check(queued.runningAfterShortWait()) { "A handle ran two calls at once" }
  store.open("listAssets:$h1")
  blocked.result(); queued.result()
  check(store.events.indexOf("listAssets:$h1") < store.events.indexOf("getAddress:$h1")) { "Calls ran out of order" }

  // Close releases the handle; later calls for it fail as closed instead of hanging.
  check(call("closeWallet", mapOf("handle" to h2)).code() == null) { "closeWallet failed" }
  check(call("getAddress", mapOf("handle" to h2)).code() == "WALLET_NOT_INITIALIZED") { "A closed handle accepted a call" }

  // invalidate drains calls already queued for a handle, then closes it on that executor.
  store.gate("sync:$h1")
  val inflight = call("sync", mapOf("handle" to h1))
  check(store.awaitStart("sync:$h1")) { "Gated sync did not start" }
  val pending = call("listTransfers", mapOf("handle" to h1))
  store.gate("open:/c")
  val opening = call("openWallet", mapOf("dataDir" to "/c"))
  check(store.awaitStart("open:/c")) { "Gated open did not start" }
  dispatcher.invalidate()
  check(call("getAddress", mapOf("handle" to h1)).code() == "WALLET_DISPOSED") { "invalidate accepted a new call" }
  store.open("sync:$h1")
  store.open("open:/c")
  check(inflight.code() == null) { "In-flight call was dropped by invalidate" }
  check(pending.code() == null) { "Queued call was dropped by invalidate" }
  check(opening.code() == "WALLET_DISPOSED") { "A wallet opened during invalidate was adopted" }
  val deadline = System.currentTimeMillis() + 5000
  while (System.currentTimeMillis() < deadline &&
    !(store.events.contains("closeWallet:$h1") && store.events.contains("closeWallet:h3"))) Thread.sleep(50)
  val closed = store.events.indexOf("closeWallet:$h1")
  check(closed >= 0) { "invalidate did not close an open wallet" }
  check(closed > store.events.indexOf("listTransfers:$h1")) { "invalidate closed before queued calls drained" }
  check("closeWallet:h3" in store.events) { "A wallet opened during invalidate was leaked" }
  check(!store.overlapped) { "Calls on one handle overlapped" }
  println("RgbLibDispatcher: per-handle isolation, serialization, close release and invalidate drain passed")
}

fun main() = rgbLibDispatcherChecks()
