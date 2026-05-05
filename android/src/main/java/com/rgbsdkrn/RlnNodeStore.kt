package com.rgbsdkrn

import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.utexo.rgblightningnode.SdkNode

object RlnNodeStore {
  private const val TAG = "RlnNodeStore"
  private val mutex = Mutex()
  private val nodes = mutableMapOf<Int, SdkNode>()
  private val states = mutableMapOf<Int, NodeLifecycleState>()
  private val storageDirByNodeId = mutableMapOf<Int, String>()
  private var nextId = 1

  enum class NodeLifecycleState {
    CREATED,
    INITIALIZED,
    UNLOCKING,
    UNLOCKED,
    SHUTDOWN
  }

  suspend fun create(node: SdkNode, storageDirPath: String): Int = mutex.withLock {
    val normalizedPath = storageDirPath.trim()
    if (normalizedPath.isNotEmpty() && storageDirByNodeId.values.contains(normalizedPath)) {
      throw IllegalStateException("RLN node already exists for storageDirPath: $normalizedPath")
    }
    val id = nextId++
    nodes[id] = node
    states[id] = NodeLifecycleState.CREATED
    storageDirByNodeId[id] = normalizedPath
    Log.d(TAG, "Created RLN node session with id: $id")
    id
  }

  suspend fun get(id: Int): SdkNode? = mutex.withLock { nodes[id] }

  suspend fun getState(id: Int): NodeLifecycleState? = mutex.withLock { states[id] }

  suspend fun markInitialized(id: Int) = mutex.withLock {
    val current = states[id] ?: return@withLock
    when (current) {
      NodeLifecycleState.CREATED -> states[id] = NodeLifecycleState.INITIALIZED
      NodeLifecycleState.INITIALIZED,
      NodeLifecycleState.UNLOCKED,
      NodeLifecycleState.SHUTDOWN -> {
        // keep existing state; caller may treat re-init attempts as no-op/invalid
      }
      NodeLifecycleState.UNLOCKING -> {
        throw IllegalStateException("Cannot initialize RLN node while unlock is in progress")
      }
    }
  }

  suspend fun beginUnlock(id: Int): NodeLifecycleState = mutex.withLock {
    val current = states[id] ?: throw IllegalStateException("RLN node with id $id not found")
    when (current) {
      NodeLifecycleState.INITIALIZED,
      NodeLifecycleState.SHUTDOWN -> {
        states[id] = NodeLifecycleState.UNLOCKING
        NodeLifecycleState.UNLOCKING
      }
      NodeLifecycleState.UNLOCKED -> NodeLifecycleState.UNLOCKED
      NodeLifecycleState.UNLOCKING -> {
        throw IllegalStateException("RLN unlock is already in progress")
      }
      NodeLifecycleState.CREATED -> {
        throw IllegalStateException("RLN node must be initialized before unlock")
      }
    }
  }

  suspend fun markUnlocked(id: Int) = mutex.withLock {
    if (states.containsKey(id)) {
      states[id] = NodeLifecycleState.UNLOCKED
    }
  }

  suspend fun markShutdown(id: Int) = mutex.withLock {
    if (states.containsKey(id)) {
      states[id] = NodeLifecycleState.SHUTDOWN
    }
  }

  suspend fun rollbackUnlock(id: Int) = mutex.withLock {
    val current = states[id] ?: return@withLock
    if (current == NodeLifecycleState.UNLOCKING) {
      states[id] = NodeLifecycleState.INITIALIZED
    }
  }

  suspend fun remove(id: Int) = mutex.withLock {
    nodes.remove(id)?.close()
    states.remove(id)
    storageDirByNodeId.remove(id)
    Log.d(TAG, "Removed RLN node session with id: $id")
  }
}
