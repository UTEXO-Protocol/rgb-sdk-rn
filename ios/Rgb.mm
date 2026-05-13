#import "Rgb.h"

@class RgbSwiftHelper;


#if __has_include(<Rgb/Rgb-Swift.h>)
#import <Rgb/Rgb-Swift.h>
#elif __has_include("Rgb-Swift.h")
#import "Rgb-Swift.h"
#else
#endif

#define EXEC_ASYNC(...) \
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{ \
    @try { __VA_ARGS__ } \
    @catch (NSException *exception) { \
      NSLog(@"Exception in async block: %@", exception.reason ?: @"Unknown error"); \
    } \
  });

@implementation Rgb

- (void)resolvePromise:(RCTPromiseResolveBlock)resolve withResult:(id)result {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (resolve) {
      resolve(result);
    }
  });
}

- (void)rejectPromise:(RCTPromiseRejectBlock)reject 
           withErrorCode:(NSString *)errorCode 
            errorMessage:(NSString *)errorMessage {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (reject) {
      reject(errorCode ?: @"ERROR", errorMessage ?: @"Unknown error", nil);
    }
  });
}

- (void)rlnCreateNode:(NSString *)storageDirPath
 daemonListeningPort:(double)daemonListeningPort
ldkPeerListeningPort:(double)ldkPeerListeningPort
              network:(NSString *)network
  maxMediaUploadSizeMb:(double)maxMediaUploadSizeMb
enableVirtualChannelsV0:(NSNumber *)enableVirtualChannelsV0
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *request = @{
            @"storageDirPath": storageDirPath ?: @"",
            @"daemonListeningPort": @(daemonListeningPort),
            @"ldkPeerListeningPort": @(ldkPeerListeningPort),
            @"network": network ?: @"",
            @"maxMediaUploadSizeMb": @(maxMediaUploadSizeMb),
            @"enableVirtualChannelsV0": enableVirtualChannelsV0 ?: [NSNull null],
        };
        NSDictionary *result = [RgbSwiftHelper _rlnCreateNode:request];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_CREATE_NODE_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"nodeId"]);
        }
    });
}

- (void)rlnInitNode:(double)nodeId
           password:(NSString *)password
           mnemonic:(NSString *)mnemonic
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnInitNode:@(nodeId) password:password mnemonic:mnemonic];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_INIT_NODE_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"pubkey"]);
        }
    });
}

- (void)rlnInitNodeWithExternalSigner:(double)nodeId
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
            _rlnInitNodeWithExternalSigner:@(nodeId)
            nodePublicKeyHex:nodePublicKeyHex
            accountXpubVanilla:accountXpubVanilla
            accountXpubColored:accountXpubColored
            masterFingerprint:masterFingerprint
            protocolVersion:protocolVersion
            apiLevel:@(apiLevel)
            ldkInboundPaymentKeyHex:ldkInboundPaymentKeyHex
            ldkPeerStorageKeyHex:ldkPeerStorageKeyHex
            ldkReceiveAuthKeyHex:ldkReceiveAuthKeyHex
            asyncPaymentsRootSeedHex:asyncPaymentsRootSeedHex];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_INIT_NODE_EXT_SIGNER_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnUnlockNode:(double)nodeId
             password:(NSString *)password
  bitcoindRpcUsername:(NSString *)bitcoindRpcUsername
  bitcoindRpcPassword:(NSString *)bitcoindRpcPassword
      bitcoindRpcHost:(NSString *)bitcoindRpcHost
      bitcoindRpcPort:(double)bitcoindRpcPort
            indexerUrl:(NSString *)indexerUrl
         proxyEndpoint:(NSString *)proxyEndpoint
     announceAddresses:(NSArray<NSString *> *)announceAddresses
         announceAlias:(NSString *)announceAlias
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnUnlockNode:@(nodeId)
                                                      password:password
                                           bitcoindRpcUsername:bitcoindRpcUsername
                                           bitcoindRpcPassword:bitcoindRpcPassword
                                               bitcoindRpcHost:bitcoindRpcHost
                                               bitcoindRpcPort:@(bitcoindRpcPort)
                                                     indexerUrl:indexerUrl
                                                  proxyEndpoint:proxyEndpoint
                                              announceAddresses:announceAddresses
                                                  announceAlias:announceAlias];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_UNLOCK_NODE_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnDestroyNode:(double)nodeId
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnDestroyNode:@(nodeId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_DESTROY_NODE_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnNodeInfo:(double)nodeId
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnNodeInfo:@(nodeId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_NODE_INFO_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnNetworkInfo:(double)nodeId
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnNetworkInfo:@(nodeId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_NETWORK_INFO_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnListPeers:(double)nodeId
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnListPeers:@(nodeId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_LIST_PEERS_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"peers"] ?: @[]);
        }
    });
}

- (void)rlnConnectPeer:(double)nodeId
      peerPubkeyAndAddr:(NSString *)peerPubkeyAndAddr
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnConnectPeer:@(nodeId) peerPubkeyAndAddr:peerPubkeyAndAddr];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_CONNECT_PEER_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnDisconnectPeer:(double)nodeId
                peerPubkey:(NSString *)peerPubkey
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnDisconnectPeer:@(nodeId) peerPubkey:peerPubkey];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_DISCONNECT_PEER_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnListChannels:(double)nodeId
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnListChannels:@(nodeId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_LIST_CHANNELS_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"channels"] ?: @[]);
        }
    });
}

- (void)rlnOpenChannel:(double)nodeId
   peerPubkeyAndOptAddr:(NSString *)peerPubkeyAndOptAddr
            capacitySat:(double)capacitySat
               pushMsat:(double)pushMsat
          publicChannel:(BOOL)publicChannel
            withAnchors:(BOOL)withAnchors
            feeBaseMsat:(NSNumber *)feeBaseMsat
feeProportionalMillionths:(NSNumber *)feeProportionalMillionths
  temporaryChannelId:(NSString *)temporaryChannelId
             assetId:(NSString *)assetId
         assetAmount:(NSNumber *)assetAmount
     pushAssetAmount:(NSNumber *)pushAssetAmount
      virtualOpenMode:(NSString *)virtualOpenMode
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *request = @{
            @"peerPubkeyAndOptAddr": peerPubkeyAndOptAddr ?: @"",
            @"capacitySat": @(capacitySat),
            @"pushMsat": @(pushMsat),
            @"public": @(publicChannel),
            @"withAnchors": @(withAnchors),
            @"feeBaseMsat": feeBaseMsat ?: [NSNull null],
            @"feeProportionalMillionths": feeProportionalMillionths ?: [NSNull null],
            @"temporaryChannelId": temporaryChannelId ?: [NSNull null],
            @"assetId": assetId ?: [NSNull null],
            @"assetAmount": assetAmount ?: [NSNull null],
            @"pushAssetAmount": pushAssetAmount ?: [NSNull null],
            @"virtualOpenMode": virtualOpenMode ?: [NSNull null],
        };
        NSDictionary *result = [RgbSwiftHelper _rlnOpenChannel:@(nodeId) request:request];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_OPEN_CHANNEL_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnCloseChannel:(double)nodeId
              channelId:(NSString *)channelId
             peerPubkey:(NSString *)peerPubkey
                  force:(BOOL)force
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *request = @{
            @"channelId": channelId ?: @"",
            @"peerPubkey": peerPubkey ?: @"",
            @"force": @(force),
        };
        NSDictionary *result = [RgbSwiftHelper _rlnCloseChannel:@(nodeId) request:request];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_CLOSE_CHANNEL_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnListPayments:(double)nodeId
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnListPayments:@(nodeId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_LIST_PAYMENTS_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"payments"] ?: @[]);
        }
    });
}

- (void)rlnAddress:(double)nodeId
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnAddress:@(nodeId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_ADDRESS_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnAssetBalance:(double)nodeId
                assetId:(NSString *)assetId
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnAssetBalance:@(nodeId) assetId:assetId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_ASSET_BALANCE_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnBackup:(double)nodeId
        backupPath:(NSString *)backupPath
          password:(NSString *)password
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnBackup:@(nodeId) backupPath:backupPath password:password];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_BACKUP_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnBtcBalance:(double)nodeId
             skipSync:(BOOL)skipSync
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnBtcBalance:@(nodeId) skipSync:@(skipSync)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_BTC_BALANCE_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnCheckIndexerUrl:(double)nodeId
                 indexerUrl:(NSString *)indexerUrl
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnCheckIndexerUrl:@(nodeId) indexerUrl:indexerUrl];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_CHECK_INDEXER_URL_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnCheckProxyEndpoint:(double)nodeId
                 proxyEndpoint:(NSString *)proxyEndpoint
                       resolve:(RCTPromiseResolveBlock)resolve
                        reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnCheckProxyEndpoint:@(nodeId) proxyEndpoint:proxyEndpoint];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_CHECK_PROXY_ENDPOINT_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnCreateUtxos:(double)nodeId
                   upTo:(BOOL)upTo
                    num:(NSNumber *)num
                   size:(NSNumber *)size
                feeRate:(double)feeRate
               skipSync:(BOOL)skipSync
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *request = @{
            @"upTo": @(upTo),
            @"num": num ?: [NSNull null],
            @"size": size ?: [NSNull null],
            @"feeRate": @(feeRate),
            @"skipSync": @(skipSync),
        };
        NSDictionary *result = [RgbSwiftHelper _rlnCreateUtxos:@(nodeId) request:request];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_CREATE_UTXOS_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnDecodeLnInvoice:(double)nodeId
                   invoice:(NSString *)invoice
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnDecodeLnInvoice:@(nodeId) invoice:invoice];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_DECODE_LN_INVOICE_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnDecodeRgbInvoice:(double)nodeId
                    invoice:(NSString *)invoice
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnDecodeRgbInvoice:@(nodeId) invoice:invoice];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_DECODE_RGB_INVOICE_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnEstimateFee:(double)nodeId
                blocks:(double)blocks
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnEstimateFee:@(nodeId) blocks:@(blocks)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_ESTIMATE_FEE_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnGetChannelId:(double)nodeId
      temporaryChannelId:(NSString *)temporaryChannelId
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnGetChannelId:@(nodeId) temporaryChannelId:temporaryChannelId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_GET_CHANNEL_ID_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"channelId"]);
        }
    });
}

- (void)rlnGetPayment:(double)nodeId
           paymentHash:(NSString *)paymentHash
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnGetPayment:@(nodeId) paymentHash:paymentHash];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_GET_PAYMENT_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnInvoiceStatus:(double)nodeId
                  invoice:(NSString *)invoice
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnInvoiceStatus:@(nodeId) invoice:invoice];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_INVOICE_STATUS_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnFailTransfers:(double)nodeId
         batchTransferIdx:(NSNumber *)batchTransferIdx
              noAssetOnly:(BOOL)noAssetOnly
                 skipSync:(BOOL)skipSync
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnFailTransfers:@(nodeId) batchTransferIdx:batchTransferIdx noAssetOnly:noAssetOnly skipSync:skipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_FAIL_TRANSFERS_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnKeysend:(double)nodeId
         destPubkey:(NSString *)destPubkey
            amtMsat:(double)amtMsat
            assetId:(NSString *)assetId
        assetAmount:(NSNumber *)assetAmount
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnKeysend:@(nodeId) destPubkey:destPubkey amtMsat:@(amtMsat) assetId:assetId assetAmount:assetAmount];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_KEYSEND_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnListAssets:(double)nodeId
    filterAssetSchemas:(NSArray<NSString *> *)filterAssetSchemas
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnListAssets:@(nodeId) filterAssetSchemas:filterAssetSchemas];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_LIST_ASSETS_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnListTransactions:(double)nodeId
                   skipSync:(BOOL)skipSync
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnListTransactions:@(nodeId) skipSync:skipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_LIST_TRANSACTIONS_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"transactions"] ?: @[]);
        }
    });
}

- (void)rlnListTransfers:(double)nodeId
                 assetId:(NSString *)assetId
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnListTransfers:@(nodeId) assetId:assetId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_LIST_TRANSFERS_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"transfers"] ?: @[]);
        }
    });
}

- (void)rlnListUnspents:(double)nodeId
                skipSync:(BOOL)skipSync
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnListUnspents:@(nodeId) skipSync:skipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_LIST_UNSPENTS_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"unspents"] ?: @[]);
        }
    });
}

- (void)rlnLnInvoice:(double)nodeId
              amtMsat:(NSNumber *)amtMsat
            expirySec:(double)expirySec
              assetId:(NSString *)assetId
          assetAmount:(NSNumber *)assetAmount
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnLnInvoice:@(nodeId) amtMsat:amtMsat expirySec:@(expirySec) assetId:assetId assetAmount:assetAmount];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_LN_INVOICE_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnRefreshTransfers:(double)nodeId
                    skipSync:(BOOL)skipSync
                     resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnRefreshTransfers:@(nodeId) skipSync:skipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_REFRESH_TRANSFERS_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnRgbInvoice:(double)nodeId
               assetId:(NSString *)assetId
      assignmentAmount:(NSNumber *)assignmentAmount
       durationSeconds:(NSNumber *)durationSeconds
      minConfirmations:(double)minConfirmations
               witness:(BOOL)witness
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnRgbInvoice:@(nodeId) assetId:assetId assignmentAmount:assignmentAmount durationSeconds:durationSeconds minConfirmations:@(minConfirmations) witness:witness];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_RGB_INVOICE_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnSendBtc:(double)nodeId
             amount:(double)amount
            address:(NSString *)address
            feeRate:(double)feeRate
           skipSync:(BOOL)skipSync
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnSendBtc:@(nodeId) amount:@(amount) address:address feeRate:@(feeRate) skipSync:skipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_SEND_BTC_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnSendPayment:(double)nodeId
               invoice:(NSString *)invoice
               amtMsat:(NSNumber *)amtMsat
               assetId:(NSString *)assetId
           assetAmount:(NSNumber *)assetAmount
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnSendPayment:@(nodeId) invoice:invoice amtMsat:amtMsat assetId:assetId assetAmount:assetAmount];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_SEND_PAYMENT_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnSendRgb:(double)nodeId
           donation:(BOOL)donation
            feeRate:(double)feeRate
   minConfirmations:(double)minConfirmations
           skipSync:(BOOL)skipSync
            assetId:(NSString *)assetId
        recipientId:(NSString *)recipientId
             amount:(double)amount
 transportEndpoints:(NSArray *)transportEndpoints
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnSendRgb:@(nodeId) donation:donation feeRate:@(feeRate) minConfirmations:@(minConfirmations) skipSync:skipSync assetId:assetId recipientId:recipientId amount:@(amount) transportEndpoints:transportEndpoints];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_SEND_RGB_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnShutdown:(double)nodeId
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnShutdown:@(nodeId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_SHUTDOWN_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnSync:(double)nodeId
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnSync:@(nodeId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_SYNC_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeRgbSpecJSI>(params);
}

- (void)rlnCreateNativeExternalSigner:(NSString *)seedHex
                             network:(NSString *)network
                     permissivePolicy:(BOOL)permissivePolicy
                              resolve:(RCTPromiseResolveBlock)resolve
                               reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnCreateNativeExternalSigner:seedHex network:network permissivePolicy:permissivePolicy];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_CREATE_NATIVE_SIGNER_ERROR", errorMessage, nil);
        } else {
            resolve(result[@"signerId"]);
        }
    });
}

- (void)rlnInitNodeWithNativeExternalSigner:(double)nodeId
                                   signerId:(double)signerId
                                    resolve:(RCTPromiseResolveBlock)resolve
                                     reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnInitNodeWithNativeExternalSigner:@(nodeId) signerId:@(signerId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_INIT_NODE_NATIVE_SIGNER_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnAttachNativeExternalSigner:(double)nodeId
                             signerId:(double)signerId
                              resolve:(RCTPromiseResolveBlock)resolve
                               reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnAttachNativeExternalSigner:@(nodeId) signerId:@(signerId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_ATTACH_NATIVE_SIGNER_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnUnlockNodeWithNativeExternalSigner:(double)nodeId
                                     signerId:(double)signerId
                          bitcoindRpcUsername:(NSString *)bitcoindRpcUsername
                          bitcoindRpcPassword:(NSString *)bitcoindRpcPassword
                              bitcoindRpcHost:(NSString *)bitcoindRpcHost
                              bitcoindRpcPort:(double)bitcoindRpcPort
                                   indexerUrl:(NSString *)indexerUrl
                                proxyEndpoint:(NSString *)proxyEndpoint
                            announceAddresses:(NSArray<NSString *> *)announceAddresses
                                announceAlias:(NSString *)announceAlias
                                      resolve:(RCTPromiseResolveBlock)resolve
                                       reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper
            _rlnUnlockNodeWithNativeExternalSigner:@(nodeId)
            signerId:@(signerId)
            bitcoindRpcUsername:bitcoindRpcUsername
            bitcoindRpcPassword:bitcoindRpcPassword
            bitcoindRpcHost:bitcoindRpcHost
            bitcoindRpcPort:@(bitcoindRpcPort)
            indexerUrl:indexerUrl
            proxyEndpoint:proxyEndpoint
            announceAddresses:announceAddresses
            announceAlias:announceAlias];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_UNLOCK_NODE_NATIVE_SIGNER_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnDestroyNativeExternalSigner:(double)signerId
                               resolve:(RCTPromiseResolveBlock)resolve
                                reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnDestroyNativeExternalSigner:@(signerId)];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_DESTROY_NATIVE_SIGNER_ERROR", errorMessage, nil);
        } else {
            resolve(nil);
        }
    });
}

- (void)rlnIssueAssetNia:(double)nodeId
                  ticker:(NSString *)ticker
                    name:(NSString *)name
               precision:(double)precision
                 amounts:(NSArray<NSNumber *> *)amounts
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnIssueAssetNia:@(nodeId) ticker:ticker name:name precision:@(precision) amounts:amounts];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_ISSUE_ASSET_NIA_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnIssueAssetCfa:(double)nodeId
                    name:(NSString *)name
                 details:(NSString *)details
               precision:(double)precision
                 amounts:(NSArray<NSNumber *> *)amounts
              fileDigest:(NSString *)fileDigest
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnIssueAssetCfa:@(nodeId) name:name details:details precision:@(precision) amounts:amounts fileDigest:fileDigest];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_ISSUE_ASSET_CFA_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnIssueAssetIfa:(double)nodeId
                  ticker:(NSString *)ticker
                    name:(NSString *)name
               precision:(double)precision
                 amounts:(NSArray<NSNumber *> *)amounts
         inflationAmounts:(NSArray<NSNumber *> *)inflationAmounts
           rejectListUrl:(NSString *)rejectListUrl
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnIssueAssetIfa:@(nodeId) ticker:ticker name:name precision:@(precision) amounts:amounts inflationAmounts:inflationAmounts rejectListUrl:rejectListUrl];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_ISSUE_ASSET_IFA_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

- (void)rlnIssueAssetUda:(double)nodeId
                  ticker:(NSString *)ticker
                    name:(NSString *)name
                 details:(NSString *)details
               precision:(double)precision
         mediaFileDigest:(NSString *)mediaFileDigest
 attachmentsFileDigests:(NSArray<NSString *> *)attachmentsFileDigests
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _rlnIssueAssetUda:@(nodeId) ticker:ticker name:name details:details precision:@(precision) mediaFileDigest:mediaFileDigest attachmentsFileDigests:attachmentsFileDigests];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            reject(result[@"errorCode"] ?: @"RLN_ISSUE_ASSET_UDA_ERROR", errorMessage, nil);
        } else {
            resolve(result);
        }
    });
}

+ (NSString *)moduleName
{
  return @"Rgb";
}

@end