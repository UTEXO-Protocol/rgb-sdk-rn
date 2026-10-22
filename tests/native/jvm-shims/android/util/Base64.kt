package android.util

/** JVM stand-in for the one android.util.Base64 call used by RgbLibSessionStore. */
object Base64 {
  const val NO_WRAP = 2
  @JvmStatic
  fun encodeToString(input: ByteArray, flags: Int): String {
    require(flags == NO_WRAP) { "Only NO_WRAP is supported on the JVM" }
    return java.util.Base64.getEncoder().encodeToString(input)
  }
}
