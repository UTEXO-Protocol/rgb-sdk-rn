package com.rgbsdkrn

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.utexo.rgblightningnode.SdkCloseChannelRequest
import org.utexo.rgblightningnode.SdkCreateUtxosRequest
import org.utexo.rgblightningnode.SdkDisconnectPeerRequest
import org.utexo.rgblightningnode.SdkFailTransfersRequest
import org.utexo.rgblightningnode.SdkInitRequest
import org.utexo.rgblightningnode.SdkKeysendRequest
import org.utexo.rgblightningnode.LnInvoiceRequest
import org.utexo.rgblightningnode.NativeExternalSigner
import org.utexo.rgblightningnode.SdkExternalSignerBootstrap
import org.utexo.rgblightningnode.SdkNode
import org.utexo.rgblightningnode.SdkOpenChannelRequest
import org.utexo.rgblightningnode.SdkRefreshTransfersRequest
import org.utexo.rgblightningnode.SdkRgbInvoiceRequest
import org.utexo.rgblightningnode.SdkSendBtcRequest
import org.utexo.rgblightningnode.SdkSendPaymentRequest
import org.utexo.rgblightningnode.AssignmentKind
import org.utexo.rgblightningnode.AssetRecipients
import org.utexo.rgblightningnode.AssetBalanceInfo
import org.utexo.rgblightningnode.AssetNia
import org.utexo.rgblightningnode.AssetCfa
import org.utexo.rgblightningnode.AssetIfa
import org.utexo.rgblightningnode.AssetUda
import org.utexo.rgblightningnode.RgbRecipient
import org.utexo.rgblightningnode.SendRgbRequest
import org.utexo.rgblightningnode.WitnessData
import org.utexo.rgblightningnode.SdkUnlockRequest
import org.utexo.rgblightningnode.PaymentType
import org.utexo.rgblightningnode.SdkIssueAssetCfaRequest
import org.utexo.rgblightningnode.SdkIssueAssetIfaRequest
import org.utexo.rgblightningnode.SdkIssueAssetNiaRequest
import org.utexo.rgblightningnode.SdkIssueAssetUdaRequest

@ReactModule(name = RgbModule.NAME)
class RgbModule(reactContext: ReactApplicationContext) :
  NativeRgbSpec(reactContext) {
  private val coroutineScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
  private val TAG = "RNRgb"

  init {
    AppConstants.ensureInitialized(reactContext)
  }

  override fun getName(): String {
    return NAME
  }

  // ── RLN native node bridge ─────────────────────────────────────────────────

  override fun rlnCreateNode(
    storageDirPath: String,
    daemonListeningPort: Double,
    ldkPeerListeningPort: Double,
    network: String,
    maxMediaUploadSizeMb: Double,
    enableVirtualChannelsV0: Boolean?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val initRequest = SdkInitRequest(
          storageDirPath = storageDirPath,
          daemonListeningPort = daemonListeningPort.toInt().toUShort(),
          ldkPeerListeningPort = ldkPeerListeningPort.toInt().toUShort(),
          network = network,
          maxMediaUploadSizeMb = maxMediaUploadSizeMb.toInt().toUShort(),
          enableVirtualChannelsV0 = enableVirtualChannelsV0,
          virtualPeerPubkeys = null,
          lspBaseUrl = "",
          lspBearerToken = ""
        )
        val node = SdkNode.create(initRequest)
        val nodeId = RlnNodeStore.create(node, storageDirPath)
        withContext(Dispatchers.Main) { promise.resolve(nodeId) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnInitNode(nodeId: Double, password: String, mnemonic: String?, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      val intNodeId = nodeId.toInt()
      try {
        val node = RlnNodeStore.get(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val state = RlnNodeStore.getState(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        if (state != RlnNodeStore.NodeLifecycleState.CREATED) {
          throw IllegalStateException("RLN init is not allowed while node is in state: $state")
        }
        val nodePubkey = node.init(password, mnemonic)
        RlnNodeStore.markInitialized(intNodeId)
        withContext(Dispatchers.Main) { promise.resolve(nodePubkey) }
      } catch (e: Exception) {
        val node = RlnNodeStore.get(intNodeId)
        if (node != null && isConflictLike(e)) {
          // RLN may already be initialized on disk after restart/recreate.
          // Keep RN lifecycle state in sync so subsequent unlock is allowed.
          RlnNodeStore.markInitialized(intNodeId)
          val recoveredPubkey = try {
            node.nodeInfo().pubkey
          } catch (_: Exception) {
            ""
          }
          withContext(Dispatchers.Main) { promise.resolve(recoveredPubkey) }
          return@launch
        }
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnInitNodeWithExternalSigner(
    nodeId: Double,
    nodePublicKeyHex: String,
    accountXpubVanilla: String,
    accountXpubColored: String,
    masterFingerprint: String,
    protocolVersion: String,
    apiLevel: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      val intNodeId = nodeId.toInt()
      try {
        val node = RlnNodeStore.get(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val state = RlnNodeStore.getState(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        if (state != RlnNodeStore.NodeLifecycleState.CREATED) {
          throw IllegalStateException("RLN init is not allowed while node is in state: $state")
        }
        node.initWithExternalSigner(
          SdkExternalSignerBootstrap(
            nodeId = nodePublicKeyHex,
            accountXpubVanilla = accountXpubVanilla,
            accountXpubColored = accountXpubColored,
            masterFingerprint = masterFingerprint,
            protocolVersion = protocolVersion,
            apiLevel = apiLevel.toInt().toUInt()
          )
        )
        RlnNodeStore.markInitialized(intNodeId)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnUnlockNode(
    nodeId: Double,
    password: String,
    bitcoindRpcUsername: String,
    bitcoindRpcPassword: String,
    bitcoindRpcHost: String,
    bitcoindRpcPort: Double,
    indexerUrl: String?,
    proxyEndpoint: String?,
    announceAddresses: ReadableArray,
    announceAlias: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      val intNodeId = nodeId.toInt()
      try {
        val node = RlnNodeStore.get(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val currentState = RlnNodeStore.getState(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        when (RlnNodeStore.beginUnlock(intNodeId)) {
          RlnNodeStore.NodeLifecycleState.UNLOCKED -> {
            // Unlock is idempotent if the node is already unlocked and responsive.
            if (probeNodeReady(node, attempts = 3, delayMs = 200L)) {
              withContext(Dispatchers.Main) { promise.resolve(null) }
              return@launch
            }
            throw IllegalStateException("RLN node is marked unlocked but nodeInfo is not available")
          }
          RlnNodeStore.NodeLifecycleState.UNLOCKING -> Unit
          RlnNodeStore.NodeLifecycleState.CREATED,
          RlnNodeStore.NodeLifecycleState.INITIALIZED,
          RlnNodeStore.NodeLifecycleState.SHUTDOWN -> {
            throw IllegalStateException("Unexpected RLN node state before unlock")
          }
        }
        val announceAddressesList = mutableListOf<String>()
        for (i in 0 until announceAddresses.size()) {
          announceAddressesList.add(announceAddresses.getString(i) ?: "")
        }
        node.unlock(
          SdkUnlockRequest(
            password = password,
            bitcoindRpcUsername = bitcoindRpcUsername,
            bitcoindRpcPassword = bitcoindRpcPassword,
            bitcoindRpcHost = bitcoindRpcHost,
            bitcoindRpcPort = bitcoindRpcPort.toInt().toUShort(),
            indexerUrl = indexerUrl,
            proxyEndpoint = proxyEndpoint,
            announceAddresses = announceAddressesList,
            announceAlias = announceAlias
          )
        )
        RlnNodeStore.markUnlocked(intNodeId)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        val node = RlnNodeStore.get(intNodeId)
        if (node != null && isConflictLike(e) && probeNodeReady(node, attempts = 12, delayMs = 500L)) {
          RlnNodeStore.markUnlocked(intNodeId)
          withContext(Dispatchers.Main) { promise.resolve(null) }
          return@launch
        }
        RlnNodeStore.rollbackUnlock(intNodeId)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnCreateNativeExternalSigner(seedHex: String, network: String, permissivePolicy: Boolean, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val signer = NativeExternalSigner(seedHex, network, permissivePolicy)
        val signerId = RlnNodeStore.createSigner(signer)
        withContext(Dispatchers.Main) { promise.resolve(signerId.toDouble()) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnInitNodeWithNativeExternalSigner(nodeId: Double, signerId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      val intNodeId = nodeId.toInt()
      try {
        val node = RlnNodeStore.get(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val state = RlnNodeStore.getState(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        if (state != RlnNodeStore.NodeLifecycleState.CREATED) {
          throw IllegalStateException("RLN init is not allowed while node is in state: $state")
        }
        val signer = RlnNodeStore.getSigner(signerId.toInt())
          ?: throw IllegalStateException("Native signer with id $signerId not found")
        node.initWithNativeExternalSigner(signer)
        node.detachExternalSigner()
        RlnNodeStore.markInitialized(intNodeId)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnAttachNativeExternalSigner(nodeId: Double, signerId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      val intNodeId = nodeId.toInt()
      try {
        val node = RlnNodeStore.get(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val signer = RlnNodeStore.getSigner(signerId.toInt())
          ?: throw IllegalStateException("Native signer with id $signerId not found")
        node.attachNativeExternalSigner(signer)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnUnlockNodeWithNativeExternalSigner(
    nodeId: Double,
    signerId: Double,
    bitcoindRpcUsername: String,
    bitcoindRpcPassword: String,
    bitcoindRpcHost: String,
    bitcoindRpcPort: Double,
    indexerUrl: String?,
    proxyEndpoint: String?,
    announceAddresses: ReadableArray,
    announceAlias: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      val intNodeId = nodeId.toInt()
      try {
        val node = RlnNodeStore.get(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val signer = RlnNodeStore.getSigner(signerId.toInt())
          ?: throw IllegalStateException("Native signer with id $signerId not found")
        when (RlnNodeStore.beginUnlock(intNodeId)) {
          RlnNodeStore.NodeLifecycleState.UNLOCKED -> {
            if (probeNodeReady(node, attempts = 3, delayMs = 200L)) {
              withContext(Dispatchers.Main) { promise.resolve(null) }
              return@launch
            }
            throw IllegalStateException("RLN node is marked unlocked but nodeInfo is not available")
          }
          RlnNodeStore.NodeLifecycleState.UNLOCKING -> Unit
          else -> throw IllegalStateException("Unexpected RLN node state before unlock")
        }
        val announceAddressesList = mutableListOf<String>()
        for (i in 0 until announceAddresses.size()) {
          announceAddressesList.add(announceAddresses.getString(i) ?: "")
        }
        node.unlockWithNativeExternalSigner(
          signer = signer,
          bitcoindRpcUsername = bitcoindRpcUsername,
          bitcoindRpcPassword = bitcoindRpcPassword,
          bitcoindRpcHost = bitcoindRpcHost,
          bitcoindRpcPort = bitcoindRpcPort.toInt().toUShort(),
          indexerUrl = indexerUrl,
          proxyEndpoint = proxyEndpoint,
          announceAddresses = announceAddressesList,
          announceAlias = announceAlias
        )
        RlnNodeStore.markUnlocked(intNodeId)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        val node = RlnNodeStore.get(intNodeId)
        if (node != null && isConflictLike(e) && probeNodeReady(node, attempts = 12, delayMs = 500L)) {
          RlnNodeStore.markUnlocked(intNodeId)
          withContext(Dispatchers.Main) { promise.resolve(null) }
          return@launch
        }
        RlnNodeStore.rollbackUnlock(intNodeId)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnDestroyNativeExternalSigner(signerId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        RlnNodeStore.removeSigner(signerId.toInt())
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnDestroyNode(nodeId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        RlnNodeStore.remove(nodeId.toInt())
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnNodeInfo(nodeId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val info = node.nodeInfo()
        val map = Arguments.createMap()
        map.putString("pubkey", info.pubkey)
        map.putDouble("numChannels", info.numChannels.toDouble())
        map.putDouble("numUsableChannels", info.numUsableChannels.toDouble())
        map.putDouble("localBalanceSat", info.localBalanceSat.toDouble())
        map.putDouble("numPeers", info.numPeers.toDouble())
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnNetworkInfo(nodeId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val info = node.networkInfo()
        val map = Arguments.createMap()
        map.putString("network", info.network)
        map.putDouble("height", info.height.toDouble())
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnListPeers(nodeId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val peers = node.listPeers()
        val arr = Arguments.createArray()
        peers.forEach {
          val map = Arguments.createMap()
          map.putString("pubkey", it.pubkey)
          arr.pushMap(map)
        }
        withContext(Dispatchers.Main) { promise.resolve(arr) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnConnectPeer(nodeId: Double, peerPubkeyAndAddr: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        node.connectpeer(peerPubkeyAndAddr)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        if (isPoisonError(e)) {
          // A Rust mutex was poisoned by a background LDK thread panic. The node's
          // internal state is unrecoverable; the caller must destroy and restart the node.
          withContext(Dispatchers.Main) {
            promise.reject("NodeStateCorrupted", "Node internal state is corrupted (PoisonError); please restart the node", e)
          }
          return@launch
        }
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnDisconnectPeer(nodeId: Double, peerPubkey: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        node.disconnectpeer(SdkDisconnectPeerRequest(peerPubkey))
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnListChannels(nodeId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val channels = node.listChannels()
        val arr = Arguments.createArray()
        channels.forEach { ch ->
          val map = Arguments.createMap()
          map.putString("channelId", ch.channelId)
          map.putString("peerPubkey", ch.peerPubkey)
          map.putBoolean("ready", ch.ready)
          map.putBoolean("isUsable", ch.isUsable)
          map.putDouble("capacitySat", ch.capacitySat.toDouble())
          map.putDouble("localBalanceSat", ch.localBalanceSat.toDouble())
          map.putDouble("outboundBalanceMsat", ch.outboundBalanceMsat.toDouble())
          map.putDouble("inboundBalanceMsat", ch.inboundBalanceMsat.toDouble())
          map.putBoolean("public", ch.public)
          ch.fundingTxid?.let { map.putString("fundingTxid", it) }
          ch.assetId?.let { map.putString("assetId", it) }
          ch.assetLocalAmount?.let { map.putDouble("assetLocalAmount", it.toDouble()) }
          ch.assetRemoteAmount?.let { map.putDouble("assetRemoteAmount", it.toDouble()) }
          arr.pushMap(map)
        }
        withContext(Dispatchers.Main) { promise.resolve(arr) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnOpenChannel(
    nodeId: Double,
    peerPubkeyAndOptAddr: String,
    capacitySat: Double,
    pushMsat: Double,
    publicChannel: Boolean,
    withAnchors: Boolean,
    feeBaseMsat: Double?,
    feeProportionalMillionths: Double?,
    temporaryChannelId: String?,
    assetId: String?,
    assetAmount: Double?,
    pushAssetAmount: Double?,
    virtualOpenMode: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val req = SdkOpenChannelRequest(
          peerPubkeyAndOptAddr = peerPubkeyAndOptAddr,
          capacitySat = capacitySat.toULong(),
          pushMsat = pushMsat.toULong(),
          public = publicChannel,
          withAnchors = withAnchors,
          feeBaseMsat = feeBaseMsat?.toInt()?.toUInt(),
          feeProportionalMillionths = feeProportionalMillionths?.toInt()?.toUInt(),
          temporaryChannelId = temporaryChannelId,
          assetId = assetId,
          assetAmount = assetAmount?.toULong(),
          pushAssetAmount = pushAssetAmount?.toULong(),
          virtualOpenMode = virtualOpenMode
        )
        val opened = node.openchannel(req)
        val map = Arguments.createMap()
        map.putString("temporaryChannelId", opened.temporaryChannelId)
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnCloseChannel(
    nodeId: Double,
    channelId: String,
    peerPubkey: String,
    force: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val req = SdkCloseChannelRequest(
          channelId = channelId,
          peerPubkey = peerPubkey,
          force = force
        )
        node.closechannel(req)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnListPayments(nodeId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val payments = node.listPayments()
        val arr = Arguments.createArray()
        payments.forEach { p ->
          val map = Arguments.createMap()
          p.assetId?.let { map.putString("assetId", it) }
          map.putString("paymentHash", p.paymentHash)
          map.putString("status", p.status.name)
          map.putString("paymentType", p.paymentType.name)
          map.putDouble("createdAt", p.createdAt.toDouble())
          map.putDouble("updatedAt", p.updatedAt.toDouble())
          map.putString("payeePubkey", p.payeePubkey)
          p.amtMsat?.let { map.putDouble("amtMsat", it.toDouble()) }
          p.assetAmount?.let { map.putDouble("assetAmount", it.toDouble()) }
          p.preimage?.let { map.putString("preimage", it) }
          arr.pushMap(map)
        }
        withContext(Dispatchers.Main) { promise.resolve(arr) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnAddress(nodeId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val address = node.address()
        val map = Arguments.createMap()
        map.putString("address", address.address)
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnAssetBalance(nodeId: Double, assetId: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val b = node.assetBalance(assetId)
        val map = Arguments.createMap()
        map.putDouble("settled", b.settled.toDouble())
        map.putDouble("future", b.future.toDouble())
        map.putDouble("spendable", b.spendable.toDouble())
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnBackup(nodeId: Double, backupPath: String, password: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        // Some generated RLN artifacts do not expose backup() on SdkNode yet.
        // Keep bridge callable and return a clear runtime error instead.
        withContext(Dispatchers.Main) {
          promise.reject(
            "UnsupportedOperationException",
            "rlnBackup is not available in current Android RLN bindings"
          )
        }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnBtcBalance(nodeId: Double, skipSync: Boolean, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val b = node.btcBalance(skipSync)
        val map = Arguments.createMap()
        val vanillaMap = Arguments.createMap()
        vanillaMap.putDouble("settled", b.vanilla.settled.toDouble())
        vanillaMap.putDouble("future", b.vanilla.future.toDouble())
        vanillaMap.putDouble("spendable", b.vanilla.spendable.toDouble())
        map.putMap("vanilla", vanillaMap)
        val coloredMap = Arguments.createMap()
        coloredMap.putDouble("settled", b.colored.settled.toDouble())
        coloredMap.putDouble("future", b.colored.future.toDouble())
        coloredMap.putDouble("spendable", b.colored.spendable.toDouble())
        map.putMap("colored", coloredMap)
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnCheckIndexerUrl(nodeId: Double, indexerUrl: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.checkIndexerUrl(indexerUrl)
        val map = Arguments.createMap()
        map.putString("value", res.toString())
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnCheckProxyEndpoint(nodeId: Double, proxyEndpoint: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        node.checkProxyEndpoint(proxyEndpoint)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnCreateUtxos(
    nodeId: Double,
    upTo: Boolean,
    num: Double?,
    size: Double?,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        node.createutxos(
          SdkCreateUtxosRequest(
            upTo = upTo,
            num = num?.toInt()?.toUByte(),
            size = size?.toInt()?.toUInt(),
            feeRate = feeRate.toULong(),
            skipSync = skipSync
          )
        )
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnDecodeLnInvoice(nodeId: Double, invoice: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.decodeLnInvoice(invoice)
        val map = Arguments.createMap()
        res.amtMsat?.let { map.putDouble("amtMsat", it.toDouble()) }
        map.putDouble("expirySec", res.expirySec.toDouble())
        map.putDouble("timestamp", res.timestamp.toDouble())
        res.assetId?.let { map.putString("assetId", it) }
        res.assetAmount?.let { map.putDouble("assetAmount", it.toDouble()) }
        map.putString("paymentHash", res.paymentHash)
        map.putString("paymentSecret", res.paymentSecret)
        res.payeePubkey?.let { map.putString("payeePubkey", it) }
        map.putString("network", res.network)
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnDecodeRgbInvoice(nodeId: Double, invoice: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.decodeRgbInvoice(invoice)
        val map = Arguments.createMap()
        map.putString("recipientId", res.recipientId)
        map.putString("recipientType", res.recipientType)
        res.assetSchema?.let { map.putString("assetSchema", it) }
        res.assetId?.let { map.putString("assetId", it) }
        map.putString("assignment", res.assignment)
        map.putString("network", res.network)
        res.expirationTimestamp?.let { map.putDouble("expirationTimestamp", it.toDouble()) }
        val endpointsArr = Arguments.createArray()
        res.transportEndpoints.forEach { endpointsArr.pushString(it) }
        map.putArray("transportEndpoints", endpointsArr)
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnEstimateFee(nodeId: Double, blocks: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.estimateFee(blocks.toInt().toUShort())
        val map = Arguments.createMap()
        map.putString("value", res.toString())
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnGetChannelId(nodeId: Double, temporaryChannelId: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        withContext(Dispatchers.Main) { promise.resolve(node.getChannelId(temporaryChannelId)) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnGetPayment(nodeId: Double, paymentHash: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val p = node.getPayment(paymentHash, PaymentType.OUTBOUND)
        val map = Arguments.createMap()
        map.putString("paymentHash", p.paymentHash)
        map.putString("status", p.status.name)
        map.putString("paymentType", p.paymentType.name)
        map.putDouble("createdAt", p.createdAt.toDouble())
        map.putDouble("updatedAt", p.updatedAt.toDouble())
        map.putString("payeePubkey", p.payeePubkey)
        p.assetId?.let { map.putString("assetId", it) }
        p.amtMsat?.let { map.putDouble("amtMsat", it.toDouble()) }
        p.assetAmount?.let { map.putDouble("assetAmount", it.toDouble()) }
        p.preimage?.let { map.putString("preimage", it) }
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnInvoiceStatus(nodeId: Double, invoice: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.invoiceStatus(invoice)
        val map = Arguments.createMap()
        map.putString("value", res.toString())
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnFailTransfers(
    nodeId: Double,
    batchTransferIdx: Double?,
    noAssetOnly: Boolean,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.failtransfers(
          SdkFailTransfersRequest(
            batchTransferIdx = batchTransferIdx?.toInt(),
            noAssetOnly = noAssetOnly,
            skipSync = skipSync
          )
        )
        val map = Arguments.createMap()
        map.putBoolean("transfersChanged", res.transfersChanged)
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnKeysend(
    nodeId: Double,
    destPubkey: String,
    amtMsat: Double,
    assetId: String?,
    assetAmount: Double?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.keysend(
          SdkKeysendRequest(
            destPubkey = destPubkey,
            amtMsat = amtMsat.toULong(),
            assetId = assetId,
            assetAmount = assetAmount?.toULong()
          )
        )
        val map = Arguments.createMap()
        map.putString("paymentHash", res.paymentHash)
        map.putString("paymentPreimage", res.paymentPreimage)
        map.putString("status", res.status.toString())
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnListAssets(nodeId: Double, filterAssetSchemas: ReadableArray, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val schemas = mutableListOf<String>()
        for (i in 0 until filterAssetSchemas.size()) {
          schemas.add(filterAssetSchemas.getString(i) ?: "")
        }
        val res = node.listAssets(schemas)
        val map = Arguments.createMap()
        val niaArr = Arguments.createArray()
        res.nia?.forEach { niaArr.pushMap(serializeAssetNia(it)) }
        map.putArray("nia", niaArr)
        val cfaArr = Arguments.createArray()
        res.cfa?.forEach { cfaArr.pushMap(serializeAssetCfa(it)) }
        map.putArray("cfa", cfaArr)
        val ifaArr = Arguments.createArray()
        res.ifa?.forEach { ifaArr.pushMap(serializeAssetIfa(it)) }
        map.putArray("ifa", ifaArr)
        val udaArr = Arguments.createArray()
        res.uda?.forEach { udaArr.pushMap(serializeAssetUda(it)) }
        map.putArray("uda", udaArr)
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnListTransactions(nodeId: Double, skipSync: Boolean, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val txs = node.listTransactions(skipSync)
        val arr = Arguments.createArray()
        txs.forEach { tx ->
          val map = Arguments.createMap()
          map.putString("txid", tx.txid)
          map.putString("transactionType", tx.transactionType.name)
          map.putDouble("received", tx.received.toDouble())
          map.putDouble("sent", tx.sent.toDouble())
          map.putDouble("fee", tx.fee.toDouble())
          tx.confirmationTime?.let { bt ->
            val ctMap = Arguments.createMap()
            ctMap.putDouble("height", bt.height.toDouble())
            ctMap.putDouble("timestamp", bt.timestamp.toDouble())
            map.putMap("confirmationTime", ctMap)
          }
          arr.pushMap(map)
        }
        withContext(Dispatchers.Main) { promise.resolve(arr) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnListTransfers(nodeId: Double, assetId: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val transfers = node.listTransfers(assetId)
        val arr = Arguments.createArray()
        transfers.forEach { t ->
          val map = Arguments.createMap()
          map.putInt("idx", t.idx)
          map.putDouble("createdAt", t.createdAt.toDouble())
          map.putDouble("updatedAt", t.updatedAt.toDouble())
          map.putString("status", t.status)
          t.requestedAssignment?.let { map.putString("requestedAssignment", it) }
          val assignArr = Arguments.createArray()
          t.assignments.forEach { assignArr.pushString(it) }
          map.putArray("assignments", assignArr)
          map.putString("kind", t.kind)
          t.txid?.let { map.putString("txid", it) }
          t.recipientId?.let { map.putString("recipientId", it) }
          t.receiveUtxo?.let { map.putString("receiveUtxo", it) }
          t.changeUtxo?.let { map.putString("changeUtxo", it) }
          t.expiration?.let { map.putDouble("expiration", it.toDouble()) }
          val epArr = Arguments.createArray()
          t.transportEndpoints.forEach { ep ->
            val epMap = Arguments.createMap()
            epMap.putString("endpoint", ep.endpoint)
            epMap.putString("transportType", ep.transportType)
            epMap.putBoolean("used", ep.used)
            epArr.pushMap(epMap)
          }
          map.putArray("transportEndpoints", epArr)
          arr.pushMap(map)
        }
        withContext(Dispatchers.Main) { promise.resolve(arr) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnListUnspents(nodeId: Double, skipSync: Boolean, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val unspents = node.listUnspents(skipSync)
        val arr = Arguments.createArray()
        unspents.forEach { unspent ->
          val map = Arguments.createMap()
          map.putString("value", unspent.toString())
          arr.pushMap(map)
        }
        withContext(Dispatchers.Main) { promise.resolve(arr) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnLnInvoice(
    nodeId: Double,
    amtMsat: Double?,
    expirySec: Double,
    assetId: String?,
    assetAmount: Double?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.lnInvoice(
          LnInvoiceRequest(
            amtMsat = amtMsat?.toULong(),
            expirySec = expirySec.toInt().toUInt(),
            assetId = assetId,
            assetAmount = assetAmount?.toULong(),
            paymentHash = null,
            descriptionHash = null
          )
        )
        val map = Arguments.createMap()
        map.putString("invoice", res.invoice)
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnRefreshTransfers(nodeId: Double, skipSync: Boolean, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        node.refreshtransfers(SdkRefreshTransfersRequest(skipSync = skipSync))
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnRgbInvoice(
    nodeId: Double,
    assetId: String?,
    assignmentAmount: Double?,
    durationSeconds: Double?,
    minConfirmations: Double,
    witness: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.rgbinvoice(
          SdkRgbInvoiceRequest(
            assetId = assetId,
            assignmentKind = null,
            assignmentAmount = assignmentAmount?.toULong(),
            durationSeconds = durationSeconds?.toInt()?.toUInt(),
            minConfirmations = minConfirmations.toInt().toUByte(),
            witness = witness
          )
        )
        val map = Arguments.createMap()
        map.putString("recipientId", res.recipientId)
        map.putString("invoice", res.invoice)
        map.putDouble("batchTransferIdx", res.batchTransferIdx.toDouble())
        res.expirationTimestamp?.let { map.putDouble("expirationTimestamp", it.toDouble()) }
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnSendBtc(
    nodeId: Double,
    amount: Double,
    address: String,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.sendbtc(
          SdkSendBtcRequest(
            amount = amount.toULong(),
            address = address,
            feeRate = feeRate.toULong(),
            skipSync = skipSync
          )
        )
        val map = Arguments.createMap()
        map.putString("txid", res.txid)
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnSendPayment(
    nodeId: Double,
    invoice: String,
    amtMsat: Double?,
    assetId: String?,
    assetAmount: Double?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val res = node.sendpayment(
          SdkSendPaymentRequest(
            invoice = invoice,
            amtMsat = amtMsat?.toULong(),
            assetId = assetId,
            assetAmount = assetAmount?.toULong()
          )
        )
        val map = Arguments.createMap()
        map.putString("paymentId", res.paymentId)
        map.putString("paymentHash", res.paymentHash)
        map.putString("status", res.status.toString())
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnSendRgb(
    nodeId: Double,
    donation: Boolean,
    feeRate: Double,
    minConfirmations: Double,
    skipSync: Boolean,
    assetId: String,
    recipientId: String,
    amount: Double,
    transportEndpoints: ReadableArray,
    witnessAmountSat: Double?,
    witnessBlinding: Double?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val endpoints = (0 until transportEndpoints.size()).map { transportEndpoints.getString(it) ?: "" }
        val witnessData = witnessAmountSat?.let {
          WitnessData(amountSat = it.toULong(), blinding = witnessBlinding?.toULong())
        }
        val res = node.sendRgb(
          SendRgbRequest(
            donation = donation,
            feeRate = feeRate.toULong(),
            minConfirmations = minConfirmations.toInt().toUByte(),
            skipSync = skipSync,
            recipientGroups = listOf(
              AssetRecipients(
                assetId = assetId,
                recipients = listOf(
                  RgbRecipient(
                    recipientId = recipientId,
                    witnessData = witnessData,
                    assignmentKind = AssignmentKind.FUNGIBLE,
                    assignmentAmount = amount.toULong(),
                    transportEndpoints = endpoints,
                  )
                )
              )
            )
          )
        )
        val map = Arguments.createMap()
        map.putString("txid", res.txid)
        map.putDouble("batchTransferIdx", res.batchTransferIdx.toDouble())
        withContext(Dispatchers.Main) { promise.resolve(map) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnShutdown(nodeId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val intNodeId = nodeId.toInt()
        val node = RlnNodeStore.get(intNodeId)
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        node.shutdown()
        RlnNodeStore.markShutdown(intNodeId)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnSync(nodeId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        node.sync()
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnIssueAssetNia(
    nodeId: Double,
    ticker: String,
    name: String,
    precision: Double,
    amounts: ReadableArray,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val amountsList = mutableListOf<ULong>()
        for (i in 0 until amounts.size()) amountsList.add(amounts.getDouble(i).toULong())
        val asset = node.issueassetnia(SdkIssueAssetNiaRequest(
          amounts = amountsList,
          ticker = ticker,
          name = name,
          precision = precision.toLong().toUByte()
        ))
        withContext(Dispatchers.Main) { promise.resolve(rlnAssetNiaToMap(asset)) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnIssueAssetCfa(
    nodeId: Double,
    name: String,
    details: String?,
    precision: Double,
    amounts: ReadableArray,
    fileDigest: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val amountsList = mutableListOf<ULong>()
        for (i in 0 until amounts.size()) amountsList.add(amounts.getDouble(i).toULong())
        val asset = node.issueassetcfa(SdkIssueAssetCfaRequest(
          amounts = amountsList,
          name = name,
          details = details,
          precision = precision.toLong().toUByte(),
          fileDigest = fileDigest
        ))
        withContext(Dispatchers.Main) { promise.resolve(rlnAssetCfaToMap(asset)) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnIssueAssetIfa(
    nodeId: Double,
    ticker: String,
    name: String,
    precision: Double,
    amounts: ReadableArray,
    inflationAmounts: ReadableArray,
    rejectListUrl: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val amountsList = mutableListOf<ULong>()
        for (i in 0 until amounts.size()) amountsList.add(amounts.getDouble(i).toULong())
        val inflationList = mutableListOf<ULong>()
        for (i in 0 until inflationAmounts.size()) inflationList.add(inflationAmounts.getDouble(i).toULong())
        val asset = node.issueassetifa(SdkIssueAssetIfaRequest(
          amounts = amountsList,
          inflationAmounts = inflationList,
          ticker = ticker,
          name = name,
          precision = precision.toLong().toUByte(),
          rejectListUrl = rejectListUrl
        ))
        withContext(Dispatchers.Main) { promise.resolve(rlnAssetIfaToMap(asset)) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rlnIssueAssetUda(
    nodeId: Double,
    ticker: String,
    name: String,
    details: String?,
    precision: Double,
    mediaFileDigest: String?,
    attachmentsFileDigests: ReadableArray,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val digestsList = mutableListOf<String>()
        for (i in 0 until attachmentsFileDigests.size()) {
          attachmentsFileDigests.getString(i)?.let { digestsList.add(it) }
        }
        val asset = node.issueassetuda(SdkIssueAssetUdaRequest(
          ticker = ticker,
          name = name,
          details = details,
          precision = precision.toLong().toUByte(),
          mediaFileDigest = mediaFileDigest,
          attachmentsFileDigests = digestsList
        ))
        withContext(Dispatchers.Main) { promise.resolve(rlnAssetUdaToMap(asset)) }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  companion object {
    const val NAME = "Rgb"
  }

  private suspend fun resolvePromise(promise: Promise, result: String) {
    withContext(Dispatchers.Main) {
      promise.resolve(result)
    }
  }

  private fun serializeBalance(b: AssetBalanceInfo): WritableMap {
    val m = Arguments.createMap()
    m.putDouble("settled", b.settled.toDouble())
    m.putDouble("future", b.future.toDouble())
    m.putDouble("spendable", b.spendable.toDouble())
    m.putDouble("offchainOutbound", b.offchainOutbound.toDouble())
    m.putDouble("offchainInbound", b.offchainInbound.toDouble())
    return m
  }

  private fun serializeAssetNia(a: AssetNia): WritableMap {
    val m = Arguments.createMap()
    m.putString("assetId", a.assetId)
    m.putString("ticker", a.ticker)
    m.putString("name", a.name)
    a.details?.let { m.putString("details", it) }
    m.putDouble("precision", a.precision.toDouble())
    m.putDouble("issuedSupply", a.issuedSupply.toDouble())
    m.putDouble("timestamp", a.timestamp.toDouble())
    m.putDouble("addedAt", a.addedAt.toDouble())
    m.putMap("balance", serializeBalance(a.balance))
    return m
  }

  private fun serializeAssetCfa(a: AssetCfa): WritableMap {
    val m = Arguments.createMap()
    m.putString("assetId", a.assetId)
    m.putString("name", a.name)
    a.details?.let { m.putString("details", it) }
    m.putDouble("precision", a.precision.toDouble())
    m.putDouble("issuedSupply", a.issuedSupply.toDouble())
    m.putDouble("timestamp", a.timestamp.toDouble())
    m.putDouble("addedAt", a.addedAt.toDouble())
    m.putMap("balance", serializeBalance(a.balance))
    return m
  }

  private fun serializeAssetIfa(a: AssetIfa): WritableMap {
    val m = Arguments.createMap()
    m.putString("assetId", a.assetId)
    m.putString("ticker", a.ticker)
    m.putString("name", a.name)
    a.details?.let { m.putString("details", it) }
    m.putDouble("precision", a.precision.toDouble())
    m.putDouble("initialSupply", a.initialSupply.toDouble())
    m.putDouble("maxSupply", a.maxSupply.toDouble())
    m.putDouble("knownCirculatingSupply", a.knownCirculatingSupply.toDouble())
    m.putDouble("timestamp", a.timestamp.toDouble())
    m.putDouble("addedAt", a.addedAt.toDouble())
    m.putMap("balance", serializeBalance(a.balance))
    a.rejectListUrl?.let { m.putString("rejectListUrl", it) }
    return m
  }

  private fun serializeAssetUda(a: AssetUda): WritableMap {
    val m = Arguments.createMap()
    m.putString("assetId", a.assetId)
    m.putString("ticker", a.ticker)
    m.putString("name", a.name)
    a.details?.let { m.putString("details", it) }
    m.putDouble("precision", a.precision.toDouble())
    m.putDouble("timestamp", a.timestamp.toDouble())
    m.putDouble("addedAt", a.addedAt.toDouble())
    m.putMap("balance", serializeBalance(a.balance))
    return m
  }

  private fun getErrorClassName(exception: Exception): String {
    val className = exception.javaClass.name
    // Handle nested classes (separated by $)
    val parts = className.split('$')
    // Take the last part and split by . to get simple name
    val lastPart = parts.last().split('.').last()
    return lastPart
  }

  private fun parseErrorMessage(message: String?): String {
    if (message == null) return "Unknown error"
    // Remove "details=" prefix if present
    return if (message.startsWith("details=", ignoreCase = true)) {
      message.substring(8).trim()
    } else {
      message
    }
  }

  private fun isConflictLike(error: Throwable): Boolean {
    val loweredMessage = (error.message ?: "").lowercase()
    return loweredMessage.contains("conflict")
  }

  private fun isPoisonError(error: Throwable): Boolean {
    val loweredMessage = (error.message ?: "").lowercase()
    return loweredMessage.contains("poisonerror") || loweredMessage.contains("poison error")
  }

  private suspend fun probeNodeReady(
    node: SdkNode,
    attempts: Int,
    delayMs: Long
  ): Boolean {
    repeat(attempts) { index ->
      try {
        val info = node.nodeInfo()
        if (info.pubkey.isNotBlank()) {
          return true
        }
      } catch (_: Exception) {
        // Keep polling through transient transition states.
      }
      if (index < attempts - 1) {
        delay(delayMs)
      }
    }
    return false
  }

  private fun rlnAssetBalanceInfoToMap(balance: org.utexo.rgblightningnode.AssetBalanceInfo): WritableMap {
    val map = Arguments.createMap()
    map.putDouble("settled", balance.settled.toDouble())
    map.putDouble("future", balance.future.toDouble())
    map.putDouble("spendable", balance.spendable.toDouble())
    map.putDouble("offchainOutbound", balance.offchainOutbound.toDouble())
    map.putDouble("offchainInbound", balance.offchainInbound.toDouble())
    return map
  }

  private fun rlnMediaToMap(media: org.utexo.rgblightningnode.Media): WritableMap {
    val map = Arguments.createMap()
    map.putString("filePath", media.filePath)
    map.putString("mime", media.mime)
    map.putString("digest", media.digest)
    return map
  }

  private fun rlnAssetNiaToMap(asset: org.utexo.rgblightningnode.AssetNia): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("ticker", asset.ticker)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("issuedSupply", asset.issuedSupply.toDouble())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", rlnAssetBalanceInfoToMap(asset.balance))
    asset.media?.let { map.putMap("media", rlnMediaToMap(it)) }
    return map
  }

  private fun rlnAssetCfaToMap(asset: org.utexo.rgblightningnode.AssetCfa): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("issuedSupply", asset.issuedSupply.toDouble())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", rlnAssetBalanceInfoToMap(asset.balance))
    asset.media?.let { map.putMap("media", rlnMediaToMap(it)) }
    return map
  }

  private fun rlnAssetIfaToMap(asset: org.utexo.rgblightningnode.AssetIfa): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("ticker", asset.ticker)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("initialSupply", asset.initialSupply.toDouble())
    map.putDouble("maxSupply", asset.maxSupply.toDouble())
    map.putDouble("knownCirculatingSupply", asset.knownCirculatingSupply.toDouble())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", rlnAssetBalanceInfoToMap(asset.balance))
    asset.media?.let { map.putMap("media", rlnMediaToMap(it)) }
    asset.rejectListUrl?.let { map.putString("rejectListUrl", it) }
    return map
  }

  private fun rlnAssetUdaToMap(asset: org.utexo.rgblightningnode.AssetUda): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("ticker", asset.ticker)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", rlnAssetBalanceInfoToMap(asset.balance))
    asset.token?.let { tokenLight ->
      val token = Arguments.createMap()
      token.putInt("index", tokenLight.index.toInt())
      tokenLight.ticker?.let { token.putString("ticker", it) }
      tokenLight.name?.let { token.putString("name", it) }
      tokenLight.details?.let { token.putString("details", it) }
      token.putBoolean("embeddedMedia", tokenLight.embeddedMedia)
      tokenLight.media?.let { token.putMap("media", rlnMediaToMap(it)) }
      val attachmentsArray = Arguments.createArray()
      tokenLight.attachments.forEach { (key, media) ->
        val attachmentMap = Arguments.createMap()
        attachmentMap.putInt("key", key.toInt())
        attachmentMap.putString("filePath", media.filePath)
        attachmentMap.putString("mime", media.mime)
        attachmentMap.putString("digest", media.digest)
        attachmentsArray.pushMap(attachmentMap)
      }
      token.putArray("attachments", attachmentsArray)
      token.putBoolean("reserves", tokenLight.reserves)
      map.putMap("token", token)
    }
    return map
  }

}