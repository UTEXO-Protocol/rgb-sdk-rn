import Foundation

final class RlnNodeStore {
  static let shared = RlnNodeStore()

  private var nodes: [Int: SdkNode] = [:]
  private var nextId: Int = 1
  private let queue = DispatchQueue(label: "com.rgbsdkrn.rlnnodestore")

  private init() {}

  func create(node: SdkNode) -> Int {
    return queue.sync {
      let id = nextId
      nextId += 1
      nodes[id] = node
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
    }
  }
}
