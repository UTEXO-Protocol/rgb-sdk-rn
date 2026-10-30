package com.rgbsdkrn

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext

/** RLN is disabled (`rgbSdk.rln: false` in package.json): `Rgb` is not registered. */
internal object RlnModules {
  const val ENABLED = false
  const val NAME = "Rgb"

  fun create(reactContext: ReactApplicationContext): NativeModule? = null
}
