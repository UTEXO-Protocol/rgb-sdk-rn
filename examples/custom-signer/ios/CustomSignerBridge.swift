import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// CustomSignerBridge.swift
//
// Add these methods to RgbSwiftHelper.swift (or keep in a separate file and
// call them from Rgb.mm) to expose the custom signer to the RN JS layer.
//
// Rgb.mm additions are shown at the bottom of this file as comments.
// ─────────────────────────────────────────────────────────────────────────────

extension RgbSwiftHelper {

    // MARK: - Create custom signer + return bootstrap fields

    /// Creates a NativeBackedSignerBackend (or swap in your own backend),
    /// stores it in CustomSignerStore, and returns the signerId plus the full
    /// bootstrap dictionary so JS can call rlnInitNodeWithExternalSigner or
    /// rlnInitNodeWithCustomSigner without a second round-trip.
    @objc(_rlnCreateCustomSigner:network:)
    public static func _rlnCreateCustomSigner(
        _ seedHex: String,
        network: String
    ) -> NSDictionary {
        do {
            // Swap NativeBackedSignerBackend for your own backend here:
            let backend = try NativeBackedSignerBackend(seedHex: seedHex, network: network)
            let (signerId, signer) = CustomSignerStore.shared.create(backend: backend)
            let bootstrap = try signer.bootstrap()

            return [
                "signerId": signerId,
                // Bootstrap fields — pass these back to JS so it can call
                // rlnInitNodeWithExternalSigner on first run.
                "nodePublicKeyHex": bootstrap.nodeId,
                "accountXpubVanilla": bootstrap.accountXpubVanilla,
                "accountXpubColored": bootstrap.accountXpubColored,
                "masterFingerprint": bootstrap.masterFingerprint,
                "protocolVersion": bootstrap.protocolVersion,
                "apiLevel": bootstrap.apiLevel,
                "ldkInboundPaymentKeyHex": bootstrap.ldkInboundPaymentKeyHex,
                "ldkPeerStorageKeyHex": bootstrap.ldkPeerStorageKeyHex,
                "ldkReceiveAuthKeyHex": bootstrap.ldkReceiveAuthKeyHex,
                "asyncPaymentsRootSeedHex": bootstrap.asyncPaymentsRootSeedHex,
            ] as NSDictionary
        } catch {
            return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
        }
    }

    // MARK: - Attach custom signer to node

    /// Attaches the custom signer to a node that was already init'd with its bootstrap.
    /// Call on every run after the first (when the node is already initialised on disk).
    @objc(_rlnAttachCustomSigner:signerId:nodePublicKeyHex:accountXpubVanilla:accountXpubColored:masterFingerprint:protocolVersion:apiLevel:ldkInboundPaymentKeyHex:ldkPeerStorageKeyHex:ldkReceiveAuthKeyHex:asyncPaymentsRootSeedHex:)
    public static func _rlnAttachCustomSigner(
        _ nodeId: NSNumber,
        signerId: NSNumber,
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
            guard let signer = CustomSignerStore.shared.get(id: signerId.intValue) else {
                return ["error": "Custom signer with id \(signerId) not found"] as NSDictionary
            }
            let bootstrap = SdkExternalSignerBootstrap(
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
            )
            try node.attachExternalSigner(host: signer, bootstrap: bootstrap)
            return [:] as NSDictionary
        } catch {
            return ["error": parseErrorMessage(error), "errorCode": getErrorClassName(error)] as NSDictionary
        }
    }

    // MARK: - Unlock node with attached custom signer

    @objc(_rlnUnlockWithCustomSigner:signerId:nodePublicKeyHex:accountXpubVanilla:accountXpubColored:masterFingerprint:protocolVersion:apiLevel:ldkInboundPaymentKeyHex:ldkPeerStorageKeyHex:ldkReceiveAuthKeyHex:asyncPaymentsRootSeedHex:bitcoindRpcUsername:bitcoindRpcPassword:bitcoindRpcHost:bitcoindRpcPort:indexerUrl:proxyEndpoint:announceAddresses:announceAlias:)
    public static func _rlnUnlockWithCustomSigner(
        _ nodeId: NSNumber,
        signerId: NSNumber,
        nodePublicKeyHex: String,
        accountXpubVanilla: String,
        accountXpubColored: String,
        masterFingerprint: String,
        protocolVersion: String,
        apiLevel: NSNumber,
        ldkInboundPaymentKeyHex: String,
        ldkPeerStorageKeyHex: String,
        ldkReceiveAuthKeyHex: String,
        asyncPaymentsRootSeedHex: String,
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
            guard let signer = CustomSignerStore.shared.get(id: signerId.intValue) else {
                return ["error": "Custom signer with id \(signerId) not found"] as NSDictionary
            }
            let bootstrap = SdkExternalSignerBootstrap(
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
            )
            try node.attachExternalSigner(host: signer, bootstrap: bootstrap)
            try node.unlockWithAttachedExternalSigner(
                bootstrap: bootstrap,
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

    // MARK: - Destroy

    @objc(_rlnDestroyCustomSigner:)
    public static func _rlnDestroyCustomSigner(_ signerId: NSNumber) -> NSDictionary {
        CustomSignerStore.shared.remove(id: signerId.intValue)
        return [:] as NSDictionary
    }
}

/*
 Add these methods to Rgb.mm inside the @implementation block:

 - (void)rlnCreateCustomSigner:(NSString *)seedHex
                       network:(NSString *)network
                       resolve:(RCTPromiseResolveBlock)resolve
                        reject:(RCTPromiseRejectBlock)reject
 {
     EXEC_ASYNC({
         NSDictionary *result = [RgbSwiftHelper _rlnCreateCustomSigner:seedHex network:network];
         NSString *errorMessage = result[@"error"];
         if (errorMessage != nil) {
             reject(result[@"errorCode"] ?: @"RLN_CREATE_CUSTOM_SIGNER_ERROR", errorMessage, nil);
         } else {
             resolve(result);   // returns full dict: signerId + all bootstrap fields
         }
     });
 }

 - (void)rlnAttachCustomSigner:(double)nodeId
                      signerId:(double)signerId
              nodePublicKeyHex:(NSString *)nodePublicKeyHex
           accountXpubVanilla:(NSString *)accountXpubVanilla
           accountXpubColored:(NSString *)accountXpubColored
           masterFingerprint:(NSString *)masterFingerprint
             protocolVersion:(NSString *)protocolVersion
                    apiLevel:(double)apiLevel
     ldkInboundPaymentKeyHex:(NSString *)ldkInboundPaymentKeyHex
      ldkPeerStorageKeyHex:(NSString *)ldkPeerStorageKeyHex
      ldkReceiveAuthKeyHex:(NSString *)ldkReceiveAuthKeyHex
  asyncPaymentsRootSeedHex:(NSString *)asyncPaymentsRootSeedHex
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
 {
     EXEC_ASYNC({
         NSDictionary *result = [RgbSwiftHelper
             _rlnAttachCustomSigner:@(nodeId) signerId:@(signerId)
             nodePublicKeyHex:nodePublicKeyHex ...];
         NSString *errorMessage = result[@"error"];
         if (errorMessage != nil) {
             reject(result[@"errorCode"] ?: @"RLN_ATTACH_CUSTOM_SIGNER_ERROR", errorMessage, nil);
         } else { resolve(nil); }
     });
 }

 // rlnUnlockWithCustomSigner: same pattern with all rpc params included
*/
