package com.rgbsdkrn

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap

class RgbPackage : BaseReactPackage() {
  // The optional backend is excluded from compilation until its UniFFI AAR is installed.
  private val rgbLibClass: Class<out NativeModule>? by lazy {
    try {
      Class.forName("com.rgbsdkrn.RgbLibModule").asSubclass(NativeModule::class.java)
    } catch (_: ClassNotFoundException) { null }
  }
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == RgbModule.NAME) {
      RgbModule(reactContext)
    } else if (name == "RgbLib") {
      rgbLibClass?.getConstructor(ReactApplicationContext::class.java)?.newInstance(reactContext)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
      moduleInfos[RgbModule.NAME] = ReactModuleInfo(
        RgbModule.NAME,
        RgbModule.NAME,
        false,  // canOverrideExistingModule
        false,  // needsEagerInit
        false,  // isCxxModule
        true // isTurboModule
      )
      if (rgbLibClass != null) {
        moduleInfos["RgbLib"] = ReactModuleInfo("RgbLib", "RgbLib", false, false, false, true)
      }
      moduleInfos
    }
  }
}
