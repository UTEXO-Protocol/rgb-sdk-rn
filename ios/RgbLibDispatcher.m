#import "RgbLibDispatcher.h"

@implementation RgbLibDispatcher {
  RgbLibExecute _execute;
  // Calls without an open handle run concurrently; storage locks guard them.
  dispatch_queue_t _shared;
  // One serial queue per wallet, so slow indexer I/O never blocks other wallets.
  NSMutableDictionary<NSString *, dispatch_queue_t> *_sessions;
  BOOL _accepting;
}
- (instancetype)initWithExecute:(RgbLibExecute)execute {
  if ((self = [super init])) {
    _execute = [execute copy];
    _shared = dispatch_queue_create("org.utexo.rgb-lib", DISPATCH_QUEUE_CONCURRENT);
    _sessions = [NSMutableDictionary new];
    _accepting = YES;
  }
  return self;
}
- (void)invoke:(NSString *)operation params:(NSDictionary *)params resolve:(RgbLibResolve)resolve reject:(RgbLibReject)reject {
  @synchronized(self) {
    if (!_accepting) { reject(@"WALLET_DISPOSED", @"Native module is closed"); return; }
    NSString *handle = [params[@"handle"] isKindOfClass:[NSString class]] ? params[@"handle"] : nil;
    dispatch_queue_t queue = (handle ? _sessions[handle] : nil) ?: _shared;
    RgbLibExecute execute = _execute;
    dispatch_async(queue, ^{
      @autoreleasepool {
        NSDictionary *response = execute(operation, params);
        if ([operation isEqualToString:@"closeWallet"]) [self releaseQueue:handle];
        if (![response isKindOfClass:[NSDictionary class]]) { reject(@"INVALID_NATIVE_RESPONSE", @"Cannot decode native response"); return; }
        NSDictionary *failure = response[@"error"];
        if (failure) { reject(failure[@"code"], failure[@"message"]); return; }
        id result = response[@"result"];
        if ([operation isEqualToString:@"openWallet"] && ![self adoptHandle:result]) {
          execute(@"closeWallet", @{@"handle":result});
          reject(@"WALLET_DISPOSED", @"Native module is closed");
          return;
        }
        resolve(result == [NSNull null] ? nil : result);
      }
    });
  }
}
- (BOOL)adoptHandle:(NSString *)handle {
  @synchronized(self) {
    if (!_accepting) return NO;
    _sessions[handle] = dispatch_queue_create("org.utexo.rgb-lib.session", DISPATCH_QUEUE_SERIAL);
    return YES;
  }
}
- (void)releaseQueue:(NSString *)handle {
  if (!handle) return;
  @synchronized(self) { [_sessions removeObjectForKey:handle]; }
}
- (void)invalidate {
  @synchronized(self) {
    if (!_accepting) return;
    _accepting = NO;
    RgbLibExecute execute = _execute;
    // Close on each wallet's own queue, after the calls already queued for it.
    [_sessions enumerateKeysAndObjectsUsingBlock:^(NSString *handle, dispatch_queue_t queue, BOOL *stop) {
      dispatch_async(queue, ^{ execute(@"closeWallet", @{@"handle":handle}); });
    }];
    [_sessions removeAllObjects];
  }
}
@end
