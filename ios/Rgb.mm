#import "Rgb.h"

@class RgbSwiftHelper;


#if __has_include(<Rgb/Rgb-Swift.h>)
#import <Rgb/Rgb-Swift.h>
#elif __has_include("Rgb-Swift.h")
#import "Rgb-Swift.h"
#else
#endif

#define EXEC_ASYNC(methodBlock) \
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{ \
    @try { methodBlock } \
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

- (NSDictionary *)generateKeys:(NSString *)bitcoinNetwork {
    return [RgbSwiftHelper _generateKeys:bitcoinNetwork];
}

- (void)generateKeys:(NSString *)bitcoinNetwork
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSString *strongBitcoinNetwork = [bitcoinNetwork copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _generateKeys:strongBitcoinNetwork];
        __strong Rgb *strongSelf = weakSelf;
        if (strongSelf && strongResolve) {
            [strongSelf resolvePromise:strongResolve withResult:result];
        }
    });
}

- (void)restoreKeys:(NSString *)bitcoinNetwork
           mnemonic:(NSString *)mnemonic
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSString *strongBitcoinNetwork = [bitcoinNetwork copy];
    NSString *strongMnemonic = [mnemonic copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _restoreKeys:strongBitcoinNetwork mnemonic:strongMnemonic];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"RESTORE_KEYS_ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)restoreBackup:(NSString *)path
             password:(NSString *)password
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSString *strongPath = [path copy];
    NSString *strongPassword = [password copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _restoreBackup:strongPath :strongPassword];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"RESTORE_BACKUP_ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:nil];
            }
        }
    });
}

- (void)initializeWallet:(NSString *)network
      accountXpubVanilla:(NSString *)accountXpubVanilla
     accountXpubColored:(NSString *)accountXpubColored
                mnemonic:(NSString *)mnemonic
       masterFingerprint:(NSString *)masterFingerprint
        supportedSchemas:(NSArray<NSString *> *)supportedSchemas
   maxAllocationsPerUtxo:(double)maxAllocationsPerUtxo
         vanillaKeychain:(double)vanillaKeychain
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
    if (!network || !accountXpubVanilla || !accountXpubColored || !mnemonic || !masterFingerprint || !supportedSchemas) {
        if (reject) {
            reject(@"INITIALIZE_WALLET_ERROR", @"Missing required parameters", nil);
        }
        return;
    }
    
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    
    NSString *strongNetwork = [network copy];
    NSString *strongAccountXpubVanilla = [accountXpubVanilla copy];
    NSString *strongAccountXpubColored = [accountXpubColored copy];
    NSString *strongMnemonic = [mnemonic copy];
    NSString *strongMasterFingerprint = [masterFingerprint copy];
    NSArray<NSString *> *strongSupportedSchemas = [supportedSchemas copy];
    
    NSNumber *strongMaxAllocationsPerUtxo = @(maxAllocationsPerUtxo);
    NSNumber *strongVanillaKeychain = @(vanillaKeychain);
    
    if (!strongNetwork || !strongAccountXpubVanilla || !strongAccountXpubColored ||
        !strongMnemonic || !strongMasterFingerprint || !strongSupportedSchemas) {
        if (strongReject) {
            strongReject(@"INITIALIZE_WALLET_ERROR", @"One or more parameters became nil", nil);
        }
        return;
    }
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _initializeWallet:strongNetwork
                                            accountXpubVanilla:strongAccountXpubVanilla
                                           accountXpubColored:strongAccountXpubColored
                                                      mnemonic:strongMnemonic
                                             masterFingerprint:strongMasterFingerprint
                                             supportedSchemas:strongSupportedSchemas
                                        maxAllocationsPerUtxo:strongMaxAllocationsPerUtxo
                                              vanillaKeychain:strongVanillaKeychain];
        
        if (!result) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(@"INITIALIZE_WALLET_ERROR", @"Swift method returned nil", nil);
                }
            });
            return;
        }
        
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"INITIALIZE_WALLET_ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            NSNumber *walletId = result[@"walletId"];
            if (!walletId) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (strongReject) {
                        strongReject(@"INITIALIZE_WALLET_ERROR", @"walletId not found in result", nil);
                    }
                });
                return;
            }
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:walletId];
            }
        }
    });
}

- (void)goOnline:(double)walletId
skipConsistencyCheck:(BOOL)skipConsistencyCheck
       indexerUrl:(NSString *)indexerUrl
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongIndexerUrl = [indexerUrl copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _goOnline:strongWalletId
                                      skipConsistencyCheck:skipConsistencyCheck
                                                indexerUrl:strongIndexerUrl];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"GO_ONLINE_ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:nil];
            }
        }
    });
}

- (void)getBtcBalance:(double)walletId
          skipSync:(BOOL)skipSync
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _getBtcBalance:strongWalletId
                                                  skipSync:skipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"GET_BTC_BALANCE_ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)walletClose:(double)walletId
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _walletClose:strongWalletId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:nil];
            }
        }
    });
}

- (void)backup:(double)walletId
    backupPath:(NSString * _Nonnull)backupPath
       password:(NSString * _Nonnull)password
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongBackupPath = [backupPath copy];
    NSString *strongPassword = [password copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _backup:strongWalletId backupPath:strongBackupPath password:strongPassword];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:nil];
            }
        }
    });
}

- (void)backupInfo:(double)walletId
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _backupInfo:strongWalletId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"hasBackup"]];
            }
        }
    });
}

- (void)blindReceive:(double)walletId
              assetId:(NSString * _Nullable)assetId
           assignment:(JS::NativeRgb::SpecBlindReceiveAssignment &)assignment
      durationSeconds:(NSNumber *)durationSeconds
   transportEndpoints:(NSArray<NSString *> *)transportEndpoints
     minConfirmations:(double)minConfirmations
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAssetId = assetId ? [assetId copy] : nil;
    NSMutableDictionary *strongAssignment = [NSMutableDictionary dictionary];
    strongAssignment[@"type"] = assignment.type();
    auto amountOpt = assignment.amount();
    if (amountOpt.has_value()) {
        strongAssignment[@"amount"] = @(amountOpt.value());
    }
    NSNumber *strongDurationSeconds = durationSeconds ? [durationSeconds copy] : nil;
    NSArray *strongTransportEndpoints = [transportEndpoints copy];
    NSNumber *strongMinConfirmations = @(minConfirmations);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _blindReceive:strongWalletId
                                                     assetId:strongAssetId
                                                  assignment:strongAssignment
                                             durationSeconds:strongDurationSeconds
                                          transportEndpoints:strongTransportEndpoints
                                            minConfirmations:strongMinConfirmations];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)createUtxos:(double)walletId
                upTo:(BOOL)upTo
                 num:(NSNumber *)num
                size:(NSNumber *)size
             feeRate:(double)feeRate
            skipSync:(BOOL)skipSync
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSNumber *strongUpTo = @(upTo);
    NSNumber *strongNum = num ? [num copy] : nil;
    NSNumber *strongSize = size ? [size copy] : nil;
    NSNumber *strongFeeRate = @(feeRate);
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _createUtxos:strongWalletId
                                                       upTo:strongUpTo
                                                        num:strongNum
                                                       size:strongSize
                                                    feeRate:strongFeeRate
                                                   skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"count"]];
            }
        }
    });
}

- (void)createUtxosBegin:(double)walletId
                     upTo:(BOOL)upTo
                      num:(NSNumber *)num
                     size:(NSNumber *)size
                  feeRate:(double)feeRate
                 skipSync:(BOOL)skipSync
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSNumber *strongUpTo = @(upTo);
    NSNumber *strongNum = num ? [num copy] : nil;
    NSNumber *strongSize = size ? [size copy] : nil;
    NSNumber *strongFeeRate = @(feeRate);
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _createUtxosBegin:strongWalletId
                                                            upTo:strongUpTo
                                                             num:strongNum
                                                            size:strongSize
                                                         feeRate:strongFeeRate
                                                        skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"psbt"]];
            }
        }
    });
}

- (void)createUtxosEnd:(double)walletId
            signedPsbt:(NSString *)signedPsbt
              skipSync:(BOOL)skipSync
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongSignedPsbt = [signedPsbt copy];
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _createUtxosEnd:strongWalletId
                                                     signedPsbt:strongSignedPsbt
                                                       skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"count"]];
            }
        }
    });
}

- (void)deleteTransfers:(double)walletId
       batchTransferIdx:(NSNumber *)batchTransferIdx
            noAssetOnly:(BOOL)noAssetOnly
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSNumber *strongBatchTransferIdx = batchTransferIdx ? [batchTransferIdx copy] : nil;
    NSNumber *strongNoAssetOnly = @(noAssetOnly);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _deleteTransfers:strongWalletId
                                                batchTransferIdx:strongBatchTransferIdx
                                                     noAssetOnly:strongNoAssetOnly];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"deleted"]];
            }
        }
    });
}

- (void)drainTo:(double)walletId
        address:(NSString *)address
   destroyAssets:(BOOL)destroyAssets
         feeRate:(double)feeRate
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAddress = [address copy];
    NSNumber *strongDestroyAssets = @(destroyAssets);
    NSNumber *strongFeeRate = @(feeRate);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _drainTo:strongWalletId
                                                address:strongAddress
                                           destroyAssets:strongDestroyAssets
                                                feeRate:strongFeeRate];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"txid"]];
            }
        }
    });
}

- (void)drainToBegin:(double)walletId
             address:(NSString *)address
        destroyAssets:(BOOL)destroyAssets
             feeRate:(double)feeRate
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAddress = [address copy];
    NSNumber *strongDestroyAssets = @(destroyAssets);
    NSNumber *strongFeeRate = @(feeRate);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _drainToBegin:strongWalletId
                                                     address:strongAddress
                                                destroyAssets:strongDestroyAssets
                                                     feeRate:strongFeeRate];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"psbt"]];
            }
        }
    });
}

- (void)drainToEnd:(double)walletId
        signedPsbt:(NSString * _Nonnull)signedPsbt
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongSignedPsbt = [signedPsbt copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _drainToEnd:strongWalletId signedPsbt:strongSignedPsbt];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"txid"]];
            }
        }
    });
}

- (void)failTransfers:(double)walletId
     batchTransferIdx:(NSNumber *)batchTransferIdx
          noAssetOnly:(BOOL)noAssetOnly
             skipSync:(BOOL)skipSync
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSNumber *strongBatchTransferIdx = batchTransferIdx ? [batchTransferIdx copy] : nil;
    NSNumber *strongNoAssetOnly = @(noAssetOnly);
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _failTransfers:strongWalletId
                                             batchTransferIdx:strongBatchTransferIdx
                                                  noAssetOnly:strongNoAssetOnly
                                                     skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"failed"]];
            }
        }
    });
}

- (void)finalizePsbt:(double)walletId
          signedPsbt:(NSString * _Nonnull)signedPsbt
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongSignedPsbt = [signedPsbt copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _finalizePsbt:strongWalletId signedPsbt:strongSignedPsbt];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"psbt"]];
            }
        }
    });
}

- (void)getAddress:(double)walletId
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _getAddress:strongWalletId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"address"]];
            }
        }
    });
}

- (void)getAssetBalance:(double)walletId
                assetId:(NSString * _Nonnull)assetId
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAssetId = [assetId copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _getAssetBalance:strongWalletId assetId:strongAssetId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)getAssetMetadata:(double)walletId
                 assetId:(NSString * _Nonnull)assetId
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAssetId = [assetId copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _getAssetMetadata:strongWalletId assetId:strongAssetId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)getFeeEstimation:(double)walletId
                  blocks:(double)blocks
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSNumber *strongBlocks = @(blocks);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _getFeeEstimation:strongWalletId blocks:strongBlocks];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"feeRate"]];
            }
        }
    });
}

- (void)getMediaDir:(double)walletId
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _getMediaDir:strongWalletId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"mediaDir"]];
            }
        }
    });
}

- (void)getWalletData:(double)walletId
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _getWalletData:strongWalletId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)getWalletDir:(double)walletId
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _getWalletDir:strongWalletId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"walletDir"]];
            }
        }
    });
}

- (void)inflate:(double)walletId
         assetId:(NSString *)assetId
 inflationAmounts:(NSArray<NSNumber *> *)inflationAmounts
         feeRate:(double)feeRate
 minConfirmations:(double)minConfirmations
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAssetId = [assetId copy];
    NSArray *strongInflationAmounts = [inflationAmounts copy];
    NSNumber *strongFeeRate = @(feeRate);
    NSNumber *strongMinConfirmations = @(minConfirmations);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _inflate:strongWalletId
                                                assetId:strongAssetId
                                        inflationAmounts:strongInflationAmounts
                                                 feeRate:strongFeeRate
                                        minConfirmations:strongMinConfirmations];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)inflateBegin:(double)walletId
             assetId:(NSString *)assetId
    inflationAmounts:(NSArray<NSNumber *> *)inflationAmounts
             feeRate:(double)feeRate
    minConfirmations:(double)minConfirmations
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAssetId = [assetId copy];
    NSArray *strongInflationAmounts = [inflationAmounts copy];
    NSNumber *strongFeeRate = @(feeRate);
    NSNumber *strongMinConfirmations = @(minConfirmations);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _inflateBegin:strongWalletId
                                                     assetId:strongAssetId
                                            inflationAmounts:strongInflationAmounts
                                                     feeRate:strongFeeRate
                                            minConfirmations:strongMinConfirmations];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"psbt"]];
            }
        }
    });
}

- (void)inflateEnd:(double)walletId
        signedPsbt:(NSString * _Nonnull)signedPsbt
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongSignedPsbt = [signedPsbt copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _inflateEnd:strongWalletId signedPsbt:strongSignedPsbt];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)issueAssetCfa:(double)walletId
                 name:(NSString *)name
              details:(NSString * _Nullable)details
            precision:(double)precision
              amounts:(NSArray<NSNumber *> *)amounts
             filePath:(NSString * _Nullable)filePath
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongName = [name copy];
    NSString *strongDetails = details ? [details copy] : nil;
    NSNumber *strongPrecision = @(precision);
    NSArray *strongAmounts = [amounts copy];
    NSString *strongFilePath = filePath ? [filePath copy] : nil;
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _issueAssetCfa:strongWalletId
                                                          name:strongName
                                                       details:strongDetails
                                                     precision:strongPrecision
                                                       amounts:strongAmounts
                                                      filePath:strongFilePath];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)issueAssetIfa:(double)walletId
               ticker:(NSString *)ticker
                 name:(NSString *)name
            precision:(double)precision
              amounts:(NSArray<NSNumber *> *)amounts
     inflationAmounts:(NSArray<NSNumber *> *)inflationAmounts
     replaceRightsNum:(double)replaceRightsNum
       rejectListUrl:(NSString * _Nullable)rejectListUrl
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongTicker = [ticker copy];
    NSString *strongName = [name copy];
    NSNumber *strongPrecision = @(precision);
    NSArray *strongAmounts = [amounts copy];
    NSArray *strongInflationAmounts = [inflationAmounts copy];
    NSNumber *strongReplaceRightsNum = @(replaceRightsNum);
    NSString *strongRejectListUrl = rejectListUrl ? [rejectListUrl copy] : nil;
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _issueAssetIfa:strongWalletId
                                                        ticker:strongTicker
                                                          name:strongName
                                                     precision:strongPrecision
                                                       amounts:strongAmounts
                                              inflationAmounts:strongInflationAmounts
                                              replaceRightsNum:strongReplaceRightsNum
                                                rejectListUrl:strongRejectListUrl];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)issueAssetNia:(double)walletId
               ticker:(NSString *)ticker
                 name:(NSString *)name
            precision:(double)precision
              amounts:(NSArray<NSNumber *> *)amounts
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongTicker = [ticker copy];
    NSString *strongName = [name copy];
    NSNumber *strongPrecision = @(precision);
    NSArray *strongAmounts = [amounts copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _issueAssetNia:strongWalletId
                                                        ticker:strongTicker
                                                          name:strongName
                                                     precision:strongPrecision
                                                       amounts:strongAmounts];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)issueAssetUda:(double)walletId
               ticker:(NSString *)ticker
                 name:(NSString *)name
              details:(NSString * _Nullable)details
            precision:(double)precision
         mediaFilePath:(NSString * _Nullable)mediaFilePath
  attachmentsFilePaths:(NSArray<NSString *> *)attachmentsFilePaths
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongTicker = [ticker copy];
    NSString *strongName = [name copy];
    NSString *strongDetails = details ? [details copy] : nil;
    NSNumber *strongPrecision = @(precision);
    NSString *strongMediaFilePath = mediaFilePath ? [mediaFilePath copy] : nil;
    NSArray *strongAttachmentsFilePaths = [attachmentsFilePaths copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _issueAssetUda:strongWalletId
                                                        ticker:strongTicker
                                                          name:strongName
                                                       details:strongDetails
                                                     precision:strongPrecision
                                                mediaFilePath:strongMediaFilePath
                                         attachmentsFilePaths:strongAttachmentsFilePaths];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)listAssets:(double)walletId
  filterAssetSchemas:(NSArray<NSString *> *)filterAssetSchemas
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSArray *strongFilterAssetSchemas = [filterAssetSchemas copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _listAssets:strongWalletId filterAssetSchemas:strongFilterAssetSchemas];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)listTransactions:(double)walletId
                skipSync:(BOOL)skipSync
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _listTransactions:strongWalletId skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"transactions"]];
            }
        }
    });
}

- (void)listTransfers:(double)walletId
              assetId:(NSString * _Nullable)assetId
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAssetId = assetId ? [assetId copy] : nil;
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _listTransfers:strongWalletId assetId:strongAssetId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"transfers"]];
            }
        }
    });
}

- (void)listUnspents:(double)walletId
          settledOnly:(BOOL)settledOnly
            skipSync:(BOOL)skipSync
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSNumber *strongSettledOnly = @(settledOnly);
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _listUnspents:strongWalletId
                                                  settledOnly:strongSettledOnly
                                                    skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"unspents"]];
            }
        }
    });
}

- (void)refresh:(double)walletId
        assetId:(NSString * _Nullable)assetId
         filter:(NSArray<NSDictionary *> *)filter
       skipSync:(BOOL)skipSync
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAssetId = assetId ? [assetId copy] : nil;
    NSArray *strongFilter = [filter copy];
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _refresh:strongWalletId
                                                assetId:strongAssetId
                                                 filter:strongFilter
                                               skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)send:(double)walletId
 recipientMap:(NSDictionary *)recipientMap
     donation:(BOOL)donation
      feeRate:(double)feeRate
minConfirmations:(double)minConfirmations
     skipSync:(BOOL)skipSync
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSDictionary *strongRecipientMap = [recipientMap copy];
    NSNumber *strongDonation = @(donation);
    NSNumber *strongFeeRate = @(feeRate);
    NSNumber *strongMinConfirmations = @(minConfirmations);
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _send:strongWalletId
                                        recipientMap:strongRecipientMap
                                             donation:strongDonation
                                              feeRate:strongFeeRate
                                     minConfirmations:strongMinConfirmations
                                            skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)sendBegin:(double)walletId
     recipientMap:(NSDictionary *)recipientMap
          donation:(BOOL)donation
           feeRate:(double)feeRate
  minConfirmations:(double)minConfirmations
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSDictionary *strongRecipientMap = [recipientMap copy];
    NSNumber *strongDonation = @(donation);
    NSNumber *strongFeeRate = @(feeRate);
    NSNumber *strongMinConfirmations = @(minConfirmations);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _sendBegin:strongWalletId
                                          recipientMap:strongRecipientMap
                                               donation:strongDonation
                                                feeRate:strongFeeRate
                                       minConfirmations:strongMinConfirmations];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"psbt"]];
            }
        }
    });
}

- (void)sendBtc:(double)walletId
        address:(NSString *)address
         amount:(double)amount
        feeRate:(double)feeRate
       skipSync:(BOOL)skipSync
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAddress = [address copy];
    NSNumber *strongAmount = @(amount);
    NSNumber *strongFeeRate = @(feeRate);
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _sendBtc:strongWalletId
                                                address:strongAddress
                                                 amount:strongAmount
                                                feeRate:strongFeeRate
                                               skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"txid"]];
            }
        }
    });
}

- (void)sendBtcBegin:(double)walletId
             address:(NSString *)address
              amount:(double)amount
             feeRate:(double)feeRate
            skipSync:(BOOL)skipSync
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAddress = [address copy];
    NSNumber *strongAmount = @(amount);
    NSNumber *strongFeeRate = @(feeRate);
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _sendBtcBegin:strongWalletId
                                                     address:strongAddress
                                                      amount:strongAmount
                                                     feeRate:strongFeeRate
                                                    skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"psbt"]];
            }
        }
    });
}

- (void)sendBtcEnd:(double)walletId
       signedPsbt:(NSString *)signedPsbt
          skipSync:(BOOL)skipSync
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongSignedPsbt = [signedPsbt copy];
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _sendBtcEnd:strongWalletId signedPsbt:strongSignedPsbt skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"txid"]];
            }
        }
    });
}

- (void)sendEnd:(double)walletId
    signedPsbt:(NSString *)signedPsbt
       skipSync:(BOOL)skipSync
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongSignedPsbt = [signedPsbt copy];
    NSNumber *strongSkipSync = @(skipSync);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _sendEnd:strongWalletId signedPsbt:strongSignedPsbt skipSync:strongSkipSync];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)signPsbt:(double)walletId
      unsignedPsbt:(NSString *)unsignedPsbt
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongUnsignedPsbt = [unsignedPsbt copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _signPsbt:strongWalletId unsignedPsbt:strongUnsignedPsbt];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result[@"psbt"]];
            }
        }
    });
}

- (void)sync:(double)walletId
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _sync:strongWalletId];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:nil];
            }
        }
    });
}

- (void)witnessReceive:(double)walletId
               assetId:(NSString * _Nullable)assetId
            assignment:(JS::NativeRgb::SpecWitnessReceiveAssignment &)assignment
       durationSeconds:(NSNumber *)durationSeconds
   transportEndpoints:(NSArray<NSString *> *)transportEndpoints
     minConfirmations:(double)minConfirmations
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSNumber *strongWalletId = @(walletId);
    NSString *strongAssetId = assetId ? [assetId copy] : nil;
    NSMutableDictionary *strongAssignment = [NSMutableDictionary dictionary];
    strongAssignment[@"type"] = assignment.type();
    auto amountOpt = assignment.amount();
    if (amountOpt.has_value()) {
        strongAssignment[@"amount"] = @(amountOpt.value());
    }
    NSNumber *strongDurationSeconds = durationSeconds ? [durationSeconds copy] : nil;
    NSArray *strongTransportEndpoints = [transportEndpoints copy];
    NSNumber *strongMinConfirmations = @(minConfirmations);
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _witnessReceive:strongWalletId
                                                       assetId:strongAssetId
                                                    assignment:strongAssignment
                                               durationSeconds:strongDurationSeconds
                                          transportEndpoints:strongTransportEndpoints
                                            minConfirmations:strongMinConfirmations];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (void)decodeInvoice:(NSString *)invoice
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
    __weak Rgb *weakSelf = self;
    RCTPromiseResolveBlock strongResolve = resolve;
    RCTPromiseRejectBlock strongReject = reject;
    NSString *strongInvoice = [invoice copy];
    
    EXEC_ASYNC({
        NSDictionary *result = [RgbSwiftHelper _decodeInvoice:strongInvoice];
        NSString *errorMessage = result[@"error"];
        if (errorMessage != nil) {
            NSString *errorCode = result[@"errorCode"] ?: @"ERROR";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (strongReject) {
                    strongReject(errorCode, errorMessage, nil);
                }
            });
        } else {
            __strong Rgb *strongSelf = weakSelf;
            if (strongSelf && strongResolve) {
                [strongSelf resolvePromise:strongResolve withResult:result];
            }
        }
    });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeRgbSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"Rgb";
}

@end
