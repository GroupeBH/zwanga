#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(ZwangaAwsLiveness, NSObject)
RCT_EXTERN_METHOD(start:(NSDictionary *)input resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(cancel)
@end
