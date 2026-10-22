package com.rgbsdkrn

import java.nio.file.Files

/** Code the bridge reports for a real UniFFI error, exactly as JS receives it. */
private fun rgbLibCode(block: () -> Any?): String? =
  (runCatching(block).exceptionOrNull() as? uniffi.rgb_lib.RgbLibException)?.let(::rgbLibErrorCode)

/** JVM integration fixture: generated UniFFI bindings + the same Kotlin session store as Android. */
@Suppress("UNCHECKED_CAST")
fun main() {
  val root = Files.createTempDirectory("rgb-uniffi-kotlin-").toFile()
  val store = RgbLibSessionStore()
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
    check((address as String).startsWith("bcrt1p"))
    check((runCatching { store.execute("openWallet", params) }.exceptionOrNull() as RgbLibBridgeError).code == "WALLET_STORAGE_IN_USE")
    check((runCatching { RlnStorageClaim.claim(params["dataDir"] as String) }.exceptionOrNull() as RlnStorageClaimError).code == "WALLET_PROFILE_MISMATCH")
    check((call("listAssets") as List<*>).isEmpty())
    check(rgbLibCode { call("getAssetBalance", mapOf("assetId" to "rgb:smoke-asset")) } == "RGB_LIB_AssetNotFound")
    val balance = call("getBtcBalance", mapOf("skipSync" to true)) as Map<String, Any?>
    check((balance["vanilla"] as Map<*, *>)["settled"] == "0")
    val expiry = (System.currentTimeMillis()/1000 + 86400).toString()
    val receive = call("receive", mapOf(
      "witness" to true, "assetId" to null, "amount" to "9007199254740993",
      "expirationTimestamp" to expiry, "transportEndpoints" to emptyList<String>(), "minConfirmations" to 1.0
    )) as Map<String, Any?>
    val invoice = call("decodeInvoice", mapOf("invoice" to receive["invoice"])) as Map<String, Any?>
    check((invoice["assignment"] as Map<*, *>)["amount"] == "9007199254740993")
    check(invoice["publicKey"] == receive["publicKey"])
    check(invoice["encryption"] == "Required")
    check(invoice["expirationTimestamp"] == expiry)
    val history = call("listTransfers", mapOf("assetId" to null, "txid" to null)) as List<Map<String, Any?>>
    check(history.size == 1)
    check((history[0]["requestedAssignment"] as Map<*, *>)["amount"] == "9007199254740993")
    check(history[0]["expiration"] == expiry)
    // send validates the invoice before going online, so nothing can be broadcast.
    val send = mapOf(
      "assetId" to "rgb:smoke-asset", "amount" to null, "witnessAmountSat" to null, "witnessBlinding" to null,
      "donation" to false, "feeRate" to "2", "minConfirmations" to 1.0, "skipSync" to true,
      "senderTransportEndpoint" to "rpc://localhost:3000/json-rpc"
    )
    fun rejected(values: Map<String, Any?>): RgbLibBridgeError =
      runCatching { call("send", send + values) }.exceptionOrNull() as RgbLibBridgeError
    val conflict = rejected(mapOf("invoice" to receive["invoice"], "amount" to "1"))
    check(conflict.code == "INVALID_CONFIG" && conflict.message == "Amount override does not match invoice")
    val soon = (System.currentTimeMillis()/1000 + 300).toString()
    val expiring = call("receive", mapOf(
      "witness" to true, "assetId" to null, "amount" to "5",
      "expirationTimestamp" to soon, "transportEndpoints" to emptyList<String>(), "minConfirmations" to 1.0
    )) as Map<String, Any?>
    val tooSoon = rejected(mapOf("invoice" to expiring["invoice"]))
    check(tooSoon.code == "INVALID_CONFIG" && tooSoon.message == "Invoice expires too soon")
    val signet = store.execute("openWallet", params + mapOf("dataDir" to root.resolve("signet").path, "network" to "signet")) as String
    val foreign = try {
      store.execute("receive", mapOf(
        "handle" to signet, "witness" to true, "assetId" to null, "amount" to "5", "expirationTimestamp" to expiry,
        "transportEndpoints" to emptyList<String>(), "minConfirmations" to 1.0
      )) as Map<String, Any?>
    } finally { store.execute("closeWallet", mapOf("handle" to signet)) }
    // JS maps the public "utexo" deployment to native "signet" before openWallet.
    check((foreign["invoice"] as String).contains("/sb:")) { "Standard signet invoice must use sb, not sbc" }
    check((call("decodeInvoice", mapOf("invoice" to foreign["invoice"])) as Map<*, *>)["network"] == "signet")
    // Old custom-signet profiles must not be silently reopened on standard signet.
    val legacyParams = params + mapOf("dataDir" to root.resolve("legacy-utexo").path, "network" to "utexo")
    val legacy = store.execute("openWallet", legacyParams) as String
    store.execute("closeWallet", mapOf("handle" to legacy))
    check((runCatching { store.execute("openWallet", legacyParams + ("network" to "signet")) }.exceptionOrNull() as RgbLibBridgeError).code == "WALLET_PROFILE_MISMATCH")
    val network = rejected(mapOf("invoice" to foreign["invoice"], "amount" to "5"))
    check(network.code == "INVALID_CONFIG" && network.message == "Invoice network does not match wallet")
    val backup = root.resolve("backup.rgb").path
    call("backup", mapOf("backupPath" to backup, "password" to "smoke-test-password"))
    call("closeWallet"); active = null
    active = store.execute("openWallet", params) as String
    check(call("getWalletIdentity") == identity)
    check(call("getAddress", mapOf("rotate" to false)) == address)
    call("closeWallet"); active = null
    check((runCatching { store.execute("openWallet", params + ("network" to "signet")) }.exceptionOrNull() as RgbLibBridgeError).code == "WALLET_PROFILE_MISMATCH")
    // RLN and RGB Lib never share storage, in either direction.
    check((runCatching { RlnStorageClaim.claim(params["dataDir"] as String) }.exceptionOrNull() as RlnStorageClaimError).code == "WALLET_PROFILE_MISMATCH")
    check(!root.resolve("source").resolve(RlnStorageClaim.MARKER).exists())
    val rln = root.resolve("rln").path
    RlnStorageClaim.claim(rln)
    check((runCatching { store.execute("openWallet", params + ("dataDir" to rln)) }.exceptionOrNull() as RgbLibBridgeError).code == "WALLET_STORAGE_NOT_EMPTY")
    check((runCatching { store.execute("restoreBackup", mapOf("dataDir" to rln, "backupPath" to backup, "password" to "smoke-test-password")) }.exceptionOrNull() as RgbLibBridgeError).code == "WALLET_STORAGE_NOT_EMPTY")
    rlnStorageClaimChecks()
    val restored = root.resolve("restored").path
    val restore = mapOf("dataDir" to restored, "backupPath" to backup, "password" to "smoke-test-password")
    check(rgbLibCode { store.execute("restoreBackup", restore + ("password" to "wrong")) } == "RGB_LIB_WrongPassword")
    store.execute("restoreBackup", restore)
    active = store.execute("openWallet", params + ("dataDir" to restored)) as String
    check(call("getWalletIdentity") == identity)
    check(call("getAddress", mapOf("rotate" to false)) == address)
    call("closeWallet"); active = null
    println("Direct Kotlin UniFFI: lifecycle, storage lock, RLN exclusion, invoice/history, send invoice checks and encrypted backup/restore passed")
  } finally {
    if (active != null) call("closeWallet")
    root.deleteRecursively()
  }
}
