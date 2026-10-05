package com.rgbsdkrn

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class RlnBurnRequestTest {
  @Test
  fun preservesUnsignedAmountsAboveTheJavaScriptAndSignedLongRanges() {
    for (amount in listOf("9007199254740993", "9223372036854775808", "18446744073709551615")) {
      val request = createRlnBurnRequest("asset", amount, null, 2.0, 3.0)
      assertEquals(amount, request.amount.toString())
      assertEquals("asset", request.assetId)
      assertEquals(2uL, request.feeRate)
      assertEquals(3.toUByte(), request.minConfirmations)
      assertNull(request.burnRecipient)
    }
  }

  @Test
  fun rejectsZeroOverflowAndNonDecimalAmounts() {
    for (amount in listOf("", "0", "000", "-1", "+1", " 1", "1 ", "1.5", "1e3", "１", "18446744073709551616")) {
      assertThrows("amount=$amount", IllegalArgumentException::class.java) {
        createRlnBurnRequest("asset", amount, null, 2.0, 3.0)
      }
    }
  }

  @Test
  fun decodesAllRecipientBytesIncludingLeadingZeroesAndHighBits() {
    val recipient = "0000000000000000000000001234567890abcdef1234567890ABCDEF12345678"
    val request = createRlnBurnRequest("asset", "1", recipient, 1.0, 0.0)
    val expected = ByteArray(12) + byteArrayOf(
      0x12, 0x34, 0x56, 0x78, 0x90.toByte(), 0xab.toByte(), 0xcd.toByte(), 0xef.toByte(),
      0x12, 0x34, 0x56, 0x78, 0x90.toByte(), 0xab.toByte(), 0xcd.toByte(), 0xef.toByte(),
      0x12, 0x34, 0x56, 0x78
    )
    assertArrayEquals(expected, request.burnRecipient)
  }

  @Test
  fun rejectsRecipientsWithPrefixWrongLengthOrNonAsciiHex() {
    for (recipient in listOf("", "ab".repeat(31), "ab".repeat(33), "0x" + "ab".repeat(32),
      "g".repeat(64), "Ａ".repeat(64), "ab".repeat(31) + "\n0")) {
      val error = assertThrows(IllegalArgumentException::class.java) {
        createRlnBurnRequest("asset", "1", recipient, 2.0, 3.0)
      }
      assertEquals("burnRecipient must be 32-byte hex without 0x", error.message)
    }
  }

  @Test
  fun rejectsInvalidFeeRatesInsteadOfTruncatingOrClamping() {
    for (rate in listOf(0.0, -1.0, 0.5, 1.5, Double.NaN, Double.POSITIVE_INFINITY,
      Double.NEGATIVE_INFINITY, 18446744073709551616.0, Double.MAX_VALUE)) {
      assertThrows("feeRate=$rate", IllegalArgumentException::class.java) {
        createRlnBurnRequest("asset", "1", null, rate, 3.0)
      }
    }
    val largestExactU64Double = Math.nextDown(18446744073709551616.0)
    assertEquals(18446744073709549568uL,
      createRlnBurnRequest("asset", "1", null, largestExactU64Double, 3.0).feeRate)
  }

  @Test
  fun validatesConfirmationsWithoutWrappingOrTruncating() {
    for (confirmations in listOf(-1.0, 0.5, 256.0, Double.NaN, Double.POSITIVE_INFINITY,
      Double.NEGATIVE_INFINITY, Double.MAX_VALUE)) {
      assertThrows("minConfirmations=$confirmations", IllegalArgumentException::class.java) {
        createRlnBurnRequest("asset", "1", null, 2.0, confirmations)
      }
    }
    for (confirmations in listOf(0.0, 255.0)) {
      assertEquals(confirmations.toInt().toUByte(),
        createRlnBurnRequest("asset", "1", null, 2.0, confirmations).minConfirmations)
    }
  }
}
