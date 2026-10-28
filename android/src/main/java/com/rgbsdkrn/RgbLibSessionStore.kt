package com.rgbsdkrn

import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.channels.FileLock
import java.security.MessageDigest
import java.util.UUID
import com.utexo.*

internal class RgbLibBridgeError(val code: String, message: String) : Exception(message)

/**
 * `RGB_LIB_<Variant>`, matching RgbLibSwiftHelper's rgbLibErrorCode for the same
 * Rust variant. Used for rejections and for per-transfer refresh failures.
 */
internal fun rgbLibErrorCode(error: RgbLibException) = "RGB_LIB_" + error.javaClass.simpleName

/**
 * Thread-safe. The registry lock is held only for handle lookup and ownership
 * changes; each session's lock serializes its own native calls, so slow indexer
 * I/O on one wallet does not block others. UniFFI owns the Rust wallet.
 */
/** [artifactInfo] returns the AAR's `rgb-lib-bfa-version.json`, or null. */
internal class RgbLibSessionStore(private val artifactInfo: () -> String? = { null }) {
  private class Lease(input: File) : AutoCloseable {
    val root = input.canonicalFile
    private val file: RandomAccessFile
    private val lock: FileLock
    init {
      if (!input.isAbsolute) throw RgbLibBridgeError("INVALID_CONFIG", "Storage path must be absolute")
      if (!root.exists() && !root.mkdirs()) throw java.io.IOException("Cannot create wallet directory")
      if (!File(root, PROFILE).exists() && root.listFiles().orEmpty().any { it.name != LOCK })
        throw RgbLibBridgeError("WALLET_STORAGE_NOT_EMPTY", "Use a separate empty wallet directory")
      file = RandomAccessFile(File(root, LOCK), "rw")
      try {
        lock = file.channel.tryLock() ?: throw IllegalStateException()
      } catch (_: Exception) {
        file.close()
        throw RgbLibBridgeError("WALLET_STORAGE_IN_USE", "Wallet storage is already in use")
      }
    }
    override fun close() {
      if (lock.isValid) lock.release()
      if (file.channel.isOpen) file.close()
    }
  }
  private data class Session(
    val wallet: Wallet, val lease: Lease, val profile: JSONObject,
    val reuse: Boolean, var online: Online? = null, var closed: Boolean = false
  )
  private val sessions = mutableMapOf<String, Session>()
  private val registry = Any()
  private fun fail(message: String): Nothing = throw RgbLibBridgeError("INVALID_CONFIG", message)
  private fun optional(p: JSONObject, key: String): String? = if (p.isNull(key)) null else p.getString(key)
  private fun schema(name: String): AssetSchema = when (name) {
    "Nia" -> AssetSchema.NIA
    "Uda" -> AssetSchema.UDA
    "Cfa" -> AssetSchema.CFA
    "Ifa" -> AssetSchema.IFA
    "Bfa" -> AssetSchema.BFA
    else -> fail("Unknown asset schema")
  }
  private fun receiveAssignment(kind: String?, amount: ULong?): Assignment = when (kind ?: if (amount == null) "Any" else "Fungible") {
    "Fungible" -> Assignment.Fungible(amount ?: fail("Fungible receive requires an amount"))
    "InflationRight" -> Assignment.InflationRight(amount ?: fail("InflationRight receive requires an amount"))
    "NonFungible", "MintRight", "Any" -> {
      if (amount != null) fail("This assignment kind takes no amount")
      when (kind) { "NonFungible" -> Assignment.NonFungible; "MintRight" -> Assignment.MintRight; else -> Assignment.Any }
    }
    else -> fail("Unknown assignment kind")
  }
  private fun amount(p: JSONObject, key: String): ULong =
    (p.get(key) as? String)?.toULongOrNull() ?: fail("Invalid decimal $key")
  private fun number(p: JSONObject, key: String, max: Long): Long {
    val n = p.getDouble(key)
    if (!n.isFinite() || n < 0 || n > max || n % 1.0 != 0.0) fail("Invalid $key")
    return n.toLong()
  }
  private fun strings(p: JSONObject, key: String) =
    p.getJSONArray(key).let { a -> (0 until a.length()).map { a.getString(it) } }
  private fun online(s: Session) = s.online ?: throw RgbLibBridgeError("WALLET_OFFLINE", "Call unlock first")
  private fun network(name: String) = when (name) {
    "mainnet" -> BitcoinNetwork.MAINNET
    "testnet" -> BitcoinNetwork.TESTNET
    "testnet4" -> BitcoinNetwork.TESTNET4
    "signet" -> BitcoinNetwork.SIGNET
    "regtest" -> BitcoinNetwork.REGTEST
    "utexo" -> BitcoinNetwork.SIGNET_CUSTOM
    else -> fail("Unsupported Bitcoin network")
  }
  private fun write(file: File, profile: JSONObject) {
    val pending = File(file.parentFile, file.name + ".tmp")
    FileOutputStream(pending).use { it.write(profile.toString().toByteArray(Charsets.UTF_8)); it.fd.sync() }
    if (!pending.renameTo(file)) throw java.io.IOException("Cannot save wallet profile")
  }
  private fun save(s: Session) {
    write(File(s.wallet.getWalletDir(), PROFILE), s.profile)
    write(File(s.lease.root, PROFILE), s.profile)
  }
  private fun open(p: JSONObject): String {
    val net = p.getString("network")
    val witness = when (p.getString("witnessVersion")) {
      "taproot" -> WitnessVersion.TAPROOT
      "segwit-v0" -> WitnessVersion.SEG_WIT_V0
      else -> fail("Unsupported witness version")
    }
    val keys = restoreKeys(network(net), p.getString("mnemonic"), witness)
    val max = number(p,"maxAllocationsPerUtxo",0xffffffffL).toUInt()
    if (max == 0U) fail("maxAllocationsPerUtxo must be positive")
    val identity = "$net:${p.getString("witnessVersion")}:${keys.accountXpubVanilla}:${keys.accountXpubColored}"
    val id = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    val expected = JSONObject(mapOf(
      "formatVersion" to 1,"backend" to "rgb-lib","id" to id,"network" to net,
      "witnessVersion" to p.getString("witnessVersion"),"maxAllocations" to max.toLong(),
      "masterFingerprint" to keys.masterFingerprint,"accountXpubVanilla" to keys.accountXpubVanilla,
      "accountXpubColored" to keys.accountXpubColored
    ))
    val lease = Lease(File(p.getString("dataDir")))
    var wallet: Wallet? = null
    try {
      val marker = File(lease.root, PROFILE)
      val profile = if (marker.exists()) JSONObject(marker.readText()) else expected
      if (expected.keys().asSequence().any { profile.opt(it)?.toString() != expected.get(it).toString() })
        throw RgbLibBridgeError("WALLET_PROFILE_MISMATCH", "Storage belongs to a different wallet profile")
      if (!marker.exists()) {
        if (lease.root.listFiles().orEmpty().any { it.name != LOCK })
          throw RgbLibBridgeError("WALLET_STORAGE_NOT_EMPTY", "Use a separate empty wallet directory")
        write(marker, expected)
      }
      wallet = Wallet(
        WalletData(lease.root.path, network(net), DatabaseType.SQLITE, max, AssetSchema.entries.toList()),
        SinglesigKeys(keys.accountXpubVanilla, keys.accountXpubColored, null, keys.masterFingerprint, keys.mnemonic, witness)
      )
      val session = Session(wallet, lease, profile, p.getBoolean("reuseAddresses"))
      save(session)
      val handle = UUID.randomUUID().toString()
      synchronized(registry) { sessions[handle] = session }
      return handle
    } catch (error: Exception) {
      wallet?.close()
      lease.close()
      throw error
    }
  }
  private fun restore(p: JSONObject) {
    Lease(File(p.getString("dataDir"))).use { lease ->
      if (lease.root.listFiles().orEmpty().any { it.name != LOCK })
        throw RgbLibBridgeError("WALLET_STORAGE_NOT_EMPTY", "Restore requires an empty directory")
      val stage = File(lease.root, ".restore")
      if (!stage.mkdir()) throw java.io.IOException("Cannot create restore staging directory")
      try {
        restoreBackup(p.getString("backupPath"), p.getString("password"), stage.path)
        val dirs = stage.listFiles().orEmpty().filter { it.isDirectory && File(it,PROFILE).isFile }
        if (dirs.size != 1) throw RgbLibBridgeError("BACKUP_PROFILE_MISSING", "Backup does not contain an SDK RGB Lib profile")
        val profile = JSONObject(File(dirs[0],PROFILE).readText())
        val fingerprint = profile.getString("masterFingerprint")
        if (profile.getInt("formatVersion") != 1 || profile.getString("backend") != "rgb-lib" ||
          !Regex("[a-fA-F0-9]{8}").matches(fingerprint) || dirs[0].name != fingerprint)
          throw RgbLibBridgeError("BACKUP_PROFILE_MISMATCH", "Invalid backup profile")
        if (!dirs[0].renameTo(File(lease.root,fingerprint))) throw java.io.IOException("Cannot install restored wallet")
        write(File(lease.root,PROFILE),profile)
      } finally { stage.deleteRecursively() }
    }
  }
  private fun consignment(s: Session, p: JSONObject): File {
    val paths = s.wallet.listTransfers(AssetFilter.Id(p.getString("assetId")),p.getString("txid")).mapNotNull { it.consignmentPath }.distinct()
    if (paths.size != 1) throw RgbLibBridgeError("CONSIGNMENT_NOT_FOUND","No unique consignment for this transfer")
    val file = File(paths.single()).canonicalFile
    if (!file.isFile || !file.path.startsWith(File(s.wallet.getWalletDir()).canonicalPath + File.separator))
      throw RgbLibBridgeError("INVALID_CONSIGNMENT_PATH","Consignment is outside wallet storage")
    return file
  }
  private fun send(s: Session,p: JSONObject): Any {
    val invoice = Invoice(p.getString("invoice")).use { it.invoiceData() }
    if (invoice.network != network(s.profile.getString("network"))) fail("Invoice network does not match wallet")
    val supplied = optional(p,"assetId")
    if (supplied != null && invoice.assetId != null && supplied != invoice.assetId) fail("Asset override does not match invoice")
    val asset = invoice.assetId ?: supplied ?: fail("Asset ID is required")
    val n = if (p.isNull("amount")) null else amount(p,"amount")
    val assignment = when(val a=invoice.assignment) {
      Assignment.Any -> if (n != null && n > 0UL) Assignment.Fungible(n) else fail("Amount is required")
      is Assignment.Fungible -> { if (n != null && n != a.amount) fail("Amount override does not match invoice"); a }
      else -> { if (n != null) fail("Amount override is incompatible with invoice"); a }
    }
    val now = (System.currentTimeMillis()/1000).toULong()
    val expiry = invoice.expirationTimestamp?.let { if (it <= now + 600UL) fail("Invoice expires too soon"); it - 600UL } ?: (now+3600UL)
    val witness = if (p.isNull("witnessAmountSat")) null else WitnessData(amount(p,"witnessAmountSat"),if(p.isNull("witnessBlinding")) null else amount(p,"witnessBlinding"))
    val recipient = Recipient(invoice.recipientId,witness,assignment,invoice.transportEndpoints,invoice.publicKey,invoice.encryption,invoice.expirationTimestamp)
    return rgbDto(s.wallet.send(online(s),mapOf(asset to listOf(recipient)),p.getBoolean("donation"),amount(p,"feeRate"),number(p,"minConfirmations",255).toUByte(),expiry,p.getString("senderTransportEndpoint")))
  }
  fun execute(operation: String, params: Map<String, Any?>): Any? {
    val p = JSONObject(params)
    when(operation) {
      "getRuntimeInfo" -> {
        val artifact = runCatching { JSONObject(artifactInfo()!!) }.getOrNull()
        return mapOf("version" to (artifact?.optString("version") ?: ""),"sourceRevision" to (artifact?.optString("source_commit") ?: ""),"bridgeVersion" to 3,"burn" to true,"consignment" to true,"bfa" to true)
      }
      "openWallet" -> return open(p)
      "restoreBackup" -> { restore(p); return null }
    }
    val handle = p.getString("handle")
    val s = synchronized(registry) { sessions[handle] } ?: throw RgbLibBridgeError("WALLET_NOT_INITIALIZED","Unknown or closed wallet")
    return synchronized(s) {
      // A close may have released the handle while this call waited for the lock.
      if (s.closed) throw RgbLibBridgeError("WALLET_NOT_INITIALIZED","Unknown or closed wallet")
      run(operation, handle, s, p)
    }
  }
  private fun run(operation: String, handle: String, s: Session, p: JSONObject): Any? {
    val w = s.wallet
    return when(operation) {
      "closeWallet" -> {
        synchronized(registry) { sessions.remove(handle) }
        s.closed = true; s.online = null
        try { w.close() } finally { s.lease.close() }
        null
      }
      "getWalletIdentity" -> mapOf("id" to s.profile.getString("id"),"network" to s.profile.getString("network"),"masterFingerprint" to s.profile.getString("masterFingerprint"))
      "goOnline" -> {
        val url=p.getString("indexerUrl")
        val config=when(p.getString("indexerKind")) {
          "electrum" -> IndexerConfig.Electrum(url)
          "esplora" -> IndexerConfig.Esplora(url)
          "bitcoind" -> IndexerConfig.Bitcoind(url,optional(p,"cookieFile")?.let { BitcoindAuth.CookieFile(it) } ?: BitcoindAuth.UserPass(p.getString("username"),p.getString("password")))
          else -> fail("Unsupported indexer")
        }
        val ids=strings(p,"evmChainIds"); val urls=strings(p,"evmRpcUrls")
        val endpoints=strings(p,"proxyEndpoints"); val keys=strings(p,"proxyAuthKeys")
        if (ids.size != urls.size || endpoints.size != keys.size) fail("Configuration arrays do not match")
        s.online=w.goOnline(OnlineOptions(config,false,20U,86400U,endpoints.zip(keys).toMap(),ids.map { it.toULong() }.zip(urls).toMap()))
        null
      }
      "getAddress" -> {
        if (p.getBoolean("rotate") || !s.reuse || s.profile.isNull("cachedAddress")) {
          val address=w.getAddress(); val previous=s.profile.opt("cachedAddress")
          s.profile.put("cachedAddress",address)
          // Never keep an in-memory address that was not persisted.
          try { save(s) } catch (e: Throwable) {
            if (previous == null) s.profile.remove("cachedAddress") else s.profile.put("cachedAddress",previous)
            throw e
          }
        }
        s.profile.getString("cachedAddress")
      }
      "getBtcBalance" -> rgbDto(w.getBtcBalance(s.online,p.getBoolean("skipSync")))
      "getAssetBalance" -> rgbDto(w.getAssetBalance(p.getString("assetId")))
      "listAssets" -> rgbDto(w.listAssets(strings(p,"filterAssetSchemas").map { schema(it) }))
      "getAssetMetadata" -> rgbDto(w.getAssetMetadata(p.getString("assetId")))
      "listUnspents" -> w.listUnspents(s.online,false,p.getBoolean("skipSync")).map { rgbDto(it) }
      "listTransactions" -> w.listTransactions(s.online,p.getBoolean("skipSync")).map { rgbDto(it) }
      "listTransfers" -> w.listTransfers(optional(p,"assetId")?.let { AssetFilter.Id(it) } ?: AssetFilter.AnyOrNone,optional(p,"txid")).map { rgbDto(it) }
      "createUtxos" -> w.createUtxos(online(s),p.getBoolean("upTo"),if(p.isNull("num")) null else number(p,"num",255).toUByte(),if(p.isNull("size")) null else number(p,"size",0xffffffffL).toUInt(),amount(p,"feeRate"),p.getBoolean("skipSync")).toDouble()
      "sendBtc" -> w.sendBtc(online(s),p.getString("address"),amount(p,"amount"),amount(p,"feeRate"),p.getBoolean("skipSync"))
      "receive" -> {
        val assignment=receiveAssignment(optional(p,"assignmentKind"),if(p.isNull("amount")) null else amount(p,"amount"))
        rgbDto(if(p.getBoolean("witness")) w.witnessReceive(s.online,optional(p,"assetId"),assignment,amount(p,"expirationTimestamp"),strings(p,"transportEndpoints"),number(p,"minConfirmations",255).toUByte(),null)
          else w.blindReceive(s.online,optional(p,"assetId"),assignment,amount(p,"expirationTimestamp"),strings(p,"transportEndpoints"),number(p,"minConfirmations",255).toUByte(),null))
      }
      "decodeInvoice" -> Invoice(p.getString("invoice")).use { rgbDto(it.invoiceData()) }
      "send" -> send(s,p)
      "issueAssetNia" -> rgbDto(w.issueAssetNia(p.getString("ticker"),p.getString("name"),number(p,"precision",18).toUByte(),strings(p,"amounts").map { it.toULong() }))
      "issueAssetCfa" -> rgbDto(w.issueAssetCfa(p.getString("name"),optional(p,"details"),number(p,"precision",18).toUByte(),strings(p,"amounts").map { it.toULong() },optional(p,"filePath")))
      "issueAssetUda" -> rgbDto(w.issueAssetUda(p.getString("ticker"),p.getString("name"),optional(p,"details"),number(p,"precision",18).toUByte(),optional(p,"mediaFilePath"),strings(p,"attachmentsFilePaths")))
      "issueAssetIfa" -> rgbDto(w.issueAssetIfa(p.getString("ticker"),p.getString("name"),number(p,"precision",18).toUByte(),strings(p,"amounts").map { it.toULong() },strings(p,"inflationAmounts").map { it.toULong() },optional(p,"rejectListUrl")))
      "inflate" -> rgbDto(w.inflate(online(s),p.getString("assetId"),strings(p,"amounts").map { it.toULong() },amount(p,"feeRate"),number(p,"minConfirmations",255).toUByte()))
      "burn" -> rgbDto(w.burn(online(s),p.getString("assetId"),amount(p,"amount"),optional(p,"burnReason"),amount(p,"feeRate"),number(p,"minConfirmations",255).toUByte()))
      "failTransfers" -> w.failTransfers(online(s),if(p.isNull("batchTransferIdx")) null else number(p,"batchTransferIdx",Int.MAX_VALUE.toLong()).toInt(),p.getBoolean("noAssetOnly"),p.getBoolean("skipSync"))
      "refresh" -> w.refresh(online(s),null,emptyList(),p.getBoolean("skipSync")).map { (id,r) -> mapOf("batchTransferIdx" to id.toDouble(),"updatedStatus" to r.updatedStatus?.let { rgbEnum(it) },"failure" to r.failure?.let { mapOf("name" to rgbLibErrorCode(it),"message" to (it.message ?: "RGB Lib operation failed")) }) }
      "deleteTransfers" -> w.deleteTransfers(if(p.isNull("batchTransferIdx")) null else number(p,"batchTransferIdx",Int.MAX_VALUE.toLong()).toInt(),p.getBoolean("noAssetOnly"))
      "drainTo" -> w.drainTo(online(s),p.getString("address"),amount(p,"feeRate"))
      "checkIndexerUrl" -> checkIndexerUrl(p.getString("indexerUrl"),null,network(s.profile.getString("network"))).name.lowercase()
      "sync" -> { w.sync(online(s),SyncOptions(SyncKeychain.Colored,SyncStrategy.FULL_SYNC)); w.sync(online(s),SyncOptions(SyncKeychain.Vanilla(20U),SyncStrategy.FULL_SYNC)); null }
      "estimateFeeRate" -> w.getFeeEstimation(online(s),number(p,"blocks",65535).toUShort())
      // This UniFFI release has no block-height method. Preserve the optional API field.
      "getNetworkInfo" -> mapOf("network" to s.profile.getString("network"),"blockHeight" to null)
      "backup" -> { save(s); w.backup(p.getString("backupPath"),p.getString("password")); null }
      "getConsignmentPath" -> consignment(s,p).path
      "getConsignment" -> Base64.encodeToString(consignment(s,p).readBytes(),Base64.NO_WRAP)
      else -> fail("Unknown native operation")
    }
  }
  companion object {
    private const val PROFILE="rgb-sdk-profile.json"
    private const val LOCK=".rgb-sdk.lock"
  }
}
