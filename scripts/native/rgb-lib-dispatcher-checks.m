// Host check for ios/RgbLibDispatcher.m with a gated fake session store.
// No React Native, UniFFI or simulator is needed.
#import <Foundation/Foundation.h>
#import "RgbLibDispatcher.h"

static void check(BOOL value, const char *message) {
  if (!value) { fprintf(stderr, "Dispatcher check failed: %s\n", message); exit(1); }
}
static const int64_t kWait = 5 * NSEC_PER_SEC;

/// Records each call; a call blocks while a gate is set for its handle and operation.
@interface FakeStore : NSObject
@property(nonatomic) NSMutableArray<NSString *> *events;
@property(nonatomic) NSMutableDictionary<NSString *, dispatch_semaphore_t> *gates;
@property(nonatomic) NSMutableDictionary<NSString *, dispatch_semaphore_t> *started;
@property(nonatomic) NSMutableSet<NSString *> *closed;
@property(nonatomic) NSMutableDictionary<NSString *, NSNumber *> *active;
@property(nonatomic) int opened;
@property(nonatomic) BOOL overlapped;
@end
@implementation FakeStore
- (instancetype)init {
  if ((self = [super init])) {
    _events = [NSMutableArray new]; _gates = [NSMutableDictionary new];
    _started = [NSMutableDictionary new]; _closed = [NSMutableSet new];
    _active = [NSMutableDictionary new];
  }
  return self;
}
- (void)gate:(NSString *)key {
  @synchronized(self) { _gates[key] = dispatch_semaphore_create(0); _started[key] = dispatch_semaphore_create(0); }
}
- (BOOL)awaitStart:(NSString *)key {
  dispatch_semaphore_t s; @synchronized(self) { s = _started[key]; }
  return dispatch_semaphore_wait(s, dispatch_time(DISPATCH_TIME_NOW, kWait)) == 0;
}
- (void)open:(NSString *)key {
  dispatch_semaphore_t g; @synchronized(self) { g = _gates[key]; [_gates removeObjectForKey:key]; }
  dispatch_semaphore_signal(g);
}
- (NSArray<NSString *> *)log { @synchronized(self) { return [_events copy]; } }
- (NSDictionary *)execute:(NSString *)operation params:(NSDictionary *)params {
  NSString *handle = params[@"handle"];
  if ([operation isEqualToString:@"openWallet"]) {
    NSString *key = [@"open:" stringByAppendingString:params[@"dataDir"]];
    dispatch_semaphore_t gate, started;
    @synchronized(self) { gate = _gates[key]; started = _started[key]; }
    if (gate) { dispatch_semaphore_signal(started); dispatch_semaphore_wait(gate, DISPATCH_TIME_FOREVER); }
    @synchronized(self) {
      NSString *h = [NSString stringWithFormat:@"h%d", ++_opened];
      [_events addObject:[@"open:" stringByAppendingString:h]];
      return @{@"result": h};
    }
  }
  NSString *key = [NSString stringWithFormat:@"%@:%@", operation, handle];
  dispatch_semaphore_t gate, started;
  @synchronized(self) {
    if ([_closed containsObject:handle])
      return @{@"error": @{@"code": @"WALLET_NOT_INITIALIZED", @"message": @"Unknown or closed wallet"}};
    if ([_active[handle] intValue] > 0) _overlapped = YES;
    _active[handle] = @([_active[handle] intValue] + 1);
    gate = _gates[key]; started = _started[key];
  }
  if (gate) { dispatch_semaphore_signal(started); dispatch_semaphore_wait(gate, DISPATCH_TIME_FOREVER); }
  @synchronized(self) {
    _active[handle] = @([_active[handle] intValue] - 1);
    [_events addObject:key];
    if ([operation isEqualToString:@"closeWallet"]) [_closed addObject:handle];
  }
  return @{@"result": [NSNull null]};
}
@end

/// One call's outcome.
@interface Reply : NSObject
@property(nonatomic) dispatch_semaphore_t done;
@property(nonatomic, nullable) id result;
@property(nonatomic, nullable) NSString *code;
@end
@implementation Reply
- (instancetype)init { if ((self = [super init])) _done = dispatch_semaphore_create(0); return self; }
- (BOOL)wait { return dispatch_semaphore_wait(_done, dispatch_time(DISPATCH_TIME_NOW, kWait)) == 0; }
- (BOOL)finishedNow { return dispatch_semaphore_wait(_done, dispatch_time(DISPATCH_TIME_NOW, 200 * NSEC_PER_MSEC)) == 0; }
@end

static Reply *call(RgbLibDispatcher *d, NSString *operation, NSDictionary *params) {
  Reply *reply = [Reply new];
  [d invoke:operation params:params
    resolve:^(id result) { reply.result = result; dispatch_semaphore_signal(reply.done); }
    reject:^(NSString *code, NSString *message) { reply.code = code; dispatch_semaphore_signal(reply.done); }];
  return reply;
}
static NSString *openAt(RgbLibDispatcher *d, NSString *dir) {
  Reply *r = call(d, @"openWallet", @{@"dataDir": dir});
  check([r wait] && r.code == nil, "openWallet did not resolve");
  return r.result;
}

int main(void) {
  @autoreleasepool {
    FakeStore *store = [FakeStore new];
    RgbLibDispatcher *d = [[RgbLibDispatcher alloc] initWithExecute:^NSDictionary *(NSString *op, NSDictionary *p) {
      return [store execute:op params:p];
    }];
    NSString *h1 = openAt(d, @"/a"), *h2 = openAt(d, @"/b");

    // A blocked call on one handle leaves the other handle free.
    [store gate:[@"listAssets:" stringByAppendingString:h1]];
    Reply *blocked = call(d, @"listAssets", @{@"handle": h1});
    check([store awaitStart:[@"listAssets:" stringByAppendingString:h1]], "Gated call did not start");
    Reply *queued = call(d, @"getAddress", @{@"handle": h1});
    Reply *other = call(d, @"getAddress", @{@"handle": h2});
    check([other wait] && other.code == nil, "A blocked handle stalled another handle");
    // The same handle is serialized: the queued call waits for the blocked one.
    check(![queued finishedNow], "A handle ran two calls at once");
    [store open:[@"listAssets:" stringByAppendingString:h1]];
    check([blocked wait] && [queued wait], "Queued calls did not drain");
    NSArray *log = [store log];
    check([log indexOfObject:[@"listAssets:" stringByAppendingString:h1]] < [log indexOfObject:[@"getAddress:" stringByAppendingString:h1]], "Calls ran out of order");

    // Close releases the handle; later calls for it fail as closed instead of hanging.
    Reply *close = call(d, @"closeWallet", @{@"handle": h2});
    check([close wait] && close.code == nil, "closeWallet failed");
    Reply *late = call(d, @"getAddress", @{@"handle": h2});
    check([late wait] && [late.code isEqual:@"WALLET_NOT_INITIALIZED"], "A closed handle accepted a call");

    // invalidate drains calls already queued for a handle, then closes it on that queue.
    [store gate:[@"sync:" stringByAppendingString:h1]];
    Reply *inflight = call(d, @"sync", @{@"handle": h1});
    check([store awaitStart:[@"sync:" stringByAppendingString:h1]], "Gated sync did not start");
    Reply *pending = call(d, @"listTransfers", @{@"handle": h1});
    [store gate:@"open:/c"];
    Reply *opening = call(d, @"openWallet", @{@"dataDir": @"/c"});
    check([store awaitStart:@"open:/c"], "Gated open did not start");
    [d invalidate];
    Reply *rejected = call(d, @"getAddress", @{@"handle": h1});
    check([rejected wait] && [rejected.code isEqual:@"WALLET_DISPOSED"], "invalidate accepted a new call");
    [store open:[@"sync:" stringByAppendingString:h1]];
    [store open:@"open:/c"];
    check([inflight wait] && inflight.code == nil, "In-flight call was dropped by invalidate");
    check([pending wait] && pending.code == nil, "Queued call was dropped by invalidate");
    check([opening wait] && [opening.code isEqual:@"WALLET_DISPOSED"], "A wallet opened during invalidate was adopted");
    NSString *close1 = [@"closeWallet:" stringByAppendingString:h1];
    for (int i = 0; i < 100 && !([[store log] containsObject:close1] && [[store log] containsObject:@"closeWallet:h3"]); i++)
      [NSThread sleepForTimeInterval:0.05];
    log = [store log];
    NSUInteger closed1 = [log indexOfObject:close1];
    check(closed1 != NSNotFound, "invalidate did not close an open wallet");
    check(closed1 > [log indexOfObject:[@"listTransfers:" stringByAppendingString:h1]], "invalidate closed before queued calls drained");
    check([log containsObject:@"closeWallet:h3"], "A wallet opened during invalidate was leaked");
    check(!store.overlapped, "Calls on one handle overlapped");
    puts("RgbLibDispatcher: per-handle isolation, serialization, close release and invalidate drain passed");
  }
  return 0;
}
