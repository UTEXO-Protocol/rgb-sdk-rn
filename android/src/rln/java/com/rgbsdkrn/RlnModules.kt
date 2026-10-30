package com.rgbsdkrn

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext

/** RLN build (`rgbSdk.rln: true` in package.json): registers the `Rgb` TurboModule. */
internal object RlnModules {
  const val ENABLED = true
  const val NAME = RgbModule.NAME

  fun create(reactContext: ReactApplicationContext): NativeModule = RgbModule(reactContext)
}
