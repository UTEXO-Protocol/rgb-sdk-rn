#if canImport(RGBLib)
import Foundation
import CryptoKit
import Darwin
import RGBLib

private struct RgbBridgeFailure: Error {
  let code: String
  let message: String
}
private func rgbInvalid(_ message: String) -> RgbBridgeFailure {
  RgbBridgeFailure(code: "INVALID_CONFIG", message: message)
}
private struct RgbParams {
  let values: [String: Any]
  func optional(_ key: String) -> String? { values[key] as? String }
  func has(_ key: String) -> Bool { values[key] != nil && !(values[key] is NSNull) }
  func string(_ key: String) throws -> String {
    guard let value = optional(key) else { throw rgbInvalid("Missing \(key)") }
    return value
  }
  func bool(_ key: String) throws -> Bool {
    guard let value = values[key] as? Bool else { throw rgbInvalid("Invalid \(key)") }
    return value
  }
  func strings(_ key: String) throws -> [String] {
    guard let value = values[key] as? [String] else { throw rgbInvalid("Invalid \(key)") }
    return value
  }
  func amount(_ key: String) throws -> UInt64 {
    guard let text = optional(key), !text.isEmpty, text.allSatisfy({ $0 >= "0" && $0 <= "9" }), let n = UInt64(text) else { throw rgbInvalid("Invalid decimal \(key)") }
    return n
  }
  func number<T: FixedWidthInteger>(_ key: String, _ type: T.Type) throws -> T {
    guard let value = values[key] as? NSNumber, let n = T(exactly: value.doubleValue) else { throw rgbInvalid("Invalid \(key)") }
    return n
  }
}
private func rgbNetworkFromName(_ name: String) throws -> RGBLib.BitcoinNetwork {
  switch name {
  case "mainnet": return .mainnet
  case "testnet": return .testnet
  case "testnet4": return .testnet4
  case "signet": return .signet
  case "regtest": return .regtest
  case "utexo": return .signetCustom
  default: throw rgbInvalid("Unsupported Bitcoin network")
  }
}
private let rgbProfileName = "rgb-sdk-profile.json"
private let rgbLockName = ".rgb-sdk.lock"
private final class RgbLibLease {
  let root: URL
  private var descriptor: Int32 = -1
  init(_ path: String) throws {
    guard path.hasPrefix("/") else { throw rgbInvalid("Storage path must be absolute") }
    root = URL(fileURLWithPath: path, isDirectory: true).resolvingSymlinksInPath().standardizedFileURL
    let fm = FileManager.default
    try fm.createDirectory(at: root, withIntermediateDirectories: true)
    if try !fm.fileExists(atPath: root.appendingPathComponent(rgbProfileName).path) &&
       fm.contentsOfDirectory(atPath: root.path).contains(where: { $0 != rgbLockName }) {
      throw RgbBridgeFailure(code: "WALLET_STORAGE_NOT_EMPTY", message: "Use a separate empty wallet directory")
    }
    descriptor = Darwin.open(root.appendingPathComponent(rgbLockName).path, O_CREAT | O_RDWR, 0o600)
    guard descriptor >= 0 else { throw rgbInvalid("Cannot open wallet storage lock") }
    if flock(descriptor, LOCK_EX | LOCK_NB) != 0 {
      Darwin.close(descriptor); descriptor = -1
      throw RgbBridgeFailure(code: "WALLET_STORAGE_IN_USE", message: "Wallet storage is already in use")
    }
  }
  deinit { release() }
  func release() {
    if descriptor >= 0 { flock(descriptor, LOCK_UN); Darwin.close(descriptor); descriptor = -1 }
  }
}
private final class RgbLibSession {
  var wallet: RGBLib.Wallet?
  let lease: RgbLibLease
  var profile: [String: Any]
  let reuse: Bool
  var online: RGBLib.Online?
  init(wallet: RGBLib.Wallet, lease: RgbLibLease, profile: [String: Any], reuse: Bool) {
    self.wallet = wallet; self.lease = lease; self.profile = profile; self.reuse = reuse
  }
  func requireOnline() throws -> RGBLib.Online {
    guard let value = online else { throw RgbBridgeFailure(code: "WALLET_OFFLINE", message: "Call unlock first") }
    return value
  }
  func save() throws {
    guard let wallet else { throw rgbInvalid("Wallet is closed") }
    let data = try JSONSerialization.data(withJSONObject: profile)
    try data.write(to: URL(fileURLWithPath: wallet.getWalletDir()).appendingPathComponent(rgbProfileName), options: .atomic)
    try data.write(to: lease.root.appendingPathComponent(rgbProfileName), options: .atomic)
  }
}

/// Mirrors the RLN helper: all wallet operations call generated UniFFI methods.
@objc(RgbLibSwiftHelper)
public final class RgbLibSwiftHelper: NSObject {
  private static let queue = DispatchQueue(label: "org.utexo.rgb-lib.sessions")
  private static var sessions: [String: RgbLibSession] = [:]

  @objc(execute:params:)
  public static func execute(_ operation: String, params: NSDictionary) -> NSDictionary {
    queue.sync {
      do { return ["result": try call(operation, RgbParams(values: params as? [String: Any] ?? [:]))] }
      catch let error as RgbBridgeFailure { return ["error": ["code": error.code, "message": error.message]] }
      catch let error as RGBLib.RgbLibError {
        let name = String(describing: error).prefix { $0 != "(" }
        return ["error": ["code": "RGB_LIB_" + name.prefix(1).uppercased() + name.dropFirst(), "message": String(describing: error)]]
      }
      catch { return ["error": ["code": "NATIVE_BRIDGE_ERROR", "message": "RGB Lib native bridge operation failed"]] }
    }
  }
  private static func open(_ p: RgbParams) throws -> String {
    let net = try p.string("network")
    let witnessName = try p.string("witnessVersion")
    let witness: RGBLib.WitnessVersion
    switch witnessName {
    case "taproot": witness = .taproot
    case "segwit-v0": witness = .segWitV0
    default: throw rgbInvalid("Unsupported witness version")
    }
    let keys = try RGBLib.restoreKeys(bitcoinNetwork: rgbNetworkFromName(net), mnemonic: p.string("mnemonic"), witnessVersion: witness)
    let max = try p.number("maxAllocationsPerUtxo", UInt32.self)
    guard max > 0 else { throw rgbInvalid("maxAllocationsPerUtxo must be positive") }
    let text = "\(net):\(witnessName):\(keys.accountXpubVanilla):\(keys.accountXpubColored)"
    let id = SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    let expected: [String: Any] = [
      "formatVersion": 1, "backend": "rgb-lib", "id": id, "network": net,
      "witnessVersion": witnessName, "maxAllocations": NSNumber(value: max),
      "masterFingerprint": keys.masterFingerprint, "accountXpubVanilla": keys.accountXpubVanilla,
      "accountXpubColored": keys.accountXpubColored
    ]
    let lease = try RgbLibLease(p.string("dataDir"))
    let marker = lease.root.appendingPathComponent(rgbProfileName)
    var profile = expected
    if FileManager.default.fileExists(atPath: marker.path) {
      guard let stored = try JSONSerialization.jsonObject(with: Data(contentsOf: marker)) as? [String: Any],
        expected.allSatisfy({ key, value in (stored[key] as? NSObject)?.isEqual(value) == true }) else {
        throw RgbBridgeFailure(code: "WALLET_PROFILE_MISMATCH", message: "Storage belongs to a different wallet profile")
      }
      profile = stored
    } else {
      guard try FileManager.default.contentsOfDirectory(atPath: lease.root.path).allSatisfy({ $0 == rgbLockName }) else {
        throw RgbBridgeFailure(code: "WALLET_STORAGE_NOT_EMPTY", message: "Use a separate empty wallet directory")
      }
      try JSONSerialization.data(withJSONObject: expected).write(to: marker, options: .atomic)
    }
    let wallet = try RGBLib.Wallet(
      walletData: RGBLib.WalletData(dataDir: lease.root.path, bitcoinNetwork: rgbNetworkFromName(net), databaseType: .sqlite, maxAllocationsPerUtxo: max, supportedSchemas: [.nia, .uda, .cfa, .ifa, .bfa]),
      keys: RGBLib.SinglesigKeys(accountXpubVanilla: keys.accountXpubVanilla, accountXpubColored: keys.accountXpubColored, vanillaKeychain: nil, masterFingerprint: keys.masterFingerprint, mnemonic: keys.mnemonic, witnessVersion: witness)
    )
    let session = RgbLibSession(wallet: wallet, lease: lease, profile: profile, reuse: try p.bool("reuseAddresses"))
    try session.save()
    let handle = UUID().uuidString
    sessions[handle] = session
    return handle
  }
  private static func restore(_ p: RgbParams) throws {
    let lease = try RgbLibLease(p.string("dataDir"))
    let fm = FileManager.default
    guard try fm.contentsOfDirectory(atPath: lease.root.path).allSatisfy({ $0 == rgbLockName }) else {
      throw RgbBridgeFailure(code: "WALLET_STORAGE_NOT_EMPTY", message: "Restore requires an empty directory")
    }
    let stage = lease.root.appendingPathComponent(".restore")
    try fm.createDirectory(at: stage, withIntermediateDirectories: false)
    defer { try? fm.removeItem(at: stage) }
    try RGBLib.restoreBackup(backupPath: p.string("backupPath"), password: p.string("password"), dataDir: stage.path)
    let dirs = try fm.contentsOfDirectory(at: stage, includingPropertiesForKeys: nil).filter { fm.fileExists(atPath: $0.appendingPathComponent(rgbProfileName).path) }
    guard dirs.count == 1,
      let profile = try JSONSerialization.jsonObject(with: Data(contentsOf: dirs[0].appendingPathComponent(rgbProfileName))) as? [String: Any] else {
      throw RgbBridgeFailure(code: "BACKUP_PROFILE_MISSING", message: "Backup does not contain an SDK RGB Lib profile")
    }
    guard profile["formatVersion"] as? Int == 1, profile["backend"] as? String == "rgb-lib",
      let fingerprint = profile["masterFingerprint"] as? String, fingerprint.count == 8,
      fingerprint.allSatisfy({ $0.isHexDigit }), dirs[0].lastPathComponent == fingerprint else {
      throw RgbBridgeFailure(code: "BACKUP_PROFILE_MISMATCH", message: "Invalid backup profile")
    }
    try fm.moveItem(at: dirs[0], to: lease.root.appendingPathComponent(fingerprint))
    try JSONSerialization.data(withJSONObject: profile).write(to: lease.root.appendingPathComponent(rgbProfileName), options: .atomic)
  }
  private static func consignment(_ s: RgbLibSession, _ p: RgbParams) throws -> URL {
    let w = s.wallet!
    let paths = Set(try w.listTransfers(assetFilter: .id(assetId: p.string("assetId")), txid: p.string("txid")).compactMap { $0.consignmentPath })
    guard paths.count == 1, let path = paths.first else { throw RgbBridgeFailure(code: "CONSIGNMENT_NOT_FOUND", message: "No unique consignment for this transfer") }
    let file = URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL
    let root = URL(fileURLWithPath: w.getWalletDir()).resolvingSymlinksInPath().standardizedFileURL.path
    guard file.path.hasPrefix(root + "/"), (try file.resourceValues(forKeys: [.isRegularFileKey])).isRegularFile == true else {
      throw RgbBridgeFailure(code: "INVALID_CONSIGNMENT_PATH", message: "Consignment is outside wallet storage")
    }
    return file
  }
  private static func send(_ s: RgbLibSession, _ p: RgbParams) throws -> Any {
    let invoice = try RGBLib.Invoice(invoiceString: p.string("invoice")).invoiceData()
    guard invoice.network == (try rgbNetworkFromName(s.profile["network"] as! String)) else { throw rgbInvalid("Invoice network does not match wallet") }
    let supplied = p.optional("assetId")
    if let supplied, let embedded = invoice.assetId, supplied != embedded { throw rgbInvalid("Asset override does not match invoice") }
    guard let asset = invoice.assetId ?? supplied else { throw rgbInvalid("Asset ID is required") }
    let amount = try p.has("amount") ? p.amount("amount") : nil
    let assignment: RGBLib.Assignment
    switch invoice.assignment {
    case .any:
      guard let amount, amount > 0 else { throw rgbInvalid("Amount is required") }
      assignment = .fungible(amount: amount)
    case .fungible(let n):
      if let amount, amount != n { throw rgbInvalid("Amount override does not match invoice") }
      assignment = invoice.assignment
    default:
      guard amount == nil else { throw rgbInvalid("Amount override is incompatible with invoice") }
      assignment = invoice.assignment
    }
    let now = UInt64(Date().timeIntervalSince1970)
    var expiry = now + 3600
    if let timestamp = invoice.expirationTimestamp {
      guard timestamp > now + 600 else { throw rgbInvalid("Invoice expires too soon") }
      expiry = timestamp - 600
    }
    let witness = try p.has("witnessAmountSat") ? RGBLib.WitnessData(amountSat: p.amount("witnessAmountSat"), blinding: p.has("witnessBlinding") ? p.amount("witnessBlinding") : nil) : nil
    let recipient = RGBLib.Recipient(recipientId: invoice.recipientId, witnessData: witness, assignment: assignment, transportEndpoints: invoice.transportEndpoints, publicKey: invoice.publicKey, encryption: invoice.encryption, expirationTimestamp: invoice.expirationTimestamp)
    return try rgbDto(s.wallet!.send(online: s.requireOnline(), recipientMap: [asset: [recipient]], donation: p.bool("donation"), feeRate: p.amount("feeRate"), minConfirmations: p.number("minConfirmations", UInt8.self), expirationTimestamp: expiry, senderTransportEndpoint: p.string("senderTransportEndpoint")))
  }
  private static func call(_ operation: String, _ p: RgbParams) throws -> Any {
    switch operation {
    case "getRuntimeInfo": return ["version": "v0.3.0-beta.7-upstream-dev-bfa.1", "sourceRevision": "ad87acb673262dbc0f2270b5b2e2f0d3db74a65a", "bridgeVersion": 2, "burn": true, "consignment": true, "bfa": true]
    case "openWallet": return try open(p)
    case "restoreBackup": try restore(p); return NSNull()
    default: break
    }
    let handle = try p.string("handle")
    guard let s = sessions[handle] else { throw RgbBridgeFailure(code: "WALLET_NOT_INITIALIZED", message: "Unknown or closed wallet") }
    if operation == "closeWallet" {
      s.wallet = nil; s.online = nil; s.lease.release(); sessions.removeValue(forKey: handle)
      return NSNull()
    }
    let w = s.wallet!
    switch operation {
    case "getWalletIdentity": return ["id": s.profile["id"]!, "network": s.profile["network"]!, "masterFingerprint": s.profile["masterFingerprint"]!]
    case "goOnline":
      let url = try p.string("indexerUrl")
      let indexer: RGBLib.IndexerConfig
      switch try p.string("indexerKind") {
      case "electrum": indexer = .electrum(url: url)
      case "esplora": indexer = .esplora(url: url)
      case "bitcoind":
        let auth: RGBLib.BitcoindAuth = try p.optional("cookieFile").map { .cookieFile(path: $0) } ?? .userPass(username: p.string("username"), password: p.string("password"))
        indexer = .bitcoind(url: url, auth: auth)
      default: throw rgbInvalid("Unsupported indexer")
      }
      let ids = try p.strings("evmChainIds"), urls = try p.strings("evmRpcUrls")
      let endpoints = try p.strings("proxyEndpoints"), keys = try p.strings("proxyAuthKeys")
      guard ids.count == urls.count, endpoints.count == keys.count else { throw rgbInvalid("Configuration arrays do not match") }
      var evm: [UInt64: String] = [:]
      for (id, url) in zip(ids, urls) {
        guard let id = UInt64(id) else { throw rgbInvalid("Invalid chain ID") }; evm[id] = url
      }
      let proxy = zip(endpoints, keys).reduce(into: [String: String]()) { $0[$1.0] = $1.1 }
      s.online = try w.goOnline(onlineOptions: RGBLib.OnlineOptions(indexerConfig: indexer, skipConsistencyCheck: false, vanillaSyncLookback: 20, failedWitnessReceiveGraceSecs: 86400, proxyAuthKeys: proxy, evmRpcUrls: evm))
      return NSNull()
    case "getAddress":
      if try p.bool("rotate") || !s.reuse || s.profile["cachedAddress"] as? String == nil {
        let address = try w.getAddress(), previous = s.profile["cachedAddress"]
        s.profile["cachedAddress"] = address
        // Never keep an in-memory address that was not persisted.
        do { try s.save() } catch { s.profile["cachedAddress"] = previous; throw error }
      }
      return s.profile["cachedAddress"]!
    case "getBtcBalance": return try rgbDto(w.getBtcBalance(online: s.online, skipSync: p.bool("skipSync")))
    case "getAssetBalance": return try rgbDto(w.getAssetBalance(assetId: p.string("assetId")))
    case "listAssets": return try rgbDto(w.listAssets(filterAssetSchemas: []))
    case "listUnspents": return try w.listUnspents(online: s.online, settledOnly: false, skipSync: p.bool("skipSync")).map { rgbDto($0) }
    case "listTransactions": return try w.listTransactions(online: s.online, skipSync: p.bool("skipSync")).map { rgbDto($0) }
    case "listTransfers": return try w.listTransfers(assetFilter: p.optional("assetId").map { .id(assetId: $0) } ?? .anyOrNone, txid: p.optional("txid")).map { rgbDto($0) }
    case "createUtxos": return try w.createUtxos(online: s.requireOnline(), upTo: p.bool("upTo"), num: p.has("num") ? p.number("num", UInt8.self) : nil, size: p.has("size") ? p.number("size", UInt32.self) : nil, feeRate: p.amount("feeRate"), skipSync: p.bool("skipSync"))
    case "sendBtc": return try w.sendBtc(online: s.requireOnline(), address: p.string("address"), amount: p.amount("amount"), feeRate: p.amount("feeRate"), skipSync: p.bool("skipSync"))
    case "receive":
      let assignment: RGBLib.Assignment = try p.has("amount") ? .fungible(amount: p.amount("amount")) : .any
      if try p.bool("witness") {
        return try rgbDto(w.witnessReceive(online: s.online, assetId: p.optional("assetId"), assignment: assignment, expirationTimestamp: p.amount("expirationTimestamp"), transportEndpoints: p.strings("transportEndpoints"), minConfirmations: p.number("minConfirmations", UInt8.self), encryption: nil))
      }
      return try rgbDto(w.blindReceive(online: s.online, assetId: p.optional("assetId"), assignment: assignment, expirationTimestamp: p.amount("expirationTimestamp"), transportEndpoints: p.strings("transportEndpoints"), minConfirmations: p.number("minConfirmations", UInt8.self), encryption: nil))
    case "decodeInvoice": return try rgbDto(RGBLib.Invoice(invoiceString: p.string("invoice")).invoiceData())
    case "send": return try send(s, p)
    case "issueAssetNia": return try rgbDto(w.issueAssetNia(ticker: p.string("ticker"), name: p.string("name"), precision: p.number("precision", UInt8.self), amounts: p.strings("amounts").map { guard let n = UInt64($0) else { throw rgbInvalid("Invalid amount") }; return n }))
    case "issueAssetIfa": return try rgbDto(w.issueAssetIfa(ticker: p.string("ticker"), name: p.string("name"), precision: p.number("precision", UInt8.self), amounts: p.strings("amounts").map { guard let n = UInt64($0) else { throw rgbInvalid("Invalid amount") }; return n }, inflationAmounts: p.strings("inflationAmounts").map { guard let n = UInt64($0) else { throw rgbInvalid("Invalid amount") }; return n }, rejectListUrl: p.optional("rejectListUrl")))
    case "inflate": return try rgbDto(w.inflate(online: s.requireOnline(), assetId: p.string("assetId"), inflationAmounts: p.strings("amounts").map { guard let n = UInt64($0) else { throw rgbInvalid("Invalid amount") }; return n }, feeRate: p.amount("feeRate"), minConfirmations: p.number("minConfirmations", UInt8.self)))
    case "burn": return try rgbDto(w.burn(online: s.requireOnline(), assetId: p.string("assetId"), amount: p.amount("amount"), burnReason: p.optional("burnReason"), feeRate: p.amount("feeRate"), minConfirmations: p.number("minConfirmations", UInt8.self)))
    case "failTransfers": return try w.failTransfers(online: s.requireOnline(), batchTransferIdx: p.has("batchTransferIdx") ? p.number("batchTransferIdx", Int32.self) : nil, noAssetOnly: p.bool("noAssetOnly"), skipSync: p.bool("skipSync"))
    case "refresh": return try w.refresh(online: s.requireOnline(), assetId: nil, filter: [], skipSync: p.bool("skipSync")).map { id, r -> [String: Any] in
      ["batchTransferIdx": NSNumber(value: id), "updatedStatus": r.updatedStatus.map { rgbEnum($0) as Any } ?? NSNull(), "failure": r.failure.map { ["name": "RgbLibError", "message": String(describing: $0)] as Any } ?? NSNull()]
    }
    case "sync":
      try w.sync(online: s.requireOnline(), options: RGBLib.SyncOptions(keychain: .colored, strategy: .fullSync))
      try w.sync(online: s.requireOnline(), options: RGBLib.SyncOptions(keychain: .vanilla(lookback: 20), strategy: .fullSync))
      return NSNull()
    case "estimateFeeRate": return try w.getFeeEstimation(online: s.requireOnline(), blocks: p.number("blocks", UInt16.self))
    // This UniFFI release has no block-height method; the shared API makes it optional.
    case "getNetworkInfo": return ["network": s.profile["network"]!, "blockHeight": NSNull()]
    case "backup": try s.save(); try w.backup(backupPath: p.string("backupPath"), password: p.string("password")); return NSNull()
    case "getConsignmentPath": return try consignment(s, p).path
    case "getConsignment": return try Data(contentsOf: consignment(s, p)).base64EncodedString()
    default: throw rgbInvalid("Unknown native operation")
    }
  }
}
#endif
