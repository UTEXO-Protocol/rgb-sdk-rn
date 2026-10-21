package com.rgbsdkrn

import java.io.File
import java.nio.file.Files

/** RLN side of RLN/RGB Lib storage exclusion; needs no native artifacts. */
internal fun rlnStorageClaimChecks() {
  val root = Files.createTempDirectory("rln-storage-claim-").toFile()
  fun code(dir: File) = (runCatching { RlnStorageClaim.claim(dir.path) }.exceptionOrNull() as? RlnStorageClaimError)?.code
  try {
    // Fresh directory: created and marked as RLN.
    val fresh = root.resolve("fresh")
    RlnStorageClaim.claim(fresh.path)
    check(fresh.resolve(RlnStorageClaim.MARKER).isFile) { "RLN marker was not created" }
    RlnStorageClaim.claim(fresh.path)

    // Legacy RLN storage created before the marker existed still opens and keeps its data.
    val legacy = root.resolve("legacy").apply { mkdirs() }
    legacy.resolve("rgb_lightning_node.db").writeText("legacy")
    legacy.resolve(".ldk").mkdirs()
    RlnStorageClaim.claim(legacy.path)
    check(legacy.resolve("rgb_lightning_node.db").readText() == "legacy") { "Legacy RLN data changed" }
    check(legacy.resolve(RlnStorageClaim.MARKER).isFile) { "Legacy RLN storage was not marked" }

    // RGB Lib profile or lease: RLN must refuse without writing a marker.
    for (name in listOf("rgb-sdk-profile.json", ".rgb-sdk.lock")) {
      val rgb = root.resolve("rgb-$name").apply { mkdirs() }
      rgb.resolve(name).writeText("{}")
      check(code(rgb) == "WALLET_PROFILE_MISMATCH") { "RLN opened RGB Lib storage ($name)" }
      check(!rgb.resolve(RlnStorageClaim.MARKER).exists()) { "RLN marked RGB Lib storage ($name)" }
    }
  } finally {
    root.deleteRecursively()
  }
  println("RLN storage claim: fresh, legacy and RGB Lib rejection checks passed")
}
