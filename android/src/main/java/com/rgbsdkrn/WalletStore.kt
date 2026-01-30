package com.rgbsdkrn

import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.rgbtools.Online
import org.rgbtools.Wallet

data class WalletSession(
  val wallet: Wallet,
  var online: Online?
)

object WalletStore {
  private const val TAG = "WalletStore"
  private val mutex = Mutex()
  private val sessions = mutableMapOf<Int, WalletSession>()
  private var nextId = 1

  suspend fun create(wallet: Wallet): Int = mutex.withLock {
    val id = nextId++
    sessions[id] = WalletSession(wallet, null)
    Log.d(TAG, "Created wallet session with id: $id")
    return id
  }

  suspend fun get(id: Int): WalletSession? = mutex.withLock {
    return sessions[id]
  }

  suspend fun setOnline(id: Int, online: Online) = mutex.withLock {
    sessions[id]?.online = online
    Log.d(TAG, "Set online for wallet session id: $id")
  }

  suspend fun remove(id: Int) = mutex.withLock {
    val session = sessions.remove(id)
    if (session != null) {
      Log.d(TAG, "Removed wallet session with id: $id")
    }
  }

  suspend fun clear() = mutex.withLock {
    sessions.clear()
    nextId = 1
    Log.d(TAG, "Cleared all wallet sessions")
  }
}

