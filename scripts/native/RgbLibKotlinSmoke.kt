package com.rgbsdkrn

import java.nio.file.Files

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
    check((call("listAssets") as List<*>).isEmpty())
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
    val backup = root.resolve("backup.rgb").path
    call("backup", mapOf("backupPath" to backup, "password" to "smoke-test-password"))
    call("closeWallet"); active = null
    active = store.execute("openWallet", params) as String
    check(call("getWalletIdentity") == identity)
    check(call("getAddress", mapOf("rotate" to false)) == address)
    call("closeWallet"); active = null
    check((runCatching { store.execute("openWallet", params + ("network" to "signet")) }.exceptionOrNull() as RgbLibBridgeError).code == "WALLET_PROFILE_MISMATCH")
    val restored = root.resolve("restored").path
    val restore = mapOf("dataDir" to restored, "backupPath" to backup, "password" to "smoke-test-password")
    check(runCatching { store.execute("restoreBackup", restore + ("password" to "wrong")) }.isFailure)
    store.execute("restoreBackup", restore)
    active = store.execute("openWallet", params + ("dataDir" to restored)) as String
    check(call("getWalletIdentity") == identity)
    check(call("getAddress", mapOf("rotate" to false)) == address)
    call("closeWallet"); active = null
    println("Direct Kotlin UniFFI: lifecycle, storage lock, invoice/history and encrypted backup/restore passed")
  } finally {
    if (active != null) call("closeWallet")
    root.deleteRecursively()
  }
}
