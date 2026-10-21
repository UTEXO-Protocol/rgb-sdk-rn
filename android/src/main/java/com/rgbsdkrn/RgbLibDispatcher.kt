package com.rgbsdkrn

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Chooses the thread for each RgbLibModule call. It has no React Native or UniFFI
 * types, so scripts/native/RgbLibDispatcherChecks.kt drives it on the JVM.
 */
internal class RgbLibDispatcher(
  private val execute: (String, Map<String, Any?>) -> Any?,
  /** Maps a failure to a bridge error code and a message without request data. */
  private val rejection: (Throwable) -> Pair<String, String?>,
  // Calls without an open handle run concurrently; storage locks guard them.
  private val shared: ExecutorService = Executors.newCachedThreadPool(),
  private val newSession: () -> ExecutorService = { Executors.newSingleThreadExecutor() }
) {
  interface Reply {
    fun resolve(value: Any?)
    fun reject(code: String, message: String?)
  }
  // One serial executor per wallet, so slow indexer I/O never blocks other wallets.
  private val sessions = mutableMapOf<String, ExecutorService>()
  private var accepting = true

  @Synchronized fun invoke(operation: String, params: Map<String, Any?>, reply: Reply) {
    if (!accepting) { reply.reject("WALLET_DISPOSED", "Native module is closed"); return }
    val handle = params["handle"] as? String
    val executor = handle?.let { sessions[it] } ?: shared
    executor.execute {
      try {
        val result = execute(operation, params)
        if (operation == "openWallet" && !adopt(result as String)) {
          try { execute("closeWallet", mapOf("handle" to result)) } catch (_: Exception) {}
          reply.reject("WALLET_DISPOSED", "Native module is closed")
          return@execute
        }
        reply.resolve(result)
      } catch (error: Exception) {
        val (code, message) = rejection(error)
        reply.reject(code, message)
      } catch (error: UnsatisfiedLinkError) {
        val (code, message) = rejection(error)
        reply.reject(code, message)
      } finally {
        if (operation == "closeWallet" && handle != null) release(handle)
      }
    }
  }
  @Synchronized private fun adopt(handle: String): Boolean {
    if (!accepting) return false
    sessions[handle] = newSession()
    return true
  }
  // shutdown() still runs calls already queued; they fail as closed.
  @Synchronized private fun release(handle: String) { sessions.remove(handle)?.shutdown() }
  @Synchronized fun invalidate() {
    if (!accepting) return
    accepting = false
    // Close on each wallet's own executor, after the calls already queued for it.
    sessions.forEach { (handle, executor) ->
      executor.execute { try { execute("closeWallet", mapOf("handle" to handle)) } catch (_: Exception) {} }
      executor.shutdown()
    }
    sessions.clear()
    shared.shutdown()
  }
}
