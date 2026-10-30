#import <Foundation/Foundation.h>
// Built with RGB_SMOKE_WITH_RLN when package.json enables RLN: then both
// native libraries are linked into one binary, as in an app.
#ifdef RGB_SMOKE_WITH_RLN
#import "RGBLightningNodeFFI.h"
#endif

@interface RgbLibSwiftHelper : NSObject
+ (NSDictionary *)execute:(NSString *)operation params:(NSDictionary *)params;
@end
@interface RlnStorageClaim : NSObject
+ (nullable NSDictionary *)claimForTesting:(NSString *)path;
@end

static id call(NSString *operation, NSDictionary *params) {
  NSDictionary *response = [RgbLibSwiftHelper execute:operation params:params];
  if (!response || response[@"error"]) {
    fprintf(stderr, "UniFFI smoke failed: %s (%s)\n", operation.UTF8String,
      [response[@"error"][@"code"] UTF8String] ?: "no response");
    exit(1);
  }
  return response[@"result"];
}
static void check(BOOL value, const char *message) {
  if (!value) { fprintf(stderr, "%s\n", message); exit(1); }
}
int main(void) {
  @autoreleasepool {
#ifdef RGB_SMOKE_WITH_RLN
    RustCallStatus status = {0};
    RustBuffer health = uniffi_rgb_lightning_node_fn_func_uniffi_healthcheck(&status);
    check(status.code == 0, "RLN healthcheck failed");
    ffi_rgb_lightning_node_rustbuffer_free(health, &status);
    check(status.code == 0, "RLN buffer cleanup failed");
#endif
    NSDictionary *runtime = call(@"getRuntimeInfo", @{});
    check([runtime[@"bridgeVersion"] isEqual:@4], "Wrong bridge version");
    // Read from the framework's copy of the release version.json.
    check([runtime[@"sourceRevision"] length] == 40 && [runtime[@"version"] length] > 0, "Missing artifact provenance");

    NSString *base = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
    NSString *root = [base stringByAppendingPathComponent:@"source"];

    // Keys rgb-lib rejects must not leave a profile behind: the same directory
    // then opens with the right mnemonic.
    NSString *badKeysDir = [base stringByAppendingPathComponent:@"rejected-keys"];
    NSDictionary *badKeys = [RgbLibSwiftHelper execute:@"openWallet" params:@{
      @"dataDir":badKeysDir, @"network":@"regtest", @"witnessVersion":@"taproot",
      @"accountXpubVanilla":@"tpubNotAValidKey", @"accountXpubColored":@"tpubNotAValidKey",
      @"masterFingerprint":@"abcdef12", @"maxAllocationsPerUtxo":@5, @"reuseAddresses":@NO
    }];
    check(badKeys[@"error"] != nil, "Invalid public keys opened a wallet");
    NSArray *left = [NSFileManager.defaultManager contentsOfDirectoryAtPath:badKeysDir error:nil];
    check(![left containsObject:@"rgb-sdk-profile.json"], "Rejected keys left a wallet profile");
    NSString *recovered = call(@"openWallet", @{
      @"dataDir":badKeysDir, @"network":@"regtest", @"witnessVersion":@"taproot",
      @"mnemonic":@"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      @"maxAllocationsPerUtxo":@5, @"reuseAddresses":@NO
    });
    call(@"closeWallet", @{@"handle":recovered});
    NSMutableDictionary *params = [@{
      @"dataDir":root, @"network":@"regtest", @"witnessVersion":@"taproot",
      @"mnemonic":@"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      @"maxAllocationsPerUtxo":@5, @"reuseAddresses":@YES
    } mutableCopy];
    NSString *handle = call(@"openWallet", params);
    NSDictionary *identity = call(@"getWalletIdentity", @{@"handle":handle});
    NSString *address = call(@"getAddress", @{@"handle":handle, @"rotate":@NO});
    check([address hasPrefix:@"bcrt1p"], "Wrong address type");
    NSDictionary *busy = [RgbLibSwiftHelper execute:@"openWallet" params:params];
    check([busy[@"error"][@"code"] isEqual:@"WALLET_STORAGE_IN_USE"], "Storage lease did not reject a second wallet");
    check([[RlnStorageClaim claimForTesting:root][@"errorCode"] isEqual:@"WALLET_PROFILE_MISMATCH"], "RLN claimed an open RGB Lib wallet");
    check([call(@"listAssets", @{@"handle":handle, @"filterAssetSchemas":@[]}) count] == 0, "Unexpected assets");
    check([call(@"listAssets", @{@"handle":handle, @"filterAssetSchemas":@[@"Cfa", @"Uda"]}) count] == 0, "Schema filter returned assets");
    check([[RgbLibSwiftHelper execute:@"listAssets" params:@{@"handle":handle, @"filterAssetSchemas":@[@"Rgb20"]}][@"error"][@"code"] isEqual:@"INVALID_CONFIG"], "Unknown schema filter was accepted");
    NSDictionary *noMetadata = [RgbLibSwiftHelper execute:@"getAssetMetadata" params:@{@"handle":handle, @"assetId":@"rgb:smoke-asset"}];
    check([noMetadata[@"error"][@"code"] isEqual:@"RGB_LIB_AssetNotFound"], "Unknown asset metadata did not map to RGB_LIB_AssetNotFound");
    check([call(@"deleteTransfers", @{@"handle":handle, @"batchTransferIdx":NSNull.null, @"noAssetOnly":@NO}) isEqual:@NO], "deleteTransfers changed an empty wallet");
    NSDictionary *missing = [RgbLibSwiftHelper execute:@"getAssetBalance" params:@{@"handle":handle, @"assetId":@"rgb:smoke-asset"}];
    check([missing[@"error"][@"code"] isEqual:@"RGB_LIB_AssetNotFound"], "Unknown asset did not map to RGB_LIB_AssetNotFound");
    NSDictionary *balance = call(@"getBtcBalance", @{@"handle":handle, @"skipSync":@YES});
    check([balance[@"vanilla"][@"settled"] isEqual:@"0"], "Balance lost decimal encoding");

    NSString *expiry = [NSString stringWithFormat:@"%llu", (unsigned long long)NSDate.date.timeIntervalSince1970 + 86400];
    NSDictionary *receive = call(@"receive", @{
      @"handle":handle, @"witness":@YES, @"assetId":NSNull.null,
      @"amount":@"9007199254740993", @"expirationTimestamp":expiry,
      @"transportEndpoints":@[], @"minConfirmations":@1
    });
    NSString *nftExpiry = [NSString stringWithFormat:@"%llu", (unsigned long long)NSDate.date.timeIntervalSince1970 + 86400];
    // rgb-lib only accepts an amount without a schema, so this proves the kind reached it.
    NSDictionary *nft = [RgbLibSwiftHelper execute:@"receive" params:@{
      @"handle":handle, @"witness":@YES, @"assetId":NSNull.null,
      @"amount":NSNull.null, @"expirationTimestamp":nftExpiry,
      @"transportEndpoints":@[], @"minConfirmations":@1, @"assignmentKind":@"NonFungible"
    }];
    check([nft[@"error"][@"code"] isEqual:@"RGB_LIB_InvalidAssignment"], "assignmentKind did not reach rgb-lib");
    NSDictionary *noAmount = [RgbLibSwiftHelper execute:@"receive" params:@{
      @"handle":handle, @"witness":@YES, @"assetId":NSNull.null,
      @"amount":NSNull.null, @"expirationTimestamp":nftExpiry,
      @"transportEndpoints":@[], @"minConfirmations":@1, @"assignmentKind":@"Fungible"
    }];
    check([noAmount[@"error"][@"code"] isEqual:@"INVALID_CONFIG"], "Fungible receive without amount was accepted");
    NSDictionary *invoice = call(@"decodeInvoice", @{@"handle":handle, @"invoice":receive[@"invoice"]});
    check([invoice[@"assignment"][@"amount"] isEqual:@"9007199254740993"], "Invoice amount was rounded");
    check([invoice[@"encryption"] isEqual:@"Required"], "Invoice encryption changed");
    check([invoice[@"publicKey"] isEqual:receive[@"publicKey"]], "Invoice public key changed");
    check([invoice[@"expirationTimestamp"] isEqual:expiry], "Invoice expiry changed");
    NSArray *history = call(@"listTransfers", @{@"handle":handle, @"assetId":NSNull.null, @"txid":NSNull.null});
    check(history.count == 1, "Receive is missing from history");
    check([history[0][@"requestedAssignment"][@"amount"] isEqual:@"9007199254740993"], "History amount was rounded");
    check([history[0][@"expiration"] isEqual:expiry], "History expiry changed");
    // send validates the invoice before going online, so nothing can be broadcast.
    NSDictionary *sendParams = @{
      @"handle":handle, @"assetId":@"rgb:smoke-asset", @"amount":NSNull.null,
      @"witnessAmountSat":NSNull.null, @"witnessBlinding":NSNull.null, @"donation":@NO,
      @"feeRate":@"2", @"minConfirmations":@1, @"skipSync":@YES,
      @"senderTransportEndpoint":@"rpc://localhost:3000/json-rpc"
    };
    NSDictionary *(^rejected)(NSDictionary *) = ^NSDictionary *(NSDictionary *values) {
      NSMutableDictionary *p = [sendParams mutableCopy];
      [p addEntriesFromDictionary:values];
      NSDictionary *error = [RgbLibSwiftHelper execute:@"send" params:p][@"error"];
      check([error[@"code"] isEqual:@"INVALID_CONFIG"], "send did not reject an invalid invoice as INVALID_CONFIG");
      return error;
    };
    check([rejected(@{@"invoice":receive[@"invoice"], @"amount":@"1"})[@"message"] isEqual:@"Amount override does not match invoice"], "send accepted a conflicting amount override");
    NSString *soon = [NSString stringWithFormat:@"%llu", (unsigned long long)NSDate.date.timeIntervalSince1970 + 300];
    NSDictionary *expiring = call(@"receive", @{
      @"handle":handle, @"witness":@YES, @"assetId":NSNull.null,
      @"amount":@"5", @"expirationTimestamp":soon,
      @"transportEndpoints":@[], @"minConfirmations":@1
    });
    check([rejected(@{@"invoice":expiring[@"invoice"]})[@"message"] isEqual:@"Invoice expires too soon"], "send accepted an invoice expiring within 600 seconds");
    NSMutableDictionary *signetParams = [params mutableCopy];
    signetParams[@"dataDir"] = [base stringByAppendingPathComponent:@"signet"];
    signetParams[@"network"] = @"signet";
    NSString *signet = call(@"openWallet", signetParams);
    NSDictionary *foreign = call(@"receive", @{
      @"handle":signet, @"witness":@YES, @"assetId":NSNull.null,
      @"amount":@"5", @"expirationTimestamp":expiry,
      @"transportEndpoints":@[], @"minConfirmations":@1
    });
    // JS maps the public "utexo" deployment to native "signet" before openWallet.
    check([foreign[@"invoice"] containsString:@"/sb:"], "Standard signet invoice must use sb, not sbc");
    check([call(@"decodeInvoice", @{@"handle":signet, @"invoice":foreign[@"invoice"]})[@"network"] isEqual:@"signet"], "Signet invoice decoded as another network");
    call(@"closeWallet", @{@"handle":signet});
    // Old custom-signet profiles must not be silently reopened on standard signet.
    NSMutableDictionary *legacyUtexoParams = [params mutableCopy];
    legacyUtexoParams[@"dataDir"] = [base stringByAppendingPathComponent:@"legacy-utexo"];
    legacyUtexoParams[@"network"] = @"utexo";
    NSString *legacyUtexo = call(@"openWallet", legacyUtexoParams);
    call(@"closeWallet", @{@"handle":legacyUtexo});
    legacyUtexoParams[@"network"] = @"signet";
    check([[RgbLibSwiftHelper execute:@"openWallet" params:legacyUtexoParams][@"error"][@"code"] isEqual:@"WALLET_PROFILE_MISMATCH"], "Custom signet storage was silently reused on standard signet");
    check([rejected(@{@"invoice":foreign[@"invoice"], @"amount":@"5"})[@"message"] isEqual:@"Invoice network does not match wallet"], "send accepted an invoice for another network");
    NSString *backup = [base stringByAppendingPathComponent:@"backup.rgb"];
    call(@"backup", @{@"handle":handle, @"backupPath":backup, @"password":@"smoke-test-password"});
    call(@"closeWallet", @{@"handle":handle});
    handle = call(@"openWallet", params);
    check([identity isEqual:call(@"getWalletIdentity", @{@"handle":handle})], "Identity changed on reopen");
    check([address isEqual:call(@"getAddress", @{@"handle":handle, @"rotate":@NO})], "Cached address changed on reopen");
    call(@"closeWallet", @{@"handle":handle});
    params[@"network"] = @"signet";
    NSDictionary *mismatch = [RgbLibSwiftHelper execute:@"openWallet" params:params];
    check([mismatch[@"error"][@"code"] isEqual:@"WALLET_PROFILE_MISMATCH"], "Profile mismatch was accepted");
    params[@"network"] = @"regtest";

    // RLN and RGB Lib never share storage, in either direction.
    NSFileManager *fm = NSFileManager.defaultManager;
    check([[RlnStorageClaim claimForTesting:root][@"errorCode"] isEqual:@"WALLET_PROFILE_MISMATCH"], "RLN claimed RGB Lib storage");
    check(![fm fileExistsAtPath:[root stringByAppendingPathComponent:@".rln-sdk-profile"]], "RLN marked RGB Lib storage");
    NSString *rln = [base stringByAppendingPathComponent:@"rln"];
    check([RlnStorageClaim claimForTesting:rln] == nil, "RLN could not claim a fresh directory");
    check([fm fileExistsAtPath:[rln stringByAppendingPathComponent:@".rln-sdk-profile"]], "RLN marker was not created");
    NSMutableDictionary *rlnParams = [params mutableCopy];
    rlnParams[@"dataDir"] = rln;
    NSDictionary *crossOpen = [RgbLibSwiftHelper execute:@"openWallet" params:rlnParams];
    check([crossOpen[@"error"][@"code"] isEqual:@"WALLET_STORAGE_NOT_EMPTY"], "RGB Lib opened RLN storage");
    NSDictionary *crossRestore = [RgbLibSwiftHelper execute:@"restoreBackup" params:@{@"dataDir":rln, @"backupPath":backup, @"password":@"smoke-test-password"}];
    check([crossRestore[@"error"][@"code"] isEqual:@"WALLET_STORAGE_NOT_EMPTY"], "RGB Lib restored into RLN storage");
    NSString *legacy = [base stringByAppendingPathComponent:@"legacy-rln"];
    [fm createDirectoryAtPath:legacy withIntermediateDirectories:YES attributes:nil error:nil];
    NSString *legacyData = [legacy stringByAppendingPathComponent:@"rgb_lightning_node.db"];
    [@"legacy" writeToFile:legacyData atomically:YES encoding:NSUTF8StringEncoding error:nil];
    check([RlnStorageClaim claimForTesting:legacy] == nil, "Legacy RLN storage without a marker was rejected");
    check([[NSString stringWithContentsOfFile:legacyData encoding:NSUTF8StringEncoding error:nil] isEqual:@"legacy"], "Legacy RLN data changed");

    NSString *restored = [base stringByAppendingPathComponent:@"restored"];
    NSDictionary *wrongPassword = [RgbLibSwiftHelper execute:@"restoreBackup" params:@{@"dataDir":restored, @"backupPath":backup, @"password":@"wrong"}];
    check([wrongPassword[@"error"][@"code"] isEqual:@"RGB_LIB_WrongPassword"], "Wrong backup password did not map to RGB_LIB_WrongPassword");
    call(@"restoreBackup", @{@"dataDir":restored, @"backupPath":backup, @"password":@"smoke-test-password"});
    params[@"dataDir"] = restored;
    handle = call(@"openWallet", params);
    check([identity isEqual:call(@"getWalletIdentity", @{@"handle":handle})], "Restored identity changed");
    check([address isEqual:call(@"getAddress", @{@"handle":handle, @"rotate":@NO})], "Restored address changed");
    call(@"closeWallet", @{@"handle":handle});

    // Watch-only: public keys from the profile, no mnemonic.
    NSDictionary *profile = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:[restored stringByAppendingPathComponent:@"rgb-sdk-profile.json"]] options:0 error:nil];
    NSMutableDictionary *watch = [params mutableCopy];
    watch[@"dataDir"] = [base stringByAppendingPathComponent:@"watch"];
    watch[@"mnemonic"] = NSNull.null;
    watch[@"accountXpubVanilla"] = profile[@"accountXpubVanilla"];
    watch[@"accountXpubColored"] = profile[@"accountXpubColored"];
    watch[@"masterFingerprint"] = profile[@"masterFingerprint"];
    handle = call(@"openWallet", watch);
    check([identity isEqual:call(@"getWalletIdentity", @{@"handle":handle})], "Watch-only identity differs from the full wallet");
    check([address isEqual:call(@"getAddress", @{@"handle":handle, @"rotate":@NO})], "Watch-only address differs from the full wallet");
    call(@"closeWallet", @{@"handle":handle});
    // The same keys reopen the full wallet's storage watch-only.
    watch[@"dataDir"] = restored;
    call(@"closeWallet", @{@"handle":call(@"openWallet", watch)});
    // Mnemonic plus matching keys opens; mismatching keys are rejected before storage is touched.
    NSMutableDictionary *both = [watch mutableCopy];
    both[@"mnemonic"] = params[@"mnemonic"];
    call(@"closeWallet", @{@"handle":call(@"openWallet", both)});
    both[@"accountXpubColored"] = profile[@"accountXpubVanilla"];
    check([[RgbLibSwiftHelper execute:@"openWallet" params:both][@"error"][@"code"] isEqual:@"INVALID_CONFIG"], "Mismatching public keys were accepted");
    NSMutableDictionary *none = [watch mutableCopy];
    none[@"accountXpubVanilla"] = NSNull.null;
    check([[RgbLibSwiftHelper execute:@"openWallet" params:none][@"error"][@"code"] isEqual:@"INVALID_CONFIG"], "A wallet opened without a mnemonic or public keys");
    [[NSFileManager defaultManager] removeItemAtPath:base error:nil];
#ifdef RGB_SMOKE_WITH_RLN
    puts("Direct UniFFI: RLN coexistence and storage exclusion, rejected-keys cleanup, wallet lifecycle, storage lock, invoice/history, send invoice checks, encrypted backup/restore and watch-only open passed");
#else
    puts("Direct UniFFI (RLN disabled): RLN storage exclusion, rejected-keys cleanup, wallet lifecycle, storage lock, invoice/history, send invoice checks, encrypted backup/restore and watch-only open passed");
#endif
  }
  return 0;
}
