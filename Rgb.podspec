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

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"
    
  s.vendored_frameworks = "ios/rgb_libFFI.xcframework"
  s.preserve_paths = "ios/rgb_libFFI.xcframework"

  install_modules_dependencies(s)
end