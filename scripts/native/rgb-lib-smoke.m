#import <Foundation/Foundation.h>
#import "RGBLightningNodeFFI.h"

@interface RgbLibSwiftHelper : NSObject
+ (NSDictionary *)execute:(NSString *)operation params:(NSDictionary *)params;
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
    RustCallStatus status = {0};
    RustBuffer health = uniffi_rgb_lightning_node_fn_func_uniffi_healthcheck(&status);
    check(status.code == 0, "RLN healthcheck failed");
    ffi_rgb_lightning_node_rustbuffer_free(health, &status);
    check(status.code == 0, "RLN buffer cleanup failed");
    check([call(@"getRuntimeInfo", @{})[@"bridgeVersion"] isEqual:@2], "Wrong bridge version");

    NSString *base = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
    NSString *root = [base stringByAppendingPathComponent:@"source"];
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
    check([call(@"listAssets", @{@"handle":handle}) count] == 0, "Unexpected assets");
    NSDictionary *balance = call(@"getBtcBalance", @{@"handle":handle, @"skipSync":@YES});
    check([balance[@"vanilla"][@"settled"] isEqual:@"0"], "Balance lost decimal encoding");

    NSString *expiry = [NSString stringWithFormat:@"%llu", (unsigned long long)NSDate.date.timeIntervalSince1970 + 86400];
    NSDictionary *receive = call(@"receive", @{
      @"handle":handle, @"witness":@YES, @"assetId":NSNull.null,
      @"amount":@"9007199254740993", @"expirationTimestamp":expiry,
      @"transportEndpoints":@[], @"minConfirmations":@1
    });
    NSDictionary *invoice = call(@"decodeInvoice", @{@"handle":handle, @"invoice":receive[@"invoice"]});
    check([invoice[@"assignment"][@"amount"] isEqual:@"9007199254740993"], "Invoice amount was rounded");
    check([invoice[@"encryption"] isEqual:@"Required"], "Invoice encryption changed");
    check([invoice[@"publicKey"] isEqual:receive[@"publicKey"]], "Invoice public key changed");
    check([invoice[@"expirationTimestamp"] isEqual:expiry], "Invoice expiry changed");
    NSArray *history = call(@"listTransfers", @{@"handle":handle, @"assetId":NSNull.null, @"txid":NSNull.null});
    check(history.count == 1, "Receive is missing from history");
    check([history[0][@"requestedAssignment"][@"amount"] isEqual:@"9007199254740993"], "History amount was rounded");
    check([history[0][@"expiration"] isEqual:expiry], "History expiry changed");
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
    NSString *restored = [base stringByAppendingPathComponent:@"restored"];
    NSDictionary *wrongPassword = [RgbLibSwiftHelper execute:@"restoreBackup" params:@{@"dataDir":restored, @"backupPath":backup, @"password":@"wrong"}];
    check(wrongPassword[@"error"] != nil, "Wrong backup password was accepted");
    call(@"restoreBackup", @{@"dataDir":restored, @"backupPath":backup, @"password":@"smoke-test-password"});
    params[@"dataDir"] = restored;
    handle = call(@"openWallet", params);
    check([identity isEqual:call(@"getWalletIdentity", @{@"handle":handle})], "Restored identity changed");
    check([address isEqual:call(@"getAddress", @{@"handle":handle, @"rotate":@NO})], "Restored address changed");
    call(@"closeWallet", @{@"handle":handle});
    [[NSFileManager defaultManager] removeItemAtPath:base error:nil];
    puts("Direct UniFFI: RLN coexistence, wallet lifecycle, storage lock, invoice/history and encrypted backup/restore passed");
  }
  return 0;
}
