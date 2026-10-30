package com.rgbsdkrn

import org.utexo.rgblightningnode.BurnRequest

// Match the iOS bridge's exact unsigned conversions before an irreversible burn.
internal fun createRlnBurnRequest(
  assetId: String,
  amount: String,
  burnRecipient: String?,
  feeRate: Double,
  minConfirmations: Double
): BurnRequest {
  val units = amount.takeIf { it.isNotEmpty() && it.all { digit -> digit in '0'..'9' } }
    ?.toULongOrNull()
  // ULong.MAX_VALUE rounds up to 2^64 as a Double. Reject that boundary before
  // toULong(), which would otherwise silently clamp an out-of-range value.
  require(units != null && units > 0uL &&
    feeRate.isFinite() && feeRate > 0.0 && feeRate < ULong.MAX_VALUE.toDouble() &&
    feeRate % 1.0 == 0.0 &&
    minConfirmations.isFinite() && minConfirmations >= 0.0 &&
    minConfirmations <= UByte.MAX_VALUE.toDouble() && minConfirmations % 1.0 == 0.0
  ) { "Invalid burn amount, fee rate or confirmations" }

  val recipient = burnRecipient?.let { hex ->
    require(hex.length == 64 && hex.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) {
      "burnRecipient must be 32-byte hex without 0x"
    }
    ByteArray(32) { index -> hex.substring(index * 2, index * 2 + 2).toInt(16).toByte() }
  }

  return BurnRequest(
    assetId = assetId,
    amount = units,
    burnRecipient = recipient,
    feeRate = feeRate.toULong(),
    minConfirmations = minConfirmations.toInt().toUByte()
  )
}
