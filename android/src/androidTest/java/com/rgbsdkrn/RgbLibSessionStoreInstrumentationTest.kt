package com.rgbsdkrn

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * The Android session store against the Maven Central rgb-lib AAR, on a device
 * or emulator. Offline only: no indexer, proxy or broadcast is needed.
 */
@RunWith(AndroidJUnit4::class)
@Suppress("UNCHECKED_CAST")
class RgbLibSessionStoreInstrumentationTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext
  private val store = RgbLibSessionStore {
    runCatching { context.assets.open("rgb-lib-bfa-version.json").bufferedReader().use { it.readText() } }.getOrNull()
  }

  /** Code the bridge reports for a real UniFFI error, exactly as JS receives it. */
  private fun rgbLibCode(block: () -> Any?): String? =
    (runCatching(block).exceptionOrNull() as? com.utexo.RgbLibException)?.let(::rgbLibErrorCode)

  private fun bridgeCode(block: () -> Any?): String? =
    (runCatching(block).exceptionOrNull() as? RgbLibBridgeError)?.code

  private fun storageCode(block: () -> Any?): String? =
    (runCatching(block).exceptionOrNull() as? RlnStorageClaimError)?.code

  @Test
  fun runtimeInfo_reportsTheAarProvenance() {
    val info = store.execute("getRuntimeInfo", emptyMap()) as Map<String, Any?>
    assertEquals(3, info["bridgeVersion"])
    assertTrue("version from the AAR asset", (info["version"] as String).isNotEmpty())
    assertEquals(40, (info["sourceRevision"] as String).length)
  }

  @Test
  fun lifecycle_storage_invoices_and_backup() {
    val root = File(context.cacheDir, "rgb-lib-instrumentation-${System.nanoTime()}")
    val params = mutableMapOf<String, Any?>(
      "dataDir" to root.resolve("source").path, "network" to "regtest",
      "witnessVersion" to "taproot", "maxAllocationsPerUtxo" to 5.0, "reuseAddresses" to true,
      "mnemonic" to "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    )
    var active: String? = null
    fun call(operation: String, values: Map<String, Any?> = emptyMap()): Any? =
      store.execute(operation, mapOf("handle" to active) + values)
    try {
      active = store.execute("openWallet", params) as String
      val identity = call("getWalletIdentity")
      val address = call("getAddress", mapOf("rotate" to false))
      assertTrue((address as String).startsWith("bcrt1p"))
      assertEquals("WALLET_STORAGE_IN_USE", bridgeCode { store.execute("openWallet", params) })
      assertEquals("WALLET_PROFILE_MISMATCH", storageCode { RlnStorageClaim.claim(params["dataDir"] as String) })
      assertTrue((call("listAssets", mapOf("filterAssetSchemas" to emptyList<String>())) as List<*>).isEmpty())
      assertEquals("RGB_LIB_AssetNotFound", rgbLibCode { call("getAssetBalance", mapOf("assetId" to "rgb:smoke-asset")) })
      val balance = call("getBtcBalance", mapOf("skipSync" to true)) as Map<String, Any?>
      assertEquals("0", (balance["vanilla"] as Map<*, *>)["settled"])

      val expiry = (System.currentTimeMillis() / 1000 + 86400).toString()
      val receive = call("receive", mapOf(
        "witness" to true, "assetId" to null, "amount" to "9007199254740993", "assignmentKind" to null,
        "expirationTimestamp" to expiry, "transportEndpoints" to emptyList<String>(), "minConfirmations" to 1.0
      )) as Map<String, Any?>
      val invoice = call("decodeInvoice", mapOf("invoice" to receive["invoice"])) as Map<String, Any?>
      assertEquals("9007199254740993", (invoice["assignment"] as Map<*, *>)["amount"])
      assertEquals(receive["publicKey"], invoice["publicKey"])
      assertEquals("Required", invoice["encryption"])
      assertEquals(expiry, invoice["expirationTimestamp"])
      val history = call("listTransfers", mapOf("assetId" to null, "txid" to null)) as List<Map<String, Any?>>
      assertEquals(1, history.size)
      assertEquals("9007199254740993", (history[0]["requestedAssignment"] as Map<*, *>)["amount"])
      assertEquals(expiry, history[0]["expiration"])

      // send validates the invoice before going online, so nothing can be broadcast.
      val send = mapOf(
        "assetId" to "rgb:smoke-asset", "amount" to null, "witnessAmountSat" to null, "witnessBlinding" to null,
        "donation" to false, "feeRate" to "2", "minConfirmations" to 1.0, "skipSync" to true,
        "senderTransportEndpoint" to "rpc://localhost:3000/json-rpc"
      )
      fun rejected(values: Map<String, Any?>): RgbLibBridgeError =
        runCatching { call("send", send + values) }.exceptionOrNull() as RgbLibBridgeError
      val conflict = rejected(mapOf("invoice" to receive["invoice"], "amount" to "1"))
      assertEquals("INVALID_CONFIG", conflict.code)
      assertEquals("Amount override does not match invoice", conflict.message)
      val soon = (System.currentTimeMillis() / 1000 + 300).toString()
      val expiring = call("receive", mapOf(
        "witness" to true, "assetId" to null, "amount" to "5", "assignmentKind" to null,
        "expirationTimestamp" to soon, "transportEndpoints" to emptyList<String>(), "minConfirmations" to 1.0
      )) as Map<String, Any?>
      assertEquals("Invoice expires too soon", rejected(mapOf("invoice" to expiring["invoice"])).message)

      val signet = store.execute("openWallet", params + mapOf("dataDir" to root.resolve("signet").path, "network" to "signet")) as String
      val foreign = try {
        store.execute("receive", mapOf(
          "handle" to signet, "witness" to true, "assetId" to null, "amount" to "5", "assignmentKind" to null,
          "expirationTimestamp" to expiry, "transportEndpoints" to emptyList<String>(), "minConfirmations" to 1.0
        )) as Map<String, Any?>
      } finally { store.execute("closeWallet", mapOf("handle" to signet)) }
      // JS maps the public "utexo" deployment to native "signet" before openWallet.
      assertTrue("Standard signet invoice must use sb, not sbc", (foreign["invoice"] as String).contains("/sb:"))
      assertEquals("signet", (call("decodeInvoice", mapOf("invoice" to foreign["invoice"])) as Map<*, *>)["network"])
      // Old custom-signet profiles must not be silently reopened on standard signet.
      val legacyParams = params + mapOf("dataDir" to root.resolve("legacy-utexo").path, "network" to "utexo")
      store.execute("closeWallet", mapOf("handle" to store.execute("openWallet", legacyParams)))
      assertEquals("WALLET_PROFILE_MISMATCH", bridgeCode { store.execute("openWallet", legacyParams + ("network" to "signet")) })
      assertEquals("Invoice network does not match wallet", rejected(mapOf("invoice" to foreign["invoice"], "amount" to "5")).message)

      val backup = root.resolve("backup.rgb").path
      call("backup", mapOf("backupPath" to backup, "password" to "smoke-test-password"))
      call("closeWallet"); active = null
      active = store.execute("openWallet", params) as String
      assertEquals(identity, call("getWalletIdentity"))
      assertEquals(address, call("getAddress", mapOf("rotate" to false)))
      call("closeWallet"); active = null
      assertEquals("WALLET_PROFILE_MISMATCH", bridgeCode { store.execute("openWallet", params + ("network" to "signet")) })

      // RLN and RGB Lib never share storage, in either direction.
      assertTrue(!root.resolve("source").resolve(RlnStorageClaim.MARKER).exists())
      val rln = root.resolve("rln").path
      RlnStorageClaim.claim(rln)
      assertEquals("WALLET_STORAGE_NOT_EMPTY", bridgeCode { store.execute("openWallet", params + ("dataDir" to rln)) })
      val restore = mapOf("dataDir" to root.resolve("restored").path, "backupPath" to backup, "password" to "smoke-test-password")
      assertEquals("WALLET_STORAGE_NOT_EMPTY", bridgeCode { store.execute("restoreBackup", restore + ("dataDir" to rln)) })
      assertEquals("RGB_LIB_WrongPassword", rgbLibCode { store.execute("restoreBackup", restore + ("password" to "wrong")) })
      store.execute("restoreBackup", restore)
      active = store.execute("openWallet", params + ("dataDir" to restore["dataDir"])) as String
      assertEquals(identity, call("getWalletIdentity"))
      assertEquals(address, call("getAddress", mapOf("rotate" to false)))
    } finally {
      if (active != null) call("closeWallet")
      root.deleteRecursively()
    }
  }
}
