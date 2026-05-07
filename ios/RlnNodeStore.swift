import Foundation

final class RlnNodeStore {
  static let shared = RlnNodeStore()

  private var nodes: [Int: SdkNode] = [:]
  private var storageDirByNodeId: [Int: String] = [:]
  private var nextId: Int = 1
  private var signers: [Int: NativeExternalSigner] = [:]
  private var nextSignerId: Int = 1
  private let queue = DispatchQueue(label: "com.rgbsdkrn.rlnnodestore")

  private init() {}

  func create(node: SdkNode, storageDirPath: String) throws -> Int {
    return queue.sync {
      let normalizedPath = storageDirPath.trimmingCharacters(in: .whitespacesAndNewlines)
      if !normalizedPath.isEmpty && storageDirByNodeId.values.contains(normalizedPath) {
        throw NSError(
          domain: "RlnNodeStore",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "RLN node already exists for storageDirPath: \(normalizedPath)"]
        )
      }
      let id = nextId
      nextId += 1
      nodes[id] = node
      storageDirByNodeId[id] = normalizedPath
      return id
    }
  }

  func get(id: Int) -> SdkNode? {
    return queue.sync { nodes[id] }
  }

  func remove(id: Int) {
    queue.sync {
      if let node = nodes.removeValue(forKey: id) {
        node.destroy()
      }
      storageDirByNodeId.removeValue(forKey: id)
    }
  }

  func createSigner(_ signer: NativeExternalSigner) -> Int {
    return queue.sync {
      let id = nextSignerId
      nextSignerId += 1
      signers[id] = signer
      return id
    }
  }

  func getSigner(id: Int) -> NativeExternalSigner? {
    return queue.sync { signers[id] }
  }

  func removeSigner(id: Int) {
    queue.sync { signers.removeValue(forKey: id) }
  }
}
