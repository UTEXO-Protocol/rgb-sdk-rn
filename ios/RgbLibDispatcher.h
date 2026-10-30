#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Returns `@{@"result": ...}` or `@{@"error": @{@"code": ..., @"message": ...}}`.
typedef NSDictionary *_Nullable (^RgbLibExecute)(NSString *operation, NSDictionary *params);
typedef void (^RgbLibResolve)(id _Nullable result);
typedef void (^RgbLibReject)(NSString *code, NSString *_Nullable message);

/// Chooses the queue for each RgbLib call. It has no React Native or UniFFI types,
/// so tests/native/rgb-lib-dispatcher-checks.m drives it on the host.
@interface RgbLibDispatcher : NSObject
- (instancetype)initWithExecute:(RgbLibExecute)execute NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;
- (void)invoke:(NSString *)operation params:(NSDictionary *)params resolve:(RgbLibResolve)resolve reject:(RgbLibReject)reject;
- (void)invalidate;
@end

NS_ASSUME_NONNULL_END
