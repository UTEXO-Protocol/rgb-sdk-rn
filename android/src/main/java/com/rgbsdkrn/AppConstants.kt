package com.rgbsdkrn

import android.content.Context
import java.io.File

object AppConstants {
  const val rgbDirName = ""
  var appContext: Context? = null
  var rgbDir: File? = null
  const val backupName = "%s.rgb_backup"

  const val testnetElectrumURL = "ssl://electrum.iriswallet.com:50013"
  const val testnet4ElectrumURL = "ssl://electrum.iriswallet.com:50053"

  const val regtestElectrumURL = "electrum.rgbtools.org:50041"
  const val mainnetElectrumUrl = "ssl://electrum.iriswallet.com:50003"

  const val proxyConsignmentEndpoint = "rpcs://proxy.iriswallet.com/0.2/json-rpc"
  const val rgbDefaultPrecision: UByte = 0U
  const val defaultFeeRate = 50.0F

  private val mainnetUrls = listOf(
    "ssl://electrum.iriswallet.com:50003",
    "https://blockstream.info/api"
  )
  private var callCount = 0

  @JvmStatic
  fun initContext(context: Context) {
    appContext = context
    rgbDir = File(context.filesDir, rgbDirName)
  }

  @JvmStatic
  fun ensureInitialized(context: Context) {
    if (appContext == null || rgbDir == null) {
      initContext(context)
    }
  }

  fun getElectrumUrl(network: String): String {
    return when (network.lowercase()) {
      "testnet" -> testnetElectrumURL
      "testnet4" -> testnet4ElectrumURL
      "regtest" -> regtestElectrumURL
      "mainnet" -> getNextMainnetUrl()
      else -> testnetElectrumURL
    }
  }

  private fun getNextMainnetUrl(): String {
    val url = mainnetUrls[callCount % mainnetUrls.size]
    callCount++
    return url
  }
}

