package com.rgbsdkrn

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.rgbtools.AssetSchema
import org.rgbtools.Assignment
import org.rgbtools.BitcoinNetwork
import org.rgbtools.DatabaseType
import org.rgbtools.RefreshFilter
import org.rgbtools.Recipient
import org.rgbtools.RefreshTransferStatus
import org.rgbtools.Wallet
import org.rgbtools.WalletData
import org.rgbtools.WitnessData
import org.rgbtools.generateKeys
import org.rgbtools.restoreKeys
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import org.rgbtools.Token
import org.rgbtools.Invoice

@ReactModule(name = RgbModule.NAME)
class RgbModule(reactContext: ReactApplicationContext) :
  NativeRgbSpec(reactContext) {
  private val coroutineScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
  private val TAG = "RNRgb"

  init {
    AppConstants.ensureInitialized(reactContext)
  }

  override fun getName(): String {
    return NAME
  }

  companion object {
    const val NAME = "Rgb"
  }

  private suspend fun resolvePromise(promise: Promise, result: String) {
    withContext(Dispatchers.Main) {
      promise.resolve(result)
    }
  }

  private fun getErrorClassName(exception: Exception): String {
    val className = exception.javaClass.name
    // Handle nested classes (separated by $)
    val parts = className.split('$')
    // Take the last part and split by . to get simple name
    val lastPart = parts.last().split('.').last()
    return lastPart
  }

  private fun parseErrorMessage(message: String?): String {
    if (message == null) return "Unknown error"
    // Remove "details=" prefix if present
    return if (message.startsWith("details=", ignoreCase = true)) {
      message.substring(8).trim()
    } else {
      message
    }
  }

  override fun generateKeys(bitcoinNetwork: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val network = when (bitcoinNetwork.lowercase()) {
          "mainnet" -> BitcoinNetwork.MAINNET
          "testnet" -> BitcoinNetwork.TESTNET
          "testnet4" -> BitcoinNetwork.TESTNET4
          "regtest" -> BitcoinNetwork.REGTEST
          "signet" -> BitcoinNetwork.SIGNET
          else -> throw IllegalArgumentException("Unknown BitcoinNetwork: $bitcoinNetwork")
        }

        val keys = generateKeys(bitcoinNetwork = network)
        val result = Arguments.createMap()
        result.putString("mnemonic", keys.mnemonic)
        result.putString("xpub", keys.xpub)
        result.putString("accountXpubVanilla", keys.accountXpubVanilla)
        result.putString("accountXpubColored", keys.accountXpubColored)
        result.putString("masterFingerprint", keys.masterFingerprint)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
      }
    }
  }

  override fun restoreKeys(bitcoinNetwork: String, mnemonic: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val network = when (bitcoinNetwork.lowercase()) {
          "mainnet" -> BitcoinNetwork.MAINNET
          "testnet" -> BitcoinNetwork.TESTNET
          "testnet4" -> BitcoinNetwork.TESTNET4
          "regtest" -> BitcoinNetwork.REGTEST
          "signet" -> BitcoinNetwork.SIGNET
          else -> throw IllegalArgumentException("Unknown BitcoinNetwork: $bitcoinNetwork")
        }
        val keys = restoreKeys(bitcoinNetwork = network, mnemonic = mnemonic)
        val result = Arguments.createMap()
        result.putString("mnemonic", keys.mnemonic)
        result.putString("xpub", keys.xpub)
        result.putString("accountXpubVanilla", keys.accountXpubVanilla)
        result.putString("accountXpubColored", keys.accountXpubColored)
        result.putString("masterFingerprint", keys.masterFingerprint)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
      }
    }
  }

  override fun restoreBackup(path: String, password: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val rgbDir = AppConstants.rgbDir
          ?: throw IllegalStateException("RGB directory not initialized.")
        org.rgbtools.restoreBackup(path, password, rgbDir.absolutePath)

        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "restoreBackup error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }
  
  override fun decodeInvoice(invoice: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val invoiceData = Invoice(invoiceString = invoice).invoiceData()
        val map = Arguments.createMap()
        map.putString("invoice", invoice)
        map.putString("recipientId", invoiceData.recipientId)
        invoiceData.assetSchema?.let { schema ->
          val assetSchemaString = when (schema) {
            AssetSchema.NIA -> "Nia"
            AssetSchema.UDA -> "Uda"
            AssetSchema.CFA -> "Cfa"
            AssetSchema.IFA -> "Ifa"
          }
          map.putString("assetSchema", assetSchemaString)
        }
        map.putString("assetId", invoiceData.assetId)
        map.putMap("assignment", assignmentToMap(invoiceData.assignment))
        map.putString("assignmentName", invoiceData.assignmentName)
        map.putString("network", invoiceData.network.toString())
        val transportEndpointsArray = Arguments.createArray()
        invoiceData.transportEndpoints.forEach {
          transportEndpointsArray.pushString(it)
        }
        map.putArray("transportEndpoints", transportEndpointsArray)

        invoiceData.expirationTimestamp?.let {
          map.putDouble("expirationTimestamp", it.toDouble())
        } ?: run {
          map.putNull("expirationTimestamp")
        }
        withContext(Dispatchers.Main) {
          promise.resolve(map)
        }
      } catch (e: Exception) {
        Log.e(TAG, "decodeInvoice error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  private fun getNetwork(network: String): BitcoinNetwork {
    return when (network.lowercase()) {
      "mainnet" -> BitcoinNetwork.MAINNET
      "testnet" -> BitcoinNetwork.TESTNET
      "testnet4" -> BitcoinNetwork.TESTNET4
      "regtest" -> BitcoinNetwork.REGTEST
      "signet" -> BitcoinNetwork.SIGNET
      else -> throw IllegalArgumentException("Unknown BitcoinNetwork: $network")
    }
  }

  private fun getAssetSchema(schema: String): AssetSchema {
    return when (schema) {
      "Nia" -> AssetSchema.NIA
      "Uda" -> AssetSchema.UDA
      "Cfa" -> AssetSchema.CFA
      "Ifa" -> AssetSchema.IFA
      // Backward compatibility with uppercase
      "NIA" -> AssetSchema.NIA
      "UDA" -> AssetSchema.UDA
      "CFA" -> AssetSchema.CFA
      "IFA" -> AssetSchema.IFA
      else -> throw IllegalArgumentException("Unknown AssetSchema: $schema")
    }
  }

  override fun initializeWallet(
    network: String,
    accountXpubVanilla: String,
    accountXpubColored: String,
    mnemonic: String,
    masterFingerprint: String,
    supportedSchemas: ReadableArray,
    maxAllocationsPerUtxo: Double,
    vanillaKeychain: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val rgbDir = AppConstants.rgbDir
          ?: throw IllegalStateException("RGB directory not initialized. Call AppConstants.initContext() first.")

        val rgbNetwork = getNetwork(network)
        val schemaList = mutableListOf<AssetSchema>()
        for (i in 0 until supportedSchemas.size()) {
          val schemaStr = supportedSchemas.getString(i)
          schemaList.add(getAssetSchema(schemaStr ?: throw IllegalArgumentException("Invalid schema at index $i")))
        }

        val walletData = WalletData(
          dataDir = rgbDir.absolutePath,
          bitcoinNetwork = rgbNetwork,
          databaseType = DatabaseType.SQLITE,
          maxAllocationsPerUtxo = maxAllocationsPerUtxo.toInt().toUInt(),
          accountXpubVanilla = accountXpubVanilla,
          accountXpubColored = accountXpubColored,
          mnemonic = mnemonic,
          masterFingerprint = masterFingerprint,
          vanillaKeychain = vanillaKeychain.toInt().toUByte(),
          supportedSchemas = schemaList
        )
        val wallet = Wallet(walletData)
        val walletId = WalletStore.create(wallet)
        withContext(Dispatchers.Main) {
          promise.resolve(walletId)
        }
      } catch (e: Exception) {
        Log.e(TAG, "initializeWallet error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun goOnline(
    walletId: Double,
    skipConsistencyCheck: Boolean,
    indexerUrl: String,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.wallet.goOnline(
          skipConsistencyCheck = skipConsistencyCheck,
          indexerUrl = indexerUrl
        )
        WalletStore.setOnline(walletId.toInt(), online)

        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "goOnline error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getBtcBalance(
    walletId: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val btcBalance = session.wallet.getBtcBalance(
          online = session.online,
          skipSync = skipSync
        )

        val result = Arguments.createMap()

        val vanilla = Arguments.createMap()
        vanilla.putDouble("settled", btcBalance.vanilla.settled.toDouble())
        vanilla.putDouble("future", btcBalance.vanilla.future.toDouble())
        vanilla.putDouble("spendable", btcBalance.vanilla.spendable.toDouble())

        val colored = Arguments.createMap()
        colored.putDouble("settled", btcBalance.colored.settled.toDouble())
        colored.putDouble("future", btcBalance.colored.future.toDouble())
        colored.putDouble("spendable", btcBalance.colored.spendable.toDouble())

        result.putMap("vanilla", vanilla)
        result.putMap("colored", colored)

        withContext(Dispatchers.Main) {
          promise.resolve(result)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getBtcBalance error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun walletClose(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        WalletStore.remove(walletId.toInt())
        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "walletClose error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  // Helper functions for type conversions
  private fun getAssignment(assignmentMap: ReadableMap): Assignment {
    val type = assignmentMap.getString("type") ?: throw IllegalArgumentException("Assignment type is required")
    return when (type) {
      "Fungible" -> {
        val amount = assignmentMap.getDouble("amount").toULong()
        Assignment.Fungible(amount)
      }
      "NonFungible" -> Assignment.NonFungible
      "InflationRight" -> {
        val amount = assignmentMap.getDouble("amount").toULong()
        Assignment.InflationRight(amount)
      }
      "ReplaceRight" -> Assignment.ReplaceRight
      "Any" -> Assignment.Any
      else -> throw IllegalArgumentException("Unknown Assignment type: $type")
    }
  }

  private fun getRefreshFilter(filterMap: ReadableMap): RefreshFilter {
    val statusStr = filterMap.getString("status") ?: throw IllegalArgumentException("RefreshFilter status is required")
    val status = when (statusStr) {
      "WaitingCounterparty" -> RefreshTransferStatus.WAITING_COUNTERPARTY
      "WaitingConfirmations" -> RefreshTransferStatus.WAITING_CONFIRMATIONS
      else -> throw IllegalArgumentException("Unknown RefreshTransferStatus: $statusStr")
    }
    val incoming = filterMap.getBoolean("incoming")
    return RefreshFilter(status, incoming)
  }

  private fun getRecipient(recipientMap: ReadableMap): Recipient {
    val recipientId = recipientMap.getString("recipientId") ?: throw IllegalArgumentException("Recipient recipientId is required")
    val assignmentMap = recipientMap.getMap("assignment") ?: throw IllegalArgumentException("Recipient assignment is required")
    val assignment = getAssignment(assignmentMap)

    val transportEndpointsArray = recipientMap.getArray("transportEndpoints") ?: throw IllegalArgumentException("Recipient transportEndpoints is required")
    val transportEndpoints = mutableListOf<String>()
    for (i in 0 until transportEndpointsArray.size()) {
      transportEndpoints.add(transportEndpointsArray.getString(i) ?: "")
    }

    val witnessData = if (recipientMap.hasKey("witnessData") && recipientMap.getType("witnessData") == ReadableType.Map) {
      val witnessDataMap = recipientMap.getMap("witnessData")
        ?: throw IllegalArgumentException("WitnessData map is null")

      val amountSat = witnessDataMap.getDouble("amountSat").toULong()
      val blinding = if (witnessDataMap.hasKey("blinding") && !witnessDataMap.isNull("blinding")) {
        witnessDataMap.getDouble("blinding").toULong()
      } else {
        null
      }

      WitnessData(amountSat, blinding)
    } else {
      null
    }

    return Recipient(recipientId, witnessData, assignment, transportEndpoints)
  }

  private fun assignmentToMap(assignment: Assignment): WritableMap {
    val map = Arguments.createMap()
    when (assignment) {
      is Assignment.Fungible -> {
        map.putString("type", "Fungible")
        map.putDouble("amount", assignment.amount.toDouble())
      }
      is Assignment.NonFungible -> {
        map.putString("type", "NonFungible")
      }
      is Assignment.InflationRight -> {
        map.putString("type", "InflationRight")
        map.putDouble("amount", assignment.amount.toDouble())
      }
      is Assignment.ReplaceRight -> {
        map.putString("type", "ReplaceRight")
      }
      is Assignment.Any -> {
        map.putString("type", "Any")
      }
    }
    return map
  }

  private fun outpointToMap(outpoint: org.rgbtools.Outpoint): WritableMap {
    val map = Arguments.createMap()
    map.putString("txid", outpoint.txid)
    map.putDouble("vout", outpoint.vout.toDouble())
    return map
  }

  private fun balanceToMap(balance: org.rgbtools.Balance): WritableMap {
    val map = Arguments.createMap()
    map.putDouble("settled", balance.settled.toDouble())
    map.putDouble("future", balance.future.toDouble())
    map.putDouble("spendable", balance.spendable.toDouble())
    return map
  }

  private fun assetCfaToMap(asset: org.rgbtools.AssetCfa): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("issuedSupply", asset.issuedSupply.toDouble())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", balanceToMap(asset.balance))
    asset.media?.let { media ->
      val mediaMap = Arguments.createMap()
      mediaMap.putString("filePath", media.filePath)
      mediaMap.putString("mime", media.mime)
      mediaMap.putString("digest", media.digest)
      map.putMap("media", mediaMap)
    }
    return map
  }

  private fun assetIfaToMap(asset: org.rgbtools.AssetIfa): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("ticker", asset.ticker)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("initialSupply", asset.initialSupply.toDouble())
    map.putDouble("maxSupply", asset.maxSupply.toDouble())
    map.putDouble("knownCirculatingSupply", asset.knownCirculatingSupply.toDouble())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", balanceToMap(asset.balance))
    asset.media?.let { media ->
      val mediaMap = Arguments.createMap()
      mediaMap.putString("filePath", media.filePath)
      mediaMap.putString("mime", media.mime)
      mediaMap.putString("digest", media.digest)
      map.putMap("media", mediaMap)
    }
    asset.rejectListUrl?.let { map.putString("rejectListUrl", it) }
    return map
  }

  private fun assetNiaToMap(asset: org.rgbtools.AssetNia): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("ticker", asset.ticker)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("issuedSupply", asset.issuedSupply.toDouble())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", balanceToMap(asset.balance))
    asset.media?.let { media ->
      val mediaMap = Arguments.createMap()
      mediaMap.putString("filePath", media.filePath)
      mediaMap.putString("mime", media.mime)
      mediaMap.putString("digest", media.digest)
      map.putMap("media", mediaMap)
    }
    return map
  }

  private fun assetUdaToMap(asset: org.rgbtools.AssetUda): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("ticker", asset.ticker)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", balanceToMap(asset.balance))
    asset.token?.let { tokenLight ->
      val token = Arguments.createMap()
      token.putInt("index", tokenLight.index.toInt())
      tokenLight.ticker?.let { token.putString("ticker", it) }
      tokenLight.name?.let { token.putString("name", it) }
      tokenLight.details?.let { token.putString("details", it) }
      token.putBoolean("embeddedMedia", tokenLight.embeddedMedia)

      tokenLight.media?.let { media ->
        val mediaMap = Arguments.createMap()
        mediaMap.putString("filePath", media.filePath)
        mediaMap.putString("mime", media.mime)
        mediaMap.putString("digest", media.digest)
        token.putMap("media", mediaMap)
      }

      val attachmentsArray = Arguments.createArray()
      tokenLight.attachments.forEach { (key, media) ->
        val attachmentMap = Arguments.createMap()
        attachmentMap.putInt("key", key.toInt())
        attachmentMap.putString("filePath", media.filePath)
        attachmentMap.putString("mime", media.mime)
        attachmentMap.putString("digest", media.digest)
        attachmentsArray.pushMap(attachmentMap)
      }
      token.putArray("attachments", attachmentsArray)
      token.putBoolean("reserves", tokenLight.reserves)
      map.putMap("token", token)
    }
    return map
  }

  private fun operationResultToMap(result: org.rgbtools.OperationResult): WritableMap {
    val map = Arguments.createMap()
    map.putString("txid", result.txid)
    map.putInt("batchTransferIdx", result.batchTransferIdx)
    return map
  }

  private fun receiveDataToMap(data: org.rgbtools.ReceiveData): WritableMap {
    val map = Arguments.createMap()
    map.putString("invoice", data.invoice)
    map.putString("recipientId", data.recipientId)
    data.expirationTimestamp?.let { map.putDouble("expirationTimestamp", it.toDouble()) }
    map.putInt("batchTransferIdx", data.batchTransferIdx)
    return map
  }

  // Wallet methods
  override fun backup(walletId: Double, backupPath: String, password: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        session.wallet.backup(backupPath, password)

        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "backup error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun backupInfo(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val hasBackup = session.wallet.backupInfo()

        withContext(Dispatchers.Main) {
          promise.resolve(hasBackup)
        }
      } catch (e: Exception) {
        Log.e(TAG, "backupInfo error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun blindReceive(
    walletId: Double,
    assetId: String?,
    assignment: ReadableMap,
    durationSeconds: Double?,
    transportEndpoints: ReadableArray,
    minConfirmations: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val assignmentObj = getAssignment(assignment)
        val endpoints = mutableListOf<String>()
        for (i in 0 until transportEndpoints.size()) {
          endpoints.add(transportEndpoints.getString(i) ?: "")
        }

        val receiveData = session.wallet.blindReceive(
          assetId,
          assignmentObj,
          durationSeconds?.toInt()?.toUInt(),
          endpoints,
          minConfirmations.toInt().toUByte()
        )

        withContext(Dispatchers.Main) {
          promise.resolve(receiveDataToMap(receiveData))
        }
      } catch (e: Exception) {
        Log.e(TAG, "blindReceive error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun createUtxos(
    walletId: Double,
    upTo: Boolean,
    num: Double?,
    size: Double?,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val count = session.wallet.createUtxos(
          online,
          upTo,
          num?.toInt()?.toUByte(),
          size?.toInt()?.toUInt(),
          feeRate.toULong(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(count.toInt())
        }
      } catch (e: Exception) {
        Log.e(TAG, "createUtxos error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun createUtxosBegin(
    walletId: Double,
    upTo: Boolean,
    num: Double?,
    size: Double?,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val psbt = session.wallet.createUtxosBegin(
          online,
          upTo,
          num?.toInt()?.toUByte(),
          size?.toInt()?.toUInt(),
          feeRate.toULong(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(psbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "createUtxosBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun createUtxosEnd(
    walletId: Double,
    signedPsbt: String,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val count = session.wallet.createUtxosEnd(online, signedPsbt, skipSync)

        withContext(Dispatchers.Main) {
          promise.resolve(count.toInt())
        }
      } catch (e: Exception) {
        Log.e(TAG, "createUtxosEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun deleteTransfers(
    walletId: Double,
    batchTransferIdx: Double?,
    noAssetOnly: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val deleted = session.wallet.deleteTransfers(
          batchTransferIdx?.toInt(),
          noAssetOnly
        )

        withContext(Dispatchers.Main) {
          promise.resolve(deleted)
        }
      } catch (e: Exception) {
        Log.e(TAG, "deleteTransfers error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun drainTo(
    walletId: Double,
    address: String,
    destroyAssets: Boolean,
    feeRate: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val txid = session.wallet.drainTo(online, address, destroyAssets, feeRate.toULong())

        withContext(Dispatchers.Main) {
          promise.resolve(txid)
        }
      } catch (e: Exception) {
        Log.e(TAG, "drainTo error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun drainToBegin(
    walletId: Double,
    address: String,
    destroyAssets: Boolean,
    feeRate: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val psbt = session.wallet.drainToBegin(online, address, destroyAssets, feeRate.toULong())

        withContext(Dispatchers.Main) {
          promise.resolve(psbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "drainToBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun drainToEnd(
    walletId: Double,
    signedPsbt: String,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val txid = session.wallet.drainToEnd(online, signedPsbt)

        withContext(Dispatchers.Main) {
          promise.resolve(txid)
        }
      } catch (e: Exception) {
        Log.e(TAG, "drainToEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun failTransfers(
    walletId: Double,
    batchTransferIdx: Double?,
    noAssetOnly: Boolean,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val failed = session.wallet.failTransfers(
          online,
          batchTransferIdx?.toInt(),
          noAssetOnly,
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(failed)
        }
      } catch (e: Exception) {
        Log.e(TAG, "failTransfers error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun finalizePsbt(walletId: Double, signedPsbt: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val finalizedPsbt = session.wallet.finalizePsbt(signedPsbt)

        withContext(Dispatchers.Main) {
          promise.resolve(finalizedPsbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "finalizePsbt error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getAddress(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val address = session.wallet.getAddress()

        withContext(Dispatchers.Main) {
          promise.resolve(address)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getAddress error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getAssetBalance(walletId: Double, assetId: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val balance = session.wallet.getAssetBalance(assetId)

        withContext(Dispatchers.Main) {
          promise.resolve(balanceToMap(balance))
        }
      } catch (e: Exception) {
        Log.e(TAG, "getAssetBalance error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getAssetMetadata(walletId: Double, assetId: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val metadata = session.wallet.getAssetMetadata(assetId)
        val map = Arguments.createMap()
        map.putString("assetId", assetId)
        val assetSchemaString = when (metadata.assetSchema) {
          AssetSchema.NIA -> "Nia"
          AssetSchema.UDA -> "Uda"
          AssetSchema.CFA -> "Cfa"
          AssetSchema.IFA -> "Ifa"
        }
        map.putString("assetSchema", assetSchemaString)
        map.putString("name", metadata.name)
        map.putInt("precision", metadata.precision.toInt())
        map.putDouble("initialSupply", metadata.initialSupply.toDouble())
        map.putDouble("maxSupply", metadata.maxSupply.toDouble())
        map.putDouble("knownCirculatingSupply", metadata.knownCirculatingSupply.toDouble())
        map.putDouble("timestamp", metadata.timestamp.toDouble())
        metadata.ticker?.let { map.putString("ticker", it) }
        metadata.details?.let { map.putString("details", it) }
        metadata.rejectListUrl?.let { map.putString("rejectListUrl", it) }
        metadata.token?.let { token ->
          val tokenMap = Arguments.createMap()
          tokenMap.putInt("index", token.index.toInt())
          token.ticker?.let { tokenMap.putString("ticker", it) }
          token.name?.let { tokenMap.putString("name", it) }
          token.details?.let { tokenMap.putString("details", it) }
          token.embeddedMedia?.let { embeddedMedia ->
            val embeddedMediaMap = Arguments.createMap()
            embeddedMediaMap.putString("mime", embeddedMedia.mime)
            val dataArray = Arguments.createArray()
            embeddedMedia.data.forEach { dataArray.pushInt(it.toInt()) }
            embeddedMediaMap.putArray("data", dataArray)
            tokenMap.putMap("embeddedMedia", embeddedMediaMap)
          }
          token.media?.let { media ->
            val mediaMap = Arguments.createMap()
            mediaMap.putString("filePath", media.filePath)
            mediaMap.putString("mime", media.mime)
            mediaMap.putString("digest", media.digest)
            tokenMap.putMap("media", mediaMap)
          }
          val attachmentsArray = Arguments.createArray()
          token.attachments.forEach { (key, media) ->
            val attachmentMap = Arguments.createMap()
            attachmentMap.putInt("key", key.toInt())
            attachmentMap.putString("filePath", media.filePath)
            attachmentMap.putString("mime", media.mime)
            attachmentMap.putString("digest", media.digest)
            attachmentsArray.pushMap(attachmentMap)
          }
          tokenMap.putArray("attachments", attachmentsArray)
          token.reserves?.let { reserves ->
            val reservesMap = Arguments.createMap()
            val utxoMap = Arguments.createMap()
            utxoMap.putString("txid", reserves.utxo.txid)
            utxoMap.putDouble("vout", reserves.utxo.vout.toDouble())
            reservesMap.putMap("utxo", utxoMap)
            val proofArray = Arguments.createArray()
            reserves.proof.forEach { proofArray.pushInt(it.toInt()) }
            reservesMap.putArray("proof", proofArray)
            tokenMap.putMap("reserves", reservesMap)
          }
          map.putMap("token", tokenMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(map)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getAssetMetadata error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getFeeEstimation(
    walletId: Double,
    blocks: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val feeRate = session.wallet.getFeeEstimation(online, blocks.toInt().toUShort())

        withContext(Dispatchers.Main) {
          promise.resolve(feeRate)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getFeeEstimation error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getMediaDir(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val mediaDir = session.wallet.getMediaDir()

        withContext(Dispatchers.Main) {
          promise.resolve(mediaDir)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getMediaDir error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getWalletData(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val walletData = session.wallet.getWalletData()
        val map = Arguments.createMap()
        map.putString("dataDir", walletData.dataDir)

        val networkString = when (walletData.bitcoinNetwork) {
          BitcoinNetwork.MAINNET -> "mainnet"
          BitcoinNetwork.TESTNET -> "testnet"
          BitcoinNetwork.TESTNET4 -> "testnet4"
          BitcoinNetwork.REGTEST -> "regtest"
          BitcoinNetwork.SIGNET -> "signet"
          else -> {
            throw Exception("Unknown bitcoin network")
          }
        }
        map.putString("bitcoinNetwork", networkString)

        val dbTypeString = when (walletData.databaseType) {
          DatabaseType.SQLITE -> "SQLITE"
        }
        map.putString("databaseType", dbTypeString)

        map.putDouble("maxAllocationsPerUtxo", walletData.maxAllocationsPerUtxo.toDouble())
        map.putString("accountXpubVanilla", walletData.accountXpubVanilla)
        map.putString("accountXpubColored", walletData.accountXpubColored)
        walletData.mnemonic?.let { map.putString("mnemonic", it) }
        map.putString("masterFingerprint", walletData.masterFingerprint)
        walletData.vanillaKeychain?.let { map.putInt("vanillaKeychain", it.toInt()) }
        val schemasArray = Arguments.createArray()
        walletData.supportedSchemas.forEach { schema ->
          val schemaString = when (schema) {
            AssetSchema.NIA -> "NIA"
            AssetSchema.UDA -> "UDA"
            AssetSchema.CFA -> "CFA"
            AssetSchema.IFA -> "IFA"
          }
          schemasArray.pushString(schemaString)
        }
        map.putArray("supportedSchemas", schemasArray)

        withContext(Dispatchers.Main) {
          promise.resolve(map)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getWalletData error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getWalletDir(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val walletDir = session.wallet.getWalletDir()

        withContext(Dispatchers.Main) {
          promise.resolve(walletDir)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getWalletDir error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun inflate(
    walletId: Double,
    assetId: String,
    inflationAmounts: ReadableArray,
    feeRate: Double,
    minConfirmations: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val amounts = mutableListOf<ULong>()
        for (i in 0 until inflationAmounts.size()) {
          amounts.add(inflationAmounts.getDouble(i).toULong())
        }

        val result = session.wallet.inflate(
          online,
          assetId,
          amounts,
          feeRate.toULong(),
          minConfirmations.toInt().toUByte()
        )

        withContext(Dispatchers.Main) {
          promise.resolve(operationResultToMap(result))
        }
      } catch (e: Exception) {
        Log.e(TAG, "inflate error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun inflateBegin(
    walletId: Double,
    assetId: String,
    inflationAmounts: ReadableArray,
    feeRate: Double,
    minConfirmations: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val amounts = mutableListOf<ULong>()
        for (i in 0 until inflationAmounts.size()) {
          amounts.add(inflationAmounts.getDouble(i).toULong())
        }

        val psbt = session.wallet.inflateBegin(
          online,
          assetId,
          amounts,
          feeRate.toULong(),
          minConfirmations.toInt().toUByte()
        )

        withContext(Dispatchers.Main) {
          promise.resolve(psbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "inflateBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun inflateEnd(
    walletId: Double,
    signedPsbt: String,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val result = session.wallet.inflateEnd(online, signedPsbt)

        withContext(Dispatchers.Main) {
          promise.resolve(operationResultToMap(result))
        }
      } catch (e: Exception) {
        Log.e(TAG, "inflateEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun issueAssetCfa(
    walletId: Double,
    name: String,
    details: String?,
    precision: Double,
    amounts: ReadableArray,
    filePath: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val amountsList = mutableListOf<ULong>()
        for (i in 0 until amounts.size()) {
          amountsList.add(amounts.getDouble(i).toULong())
        }

        val asset = session.wallet.issueAssetCfa(
          name,
          details,
          precision.toInt().toUByte(),
          amountsList,
          filePath
        )

        withContext(Dispatchers.Main) {
          promise.resolve(assetCfaToMap(asset))
        }
      } catch (e: Exception) {
        Log.e(TAG, "issueAssetCfa error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun issueAssetIfa(
    walletId: Double,
    ticker: String,
    name: String,
    precision: Double,
    amounts: ReadableArray,
    inflationAmounts: ReadableArray,
    replaceRightsNum: Double,
    rejectListUrl: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val amountsList = mutableListOf<ULong>()
        for (i in 0 until amounts.size()) {
          amountsList.add(amounts.getDouble(i).toULong())
        }

        val inflationAmountsList = mutableListOf<ULong>()
        for (i in 0 until inflationAmounts.size()) {
          inflationAmountsList.add(inflationAmounts.getDouble(i).toULong())
        }

        val asset = session.wallet.issueAssetIfa(
          ticker,
          name,
          precision.toInt().toUByte(),
          amountsList,
          inflationAmountsList,
          replaceRightsNum.toInt().toUByte(),
          rejectListUrl
        )

        withContext(Dispatchers.Main) {
          promise.resolve(assetIfaToMap(asset))
        }
      } catch (e: Exception) {
        Log.e(TAG, "issueAssetIfa error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun issueAssetNia(
    walletId: Double,
    ticker: String,
    name: String,
    precision: Double,
    amounts: ReadableArray,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val amountsList = mutableListOf<ULong>()
        for (i in 0 until amounts.size()) {
          amountsList.add(amounts.getDouble(i).toULong())
        }

        val asset = session.wallet.issueAssetNia(
          ticker,
          name,
          precision.toInt().toUByte(),
          amountsList
        )

        withContext(Dispatchers.Main) {
          promise.resolve(assetNiaToMap(asset))
        }
      } catch (e: Exception) {
        Log.e(TAG, "issueAssetNia error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun issueAssetUda(
    walletId: Double,
    ticker: String,
    name: String,
    details: String?,
    precision: Double,
    mediaFilePath: String?,
    attachmentsFilePaths: ReadableArray,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val attachmentsList = mutableListOf<String>()
        for (i in 0 until attachmentsFilePaths.size()) {
          attachmentsList.add(attachmentsFilePaths.getString(i) ?: "")
        }

        val asset = session.wallet.issueAssetUda(
          ticker,
          name,
          details,
          precision.toInt().toUByte(),
          mediaFilePath,
          attachmentsList
        )

        withContext(Dispatchers.Main) {
          promise.resolve(assetUdaToMap(asset))
        }
      } catch (e: Exception) {
        Log.e(TAG, "issueAssetUda error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun listAssets(
    walletId: Double,
    filterAssetSchemas: ReadableArray,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val schemaList = mutableListOf<AssetSchema>()
        for (i in 0 until filterAssetSchemas.size()) {
          val schemaStr = filterAssetSchemas.getString(i)
          schemaList.add(getAssetSchema(schemaStr ?: ""))
        }

        val assets = session.wallet.listAssets(schemaList)
        val result = Arguments.createMap()

        val niaArray = Arguments.createArray()
        assets.nia?.forEach { asset ->
          niaArray.pushMap(assetNiaToMap(asset))
        }
        result.putArray("nia", niaArray)

        val udaArray = Arguments.createArray()
        assets.uda?.forEach { asset ->
          udaArray.pushMap(assetUdaToMap(asset))
        }
        result.putArray("uda", udaArray)

        val cfaArray = Arguments.createArray()
        assets.cfa?.forEach { asset ->
          cfaArray.pushMap(assetCfaToMap(asset))
        }
        result.putArray("cfa", cfaArray)

        val ifaArray = Arguments.createArray()
        assets.ifa?.forEach { asset ->
          ifaArray.pushMap(assetIfaToMap(asset))
        }
        result.putArray("ifa", ifaArray)

        withContext(Dispatchers.Main) {
          promise.resolve(result)
        }
      } catch (e: Exception) {
        Log.e(TAG, "listAssets error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun listTransactions(
    walletId: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online

        val transactions = session.wallet.listTransactions(online, skipSync)
        val transactionsArray = Arguments.createArray()

        transactions.forEach { tx ->
          val txMap = Arguments.createMap()
          val txTypeString = when (tx.transactionType) {
            org.rgbtools.TransactionType.RGB_SEND -> "RgbSend"
            org.rgbtools.TransactionType.DRAIN -> "Drain"
            org.rgbtools.TransactionType.CREATE_UTXOS -> "CreateUtxos"
            org.rgbtools.TransactionType.USER -> "User"
          }
          txMap.putString("transactionType", txTypeString)
          txMap.putString("txid", tx.txid)
          txMap.putDouble("received", tx.received.toDouble())
          txMap.putDouble("sent", tx.sent.toDouble())
          txMap.putDouble("fee", tx.fee.toDouble())
          tx.confirmationTime?.let { blockTime ->
            txMap.putDouble("confirmationTime", blockTime.timestamp.toDouble())
          }
          transactionsArray.pushMap(txMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(transactionsArray)
        }
      } catch (e: Exception) {
        Log.e(TAG, "listTransactions error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun listTransfers(
    walletId: Double,
    assetId: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val transfers = session.wallet.listTransfers(assetId)
        val transfersArray = Arguments.createArray()

        transfers.forEach { transfer ->
          val transferMap = Arguments.createMap()
          transferMap.putInt("idx", transfer.idx)
          transferMap.putInt("batchTransferIdx", transfer.batchTransferIdx)
          transferMap.putDouble("createdAt", transfer.createdAt.toDouble())
          transferMap.putDouble("updatedAt", transfer.updatedAt.toDouble())

          val kindString = when (transfer.kind) {
            org.rgbtools.TransferKind.ISSUANCE -> "Issuance"
            org.rgbtools.TransferKind.RECEIVE_BLIND -> "ReceiveBlind"
            org.rgbtools.TransferKind.RECEIVE_WITNESS -> "ReceiveWitness"
            org.rgbtools.TransferKind.SEND -> "Send"
            org.rgbtools.TransferKind.INFLATION -> "Inflation"
          }
          transferMap.putString("kind", kindString)

          val statusString = when (transfer.status) {
            org.rgbtools.TransferStatus.WAITING_COUNTERPARTY -> "WaitingCounterparty"
            org.rgbtools.TransferStatus.WAITING_CONFIRMATIONS -> "WaitingConfirmations"
            org.rgbtools.TransferStatus.SETTLED -> "Settled"
            org.rgbtools.TransferStatus.FAILED -> "Failed"
          }
          transferMap.putString("status", statusString)

          transfer.txid?.let { transferMap.putString("txid", it) }
          transfer.recipientId?.let { transferMap.putString("recipientId", it) }
          transfer.expiration?.let { transferMap.putDouble("expiration", it.toDouble()) }

          transfer.requestedAssignment?.let {
            transferMap.putMap("requestedAssignment", assignmentToMap(it))
          }

          val assignmentsArray = Arguments.createArray()
          transfer.assignments.forEach { assignment ->
            assignmentsArray.pushMap(assignmentToMap(assignment))
          }
          transferMap.putArray("assignments", assignmentsArray)

          transfer.receiveUtxo?.let {
            transferMap.putMap("receiveUtxo", outpointToMap(it))
          }

          transfer.changeUtxo?.let {
            transferMap.putMap("changeUtxo", outpointToMap(it))
          }

          val transportEndpointsMap = Arguments.createArray()
          transfer.transportEndpoints.forEach {
            val endpoint = Arguments.createMap()
            endpoint.putString("endpoint", it.endpoint)
            endpoint.putBoolean("used", it.used)
            endpoint.putString("transportType", it.transportType.toString())
            transportEndpointsMap.pushMap(endpoint)
          }
          transferMap.putArray("transportEndpoints", transportEndpointsMap)

          transfer.invoiceString?.let { transferMap.putString("invoiceString", it) }
          transfer.consignmentPath?.let { transferMap.putString("consignmentPath", it) }

          transfersArray.pushMap(transferMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(transfersArray)
        }
      } catch (e: Exception) {
        Log.e(TAG, "listTransfers error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun listUnspents(
    walletId: Double,
    settledOnly: Boolean,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online

        val unspents = session.wallet.listUnspents(online, settledOnly, skipSync)
        val unspentsArray = Arguments.createArray()

        unspents.forEach { unspent ->
          val unspentMap = Arguments.createMap()
          val utxoMap = Arguments.createMap()
          val outpointMap = Arguments.createMap()
          outpointMap.putString("txid", unspent.utxo.outpoint.txid)
          outpointMap.putDouble("vout", unspent.utxo.outpoint.vout.toDouble())
          utxoMap.putMap("outpoint", outpointMap)
          utxoMap.putDouble("btcAmount", unspent.utxo.btcAmount.toDouble())
          utxoMap.putBoolean("colorable", unspent.utxo.colorable)
          utxoMap.putBoolean("exists", unspent.utxo.exists)
          unspentMap.putMap("utxo", utxoMap)
          unspentMap.putDouble("pendingBlinded", unspent.pendingBlinded.toDouble())

          val rgbAllocationsArray = Arguments.createArray()
          unspent.rgbAllocations.forEach { allocation ->
            val allocationMap = Arguments.createMap()
            allocation.assetId?.let { allocationMap.putString("assetId", it) }
            allocationMap.putMap("assignment", assignmentToMap(allocation.assignment))
            allocationMap.putBoolean("settled", allocation.settled)
            rgbAllocationsArray.pushMap(allocationMap)
          }
          unspentMap.putArray("rgbAllocations", rgbAllocationsArray)

          unspentsArray.pushMap(unspentMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(unspentsArray)
        }
      } catch (e: Exception) {
        Log.e(TAG, "listUnspents error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun refresh(
    walletId: Double,
    assetId: String?,
    filter: ReadableArray,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val filterList = mutableListOf<RefreshFilter>()
        for (i in 0 until filter.size()) {
          val filterMap = filter.getMap(i) ?: continue
          filterList.add(getRefreshFilter(filterMap))
        }

        val refreshed = session.wallet.refresh(online, assetId, filterList, skipSync)
        val result = Arguments.createMap()

        refreshed.forEach { (idx, refreshedTransfer) ->
          val refreshedMap = Arguments.createMap()
          refreshedTransfer.updatedStatus?.let { status ->
            val statusString = when (status) {
              org.rgbtools.TransferStatus.WAITING_COUNTERPARTY -> "WaitingCounterparty"
              org.rgbtools.TransferStatus.WAITING_CONFIRMATIONS -> "WaitingConfirmations"
              org.rgbtools.TransferStatus.SETTLED -> "Settled"
              org.rgbtools.TransferStatus.FAILED -> "Failed"
            }
            refreshedMap.putString("updatedStatus", statusString)
          }
          refreshedTransfer.failure?.let {
            refreshedMap.putString("failure", it.toString())
          }
          result.putMap(idx.toString(), refreshedMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(result)
        }
      } catch (e: Exception) {
        Log.e(TAG, "refresh error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun send(
    walletId: Double,
    recipientMap: ReadableMap,
    donation: Boolean,
    feeRate: Double,
    minConfirmations: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        // Convert ReadableMap to Map<String, List<Recipient>>
        val recipientMapNative = mutableMapOf<String, List<Recipient>>()
        val keys = recipientMap.keySetIterator()
        while (keys.hasNextKey()) {
          val key = keys.nextKey()
          val recipientsArray = recipientMap.getArray(key) ?: continue
          val recipientsList = mutableListOf<Recipient>()
          for (i in 0 until recipientsArray.size()) {
            val recipientMapItem = recipientsArray.getMap(i) ?: continue
            recipientsList.add(getRecipient(recipientMapItem))
          }
          recipientMapNative[key] = recipientsList
        }

        val result = session.wallet.send(
          online,
          recipientMapNative,
          donation,
          feeRate.toULong(),
          minConfirmations.toInt().toUByte(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(operationResultToMap(result))
        }
      } catch (e: Exception) {
        Log.e(TAG, "send error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendBegin(
    walletId: Double,
    recipientMap: ReadableMap,
    donation: Boolean,
    feeRate: Double,
    minConfirmations: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        // Convert ReadableMap to Map<String, List<Recipient>>
        val recipientMapNative = mutableMapOf<String, List<Recipient>>()
        val keys = recipientMap.keySetIterator()
        while (keys.hasNextKey()) {
          val key = keys.nextKey()
          val recipientsArray = recipientMap.getArray(key) ?: continue
          val recipientsList = mutableListOf<Recipient>()
          for (i in 0 until recipientsArray.size()) {
            val recipientMapItem = recipientsArray.getMap(i) ?: continue
            recipientsList.add(getRecipient(recipientMapItem))
          }
          recipientMapNative[key] = recipientsList
        }

        val psbt = session.wallet.sendBegin(
          online,
          recipientMapNative,
          donation,
          feeRate.toULong(),
          minConfirmations.toInt().toUByte()
        )

        withContext(Dispatchers.Main) {
          promise.resolve(psbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendBtc(
    walletId: Double,
    address: String,
    amount: Double,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val txid = session.wallet.sendBtc(
          online,
          address,
          amount.toULong(),
          feeRate.toULong(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(txid)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendBtc error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendBtcBegin(
    walletId: Double,
    address: String,
    amount: Double,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val psbt = session.wallet.sendBtcBegin(
          online,
          address,
          amount.toULong(),
          feeRate.toULong(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(psbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendBtcBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendBtcEnd(
    walletId: Double,
    signedPsbt: String,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val txid = session.wallet.sendBtcEnd(online, signedPsbt, skipSync)

        withContext(Dispatchers.Main) {
          promise.resolve(txid)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendBtcEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendEnd(
    walletId: Double,
    signedPsbt: String,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val result = session.wallet.sendEnd(online, signedPsbt, skipSync)

        withContext(Dispatchers.Main) {
          promise.resolve(operationResultToMap(result))
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun signPsbt(walletId: Double, unsignedPsbt: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val signedPsbt = session.wallet.signPsbt(unsignedPsbt)

        withContext(Dispatchers.Main) {
          promise.resolve(signedPsbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "signPsbt error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sync(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        session.wallet.sync(online)
        val refresh = session.wallet.refresh(online, null, emptyList(), false)
        val failed = session.wallet.failTransfers(online, null, false, false)
        val delete = session.wallet.deleteTransfers(null, false)
        val assets = session.wallet.listAssets(listOf())
        val rgb25Assets = assets.cfa
        val rgb20Assets = assets.nia
        val udaAssets = assets.uda
        if (rgb20Assets != null) {
          for (rgb20Asset in rgb20Assets) {
            val assetRefresh = session.wallet.refresh(online, rgb20Asset.assetId, listOf(), false)
          }
        }
        if (rgb25Assets != null) {
          for (rgb25Asset in rgb25Assets) {
            val assetRefresh = session.wallet.refresh(online, rgb25Asset.assetId, listOf(), false)
          }
        }
        if (udaAssets != null) {
          for (udaAsset in udaAssets) {
            val assetRefresh = session.wallet.refresh(online, udaAsset.assetId, listOf(), false)
          }
        }
        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sync error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun witnessReceive(
    walletId: Double,
    assetId: String?,
    assignment: ReadableMap,
    durationSeconds: Double?,
    transportEndpoints: ReadableArray,
    minConfirmations: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val assignmentObj = getAssignment(assignment)
        val endpoints = mutableListOf<String>()
        for (i in 0 until transportEndpoints.size()) {
          endpoints.add(transportEndpoints.getString(i) ?: "")
        }

        val receiveData = session.wallet.witnessReceive(
          assetId,
          assignmentObj,
          durationSeconds?.toInt()?.toUInt(),
          endpoints,
          minConfirmations.toInt().toUByte()
        )

        withContext(Dispatchers.Main) {
          promise.resolve(receiveDataToMap(receiveData))
        }
      } catch (e: Exception) {
        Log.e(TAG, "witnessReceive error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

}
