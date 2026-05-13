import Foundation

final class RlnNodeStore {
  static let shared = RlnNodeStore()

  private var nodes: [Int: SdkNode] = [:]
  private var storageDirByNodeId: [Int: String] = [:]
  private var shutdownNodeIds: Set<Int> = []
  private var nextId: Int = 1
  private var signers: [Int: NativeExternalSigner] = [:]
  private var nextSignerId: Int = 1
  private let queue = DispatchQueue(label: "com.rgbsdkrn.rlnnodestore")

  private init() {}

  func create(node: SdkNode, storageDirPath: String) throws -> Int {
    var result: Result<Int, Error> = .failure(NSError(domain: "RlnNodeStore", code: -1))
    queue.sync {
      let normalizedPath = storageDirPath.trimmingCharacters(in: .whitespacesAndNewlines)
      if !normalizedPath.isEmpty, let existingId = storageDirByNodeId.first(where: { $0.value == normalizedPath })?.key {
        if shutdownNodeIds.contains(existingId) {
          nodes[existingId] = node  // ARC releases old node via deinit
          shutdownNodeIds.remove(existingId)
          result = .success(existingId)
        } else {
          result = .failure(NSError(
            domain: "RlnNodeStore",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "RLN node already exists for storageDirPath: \(normalizedPath)"]
          ))
        }
        return
      }
      let id = nextId
      nextId += 1
      nodes[id] = node
      storageDirByNodeId[id] = normalizedPath
      result = .success(id)
    }
    return try result.get()
  }

  func get(id: Int) -> SdkNode? {
    return queue.sync { nodes[id] }
  }

  func markShutdown(id: Int) {
    queue.sync { shutdownNodeIds.insert(id) }
  }

  func remove(id: Int) {
    queue.sync {
      if let node = nodes.removeValue(forKey: id) {
        if !shutdownNodeIds.contains(id) {
          node.shutdown()
        }
        // ARC releases node memory via deinit
      }
      storageDirByNodeId.removeValue(forKey: id)
      shutdownNodeIds.remove(id)
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
