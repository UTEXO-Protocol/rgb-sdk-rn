package com.rgbsdkrn

import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.utexo.rgblightningnode.SdkNode

object RlnNodeStore {
  private const val TAG = "RlnNodeStore"
  private val mutex = Mutex()
  private val nodes = mutableMapOf<Int, SdkNode>()
  private var nextId = 1

  suspend fun create(node: SdkNode): Int = mutex.withLock {
    val id = nextId++
    nodes[id] = node
    Log.d(TAG, "Created RLN node session with id: $id")
    id
  }

  suspend fun get(id: Int): SdkNode? = mutex.withLock { nodes[id] }

  suspend fun remove(id: Int) = mutex.withLock {
    nodes.remove(id)?.close()
    Log.d(TAG, "Removed RLN node session with id: $id")
  }
}
