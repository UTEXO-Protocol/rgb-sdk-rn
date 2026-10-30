import Foundation

/// Claims a storage directory for an RLN node before native creation. Pure
/// Foundation so the native smoke test exercises the exact code the RLN bridge
/// runs. Existing RLN directories without a marker (created before the marker
/// existed) are claimed in place; RGB Lib profiles are never opened as RLN.
@objc(RlnStorageClaim)
public final class RlnStorageClaim: NSObject {
  @objc public static let marker = ".rln-sdk-profile"

  /// Returns nil when the directory is claimed, otherwise an RLN bridge error
  /// dictionary (`error`, `errorCode`). Filesystem failures are thrown.
  public static func claim(_ storageDirPath: String) throws -> NSDictionary? {
    let fm = FileManager.default
    let storageRoot = URL(fileURLWithPath: storageDirPath, isDirectory: true)
    try fm.createDirectory(at: storageRoot, withIntermediateDirectories: true)
    let rgbLock = storageRoot.appendingPathComponent(".rgb-sdk.lock").path
    let rgbProfile = storageRoot.appendingPathComponent("rgb-sdk-profile.json").path
    if fm.fileExists(atPath: rgbLock) || fm.fileExists(atPath: rgbProfile) {
      return ["error": "Storage belongs to RGB Lib; use a separate RLN directory", "errorCode": "WALLET_PROFILE_MISMATCH"]
    }
    let markerURL = storageRoot.appendingPathComponent(marker)
    if !fm.fileExists(atPath: markerURL.path) {
      try Data("rln".utf8).write(to: markerURL, options: .atomic)
    }
    // An RGB Lib open may have raced the marker; it rejects the marker, but do not proceed either.
    if fm.fileExists(atPath: rgbLock) {
      return ["error": "Storage is being opened by RGB Lib", "errorCode": "WALLET_STORAGE_IN_USE"]
    }
    return nil
  }

  /// Objective-C entry point for native tests: returns nil on success, or an
  /// error dictionary (filesystem failures use `NATIVE_BRIDGE_ERROR`).
  @objc(claimForTesting:)
  public static func claimForTesting(_ storageDirPath: String) -> NSDictionary? {
    do { return try claim(storageDirPath) }
    catch { return ["error": String(describing: error), "errorCode": "NATIVE_BRIDGE_ERROR"] }
  }
}
