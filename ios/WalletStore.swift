import Foundation

class WalletSession {
  let wallet: Wallet
  var online: Online?
  
  init(wallet: Wallet, online: Online? = nil) {
    self.wallet = wallet
    self.online = online
  }
}

class WalletStore {
  static let shared = WalletStore()
  
  private var sessions: [Int: WalletSession] = [:]
  private var nextId: Int = 1
  private let queue = DispatchQueue(label: "com.rgbsdkrn.walletstore")
  
  private init() {}
  
  func create(wallet: Wallet) -> Int {
    return queue.sync {
      let id = nextId
      nextId += 1
      sessions[id] = WalletSession(wallet: wallet)
      print("WalletStore: Created wallet session with id: \(id)")
      return id
    }
  }
  
  func get(id: Int) -> WalletSession? {
    return queue.sync {
      return sessions[id]
    }
  }
  
  func setOnline(id: Int, online: Online) {
    queue.sync {
      sessions[id]?.online = online
      print("WalletStore: Set online for wallet session id: \(id)")
    }
  }
  
  func remove(id: Int) {
    queue.sync {
      if sessions.removeValue(forKey: id) != nil {
        print("WalletStore: Removed wallet session with id: \(id)")
      }
    }
  }
  
  func clear() {
    queue.sync {
      sessions.removeAll()
      nextId = 1
      print("WalletStore: Cleared all wallet sessions")
    }
  }
}



