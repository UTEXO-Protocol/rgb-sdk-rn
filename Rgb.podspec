require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "Rgb"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["repository"] && package["repository"]["url"] ? package["repository"]["url"].gsub(/\.git$/, "") : "https://github.com/UTEXO-Protocol/rgb-sdk-rn"
  s.license      = package["license"]
  s.authors      = package["author"] || { "UTEXO-Protocol" => "https://github.com/UTEXO-Protocol" }

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/UTEXO-Protocol/rgb-sdk-rn.git", :tag => "#{s.version}" }

  # Keep framework contents out of source globs without excluding the vendored
  # frameworks themselves: CocoaPods applies exclude_files to those as well.
  s.source_files = "ios/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/*.h"
    
  native_frameworks = ["ios/RGBLightningNode.xcframework"]
  if File.file?(File.join(__dir__, "ios/RgbLibBindings/manifest.json"))
    pin = JSON.parse(File.read(File.join(__dir__, "src/bindings/rgb-lib/manifest.json")))
    installed = JSON.parse(File.read(File.join(__dir__, "ios/RgbLibBindings/manifest.json")))
    %w[version sourceRevision uniffiVersion swiftModule].each do |field|
      raise "RGB Lib bindings #{field} mismatch. Run `npm run bindings:rgb-lib` in the SDK package." unless installed[field] == pin[field]
    end
    # Built by scripts/setup-rgb-lib-bindings.mjs from the pinned rgb-lib-swift release.
    native_frameworks += ["ios/RgbLibBindings/RGBLib.xcframework", "ios/RgbLibBindings/rgb_libFFI.xcframework"]
    # The release is built for this iOS version, and App Store upload rejects
    # an embedded framework that needs a newer iOS than the app (ITMS-90208).
    rgb_lib_ios = pin["ios"]["minIosVersion"]
    if Gem::Version.new(rgb_lib_ios) > Gem::Version.new(min_ios_version_supported)
      s.platforms = { :ios => rgb_lib_ios }
    end
    s.libraries = "c++", "resolv", "sqlite3"
    s.frameworks = "Security", "SystemConfiguration"
  end
  # Required-reason API declarations for the bundled native libraries.
  s.resource_bundles = { "RgbPrivacyInfo" => ["ios/PrivacyInfo.xcprivacy"] }
  s.vendored_frameworks = native_frameworks
  s.preserve_paths = native_frameworks

  install_modules_dependencies(s)
end
