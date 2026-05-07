import Foundation


@objc(RgbSwiftHelper)
public class RgbSwiftHelper: NSObject {
  
  private static func getErrorClassName(_ error: Error) -> String {
    if let rgbError = error as? RgbLibError {
      let errorString = String(reflecting: rgbError)
      
      if let rgbLibErrorRange = errorString.range(of: "RgbLibError.") {
        let afterRgbLibError = String(errorString[rgbLibErrorRange.upperBound...])
        if let parenIndex = afterRgbLibError.firstIndex(of: "(") {
          return String(afterRgbLibError[..<parenIndex])
        }
        return afterRgbLibError
      }
      if let parenIndex = errorString.firstIndex(of: "(") {
        let beforeParen = String(errorString[..<parenIndex])
        if let lastDotIndex = beforeParen.lastIndex(of: ".") {
          return String(beforeParen[beforeParen.index(after: lastDotIndex)...])
        }
      }
    }
    
    let errorType = String(describing: type(of: error))
    if let dotIndex = errorType.lastIndex(of: ".") {
      return String(errorType[errorType.index(after: dotIndex)...])
    }
    return errorType
  }
  private static func parseErrorMessage(_ error: Error) -> String {
    let errorString = String(describing: error)
    
    if let detailsRange = errorString.range(of: "details: \"") {
      let afterDetails = String(errorString[detailsRange.upperBound...])
      if let endQuote = afterDetails.firstIndex(of: "\"") {
        return String(afterDetails[..<endQuote])
      }
    }
    
    if let detailsRange = errorString.range(of: "(details: \"") {
      let afterDetails = String(errorString[detailsRange.upperBound...])
      if let endQuote = afterDetails.firstIndex(of: "\"") {
        return String(afterDetails[..<endQuote])
      }
    }
    
    return error.localizedDescription
  }
  
  private static func getNetwork(_ network: String) -> BitcoinNetwork {
    switch network.lowercased() {
    case "mainnet":
      return .mainnet
    case "testnet":
      return .testnet
    case "testnet4":
      return .testnet4
    case "regtest":
      return .regtest
    case "signet":
      return .signet
    default:
      fatalError("Unknown BitcoinNetwork: \(network)")
    }
  }
  @objc
  public static func _generateKeys(_ bitcoinNetwork: String) -> NSDictionary {
    let network: BitcoinNetwork
    switch bitcoinNetwork.lowercased() {
    case "mainnet":
      network = .mainnet
    case "testnet":
      network = .testnet
    case "testnet4":
      network = .testnet4
    case "regtest":
      network = .regtest
    case "signet":
      network = .signet
    default:
      fatalError("Unknown BitcoinNetwork: \(bitcoinNetwork)")
    }
    
    let keys = generateKeys(bitcoinNetwork: network)
    return [
      "mnemonic": keys.mnemonic,
      "xpub": keys.xpub,
      "accountXpubVanilla": keys.accountXpubVanilla,
      "accountXpubColored": keys.accountXpubColored,
      "masterFingerprint": keys.masterFingerprint,
    ] as NSDictionary
  }
  
  @objc
  public static func _restoreKeys(_ bitcoinNetwork: String, mnemonic: String) -> NSDictionary {
    let network: BitcoinNetwork
    switch bitcoinNetwork.lowercased() {
    case "mainnet":
      network = .mainnet
    case "testnet":
      network = .testnet
    case "testnet4":
      network = .testnet4
    case "regtest":
      network = .regtest
    case "signet":
      network = .signet
    
    default:
      fatalError("Unknown BitcoinNetwork: \(bitcoinNetwork)")
    }
    
    do{
      let keys = try restoreKeys(bitcoinNetwork: network, mnemonic: mnemonic)
      return [
        "mnemonic": keys.mnemonic,
        "xpub": keys.xpub,
        "accountXpubVanilla": keys.accountXpubVanilla,
        "accountXpubColored": keys.accountXpubColored,
        "masterFingerprint": keys.masterFingerprint,
      ] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc
  public static func _restoreBackup(_ path: String, _ password: String) -> NSDictionary {
    do {
      let constants = AppConstants.shared
      constants.ensureInitialized()
      
      guard let rgbDir = constants.rgbDir else {
        return ["error": "RGB directory not initialized."] as NSDictionary
      }
      
      try restoreBackup(backupPath: path, password: password, dataDir: rgbDir.path)
      return [:] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  private static func getAssetSchema(_ schema: String) -> AssetSchema {
    switch schema {
    case "Nia":
      return .nia
    case "Uda":
      return .uda
    case "Cfa":
      return .cfa
    case "Ifa":
      return .ifa
    default:
      // Try uppercase for backward compatibility
      switch schema.uppercased() {
      case "NIA":
        return .nia
      case "UDA":
        return .uda
      case "CFA":
        return .cfa
      case "IFA":
        return .ifa
      default:
        fatalError("Unknown AssetSchema: \(schema)")
      }
    }
  }
  
  @objc(_initializeWallet:accountXpubVanilla:accountXpubColored:mnemonic:masterFingerprint:supportedSchemas:maxAllocationsPerUtxo:vanillaKeychain:reuseAddresses:)
  public static func _initializeWallet(
    _ network: String,
    _ accountXpubVanilla: String,
    _ accountXpubColored: String,
    _ mnemonic: String,
    _ masterFingerprint: String,
    _ supportedSchemas: NSArray,
    _ maxAllocationsPerUtxo: NSNumber,
    _ vanillaKeychain: NSNumber,
    _ reuseAddresses: Bool
  ) -> NSDictionary {
    do {
      guard !network.isEmpty, !accountXpubVanilla.isEmpty, !accountXpubColored.isEmpty,
            !mnemonic.isEmpty, !masterFingerprint.isEmpty else {
        return ["error": "All string parameters must be non-empty"] as NSDictionary
      }

      guard supportedSchemas.count > 0 else {
        return ["error": "supportedSchemas must not be empty"] as NSDictionary
      }

      let constants = AppConstants.shared
      constants.ensureInitialized()

      guard let rgbDir = constants.rgbDir else {
        return ["error": "RGB directory not initialized. Call AppConstants.initContext() first."] as NSDictionary
      }

      let networkDir = rgbDir.appendingPathComponent(network.lowercased())
      try FileManager.default.createDirectory(at: networkDir, withIntermediateDirectories: true, attributes: nil)
      let dataDirPath = networkDir.path

      let bitcoinNetwork = getNetwork(network)
      var schemaList: [AssetSchema] = []
      for schemaStr in supportedSchemas {
        if let schemaString = schemaStr as? String {
          schemaList.append(getAssetSchema(schemaString))
        }
      }

      let singlesigKeys = SinglesigKeys(
        accountXpubVanilla: accountXpubVanilla,
        accountXpubColored: accountXpubColored,
        vanillaKeychain: UInt8(vanillaKeychain.intValue),
        masterFingerprint: masterFingerprint,
        mnemonic: mnemonic
      )
      let walletData = WalletData(
        dataDir: dataDirPath,
        bitcoinNetwork: bitcoinNetwork,
        databaseType: .sqlite,
        maxAllocationsPerUtxo: UInt32(maxAllocationsPerUtxo.intValue),
        supportedSchemas: schemaList,
        reuseAddresses: reuseAddresses
      )
      let wallet = try Wallet(walletData: walletData, keys: singlesigKeys)
      
      let store = WalletStore.shared
      let walletId = store.create(wallet: wallet)
      return ["walletId": walletId] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_goOnline:skipConsistencyCheck:indexerUrl:)
  public static func _goOnline(
    _ walletId: NSNumber,
    _ skipConsistencyCheck: Bool,
    _ indexerUrl: String
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let online = try session.wallet.goOnline(
        skipConsistencyCheck: skipConsistencyCheck,
        indexerUrl: indexerUrl
      )
      WalletStore.shared.setOnline(id: walletId.intValue, online: online)
      return [:] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_getBtcBalance:skipSync:)
  public static func _getBtcBalance(
    _ walletId: NSNumber,
    _ skipSync: Bool
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let btcBalance = try session.wallet.getBtcBalance(
        online: session.online,
        skipSync: skipSync
      )
      
      let vanilla: [String: NSNumber] = [
        "settled": NSNumber(value: btcBalance.vanilla.settled),
        "future": NSNumber(value: btcBalance.vanilla.future),
        "spendable": NSNumber(value: btcBalance.vanilla.spendable)
      ]
      
      let colored: [String: NSNumber] = [
        "settled": NSNumber(value: btcBalance.colored.settled),
        "future": NSNumber(value: btcBalance.colored.future),
        "spendable": NSNumber(value: btcBalance.colored.spendable)
      ]
      
      return [
        "vanilla": vanilla,
        "colored": colored
      ] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_walletClose:)
  public static func _walletClose(_ walletId: NSNumber) -> NSDictionary {
    WalletStore.shared.remove(id: walletId.intValue)
    return [:] as NSDictionary
  }
  
  private static func getAssignment(_ assignmentDict: NSDictionary) -> Assignment {
    guard let type = assignmentDict["type"] as? String else {
      fatalError("Assignment type is required")
    }
    
    switch type {
    case "Fungible":
      guard let amount = assignmentDict["amount"] as? NSNumber else {
        fatalError("Amount is required for Fungible assignment")
      }
      return .fungible(amount: amount.uint64Value)
    case "NonFungible":
      return .nonFungible
    case "InflationRight":
      guard let amount = assignmentDict["amount"] as? NSNumber else {
        fatalError("Amount is required for InflationRight assignment")
      }
      return .inflationRight(amount: amount.uint64Value)
    case "Any":
      return .any
    default:
      fatalError("Unknown Assignment type: \(type)")
    }
  }
  
  private static func getRefreshFilter(_ filterDict: NSDictionary) -> RefreshFilter {
    guard let statusStr = filterDict["status"] as? String else {
      fatalError("RefreshFilter status is required")
    }
    
    let status: RefreshTransferStatus
    switch statusStr {
    case "WaitingCounterparty":
      status = .waitingCounterparty
    case "WaitingConfirmations":
      status = .waitingConfirmations
    default:
      fatalError("Unknown RefreshTransferStatus: \(statusStr)")
    }
    
    guard let incoming = filterDict["incoming"] as? Bool else {
      fatalError("RefreshFilter incoming is required")
    }
    
    return RefreshFilter(status: status, incoming: incoming)
  }
  
  private static func getRecipient(_ recipientDict: NSDictionary) -> Recipient {
    guard let recipientId = recipientDict["recipientId"] as? String else {
      fatalError("Recipient recipientId is required")
    }
    
    guard let assignmentDict = recipientDict["assignment"] as? NSDictionary else {
      fatalError("Recipient assignment is required")
    }
    let assignment = getAssignment(assignmentDict)
    
    guard let transportEndpointsArray = recipientDict["transportEndpoints"] as? NSArray else {
      fatalError("Recipient transportEndpoints is required")
    }
    var transportEndpoints: [String] = []
    for endpoint in transportEndpointsArray {
      if let endpointStr = endpoint as? String {
        transportEndpoints.append(endpointStr)
      }
    }
    
    let witnessData: WitnessData?
    if let witnessDataDict = recipientDict["witnessData"] as? NSDictionary {
      guard let amountSatValue = witnessDataDict["amountSat"] as? NSNumber else {
        fatalError("WitnessData amountSat is required")
      }
      let amountSat = amountSatValue.uint64Value
      
      let blinding: UInt64?
      if let blindingValue = witnessDataDict["blinding"] as? NSNumber {
        blinding = blindingValue.uint64Value
      } else {
        blinding = nil
      }
      
      witnessData = WitnessData(amountSat: amountSat, blinding: blinding)
    } else {
      witnessData = nil
    }
    
    return Recipient(recipientId: recipientId, witnessData: witnessData, assignment: assignment, transportEndpoints: transportEndpoints)
  }
  
  private static func balanceToDict(_ balance: Balance) -> NSDictionary {
    return [
      "settled": NSNumber(value: balance.settled),
      "future": NSNumber(value: balance.future),
      "spendable": NSNumber(value: balance.spendable)
    ] as NSDictionary
  }
  
  private static func assetCfaToDict(_ asset: AssetCfa) -> NSDictionary {
    var dict: [String: Any] = [
      "assetId": asset.assetId,
      "name": asset.name,
      "precision": NSNumber(value: asset.precision),
      "issuedSupply": NSNumber(value: asset.issuedSupply),
      "timestamp": NSNumber(value: asset.timestamp),
      "addedAt": NSNumber(value: asset.addedAt),
      "balance": balanceToDict(asset.balance)
    ]
    
    if let details = asset.details {
      dict["details"] = details
    }
    
    if let media = asset.media {
      dict["media"] = [
        "filePath": media.filePath,
        "mime": media.mime,
        "digest": media.digest
      ] as NSDictionary
    }
    
    return dict as NSDictionary
  }
  
  private static func assetIfaToDict(_ asset: AssetIfa) -> NSDictionary {
    var dict: [String: Any] = [
      "assetId": asset.assetId,
      "ticker": asset.ticker,
      "name": asset.name,
      "precision": NSNumber(value: asset.precision),
      "initialSupply": NSNumber(value: asset.initialSupply),
      "maxSupply": NSNumber(value: asset.maxSupply),
      "knownCirculatingSupply": NSNumber(value: asset.knownCirculatingSupply),
      "timestamp": NSNumber(value: asset.timestamp),
      "addedAt": NSNumber(value: asset.addedAt),
      "balance": balanceToDict(asset.balance)
    ]
    
    if let details = asset.details {
      dict["details"] = details
    }
    
    if let media = asset.media {
      dict["media"] = [
        "filePath": media.filePath,
        "mime": media.mime,
        "digest": media.digest
      ] as NSDictionary
    }
    
    if let rejectListUrl = asset.rejectListUrl {
      dict["rejectListUrl"] = rejectListUrl
    }
    
    return dict as NSDictionary
  }
  
  private static func assetNiaToDict(_ asset: AssetNia) -> NSDictionary {
    var dict: [String: Any] = [
      "assetId": asset.assetId,
      "ticker": asset.ticker,
      "name": asset.name,
      "precision": NSNumber(value: asset.precision),
      "issuedSupply": NSNumber(value: asset.issuedSupply),
      "timestamp": NSNumber(value: asset.timestamp),
      "addedAt": NSNumber(value: asset.addedAt),
      "balance": balanceToDict(asset.balance)
    ]
    
    if let details = asset.details {
      dict["details"] = details
    }
    
    if let media = asset.media {
      dict["media"] = [
        "filePath": media.filePath,
        "mime": media.mime,
        "digest": media.digest
      ] as NSDictionary
    }
    
    return dict as NSDictionary
  }
  
  private static func assetUdaToDict(_ asset: AssetUda) -> NSDictionary {
    var dict: [String: Any] = [
      "assetId": asset.assetId,
      "ticker": asset.ticker,
      "name": asset.name,
      "precision": NSNumber(value: asset.precision),
      "timestamp": NSNumber(value: asset.timestamp),
      "addedAt": NSNumber(value: asset.addedAt),
      "balance": balanceToDict(asset.balance)
    ]
    
    if let details = asset.details {
      dict["details"] = details
    }
    
    if let token = asset.token {
      var tokenDict: [String: Any] = [
        "index": NSNumber(value: token.index),
        "embeddedMedia": NSNumber(value: token.embeddedMedia),
        "reserves": NSNumber(value: token.reserves)
      ]
      
      if let ticker = token.ticker {
        tokenDict["ticker"] = ticker
      }
      if let name = token.name {
        tokenDict["name"] = name
      }
      if let details = token.details {
        tokenDict["details"] = details
      }
      
      if let media = token.media {
        tokenDict["media"] = [
          "filePath": media.filePath,
          "mime": media.mime,
          "digest": media.digest
        ] as NSDictionary
      }
      
      var attachmentsArray: [[String: Any]] = []
      for (key, media) in token.attachments {
        attachmentsArray.append([
          "key": NSNumber(value: key),
          "filePath": media.filePath,
          "mime": media.mime,
          "digest": media.digest
        ] as [String: Any])
      }
      tokenDict["attachments"] = attachmentsArray
      
      dict["token"] = tokenDict
    }
        
    return dict as NSDictionary
  }
  
  private static func operationResultToDict(_ result: OperationResult) -> NSDictionary {
    return [
      "txid": result.txid,
      "batchTransferIdx": NSNumber(value: result.batchTransferIdx)
    ] as NSDictionary
  }
  
  private static func receiveDataToDict(_ data: ReceiveData) -> NSDictionary {
    var dict: [String: Any] = [
      "invoice": data.invoice,
      "recipientId": data.recipientId,
      "batchTransferIdx": NSNumber(value: data.batchTransferIdx)
    ]
    
    if let expirationTimestamp = data.expirationTimestamp {
      dict["expirationTimestamp"] = NSNumber(value: expirationTimestamp)
    }
    
    return dict as NSDictionary
  }
  
  @objc(_backup:backupPath:password:)
  public static func _backup(_ walletId: NSNumber, _ backupPath: String, _ password: String) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      try session.wallet.backup(backupPath: backupPath, password: password)
      return [:] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_backupInfo:)
  public static func _backupInfo(_ walletId: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let hasBackup = try session.wallet.backupInfo()
      return ["hasBackup": NSNumber(value: hasBackup)] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_blindReceive:assetId:assignment:expirationTimestamp:transportEndpoints:minConfirmations:)
  public static func _blindReceive(
    _ walletId: NSNumber,
    _ assetId: String?,
    _ assignment: NSDictionary,
    _ expirationTimestamp: NSNumber?,
    _ transportEndpoints: NSArray,
    _ minConfirmations: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let assignmentObj = getAssignment(assignment)
      var endpoints: [String] = []
      for endpoint in transportEndpoints {
        if let endpointStr = endpoint as? String {
          endpoints.append(endpointStr)
        }
      }
      
      let receiveData = try session.wallet.blindReceive(
        assetId: assetId,
        assignment: assignmentObj,
        expirationTimestamp: expirationTimestamp?.uint64Value,
        transportEndpoints: endpoints,
        minConfirmations: minConfirmations.uint8Value
      )
      
      return receiveDataToDict(receiveData)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_createUtxos:upTo:num:size:feeRate:skipSync:)
  public static func _createUtxos(
    _ walletId: NSNumber,
    _ upTo: NSNumber,
    _ num: NSNumber?,
    _ size: NSNumber?,
    _ feeRate: NSNumber,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let count = try session.wallet.createUtxos(
        online: online,
        upTo: upTo.boolValue,
        num: num?.uint8Value,
        size: size?.uint32Value,
        feeRate: feeRate.uint64Value,
        skipSync: skipSync.boolValue
      )
      return ["count": NSNumber(value: count)] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_createUtxosBegin:upTo:num:size:feeRate:skipSync:)
  public static func _createUtxosBegin(
    _ walletId: NSNumber,
    _ upTo: NSNumber,
    _ num: NSNumber?,
    _ size: NSNumber?,
    _ feeRate: NSNumber,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let psbt = try session.wallet.createUtxosBegin(
        online: online,
        upTo: upTo.boolValue,
        num: num?.uint8Value,
        size: size?.uint32Value,
        feeRate: feeRate.uint64Value,
        skipSync: skipSync.boolValue
      )
      return ["psbt": psbt] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_createUtxosEnd:signedPsbt:skipSync:)
  public static func _createUtxosEnd(
    _ walletId: NSNumber,
    _ signedPsbt: String,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let count = try session.wallet.createUtxosEnd(online: online, signedPsbt: signedPsbt, skipSync: skipSync.boolValue)
      return ["count": NSNumber(value: count)] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_deleteTransfers:batchTransferIdx:noAssetOnly:)
  public static func _deleteTransfers(
    _ walletId: NSNumber,
    _ batchTransferIdx: NSNumber?,
    _ noAssetOnly: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let deleted = try session.wallet.deleteTransfers(
        batchTransferIdx: batchTransferIdx?.int32Value,
        noAssetOnly: noAssetOnly.boolValue
      )
      return ["deleted": NSNumber(value: deleted)] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_drainTo:address:destroyAssets:feeRate:)
  public static func _drainTo(
    _ walletId: NSNumber,
    _ address: String,
    _ destroyAssets: NSNumber,
    _ feeRate: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let txid = try session.wallet.drainTo(
        online: online,
        address: address,
        destroyAssets: destroyAssets.boolValue,
        feeRate: feeRate.uint64Value
      )
      return ["txid": txid] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_drainToBegin:address:destroyAssets:feeRate:)
  public static func _drainToBegin(
    _ walletId: NSNumber,
    _ address: String,
    _ destroyAssets: NSNumber,
    _ feeRate: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let psbt = try session.wallet.drainToBegin(
        online: online,
        address: address,
        destroyAssets: destroyAssets.boolValue,
        feeRate: feeRate.uint64Value
      )
      return ["psbt": psbt] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_drainToEnd:signedPsbt:)
  public static func _drainToEnd(
    _ walletId: NSNumber,
    _ signedPsbt: String
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let txid = try session.wallet.drainToEnd(online: online, signedPsbt: signedPsbt)
      return ["txid": txid] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_failTransfers:batchTransferIdx:noAssetOnly:skipSync:)
  public static func _failTransfers(
    _ walletId: NSNumber,
    _ batchTransferIdx: NSNumber?,
    _ noAssetOnly: NSNumber,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let failed = try session.wallet.failTransfers(
        online: online,
        batchTransferIdx: batchTransferIdx?.int32Value,
        noAssetOnly: noAssetOnly.boolValue,
        skipSync: skipSync.boolValue
      )
      return ["failed": NSNumber(value: failed)] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_finalizePsbt:signedPsbt:)
  public static func _finalizePsbt(_ walletId: NSNumber, _ signedPsbt: String) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let finalizedPsbt = try session.wallet.finalizePsbt(signedPsbt: signedPsbt)
      return ["psbt": finalizedPsbt] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_getAddress:)
  public static func _getAddress(_ walletId: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let address = try session.wallet.getAddress()
      return ["address": address] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_getAssetBalance:assetId:)
  public static func _getAssetBalance(_ walletId: NSNumber, _ assetId: String) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let balance = try session.wallet.getAssetBalance(assetId: assetId)
      return balanceToDict(balance)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_getAssetMetadata:assetId:)
  public static func _getAssetMetadata(_ walletId: NSNumber, _ assetId: String) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let metadata = try session.wallet.getAssetMetadata(assetId: assetId)
      var dict: [String: Any] = [
        "assetId": assetId,
        "name": metadata.name
      ]
      
      if let ticker = metadata.ticker {
        dict["ticker"] = ticker
      }
      if let details = metadata.details {
        dict["details"] = details
      }
      dict["precision"] = NSNumber(value: metadata.precision)
      dict["maxSupply"] = NSNumber(value: metadata.maxSupply)
      dict["timestamp"] = NSNumber(value: metadata.timestamp)
      
      return dict as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_getFeeEstimation:blocks:)
  public static func _getFeeEstimation(_ walletId: NSNumber, _ blocks: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let feeRate = try session.wallet.getFeeEstimation(online: online, blocks: blocks.uint16Value)
      return ["feeRate": NSNumber(value: feeRate)] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_getMediaDir:)
  public static func _getMediaDir(_ walletId: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    let mediaDir = session.wallet.getMediaDir()
    return ["mediaDir": mediaDir] as NSDictionary
  }
  
  @objc(_getWalletData:)
  public static func _getWalletData(_ walletId: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    let walletData = session.wallet.getWalletData()
    let keys = session.wallet.getKeys()

    let networkString: String
    switch walletData.bitcoinNetwork {
    case .mainnet: networkString = "mainnet"
    case .testnet: networkString = "testnet"
    case .testnet4: networkString = "testnet4"
    case .regtest: networkString = "regtest"
    case .signet: networkString = "signet"
    case .signetCustom: networkString = "signetCustom"
    }
    
    let dbTypeString: String
    switch walletData.databaseType {
    case .sqlite: dbTypeString = "SQLITE"
    }
    
    var schemaStrings: [String] = []
    for schema in walletData.supportedSchemas {
      switch schema {
      case .nia: schemaStrings.append("Nia")
      case .uda: schemaStrings.append("Uda")
      case .cfa: schemaStrings.append("Cfa")
      case .ifa: schemaStrings.append("Ifa")
      }
    }
    
    var dict: [String: Any] = [
      "dataDir": walletData.dataDir,
      "bitcoinNetwork": networkString,
      "databaseType": dbTypeString,
      "maxAllocationsPerUtxo": NSNumber(value: walletData.maxAllocationsPerUtxo),
      "accountXpubVanilla": keys.accountXpubVanilla,
      "accountXpubColored": keys.accountXpubColored,
      "masterFingerprint": keys.masterFingerprint,
      "supportedSchemas": schemaStrings
    ]

    if let mnemonic = keys.mnemonic {
      dict["mnemonic"] = mnemonic
    }
    if let vanillaKeychain = keys.vanillaKeychain {
      dict["vanillaKeychain"] = NSNumber(value: vanillaKeychain)
    }
    
    return dict as NSDictionary
  }
  
  @objc(_getWalletDir:)
  public static func _getWalletDir(_ walletId: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }

    let walletDir = session.wallet.getWalletDir()
    return ["walletDir": walletDir] as NSDictionary
  }

  @objc(_rotateVanillaAddress:)
  public static func _rotateVanillaAddress(_ walletId: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    do {
      let address = try session.wallet.rotateVanillaAddress()
      return ["address": address] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rotateColoredAddress:)
  public static func _rotateColoredAddress(_ walletId: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    do {
      let address = try session.wallet.rotateColoredAddress()
      return ["address": address] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_inflate:assetId:inflationAmounts:feeRate:minConfirmations:)
  public static func _inflate(
    _ walletId: NSNumber,
    _ assetId: String,
    _ inflationAmounts: NSArray,
    _ feeRate: NSNumber,
    _ minConfirmations: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      var amounts: [UInt64] = []
      for amount in inflationAmounts {
        if let amountNum = amount as? NSNumber {
          amounts.append(amountNum.uint64Value)
        }
      }
      
      let result = try session.wallet.inflate(
        online: online,
        assetId: assetId,
        inflationAmounts: amounts,
        feeRate: feeRate.uint64Value,
        minConfirmations: minConfirmations.uint8Value
      )
      
      return operationResultToDict(result)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_inflateBegin:assetId:inflationAmounts:feeRate:minConfirmations:dryRun:)
  public static func _inflateBegin(
    _ walletId: NSNumber,
    _ assetId: String,
    _ inflationAmounts: NSArray,
    _ feeRate: NSNumber,
    _ minConfirmations: NSNumber,
    _ dryRun: Bool
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }

    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }

    do {
      var amounts: [UInt64] = []
      for amount in inflationAmounts {
        if let amountNum = amount as? NSNumber {
          amounts.append(amountNum.uint64Value)
        }
      }

      let result = try session.wallet.inflateBegin(
        online: online,
        assetId: assetId,
        inflationAmounts: amounts,
        feeRate: feeRate.uint64Value,
        minConfirmations: minConfirmations.uint8Value,
        dryRun: dryRun
      )

      return [
        "psbt": result.psbt,
        "batchTransferIdx": result.batchTransferIdx.map { NSNumber(value: $0) } ?? NSNull(),
        "details": [
          "fasciaPath": result.details.fasciaPath,
          "minConfirmations": NSNumber(value: result.details.minConfirmations),
          "entropy": NSNumber(value: result.details.entropy)
        ] as [String: Any]
      ] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_inflateEnd:signedPsbt:)
  public static func _inflateEnd(_ walletId: NSNumber, _ signedPsbt: String) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let result = try session.wallet.inflateEnd(online: online, signedPsbt: signedPsbt)
      return operationResultToDict(result)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_issueAssetCfa:name:details:precision:amounts:filePath:)
  public static func _issueAssetCfa(
    _ walletId: NSNumber,
    _ name: String,
    _ details: String?,
    _ precision: NSNumber,
    _ amounts: NSArray,
    _ filePath: String?
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      var amountsList: [UInt64] = []
      for amount in amounts {
        if let amountNum = amount as? NSNumber {
          amountsList.append(amountNum.uint64Value)
        }
      }
      
      let asset = try session.wallet.issueAssetCfa(
        name: name,
        details: details,
        precision: precision.uint8Value,
        amounts: amountsList,
        filePath: filePath
      )
      
      return assetCfaToDict(asset)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_issueAssetIfa:ticker:name:precision:amounts:inflationAmounts:rejectListUrl:)
  public static func _issueAssetIfa(
    _ walletId: NSNumber,
    _ ticker: String,
    _ name: String,
    _ precision: NSNumber,
    _ amounts: NSArray,
    _ inflationAmounts: NSArray,
    _ rejectListUrl: String?
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }

    do {
      var amountsList: [UInt64] = []
      for amount in amounts {
        if let amountNum = amount as? NSNumber {
          amountsList.append(amountNum.uint64Value)
        }
      }

      var inflationAmountsList: [UInt64] = []
      for amount in inflationAmounts {
        if let amountNum = amount as? NSNumber {
          inflationAmountsList.append(amountNum.uint64Value)
        }
      }

      let asset = try session.wallet.issueAssetIfa(
        ticker: ticker,
        name: name,
        precision: precision.uint8Value,
        amounts: amountsList,
        inflationAmounts: inflationAmountsList,
        rejectListUrl: rejectListUrl
      )
      
      return assetIfaToDict(asset)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_issueAssetNia:ticker:name:precision:amounts:)
  public static func _issueAssetNia(
    _ walletId: NSNumber,
    _ ticker: String,
    _ name: String,
    _ precision: NSNumber,
    _ amounts: NSArray
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      var amountsList: [UInt64] = []
      for amount in amounts {
        if let amountNum = amount as? NSNumber {
          amountsList.append(amountNum.uint64Value)
        }
      }
      
      let asset = try session.wallet.issueAssetNia(
        ticker: ticker,
        name: name,
        precision: precision.uint8Value,
        amounts: amountsList
      )
      
      return assetNiaToDict(asset)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_issueAssetUda:ticker:name:details:precision:mediaFilePath:attachmentsFilePaths:)
  public static func _issueAssetUda(
    _ walletId: NSNumber,
    _ ticker: String,
    _ name: String,
    _ details: String?,
    _ precision: NSNumber,
    _ mediaFilePath: String?,
    _ attachmentsFilePaths: NSArray
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      var attachmentsList: [String] = []
      for attachment in attachmentsFilePaths {
        if let attachmentStr = attachment as? String {
          attachmentsList.append(attachmentStr)
        }
      }
      
      let asset = try session.wallet.issueAssetUda(
        ticker: ticker,
        name: name,
        details: details,
        precision: precision.uint8Value,
        mediaFilePath: mediaFilePath,
        attachmentsFilePaths: attachmentsList
      )
      
      return assetUdaToDict(asset)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_listAssets:filterAssetSchemas:)
  public static func _listAssets(_ walletId: NSNumber, _ filterAssetSchemas: NSArray) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      var schemaList: [AssetSchema] = []
      for schemaStr in filterAssetSchemas {
        if let schemaString = schemaStr as? String {
          schemaList.append(getAssetSchema(schemaString))
        }
      }
      
      let assets = try session.wallet.listAssets(filterAssetSchemas: schemaList)
      
      var niaArray: [[String: Any]] = []
      for asset in assets.nia ?? [] {
          niaArray.append(assetNiaToDict(asset) as! [String: Any])
      }
      
      var udaArray: [[String: Any]] = []
      for asset in assets.uda ?? [] {
        udaArray.append(assetUdaToDict(asset) as! [String: Any])
      }
      
      var cfaArray: [[String: Any]] = []
      for asset in assets.cfa ?? [] {
        cfaArray.append(assetCfaToDict(asset) as! [String: Any])
      }
      
      var ifaArray: [[String: Any]] = []
      for asset in assets.ifa ?? [] {
        ifaArray.append(assetIfaToDict(asset) as! [String: Any])
      }
      
      return [
        "nia": niaArray,
        "uda": udaArray,
        "cfa": cfaArray,
        "ifa": ifaArray
      ] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_listTransactions:skipSync:)
  public static func _listTransactions(_ walletId: NSNumber, _ skipSync: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let transactions = try session.wallet.listTransactions(online: session.online, skipSync: skipSync.boolValue)
      
      var transactionsArray: [[String: Any]] = []
      for tx in transactions {
        let txTypeString: String
        switch tx.transactionType {
        case .rgbSend: txTypeString = "RgbSend"
        case .drain: txTypeString = "Drain"
        case .createUtxos: txTypeString = "CreateUtxos"
        case .user: txTypeString = "User"
        }
        
        var txDict: [String: Any] = [
          "transactionType": txTypeString,
          "txid": tx.txid,
          "received": NSNumber(value: tx.received),
          "sent": NSNumber(value: tx.sent),
          "fee": NSNumber(value: tx.fee)
        ]
        
        if let confirmationTime = tx.confirmationTime {
          txDict["confirmationTime"] = NSNumber(value: confirmationTime.timestamp)
        }
        
        transactionsArray.append(txDict)
      }
      
      return ["transactions": transactionsArray] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_listTransfers:assetId:)
  public static func _listTransfers(_ walletId: NSNumber, _ assetId: String?) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let transfers = try session.wallet.listTransfers(assetId: assetId)
      
      var transfersArray: [[String: Any]] = []
      for transfer in transfers {
        let kindString: String
        switch transfer.kind {
        case .issuance: kindString = "Issuance"
        case .receiveBlind: kindString = "ReceiveBlind"
        case .receiveWitness: kindString = "ReceiveWitness"
        case .send: kindString = "Send"
        case .inflation: kindString = "Inflation"
        }
        
        let statusString: String
        switch transfer.status {
        case .initiated: statusString = "Initiated"
        case .waitingCounterparty: statusString = "WaitingCounterparty"
        case .waitingConfirmations: statusString = "WaitingConfirmations"
        case .settled: statusString = "Settled"
        case .failed: statusString = "Failed"
        }
        
        var transferDict: [String: Any] = [
          "idx": NSNumber(value: transfer.idx),
          "batchTransferIdx": NSNumber(value: transfer.batchTransferIdx),
          "createdAt": NSNumber(value: transfer.createdAt),
          "updatedAt": NSNumber(value: transfer.updatedAt),
          "kind": kindString,
          "status": statusString
        ]
        
        if let txid = transfer.txid {
          transferDict["txid"] = txid
        }
        if let recipientId = transfer.recipientId {
          transferDict["recipientId"] = recipientId
        }
        if let expiration = transfer.expirationTimestamp {
          transferDict["expiration"] = NSNumber(value: expiration)
        }
        
        if let requestedAssignment = transfer.requestedAssignment {
          transferDict["requestedAssignment"] = assignmentToDict(requestedAssignment)
        }
        
        var assignmentsArray: [[String: Any]] = []
        for assignment in transfer.assignments {
          assignmentsArray.append(assignmentToDict(assignment) as! [String: Any])
        }
        transferDict["assignments"] = assignmentsArray
        
        if let receiveUtxo = transfer.receiveUtxo {
          transferDict["receiveUtxo"] = outpointToDict(receiveUtxo)
        }
        
        if let changeUtxo = transfer.changeUtxo {
          transferDict["changeUtxo"] = outpointToDict(changeUtxo)
        }
        
        var transportEndpointsArray: [[String: Any]] = []
        for endpoint in transfer.transportEndpoints {
          transportEndpointsArray.append([
            "endpoint": endpoint.endpoint,
            "used": NSNumber(value: endpoint.used),
            "transportType": String(describing: endpoint.transportType)
          ] as [String: Any])
        }
        transferDict["transportEndpoints"] = transportEndpointsArray
        
        if let invoiceString = transfer.invoiceString {
          transferDict["invoiceString"] = invoiceString
        }
        if let consignmentPath = transfer.consignmentPath {
          transferDict["consignmentPath"] = consignmentPath
        }
        
        transfersArray.append(transferDict)
      }
      
      return ["transfers": transfersArray] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_listUnspents:settledOnly:skipSync:)
  public static func _listUnspents(
    _ walletId: NSNumber,
    _ settledOnly: NSNumber,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let unspents = try session.wallet.listUnspents(online: session.online, settledOnly: settledOnly.boolValue, skipSync: skipSync.boolValue)
      
      var unspentsArray: [[String: Any]] = []
      for unspent in unspents {
        let utxoDict: [String: Any] = [
          "outpoint": outpointToDict(unspent.utxo.outpoint),
          "btcAmount": NSNumber(value: unspent.utxo.btcAmount),
          "colorable": NSNumber(value: unspent.utxo.colorable),
          "exists": NSNumber(value: unspent.utxo.exists)
        ]
        
        var rgbAllocationsArray: [[String: Any]] = []
        for allocation in unspent.rgbAllocations {
          var allocationDict: [String: Any] = [
            "assignment": assignmentToDict(allocation.assignment),
            "settled": NSNumber(value: allocation.settled)
          ]
          if let assetId = allocation.assetId {
            allocationDict["assetId"] = assetId
          }
          rgbAllocationsArray.append(allocationDict)
        }
        
        var unspentDict: [String: Any] = [
          "utxo": utxoDict,
          "pendingBlinded": NSNumber(value: unspent.pendingBlinded),
          "rgbAllocations": rgbAllocationsArray
        ]
        
        unspentsArray.append(unspentDict)
      }
      
      return ["unspents": unspentsArray] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_refresh:assetId:filter:skipSync:)
  public static func _refresh(
    _ walletId: NSNumber,
    _ assetId: String?,
    _ filter: NSArray,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      var filterList: [RefreshFilter] = []
      for filterItem in filter {
        if let filterDict = filterItem as? NSDictionary {
          filterList.append(getRefreshFilter(filterDict))
        }
      }
      
      let refreshed = try session.wallet.refresh(online: online, assetId: assetId, filter: filterList, skipSync: skipSync.boolValue)
      
      var result: [String: Any] = [:]
      for (idx, refreshedTransfer) in refreshed {
        var refreshedDict: [String: Any] = [:]
        if let updatedStatus = refreshedTransfer.updatedStatus {
          let statusString: String
          switch updatedStatus {
          case .initiated: statusString = "Initiated"
          case .waitingCounterparty: statusString = "WaitingCounterparty"
          case .waitingConfirmations: statusString = "WaitingConfirmations"
          case .settled: statusString = "Settled"
          case .failed: statusString = "Failed"
          }
          refreshedDict["updatedStatus"] = statusString
        }
        if let failure = refreshedTransfer.failure {
          refreshedDict["failure"] = failure.localizedDescription
        }
        result[String(idx)] = refreshedDict
      }
      
      return result as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_send:recipientMap:donation:feeRate:minConfirmations:expirationTimestamp:skipSync:)
  public static func _send(
    _ walletId: NSNumber,
    _ recipientMap: NSDictionary,
    _ donation: NSNumber,
    _ feeRate: NSNumber,
    _ minConfirmations: NSNumber,
    _ expirationTimestamp: NSNumber?,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      var recipientMapNative: [String: [Recipient]] = [:]
      for (key, value) in recipientMap {
        if let keyStr = key as? String, let recipientsArray = value as? NSArray {
          var recipientsList: [Recipient] = []
          for recipientItem in recipientsArray {
            if let recipientDict = recipientItem as? NSDictionary {
              recipientsList.append(getRecipient(recipientDict))
            }
          }
          recipientMapNative[keyStr] = recipientsList
        }
      }
      
      let result = try session.wallet.send(
        online: online,
        recipientMap: recipientMapNative,
        donation: donation.boolValue,
        feeRate: feeRate.uint64Value,
        minConfirmations: minConfirmations.uint8Value,
        expirationTimestamp: expirationTimestamp?.uint64Value,
        skipSync: skipSync.boolValue
      )
      
      return operationResultToDict(result)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_sendBegin:recipientMap:donation:feeRate:minConfirmations:expirationTimestamp:dryRun:)
  public static func _sendBegin(
    _ walletId: NSNumber,
    _ recipientMap: NSDictionary,
    _ donation: NSNumber,
    _ feeRate: NSNumber,
    _ minConfirmations: NSNumber,
    _ expirationTimestamp: NSNumber?,
    _ dryRun: Bool
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }

    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }

    do {
      var recipientMapNative: [String: [Recipient]] = [:]
      for (key, value) in recipientMap {
        if let keyStr = key as? String, let recipientsArray = value as? NSArray {
          var recipientsList: [Recipient] = []
          for recipientItem in recipientsArray {
            if let recipientDict = recipientItem as? NSDictionary {
              recipientsList.append(getRecipient(recipientDict))
            }
          }
          recipientMapNative[keyStr] = recipientsList
        }
      }

      let result = try session.wallet.sendBegin(
        online: online,
        recipientMap: recipientMapNative,
        donation: donation.boolValue,
        feeRate: feeRate.uint64Value,
        minConfirmations: minConfirmations.uint8Value,
        expirationTimestamp: expirationTimestamp?.uint64Value,
        dryRun: dryRun
      )

      return [
        "psbt": result.psbt,
        "batchTransferIdx": result.batchTransferIdx.map { NSNumber(value: $0) } ?? NSNull(),
        "details": [
          "fasciaPath": result.details.fasciaPath,
          "minConfirmations": NSNumber(value: result.details.minConfirmations),
          "entropy": NSNumber(value: result.details.entropy),
          "isDonation": result.details.isDonation
        ] as [String: Any]
      ] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_sendBtc:address:amount:feeRate:skipSync:)
  public static func _sendBtc(
    _ walletId: NSNumber,
    _ address: String,
    _ amount: NSNumber,
    _ feeRate: NSNumber,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let txid = try session.wallet.sendBtc(
        online: online,
        address: address,
        amount: amount.uint64Value,
        feeRate: feeRate.uint64Value,
        skipSync: skipSync.boolValue
      )
      return ["txid": txid] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_sendBtcBegin:address:amount:feeRate:skipSync:)
  public static func _sendBtcBegin(
    _ walletId: NSNumber,
    _ address: String,
    _ amount: NSNumber,
    _ feeRate: NSNumber,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let psbt = try session.wallet.sendBtcBegin(
        online: online,
        address: address,
        amount: amount.uint64Value,
        feeRate: feeRate.uint64Value,
        skipSync: skipSync.boolValue
      )
      return ["psbt": psbt] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_sendBtcEnd:signedPsbt:skipSync:)
  public static func _sendBtcEnd(
    _ walletId: NSNumber,
    _ signedPsbt: String,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let txid = try session.wallet.sendBtcEnd(online: online, signedPsbt: signedPsbt, skipSync: skipSync.boolValue)
      return ["txid": txid] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_sendEnd:signedPsbt:skipSync:)
  public static func _sendEnd(
    _ walletId: NSNumber,
    _ signedPsbt: String,
    _ skipSync: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      let result = try session.wallet.sendEnd(online: online, signedPsbt: signedPsbt, skipSync: skipSync.boolValue)
      return operationResultToDict(result)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_signPsbt:unsignedPsbt:)
  public static func _signPsbt(_ walletId: NSNumber, _ unsignedPsbt: String) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let signedPsbt = try session.wallet.signPsbt(unsignedPsbt: unsignedPsbt)
      return ["psbt": signedPsbt] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_sync:)
  public static func _sync(_ walletId: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    guard let online = session.online else {
      return ["error": "Wallet is not online"] as NSDictionary
    }
    
    do {
      try session.wallet.sync(online: online)
      let _ = try session.wallet.refresh(online: online, assetId: nil, filter: [], skipSync: false)
      let _ = try session.wallet.failTransfers(online: online, batchTransferIdx: nil, noAssetOnly: false, skipSync: false)
      let _ = try session.wallet.deleteTransfers(batchTransferIdx: nil, noAssetOnly: false)
      let assets = try session.wallet.listAssets(filterAssetSchemas: [])
      let rgb25Assets = assets.cfa
      let rgb20Assets = assets.nia
      let udaAssets = assets.uda
      if let rgb20Assets = rgb20Assets {
        for rgb20Asset in rgb20Assets {
          let _ = try session.wallet.refresh(online: online, assetId: rgb20Asset.assetId, filter: [], skipSync: false)
        }
      }
      if let rgb25Assets = rgb25Assets {
        for rgb25Asset in rgb25Assets {
          let _ = try session.wallet.refresh(online: online, assetId: rgb25Asset.assetId, filter: [], skipSync: false)
        }
      }
      if let udaAssets = udaAssets {
        for udaAsset in udaAssets {
          let _ = try session.wallet.refresh(online: online, assetId: udaAsset.assetId, filter: [], skipSync: false)
        }
      }
      return [:] as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  @objc(_witnessReceive:assetId:assignment:expirationTimestamp:transportEndpoints:minConfirmations:)
  public static func _witnessReceive(
    _ walletId: NSNumber,
    _ assetId: String?,
    _ assignment: NSDictionary,
    _ expirationTimestamp: NSNumber?,
    _ transportEndpoints: NSArray,
    _ minConfirmations: NSNumber
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    
    do {
      let assignmentObj = getAssignment(assignment)
      var endpoints: [String] = []
      for endpoint in transportEndpoints {
        if let endpointStr = endpoint as? String {
          endpoints.append(endpointStr)
        }
      }
      
      let receiveData = try session.wallet.witnessReceive(
        assetId: assetId,
        assignment: assignmentObj,
        expirationTimestamp: expirationTimestamp?.uint64Value,
        transportEndpoints: endpoints,
        minConfirmations: minConfirmations.uint8Value
      )
      
      return receiveDataToDict(receiveData)
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }
  
  private static func assignmentToDict(_ assignment: Assignment) -> NSDictionary {
    var assignmentDict: [String: Any] = [:]
    switch assignment {
    case .fungible(let amount):
      assignmentDict["type"] = "Fungible"
      assignmentDict["amount"] = NSNumber(value: amount)
    case .nonFungible:
      assignmentDict["type"] = "NonFungible"
    case .inflationRight(let amount):
      assignmentDict["type"] = "InflationRight"
      assignmentDict["amount"] = NSNumber(value: amount)
    case .any:
      assignmentDict["type"] = "Any"
    }
    return assignmentDict as NSDictionary
  }
  
  private static func outpointToDict(_ outpoint: Outpoint) -> NSDictionary {
    return [
      "txid": outpoint.txid,
      "vout": NSNumber(value: outpoint.vout)
    ] as NSDictionary
  }
  
  private static func assetSchemaToString(_ schema: AssetSchema?) -> String? {
    guard let schema = schema else { return nil }
    switch schema {
    case .nia: return "Nia"
    case .uda: return "Uda"
    case .cfa: return "Cfa"
    case .ifa: return "Ifa"
    }
  }
  
  private static func networkToString(_ network: BitcoinNetwork) -> String {
    switch network {
    case .mainnet: return "mainnet"
    case .testnet: return "testnet"
    case .testnet4: return "testnet4"
    case .regtest: return "regtest"
    case .signet: return "signet"
    case .signetCustom: return "signet"
    }
  }
  
  @objc(_decodeInvoice:)
  public static func _decodeInvoice(_ invoice: String) -> NSDictionary {
    do {
      let invoiceData = try Invoice(invoiceString: invoice).invoiceData()
      
      var dict: [String: Any] = [
        "invoice": invoice,
        "recipientId": invoiceData.recipientId,
        "assignment": assignmentToDict(invoiceData.assignment),
        "network": networkToString(invoiceData.network),
        "transportEndpoints": invoiceData.transportEndpoints
      ]
      
      if let assetSchema = assetSchemaToString(invoiceData.assetSchema) {
        dict["assetSchema"] = assetSchema
      }
      
      if let assetId = invoiceData.assetId {
        dict["assetId"] = assetId
      }
      
      if let assignmentName = invoiceData.assignmentName {
        dict["assignmentName"] = assignmentName
      }
      
      if let expirationTimestamp = invoiceData.expirationTimestamp {
        dict["expirationTimestamp"] = NSNumber(value: expirationTimestamp)
      }
      
      return dict as NSDictionary
    } catch {
      let errorData = [
        "error": parseErrorMessage(error),
        "errorCode": getErrorClassName(error)
      ] as NSDictionary
      return errorData
    }
  }

  // MARK: - VSS Backup

  private static func hexStringToBytes(_ hex: String) -> [UInt8] {
    var bytes: [UInt8] = []
    var remaining = hex
    while remaining.count >= 2 {
      let c = String(remaining.prefix(2))
      remaining = String(remaining.dropFirst(2))
      if let byte = UInt8(c, radix: 16) {
        bytes.append(byte)
      }
    }
    return bytes
  }

  private static func stringToVssBackupMode(_ mode: String) -> VssBackupMode {
    switch mode.lowercased() {
    case "blocking": return .blocking
    default: return .async
    }
  }

  @objc(_configureVssBackup:serverUrl:storeId:signingKeyHex:encryptionEnabled:autoBackup:backupMode:)
  public static func _configureVssBackup(
    _ walletId: NSNumber,
    serverUrl: String,
    storeId: String,
    signingKeyHex: String,
    encryptionEnabled: Bool,
    autoBackup: Bool,
    backupMode: String
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    do {
      let config = VssBackupConfig(
        serverUrl: serverUrl,
        storeId: storeId,
        signingKey: hexStringToBytes(signingKeyHex),
        encryptionEnabled: encryptionEnabled,
        autoBackup: autoBackup,
        backupMode: stringToVssBackupMode(backupMode)
      )
      try session.wallet.configureVssBackup(config: config)
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_vssBackup:serverUrl:storeId:signingKeyHex:encryptionEnabled:autoBackup:backupMode:)
  public static func _vssBackup(
    _ walletId: NSNumber,
    serverUrl: String,
    storeId: String,
    signingKeyHex: String,
    encryptionEnabled: Bool,
    autoBackup: Bool,
    backupMode: String
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    do {
      let config = VssBackupConfig(
        serverUrl: serverUrl,
        storeId: storeId,
        signingKey: hexStringToBytes(signingKeyHex),
        encryptionEnabled: encryptionEnabled,
        autoBackup: autoBackup,
        backupMode: stringToVssBackupMode(backupMode)
      )
      let client = try VssBackupClient(config: config)
      let version = try session.wallet.vssBackup(client: client)
      return ["version": NSNumber(value: version)] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_vssBackupInfo:serverUrl:storeId:signingKeyHex:encryptionEnabled:autoBackup:backupMode:)
  public static func _vssBackupInfo(
    _ walletId: NSNumber,
    serverUrl: String,
    storeId: String,
    signingKeyHex: String,
    encryptionEnabled: Bool,
    autoBackup: Bool,
    backupMode: String
  ) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    do {
      let config = VssBackupConfig(
        serverUrl: serverUrl,
        storeId: storeId,
        signingKey: hexStringToBytes(signingKeyHex),
        encryptionEnabled: encryptionEnabled,
        autoBackup: autoBackup,
        backupMode: stringToVssBackupMode(backupMode)
      )
      let client = try VssBackupClient(config: config)
      let info = try session.wallet.vssBackupInfo(client: client)
      var result: [String: Any] = [
        "backupExists": NSNumber(value: info.backupExists),
        "backupRequired": NSNumber(value: info.backupRequired),
      ]
      if let version = info.serverVersion {
        result["serverVersion"] = NSNumber(value: version)
      } else {
        result["serverVersion"] = NSNull()
      }
      return result as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_disableVssAutoBackup:)
  public static func _disableVssAutoBackup(_ walletId: NSNumber) -> NSDictionary {
    guard let session = WalletStore.shared.get(id: walletId.intValue) else {
      return ["error": "Wallet with id \(walletId) not found"] as NSDictionary
    }
    session.wallet.disableVssAutoBackup()
    return [:] as NSDictionary
  }

  @objc(_restoreFromVss:storeId:signingKeyHex:encryptionEnabled:autoBackup:backupMode:targetDir:)
  public static func _restoreFromVss(
    _ serverUrl: String,
    storeId: String,
    signingKeyHex: String,
    encryptionEnabled: Bool,
    autoBackup: Bool,
    backupMode: String,
    targetDir: String
  ) -> NSDictionary {
    do {
      let config = VssBackupConfig(
        serverUrl: serverUrl,
        storeId: storeId,
        signingKey: hexStringToBytes(signingKeyHex),
        encryptionEnabled: encryptionEnabled,
        autoBackup: autoBackup,
        backupMode: stringToVssBackupMode(backupMode)
      )
      let walletPath = try restoreFromVss(config: config, targetDir: targetDir)
      return ["path": walletPath] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  // MARK: - RLN native node bridge

  @objc(_rlnCreateNode:)
  public static func _rlnCreateNode(_ request: NSDictionary) -> NSDictionary {
    do {
      guard let storageDirPath = request["storageDirPath"] as? String,
            let daemonListeningPort = request["daemonListeningPort"] as? NSNumber,
            let ldkPeerListeningPort = request["ldkPeerListeningPort"] as? NSNumber,
            let network = request["network"] as? String,
            let maxMediaUploadSizeMb = request["maxMediaUploadSizeMb"] as? NSNumber else {
        return ["error": "Invalid rlnCreateNode request"] as NSDictionary
      }
      let initReq = SdkInitRequest(
        storageDirPath: storageDirPath,
        daemonListeningPort: UInt16(truncating: daemonListeningPort),
        ldkPeerListeningPort: UInt16(truncating: ldkPeerListeningPort),
        network: network,
        maxMediaUploadSizeMb: UInt16(truncating: maxMediaUploadSizeMb),
        enableVirtualChannelsV0: request["enableVirtualChannelsV0"] as? Bool,
        virtualPeerPubkeys: nil,
        lspBaseUrl: "",
        lspBearerToken: ""
      )
      let node = try SdkNode.create(request: initReq)
      let nodeId = try RlnNodeStore.shared.create(node: node, storageDirPath: storageDirPath)
      return ["nodeId": nodeId] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnInitNode:password:mnemonic:)
  public static func _rlnInitNode(_ nodeId: NSNumber, password: String, mnemonic: String?) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let pubkey = try node.init(password: password, mnemonic: mnemonic)
      return ["pubkey": pubkey] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnInitNodeWithExternalSigner:nodePublicKeyHex:accountXpubVanilla:accountXpubColored:masterFingerprint:protocolVersion:apiLevel:ldkInboundPaymentKeyHex:ldkPeerStorageKeyHex:ldkReceiveAuthKeyHex:asyncPaymentsRootSeedHex:)
  public static func _rlnInitNodeWithExternalSigner(
    _ nodeId: NSNumber,
    nodePublicKeyHex: String,
    accountXpubVanilla: String,
    accountXpubColored: String,
    masterFingerprint: String,
    protocolVersion: String,
    apiLevel: NSNumber,
    ldkInboundPaymentKeyHex: String,
    ldkPeerStorageKeyHex: String,
    ldkReceiveAuthKeyHex: String,
    asyncPaymentsRootSeedHex: String
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      try node.initWithExternalSigner(bootstrap: SdkExternalSignerBootstrap(
        nodeId: nodePublicKeyHex,
        accountXpubVanilla: accountXpubVanilla,
        accountXpubColored: accountXpubColored,
        masterFingerprint: masterFingerprint,
        protocolVersion: protocolVersion,
        apiLevel: UInt32(truncating: apiLevel),
        ldkInboundPaymentKeyHex: ldkInboundPaymentKeyHex,
        ldkPeerStorageKeyHex: ldkPeerStorageKeyHex,
        ldkReceiveAuthKeyHex: ldkReceiveAuthKeyHex,
        asyncPaymentsRootSeedHex: asyncPaymentsRootSeedHex
      ))
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnUnlockNode:password:bitcoindRpcUsername:bitcoindRpcPassword:bitcoindRpcHost:bitcoindRpcPort:indexerUrl:proxyEndpoint:announceAddresses:announceAlias:)
  public static func _rlnUnlockNode(
    _ nodeId: NSNumber,
    password: String,
    bitcoindRpcUsername: String,
    bitcoindRpcPassword: String,
    bitcoindRpcHost: String,
    bitcoindRpcPort: NSNumber,
    indexerUrl: String?,
    proxyEndpoint: String?,
    announceAddresses: [String],
    announceAlias: String?
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      try node.unlock(
        request: SdkUnlockRequest(
          password: password,
          bitcoindRpcUsername: bitcoindRpcUsername,
          bitcoindRpcPassword: bitcoindRpcPassword,
          bitcoindRpcHost: bitcoindRpcHost,
          bitcoindRpcPort: UInt16(truncating: bitcoindRpcPort),
          indexerUrl: indexerUrl,
          proxyEndpoint: proxyEndpoint,
          announceAddresses: announceAddresses,
          announceAlias: announceAlias
        )
      )
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnDestroyNode:)
  public static func _rlnDestroyNode(_ nodeId: NSNumber) -> NSDictionary {
    RlnNodeStore.shared.remove(id: nodeId.intValue)
    return [:] as NSDictionary
  }

  @objc(_rlnNodeInfo:)
  public static func _rlnNodeInfo(_ nodeId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let info = try node.nodeInfo()
      return [
        "pubkey": info.pubkey,
        "numChannels": NSNumber(value: info.numChannels),
        "numUsableChannels": NSNumber(value: info.numUsableChannels),
        "localBalanceSat": NSNumber(value: info.localBalanceSat),
        "numPeers": NSNumber(value: info.numPeers),
      ] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnNetworkInfo:)
  public static func _rlnNetworkInfo(_ nodeId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let info = try node.networkInfo()
      return [
        "network": info.network,
        "height": NSNumber(value: info.height),
      ] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnListPeers:)
  public static func _rlnListPeers(_ nodeId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let peers = try node.listPeers().map { ["pubkey": $0.pubkey] as NSDictionary }
      return ["peers": peers] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnConnectPeer:peerPubkeyAndAddr:)
  public static func _rlnConnectPeer(_ nodeId: NSNumber, peerPubkeyAndAddr: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      try node.connectpeer(peerPubkeyAndAddr: peerPubkeyAndAddr)
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnDisconnectPeer:peerPubkey:)
  public static func _rlnDisconnectPeer(_ nodeId: NSNumber, peerPubkey: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      try node.disconnectpeer(request: SdkDisconnectPeerRequest(peerPubkey: peerPubkey))
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnListChannels:)
  public static func _rlnListChannels(_ nodeId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let channels = try node.listChannels().map { c in
        [
          "channelId": c.channelId,
          "peerPubkey": c.peerPubkey,
          "ready": c.ready,
          "isUsable": c.isUsable,
          "capacitySat": NSNumber(value: c.capacitySat),
          "localBalanceSat": NSNumber(value: c.localBalanceSat),
          "outboundBalanceMsat": NSNumber(value: c.outboundBalanceMsat),
          "inboundBalanceMsat": NSNumber(value: c.inboundBalanceMsat),
          "public": c.public,
          "fundingTxid": c.fundingTxid as Any,
          "assetId": c.assetId as Any,
          "assetLocalAmount": c.assetLocalAmount.map { NSNumber(value: $0) } as Any,
          "assetRemoteAmount": c.assetRemoteAmount.map { NSNumber(value: $0) } as Any,
        ] as NSDictionary
      }
      return ["channels": channels] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnOpenChannel:request:)
  public static func _rlnOpenChannel(_ nodeId: NSNumber, request: NSDictionary) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      guard let peer = request["peerPubkeyAndOptAddr"] as? String,
            let capacitySat = request["capacitySat"] as? NSNumber,
            let pushMsat = request["pushMsat"] as? NSNumber,
            let isPublic = request["public"] as? Bool,
            let withAnchors = request["withAnchors"] as? Bool else {
        return ["error": "Invalid rlnOpenChannel request"] as NSDictionary
      }
      let req = SdkOpenChannelRequest(
        peerPubkeyAndOptAddr: peer,
        capacitySat: UInt64(truncating: capacitySat),
        pushMsat: UInt64(truncating: pushMsat),
        public: isPublic,
        withAnchors: withAnchors,
        feeBaseMsat: (request["feeBaseMsat"] as? NSNumber).map { UInt32(truncating: $0) },
        feeProportionalMillionths: (request["feeProportionalMillionths"] as? NSNumber).map { UInt32(truncating: $0) },
        temporaryChannelId: request["temporaryChannelId"] as? String,
        assetId: request["assetId"] as? String,
        assetAmount: (request["assetAmount"] as? NSNumber).map { UInt64(truncating: $0) },
        pushAssetAmount: (request["pushAssetAmount"] as? NSNumber).map { UInt64(truncating: $0) },
        virtualOpenMode: request["virtualOpenMode"] as? String
      )
      let response = try node.openchannel(request: req)
      return ["temporaryChannelId": response.temporaryChannelId] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnCloseChannel:request:)
  public static func _rlnCloseChannel(_ nodeId: NSNumber, request: NSDictionary) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      guard let channelId = request["channelId"] as? String,
            let peerPubkey = request["peerPubkey"] as? String,
            let force = request["force"] as? Bool else {
        return ["error": "Invalid rlnCloseChannel request"] as NSDictionary
      }
      try node.closechannel(request: SdkCloseChannelRequest(channelId: channelId, peerPubkey: peerPubkey, force: force))
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnListPayments:)
  public static func _rlnListPayments(_ nodeId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let payments = try node.listPayments().map { p in
        [
          "paymentHash": p.paymentHash,
          "status": "\(p.status)".uppercased(),
          "paymentType": "\(p.paymentType)".uppercased(),
          "assetId": p.assetId as Any,
          "amtMsat": p.amtMsat.map { NSNumber(value: $0) } as Any,
          "assetAmount": p.assetAmount.map { NSNumber(value: $0) } as Any,
          "createdAt": NSNumber(value: p.createdAt),
          "updatedAt": NSNumber(value: p.updatedAt),
          "payeePubkey": p.payeePubkey,
          "preimage": p.preimage as Any,
        ] as NSDictionary
      }
      return ["payments": payments] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnAddress:)
  public static func _rlnAddress(_ nodeId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let address = try node.address()
      return ["address": address.address] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnAssetBalance:assetId:)
  public static func _rlnAssetBalance(_ nodeId: NSNumber, assetId: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let b = try node.assetBalance(assetId: assetId)
      return [
        "settled": NSNumber(value: b.settled),
        "future": NSNumber(value: b.future),
        "spendable": NSNumber(value: b.spendable),
      ] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnBackup:backupPath:password:)
  public static func _rlnBackup(_ nodeId: NSNumber, backupPath: String, password: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      try node.backup(backupPath: backupPath, password: password)
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnBtcBalance:skipSync:)
  public static func _rlnBtcBalance(_ nodeId: NSNumber, skipSync: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let b = try node.btcBalance(skipSync: skipSync.boolValue)
      return [
        "vanilla": [
          "settled": NSNumber(value: b.vanilla.settled),
          "future": NSNumber(value: b.vanilla.future),
          "spendable": NSNumber(value: b.vanilla.spendable)
        ] as NSDictionary,
        "colored": [
          "settled": NSNumber(value: b.colored.settled),
          "future": NSNumber(value: b.colored.future),
          "spendable": NSNumber(value: b.colored.spendable)
        ] as NSDictionary,
      ] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnCheckIndexerUrl:indexerUrl:)
  public static func _rlnCheckIndexerUrl(_ nodeId: NSNumber, indexerUrl: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.checkIndexerUrl(indexerUrl: indexerUrl)
      return ["indexerUrl": res.indexerUrl] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnCheckProxyEndpoint:proxyEndpoint:)
  public static func _rlnCheckProxyEndpoint(_ nodeId: NSNumber, proxyEndpoint: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      try node.checkProxyEndpoint(proxyEndpoint: proxyEndpoint)
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnCreateUtxos:request:)
  public static func _rlnCreateUtxos(_ nodeId: NSNumber, request: NSDictionary) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      try node.createutxos(
        request: SdkCreateUtxosRequest(
          upTo: (request["upTo"] as? NSNumber)?.boolValue ?? false,
          num: (request["num"] as? NSNumber).map { UInt8(truncating: $0) },
          size: (request["size"] as? NSNumber).map { UInt64(truncating: $0) },
          feeRate: UInt64(truncating: (request["feeRate"] as? NSNumber) ?? 0),
          skipSync: (request["skipSync"] as? NSNumber)?.boolValue ?? false
        )
      )
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnDecodeLnInvoice:invoice:)
  public static func _rlnDecodeLnInvoice(_ nodeId: NSNumber, invoice: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.decodeLnInvoice(invoice: invoice)
      var dict: [String: Any] = [
        "expirySec": NSNumber(value: res.expirySec),
        "timestamp": NSNumber(value: res.timestamp),
        "paymentHash": res.paymentHash,
        "paymentSecret": res.paymentSecret,
        "network": res.network,
      ]
      if let amt = res.amtMsat { dict["amtMsat"] = NSNumber(value: amt) }
      if let aid = res.assetId { dict["assetId"] = aid }
      if let aa = res.assetAmount { dict["assetAmount"] = NSNumber(value: aa) }
      if let pk = res.payeePubkey { dict["payeePubkey"] = pk }
      return dict as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnDecodeRgbInvoice:invoice:)
  public static func _rlnDecodeRgbInvoice(_ nodeId: NSNumber, invoice: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.decodeRgbInvoice(invoice: invoice)
      var dict: [String: Any] = [
        "recipientId": res.recipientId,
        "recipientType": res.recipientType,
        "assignment": res.assignment,
        "network": res.network,
        "transportEndpoints": res.transportEndpoints,
      ]
      if let schema = res.assetSchema { dict["assetSchema"] = schema }
      if let aid = res.assetId { dict["assetId"] = aid }
      if let exp = res.expirationTimestamp { dict["expirationTimestamp"] = NSNumber(value: exp) }
      return dict as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnEstimateFee:blocks:)
  public static func _rlnEstimateFee(_ nodeId: NSNumber, blocks: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.estimateFee(blocks: UInt16(truncating: blocks))
      return ["value": "\(res)"] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnGetChannelId:temporaryChannelId:)
  public static func _rlnGetChannelId(_ nodeId: NSNumber, temporaryChannelId: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      return ["channelId": try node.getChannelId(temporaryChannelId: temporaryChannelId)] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnGetPayment:paymentHash:)
  public static func _rlnGetPayment(_ nodeId: NSNumber, paymentHash: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let p = try node.getPayment(paymentHash: paymentHash)
      var dict: [String: Any] = [
        "paymentHash": p.paymentHash,
        "status": "\(p.status)".uppercased(),
        "paymentType": "\(p.paymentType)".uppercased(),
        "createdAt": NSNumber(value: p.createdAt),
        "updatedAt": NSNumber(value: p.updatedAt),
        "payeePubkey": p.payeePubkey,
      ]
      if let assetId = p.assetId { dict["assetId"] = assetId }
      if let amt = p.amtMsat { dict["amtMsat"] = NSNumber(value: amt) }
      if let a = p.assetAmount { dict["assetAmount"] = NSNumber(value: a) }
      if let pre = p.preimage { dict["preimage"] = pre }
      return dict as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnInvoiceStatus:invoice:)
  public static func _rlnInvoiceStatus(_ nodeId: NSNumber, invoice: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      return ["value": "\(try node.invoiceStatus(invoice: invoice))"] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnFailTransfers:batchTransferIdx:noAssetOnly:skipSync:)
  public static func _rlnFailTransfers(
    _ nodeId: NSNumber,
    batchTransferIdx: NSNumber?,
    noAssetOnly: Bool,
    skipSync: Bool
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.failtransfers(
        request: SdkFailTransfersRequest(
          batchTransferIdx: batchTransferIdx?.intValue,
          noAssetOnly: noAssetOnly,
          skipSync: skipSync
        )
      )
      return ["transfersChanged": res.transfersChanged] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnKeysend:destPubkey:amtMsat:assetId:assetAmount:)
  public static func _rlnKeysend(
    _ nodeId: NSNumber,
    destPubkey: String,
    amtMsat: NSNumber,
    assetId: String?,
    assetAmount: NSNumber?
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.keysend(
        request: SdkKeysendRequest(
          destPubkey: destPubkey,
          amtMsat: UInt64(truncating: amtMsat),
          assetId: assetId,
          assetAmount: assetAmount.map { UInt64(truncating: $0) }
        )
      )
      return [
        "paymentHash": res.paymentHash,
        "paymentPreimage": res.paymentPreimage,
        "status": "\(res.status)",
      ] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnListAssets:filterAssetSchemas:)
  public static func _rlnListAssets(_ nodeId: NSNumber, filterAssetSchemas: [String]) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.listAssets(filterAssetSchemas: filterAssetSchemas)
      return ["value": "\(res)"] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnListTransactions:skipSync:)
  public static func _rlnListTransactions(_ nodeId: NSNumber, skipSync: Bool) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let txs = try node.listTransactions(skipSync: skipSync).map { ["txid": $0.txid] as NSDictionary }
      return ["transactions": txs] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnListTransfers:assetId:)
  public static func _rlnListTransfers(_ nodeId: NSNumber, assetId: String) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let transfers = try node.listTransfers(assetId: assetId).map {
        ["idx": NSNumber(value: $0.idx), "status": "\($0.status)"] as NSDictionary
      }
      return ["transfers": transfers] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnListUnspents:skipSync:)
  public static func _rlnListUnspents(_ nodeId: NSNumber, skipSync: Bool) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let unspents = try node.listUnspents(skipSync: skipSync).map {
        ["txid": $0.utxo.outpoint.txid, "vout": NSNumber(value: $0.utxo.outpoint.vout)] as NSDictionary
      }
      return ["unspents": unspents] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnLnInvoice:amtMsat:expirySec:assetId:assetAmount:)
  public static func _rlnLnInvoice(
    _ nodeId: NSNumber,
    amtMsat: NSNumber?,
    expirySec: NSNumber,
    assetId: String?,
    assetAmount: NSNumber?
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.lnInvoice(
        request: LnInvoiceRequest(
          amtMsat: amtMsat.map { UInt64(truncating: $0) },
          expirySec: UInt32(truncating: expirySec),
          assetId: assetId,
          assetAmount: assetAmount.map { UInt64(truncating: $0) },
          paymentHash: nil,
          descriptionHash: nil
        )
      )
      return ["invoice": res.invoice] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnRefreshTransfers:skipSync:)
  public static func _rlnRefreshTransfers(_ nodeId: NSNumber, skipSync: Bool) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      try node.refreshtransfers(request: SdkRefreshTransfersRequest(skipSync: skipSync))
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnRgbInvoice:assetId:assignmentAmount:durationSeconds:minConfirmations:witness:)
  public static func _rlnRgbInvoice(
    _ nodeId: NSNumber,
    assetId: String?,
    assignmentAmount: NSNumber?,
    durationSeconds: NSNumber?,
    minConfirmations: NSNumber,
    witness: Bool
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.rgbinvoice(
        request: SdkRgbInvoiceRequest(
          assetId: assetId,
          assignmentKind: nil,
          assignmentAmount: assignmentAmount.map { UInt64(truncating: $0) },
          durationSeconds: durationSeconds.map { UInt32(truncating: $0) },
          minConfirmations: UInt8(truncating: minConfirmations),
          witness: witness
        )
      )
      var dict: [String: Any] = [
        "recipientId": res.recipientId,
        "invoice": res.invoice,
        "batchTransferIdx": NSNumber(value: res.batchTransferIdx),
      ]
      if let ts = res.expirationTimestamp { dict["expirationTimestamp"] = NSNumber(value: ts) }
      return dict as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnSendBtc:amount:address:feeRate:skipSync:)
  public static func _rlnSendBtc(
    _ nodeId: NSNumber,
    amount: NSNumber,
    address: String,
    feeRate: NSNumber,
    skipSync: Bool
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.sendbtc(
        request: SdkSendBtcRequest(
          amount: UInt64(truncating: amount),
          address: address,
          feeRate: UInt64(truncating: feeRate),
          skipSync: skipSync
        )
      )
      return ["txid": res.txid] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnSendPayment:invoice:amtMsat:assetId:assetAmount:)
  public static func _rlnSendPayment(
    _ nodeId: NSNumber,
    invoice: String,
    amtMsat: NSNumber?,
    assetId: String?,
    assetAmount: NSNumber?
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let res = try node.sendpayment(
        request: SdkSendPaymentRequest(
          invoice: invoice,
          amtMsat: amtMsat.map { UInt64(truncating: $0) },
          assetId: assetId,
          assetAmount: assetAmount.map { UInt64(truncating: $0) }
        )
      )
      return [
        "paymentId": res.paymentId,
        "paymentHash": res.paymentHash as Any,
        "status": "\(res.status)",
      ] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnSendRgb:donation:feeRate:minConfirmations:skipSync:assetId:recipientId:amount:transportEndpoints:)
  public static func _rlnSendRgb(
    _ nodeId: NSNumber,
    donation: Bool,
    feeRate: NSNumber,
    minConfirmations: NSNumber,
    skipSync: Bool,
    assetId: String,
    recipientId: String,
    amount: NSNumber,
    transportEndpoints: NSArray
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      let endpoints = (transportEndpoints as? [String]) ?? []
      let res = try node.sendRgb(
        request: SendRgbRequest(
          donation: donation,
          feeRate: UInt64(truncating: feeRate),
          minConfirmations: UInt8(truncating: minConfirmations),
          skipSync: skipSync,
          recipientGroups: [
            AssetRecipients(
              assetId: assetId,
              recipients: [
                RgbRecipient(
                  recipientId: recipientId,
                  witnessData: nil,
                  assignmentKind: .fungible,
                  assignmentAmount: UInt64(truncating: amount),
                  transportEndpoints: endpoints
                )
              ]
            )
          ]
        )
      )
      return [
        "txid": res.txid,
        "batchTransferIdx": NSNumber(value: res.batchTransferIdx),
      ] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnShutdown:)
  public static func _rlnShutdown(_ nodeId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      node.shutdown()
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnSync:)
  public static func _rlnSync(_ nodeId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      try node.sync()
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnIssueAssetNia:ticker:name:precision:amounts:)
  public static func _rlnIssueAssetNia(
    _ nodeId: NSNumber,
    _ ticker: String,
    _ name: String,
    _ precision: NSNumber,
    _ amounts: NSArray
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      var amountsList: [UInt64] = []
      for amount in amounts {
        if let n = amount as? NSNumber { amountsList.append(n.uint64Value) }
      }
      let asset = try node.issueassetnia(request: SdkIssueAssetNiaRequest(
        amounts: amountsList,
        ticker: ticker,
        name: name,
        precision: precision.uint8Value
      ))
      var dict: [String: Any] = [
        "assetId": asset.assetId,
        "ticker": asset.ticker,
        "name": asset.name,
        "precision": NSNumber(value: asset.precision),
        "issuedSupply": NSNumber(value: asset.issuedSupply),
        "timestamp": NSNumber(value: asset.timestamp),
        "addedAt": NSNumber(value: asset.addedAt),
        "balance": [
          "settled": NSNumber(value: asset.balance.settled),
          "future": NSNumber(value: asset.balance.future),
          "spendable": NSNumber(value: asset.balance.spendable),
          "offchainOutbound": NSNumber(value: asset.balance.offchainOutbound),
          "offchainInbound": NSNumber(value: asset.balance.offchainInbound)
        ] as NSDictionary
      ]
      if let details = asset.details { dict["details"] = details }
      if let media = asset.media {
        dict["media"] = ["filePath": media.filePath, "mime": media.mime, "digest": media.digest] as NSDictionary
      }
      return dict as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnIssueAssetCfa:name:details:precision:amounts:fileDigest:)
  public static func _rlnIssueAssetCfa(
    _ nodeId: NSNumber,
    _ name: String,
    _ details: String?,
    _ precision: NSNumber,
    _ amounts: NSArray,
    _ fileDigest: String?
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      var amountsList: [UInt64] = []
      for amount in amounts {
        if let n = amount as? NSNumber { amountsList.append(n.uint64Value) }
      }
      let asset = try node.issueassetcfa(request: SdkIssueAssetCfaRequest(
        amounts: amountsList,
        name: name,
        details: details,
        precision: precision.uint8Value,
        fileDigest: fileDigest
      ))
      var dict: [String: Any] = [
        "assetId": asset.assetId,
        "name": asset.name,
        "precision": NSNumber(value: asset.precision),
        "issuedSupply": NSNumber(value: asset.issuedSupply),
        "timestamp": NSNumber(value: asset.timestamp),
        "addedAt": NSNumber(value: asset.addedAt),
        "balance": [
          "settled": NSNumber(value: asset.balance.settled),
          "future": NSNumber(value: asset.balance.future),
          "spendable": NSNumber(value: asset.balance.spendable),
          "offchainOutbound": NSNumber(value: asset.balance.offchainOutbound),
          "offchainInbound": NSNumber(value: asset.balance.offchainInbound)
        ] as NSDictionary
      ]
      if let d = asset.details { dict["details"] = d }
      if let media = asset.media {
        dict["media"] = ["filePath": media.filePath, "mime": media.mime, "digest": media.digest] as NSDictionary
      }
      return dict as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnIssueAssetIfa:ticker:name:precision:amounts:inflationAmounts:rejectListUrl:)
  public static func _rlnIssueAssetIfa(
    _ nodeId: NSNumber,
    _ ticker: String,
    _ name: String,
    _ precision: NSNumber,
    _ amounts: NSArray,
    _ inflationAmounts: NSArray,
    _ rejectListUrl: String?
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      var amountsList: [UInt64] = []
      for amount in amounts {
        if let n = amount as? NSNumber { amountsList.append(n.uint64Value) }
      }
      var inflationList: [UInt64] = []
      for amount in inflationAmounts {
        if let n = amount as? NSNumber { inflationList.append(n.uint64Value) }
      }
      let asset = try node.issueassetifa(request: SdkIssueAssetIfaRequest(
        amounts: amountsList,
        inflationAmounts: inflationList,
        ticker: ticker,
        name: name,
        precision: precision.uint8Value,
        rejectListUrl: rejectListUrl
      ))
      var dict: [String: Any] = [
        "assetId": asset.assetId,
        "ticker": asset.ticker,
        "name": asset.name,
        "precision": NSNumber(value: asset.precision),
        "initialSupply": NSNumber(value: asset.initialSupply),
        "maxSupply": NSNumber(value: asset.maxSupply),
        "knownCirculatingSupply": NSNumber(value: asset.knownCirculatingSupply),
        "timestamp": NSNumber(value: asset.timestamp),
        "addedAt": NSNumber(value: asset.addedAt),
        "balance": [
          "settled": NSNumber(value: asset.balance.settled),
          "future": NSNumber(value: asset.balance.future),
          "spendable": NSNumber(value: asset.balance.spendable),
          "offchainOutbound": NSNumber(value: asset.balance.offchainOutbound),
          "offchainInbound": NSNumber(value: asset.balance.offchainInbound)
        ] as NSDictionary
      ]
      if let d = asset.details { dict["details"] = d }
      if let media = asset.media {
        dict["media"] = ["filePath": media.filePath, "mime": media.mime, "digest": media.digest] as NSDictionary
      }
      if let url = asset.rejectListUrl { dict["rejectListUrl"] = url }
      return dict as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnIssueAssetUda:ticker:name:details:precision:mediaFileDigest:attachmentsFileDigests:)
  public static func _rlnIssueAssetUda(
    _ nodeId: NSNumber,
    _ ticker: String,
    _ name: String,
    _ details: String?,
    _ precision: NSNumber,
    _ mediaFileDigest: String?,
    _ attachmentsFileDigests: NSArray
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      var digestsList: [String] = []
      for d in attachmentsFileDigests {
        if let s = d as? String { digestsList.append(s) }
      }
      let asset = try node.issueassetuda(request: SdkIssueAssetUdaRequest(
        ticker: ticker,
        name: name,
        details: details,
        precision: precision.uint8Value,
        mediaFileDigest: mediaFileDigest,
        attachmentsFileDigests: digestsList
      ))
      var dict: [String: Any] = [
        "assetId": asset.assetId,
        "ticker": asset.ticker,
        "name": asset.name,
        "precision": NSNumber(value: asset.precision),
        "timestamp": NSNumber(value: asset.timestamp),
        "addedAt": NSNumber(value: asset.addedAt),
        "balance": [
          "settled": NSNumber(value: asset.balance.settled),
          "future": NSNumber(value: asset.balance.future),
          "spendable": NSNumber(value: asset.balance.spendable),
          "offchainOutbound": NSNumber(value: asset.balance.offchainOutbound),
          "offchainInbound": NSNumber(value: asset.balance.offchainInbound)
        ] as NSDictionary
      ]
      if let d = asset.details { dict["details"] = d }
      if let token = asset.token {
        var tokenDict: [String: Any] = [
          "index": NSNumber(value: token.index),
          "embeddedMedia": token.embeddedMedia,
          "reserves": token.reserves
        ]
        if let t = token.ticker { tokenDict["ticker"] = t }
        if let n = token.name { tokenDict["name"] = n }
        if let d = token.details { tokenDict["details"] = d }
        if let media = token.media {
          tokenDict["media"] = ["filePath": media.filePath, "mime": media.mime, "digest": media.digest] as NSDictionary
        }
        let attachmentsArray = token.attachments.map { (key, media) in
          ["key": NSNumber(value: key), "filePath": media.filePath, "mime": media.mime, "digest": media.digest] as NSDictionary
        }
        tokenDict["attachments"] = attachmentsArray
        dict["token"] = tokenDict as NSDictionary
      }
      return dict as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnCreateNativeExternalSigner:network:permissivePolicy:)
  public static func _rlnCreateNativeExternalSigner(_ seedHex: String, network: String, permissivePolicy: Bool) -> NSDictionary {
    do {
      let signer = try NativeExternalSigner(seedHex: seedHex, network: network, permissivePolicy: permissivePolicy)
      let signerId = RlnNodeStore.shared.createSigner(signer)
      return ["signerId": signerId] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnInitNodeWithNativeExternalSigner:signerId:)
  public static func _rlnInitNodeWithNativeExternalSigner(_ nodeId: NSNumber, signerId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      guard let signer = RlnNodeStore.shared.getSigner(id: signerId.intValue) else {
        return ["error": "Native signer with id \(signerId) not found"] as NSDictionary
      }
      try node.initWithNativeExternalSigner(signer: signer)
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnAttachNativeExternalSigner:signerId:)
  public static func _rlnAttachNativeExternalSigner(_ nodeId: NSNumber, signerId: NSNumber) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      guard let signer = RlnNodeStore.shared.getSigner(id: signerId.intValue) else {
        return ["error": "Native signer with id \(signerId) not found"] as NSDictionary
      }
      try node.attachNativeExternalSigner(signer: signer)
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnUnlockNodeWithNativeExternalSigner:signerId:bitcoindRpcUsername:bitcoindRpcPassword:bitcoindRpcHost:bitcoindRpcPort:indexerUrl:proxyEndpoint:announceAddresses:announceAlias:)
  public static func _rlnUnlockNodeWithNativeExternalSigner(
    _ nodeId: NSNumber,
    signerId: NSNumber,
    bitcoindRpcUsername: String,
    bitcoindRpcPassword: String,
    bitcoindRpcHost: String,
    bitcoindRpcPort: NSNumber,
    indexerUrl: String?,
    proxyEndpoint: String?,
    announceAddresses: [String],
    announceAlias: String?
  ) -> NSDictionary {
    do {
      guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
        return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
      }
      guard let signer = RlnNodeStore.shared.getSigner(id: signerId.intValue) else {
        return ["error": "Native signer with id \(signerId) not found"] as NSDictionary
      }
      try node.unlockWithNativeExternalSigner(
        signer: signer,
        bitcoindRpcUsername: bitcoindRpcUsername,
        bitcoindRpcPassword: bitcoindRpcPassword,
        bitcoindRpcHost: bitcoindRpcHost,
        bitcoindRpcPort: UInt16(truncating: bitcoindRpcPort),
        indexerUrl: indexerUrl,
        proxyEndpoint: proxyEndpoint,
        announceAddresses: announceAddresses,
        announceAlias: announceAlias
      )
      return [:] as NSDictionary
    } catch {
      return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
    }
  }

  @objc(_rlnDestroyNativeExternalSigner:)
  public static func _rlnDestroyNativeExternalSigner(_ signerId: NSNumber) -> NSDictionary {
    RlnNodeStore.shared.removeSigner(id: signerId.intValue)
    return [:] as NSDictionary
  }
}