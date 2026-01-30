import Foundation

@objc
@objcMembers
public class AppConstants: NSObject {
  @objc public static let shared = AppConstants()
  
  private let rgbDirName = ""
  private var _rgbDir: URL? = nil
  private let queue = DispatchQueue(label: "com.rgbsdkrn.appconstants")
  
  var rgbDir: URL? {
    get {
      return queue.sync {
        return _rgbDir
      }
    }
    set {
      queue.sync {
        self._rgbDir = newValue
      }
    }
  }
  
  private override init() {
    super.init()
  }
  
  @objc public func initContext() {
    queue.sync {
      let fileManager = FileManager.default
      let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
      _rgbDir = documentsPath.appendingPathComponent(rgbDirName)
      
      // Create directory if it doesn't exist
      if let rgbDir = _rgbDir {
        try? fileManager.createDirectory(at: rgbDir, withIntermediateDirectories: true, attributes: nil)
      }
    }
  }
  
  @objc public func ensureInitialized() {
    queue.sync {
      if _rgbDir == nil {
        let fileManager = FileManager.default
        let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        _rgbDir = documentsPath.appendingPathComponent(rgbDirName)
        
        // Create directory if it doesn't exist
        if let rgbDir = _rgbDir {
          try? fileManager.createDirectory(at: rgbDir, withIntermediateDirectories: true, attributes: nil)
        }
      }
    }
  }
}



