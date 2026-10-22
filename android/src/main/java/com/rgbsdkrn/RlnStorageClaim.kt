package com.rgbsdkrn

import java.io.File

internal class RlnStorageClaimError(val code: String, message: String) : Exception(message)

/**
 * Claims a storage directory for an RLN node before native creation. Pure
 * java.io so the JVM smoke test exercises the exact code RgbModule runs.
 * Existing RLN directories without a marker (created before the marker
 * existed) are claimed in place; RGB Lib profiles are never opened as RLN.
 */
internal object RlnStorageClaim {
  const val MARKER = ".rln-sdk-profile"
  private const val RGB_LIB_PROFILE = "rgb-sdk-profile.json"
  private const val RGB_LIB_LOCK = ".rgb-sdk.lock"

  fun claim(storageDirPath: String) {
    val root = File(storageDirPath).canonicalFile
    if (!root.exists() && !root.mkdirs()) {
      throw java.io.IOException("Cannot create wallet storage directory")
    }
    val rgbLock = File(root, RGB_LIB_LOCK)
    if (rgbLock.exists() || File(root, RGB_LIB_PROFILE).exists()) {
      throw RlnStorageClaimError("WALLET_PROFILE_MISMATCH", "Storage belongs to RGB Lib; use a separate RLN directory")
    }
    File(root, MARKER).createNewFile()
    // An RGB Lib open may have raced the marker; it rejects the marker, but do not proceed either.
    if (rgbLock.exists()) {
      throw RlnStorageClaimError("WALLET_STORAGE_IN_USE", "Storage is being opened by RGB Lib")
    }
  }
}
