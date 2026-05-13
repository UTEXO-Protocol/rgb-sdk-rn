import Foundation


@objc(RgbSwiftHelper)
public class RgbSwiftHelper: NSObject {

  private static func getErrorClassName(_ error: Error) -> String {
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
      let pubkey = try node.`init`(password: password, mnemonic: mnemonic)
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
      throw NSError(domain: "RlnError", code: -1, userInfo: [NSLocalizedDescriptionKey: "rlnBackup is not supported in this version of the RLN node"])
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
      return ["indexerUrl": res.indexerProtocol] as NSDictionary
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
          size: (request["size"] as? NSNumber).map { UInt32(truncating: $0) },
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
      var found: Payment? = nil
      for payType in [PaymentType.outbound, .inboundAutoClaim, .inboundHodl] {
        if let p = try? node.getPayment(paymentHash: paymentHash, paymentType: payType) {
          found = p; break
        }
      }
      guard let p = found else {
        return ["error": "Payment not found for hash: \(paymentHash)"] as NSDictionary
      }
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
          batchTransferIdx: batchTransferIdx.map { Int32($0.intValue) },
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
      let txs = try node.listTransactions(skipSync: skipSync).map { tx -> NSDictionary in
        var txDict: [String: Any] = [
          "txid": tx.txid,
          "transactionType": "\(tx.transactionType)",
          "received": NSNumber(value: UInt64(tx.received)),
          "sent": NSNumber(value: UInt64(tx.sent)),
          "fee": NSNumber(value: UInt64(tx.fee)),
        ]
        if let ct = tx.confirmationTime {
          txDict["confirmationTime"] = ["height": NSNumber(value: ct.height), "timestamp": NSNumber(value: ct.timestamp)] as NSDictionary
        }
        return txDict as NSDictionary
      }
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
      let unspents = try node.listUnspents(skipSync: skipSync).map { u -> NSDictionary in
        let parts = u.utxo.outpoint.split(separator: ":", maxSplits: 1)
        let txid = parts.count > 0 ? String(parts[0]) : u.utxo.outpoint
        let vout = parts.count > 1 ? Int(String(parts[1])) ?? 0 : 0
        return ["txid": txid, "vout": NSNumber(value: vout)] as NSDictionary
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
    guard let node = RlnNodeStore.shared.get(id: nodeId.intValue) else {
      return ["error": "RLN node with id \(nodeId) not found"] as NSDictionary
    }
    node.shutdown()
    RlnNodeStore.shared.markShutdown(id: nodeId.intValue)
    return [:] as NSDictionary
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
        let attachmentsArray = token.attachments.map { attachment -> NSDictionary in
          ["key": NSNumber(value: attachment.key), "filePath": attachment.media.filePath, "mime": attachment.media.mime, "digest": attachment.media.digest] as NSDictionary
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
      node.detachExternalSigner()
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
