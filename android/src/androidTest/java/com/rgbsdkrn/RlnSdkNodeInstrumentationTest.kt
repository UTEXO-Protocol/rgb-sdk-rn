package com.rgbsdkrn

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.utexo.rgblightningnode.SdkInitRequest
import org.utexo.rgblightningnode.SdkNode
import org.utexo.rgblightningnode.SdkUnlockRequest
import java.io.File
import kotlin.random.Random

@RunWith(AndroidJUnit4::class)
class RlnSdkNodeInstrumentationTest {
  private val defaultMnemonic =
    "poem twice question inch happy capital grain quality laptop dry chaos what"
  private val defaultPassword = "password"

  private fun randomPortBase(): Int = 20000 + Random.nextInt(20000)

  @Test
  fun createInitUnlockNode_regtest_shouldReachNodeInfo() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val args = InstrumentationRegistry.getArguments()

    val rpcHost = args.getString("rlnRpcHost") ?: "10.0.2.2"
    val rpcPort = args.getString("rlnRpcPort")?.toIntOrNull() ?: 18443
    val rpcUser = args.getString("rlnRpcUser") ?: "user"
    val rpcPassword = args.getString("rlnRpcPassword") ?: "password"
    val indexerUrl = args.getString("rlnIndexerUrl") ?: "10.0.2.2:50001"
    val proxyEndpoint = args.getString("rlnProxyEndpoint") ?: "rpc://10.0.2.2:3000/json-rpc"
    val mnemonic = args.getString("rlnMnemonic") ?: defaultMnemonic
    val nodePassword = args.getString("rlnNodePassword") ?: defaultPassword

    val storageDir = File(
      context.cacheDir,
      "rln_instrumentation_${System.currentTimeMillis()}_${Random.nextInt(10000)}"
    )
    storageDir.mkdirs()
    val initBase = randomPortBase()
    val initRequest = SdkInitRequest(
      storageDirPath = storageDir.absolutePath,
      daemonListeningPort = initBase.toUShort(),
      ldkPeerListeningPort = (initBase + 1).toUShort(),
      network = "regtest",
      maxMediaUploadSizeMb = 20u,
      enableVirtualChannelsV0 = false,
      virtualPeerPubkeys = null
    )
    val node = SdkNode.create(initRequest)

    try {
      val pubkey = node.init(nodePassword, mnemonic)
      assertFalse("Expected non-empty pubkey from init", pubkey.isBlank())

      val unlockRequest = SdkUnlockRequest(
        password = nodePassword,
        bitcoindRpcUsername = rpcUser,
        bitcoindRpcPassword = rpcPassword,
        bitcoindRpcHost = rpcHost,
        bitcoindRpcPort = rpcPort.toUShort(),
        indexerUrl = indexerUrl,
        proxyEndpoint = proxyEndpoint,
        announceAddresses = emptyList(),
        announceAlias = null
      )

      // Match android-e2e PaymentTest sequence strictly: init once, then unlock once.
      node.unlock(unlockRequest)

      val info = node.nodeInfo()
      assertNotNull("Node info must be available after unlock", info)
      assertFalse("Node info pubkey should not be blank", info.pubkey.isBlank())
    } finally {
      try {
        node.shutdown()
      } catch (_: Throwable) {
        // best effort cleanup
      }
      try {
        node.close()
      } catch (_: Throwable) {
        // best effort cleanup
      }
      storageDir.deleteRecursively()
    }
  }
}
