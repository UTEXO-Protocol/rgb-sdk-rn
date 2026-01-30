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
  
  @objc(_initializeWallet:accountXpubVanilla:accountXpubColored:mnemonic:masterFingerprint:supportedSchemas:maxAllocationsPerUtxo:vanillaKeychain:)
  public static func _initializeWallet(
    _ network: String,
    _ accountXpubVanilla: String,
    _ accountXpubColored: String,
    _ mnemonic: String,
    _ masterFingerprint: String,
    _ supportedSchemas: NSArray,
    _ maxAllocationsPerUtxo: NSNumber,
    _ vanillaKeychain: NSNumber
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
      
      let dataDirPath = rgbDir.path
      
      let bitcoinNetwork = getNetwork(network)
      var schemaList: [AssetSchema] = []
      for schemaStr in supportedSchemas {
        if let schemaString = schemaStr as? String {
          schemaList.append(getAssetSchema(schemaString))
        }
      }
      
      let walletData = WalletData(
        dataDir: dataDirPath,
        bitcoinNetwork: bitcoinNetwork,
        databaseType: .sqlite,
        maxAllocationsPerUtxo: UInt32(maxAllocationsPerUtxo.intValue),
        accountXpubVanilla: accountXpubVanilla,
        accountXpubColored: accountXpubColored,
        mnemonic: mnemonic,
        masterFingerprint: masterFingerprint,
        vanillaKeychain: UInt8(vanillaKeychain.intValue),
        supportedSchemas: schemaList
      )
      let wallet = try Wallet(walletData: walletData)
      
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
    case "ReplaceRight":
      return .replaceRight
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
  
  @objc(_blindReceive:assetId:assignment:durationSeconds:transportEndpoints:minConfirmations:)
  public static func _blindReceive(
    _ walletId: NSNumber,
    _ assetId: String?,
    _ assignment: NSDictionary,
    _ durationSeconds: NSNumber?,
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
        durationSeconds: durationSeconds?.uint32Value,
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
    
    let networkString: String
    switch walletData.bitcoinNetwork {
    case .mainnet: networkString = "mainnet"
    case .testnet: networkString = "testnet"
    case .testnet4: networkString = "testnet4"
    case .regtest: networkString = "regtest"
    case .signet: networkString = "signet"
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
      "accountXpubVanilla": walletData.accountXpubVanilla,
      "accountXpubColored": walletData.accountXpubColored,
      "masterFingerprint": walletData.masterFingerprint,
      "supportedSchemas": schemaStrings
    ]
    
    if let mnemonic = walletData.mnemonic {
      dict["mnemonic"] = mnemonic
    }
    if let vanillaKeychain = walletData.vanillaKeychain {
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
  
  @objc(_inflateBegin:assetId:inflationAmounts:feeRate:minConfirmations:)
  public static func _inflateBegin(
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
      
      let psbt = try session.wallet.inflateBegin(
        online: online,
        assetId: assetId,
        inflationAmounts: amounts,
        feeRate: feeRate.uint64Value,
        minConfirmations: minConfirmations.uint8Value
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
  
  @objc(_issueAssetIfa:ticker:name:precision:amounts:inflationAmounts:replaceRightsNum:rejectListUrl:)
  public static func _issueAssetIfa(
    _ walletId: NSNumber,
    _ ticker: String,
    _ name: String,
    _ precision: NSNumber,
    _ amounts: NSArray,
    _ inflationAmounts: NSArray,
    _ replaceRightsNum: NSNumber,
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
        replaceRightsNum: replaceRightsNum.uint8Value,
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
        if let expiration = transfer.expiration {
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
  
  @objc(_send:recipientMap:donation:feeRate:minConfirmations:skipSync:)
  public static func _send(
    _ walletId: NSNumber,
    _ recipientMap: NSDictionary,
    _ donation: NSNumber,
    _ feeRate: NSNumber,
    _ minConfirmations: NSNumber,
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
  
  @objc(_sendBegin:recipientMap:donation:feeRate:minConfirmations:)
  public static func _sendBegin(
    _ walletId: NSNumber,
    _ recipientMap: NSDictionary,
    _ donation: NSNumber,
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
      
      let psbt = try session.wallet.sendBegin(
        online: online,
        recipientMap: recipientMapNative,
        donation: donation.boolValue,
        feeRate: feeRate.uint64Value,
        minConfirmations: minConfirmations.uint8Value
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
  
  @objc(_witnessReceive:assetId:assignment:durationSeconds:transportEndpoints:minConfirmations:)
  public static func _witnessReceive(
    _ walletId: NSNumber,
    _ assetId: String?,
    _ assignment: NSDictionary,
    _ durationSeconds: NSNumber?,
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
        durationSeconds: durationSeconds?.uint32Value,
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
    case .replaceRight:
      assignmentDict["type"] = "ReplaceRight"
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
}
