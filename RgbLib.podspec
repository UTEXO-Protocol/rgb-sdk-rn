require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
repository = package.dig("repository", "url") || "https://github.com/UTEXO-Protocol/rgb-sdk-rn.git"

Pod::Spec.new do |s|
  s.name         = "RgbLib"
  # The compiled module (and, with use_frameworks!, the framework) must not be
  # named RgbLib: it would differ from the vendored RGBLib.framework only by
  # case and collide on case-insensitive file systems.
  s.module_name  = "UtexoRgbLib"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = repository.sub(/\.git$/, "")
  s.license      = package["license"]
  s.authors      = package["author"] || { "UTEXO-Protocol" => "https://github.com/UTEXO-Protocol" }

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => repository, :tag => "#{s.version}" }

  # Keep framework contents out of source globs without excluding the vendored
  # frameworks themselves: CocoaPods applies exclude_files to those as well.
  s.source_files = "ios/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/*.h"

  # The rgb-lib bindings are required. Without them the pod would build an app
  # with no RgbLib module, which fails only at runtime; stop here instead.
  # postinstall installs them (`--optional`, so `npm install` itself never fails).
  fix = "Run `npm run bindings:rgb-lib` in #{package["name"]} (#{__dir__}), then `pod install` again."
  pin = JSON.parse(File.read(File.join(__dir__, "src/bindings/rgb-lib/manifest.json")))
  installed_manifest = File.join(__dir__, "ios/RgbLibBindings/manifest.json")
  raise "RgbLib: rgb-lib iOS bindings are not installed. #{fix}" unless File.file?(installed_manifest)
  installed = JSON.parse(File.read(installed_manifest))
  # Same criteria as installedMatches() in scripts/setup-rgb-lib-bindings.mjs.
  checks = %w[version sourceRevision uniffiVersion swiftModule].map { |field| [field, installed[field], pin[field]] }
  checks << ["ios.sha256", installed.dig("ios", "sha256"), pin["ios"]["sha256"]]
  checks.each do |field, actual, expected|
    unless actual == expected
      raise "RgbLib: rgb-lib iOS bindings #{field} is #{actual.inspect}, expected #{expected.inspect}. #{fix}"
    end
  end
  # Built by scripts/setup-rgb-lib-bindings.mjs from the pinned rgb-lib-swift release.
  native_frameworks = ["ios/RgbLibBindings/RGBLib.xcframework", "ios/RgbLibBindings/rgb_libFFI.xcframework"]
  native_frameworks.each do |framework|
    raise "RgbLib: #{framework} is missing. #{fix}" unless File.directory?(File.join(__dir__, framework))
  end
  provenance = "ios/RgbLibBindings/RGBLib.xcframework/ios-arm64/RGBLib.framework/rgb-lib-bfa-version.json"
  raise "RgbLib: #{provenance} is missing. #{fix}" unless File.file?(File.join(__dir__, provenance))

  # The release is built for this iOS version, and App Store upload rejects
  # an embedded framework that needs a newer iOS than the app (ITMS-90208).
  rgb_lib_ios = pin["ios"]["minIosVersion"]
  if Gem::Version.new(rgb_lib_ios) > Gem::Version.new(min_ios_version_supported)
    s.platforms = { :ios => rgb_lib_ios }
  end
  # RgbLib.mm compiles only with this flag; the Swift side uses canImport(RGBLib).
  s.pod_target_xcconfig = { "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) RGB_LIB_BINDINGS=1" }
  s.libraries = "c++", "resolv", "sqlite3"
  s.frameworks = "Security", "SystemConfiguration"

  # Required-reason API declarations for the bundled native library.
  s.resource_bundles = { "RgbLibPrivacyInfo" => ["ios/PrivacyInfo.xcprivacy"] }
  s.vendored_frameworks = native_frameworks
  s.preserve_paths = native_frameworks

  install_modules_dependencies(s)
end
