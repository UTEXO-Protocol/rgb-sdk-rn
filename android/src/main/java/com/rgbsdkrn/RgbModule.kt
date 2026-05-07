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
import com.utexo.AssetSchema
import com.utexo.Assignment
import com.utexo.BitcoinNetwork
import com.utexo.DatabaseType
import com.utexo.RefreshFilter
import com.utexo.Recipient
import com.utexo.RefreshTransferStatus
import com.utexo.Wallet
import com.utexo.WalletData
import com.utexo.WitnessData
import com.utexo.generateKeys
import com.utexo.restoreKeys
import com.utexo.VssBackupConfig
import com.utexo.VssBackupClient
import com.utexo.VssBackupMode
import com.utexo.restoreFromVss as nativeRestoreFromVss
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.utexo.Token
import com.utexo.Invoice
import com.utexo.SinglesigKeys
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
import org.utexo.rgblightningnode.RgbRecipient
import org.utexo.rgblightningnode.SendRgbRequest
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
    ldkInboundPaymentKeyHex: String,
    ldkPeerStorageKeyHex: String,
    ldkReceiveAuthKeyHex: String,
    asyncPaymentsRootSeedHex: String,
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
            apiLevel = apiLevel.toInt().toUInt(),
            ldkInboundPaymentKeyHex = ldkInboundPaymentKeyHex,
            ldkPeerStorageKeyHex = ldkPeerStorageKeyHex,
            ldkReceiveAuthKeyHex = ldkReceiveAuthKeyHex,
            asyncPaymentsRootSeedHex = asyncPaymentsRootSeedHex
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
        map.putString("value", res.toString())
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
        transfers.forEach { transfer ->
          val map = Arguments.createMap()
          map.putInt("idx", transfer.idx)
          map.putString("status", transfer.status.toString())
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
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val node = RlnNodeStore.get(nodeId.toInt())
          ?: throw IllegalStateException("RLN node with id $nodeId not found")
        val endpoints = (0 until transportEndpoints.size()).map { transportEndpoints.getString(it) ?: "" }
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
                    witnessData = null,
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

  override fun generateKeys(bitcoinNetwork: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val network = when (bitcoinNetwork.lowercase()) {
          "mainnet" -> BitcoinNetwork.MAINNET
          "testnet" -> BitcoinNetwork.TESTNET
          "testnet4" -> BitcoinNetwork.TESTNET4
          "regtest" -> BitcoinNetwork.REGTEST
          "signet" -> BitcoinNetwork.SIGNET
          else -> throw IllegalArgumentException("Unknown BitcoinNetwork: $bitcoinNetwork")
        }

        val keys = generateKeys(bitcoinNetwork = network)
        val result = Arguments.createMap()
        result.putString("mnemonic", keys.mnemonic)
        result.putString("xpub", keys.xpub)
        result.putString("accountXpubVanilla", keys.accountXpubVanilla)
        result.putString("accountXpubColored", keys.accountXpubColored)
        result.putString("masterFingerprint", keys.masterFingerprint)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
      }
    }
  }

  override fun restoreKeys(bitcoinNetwork: String, mnemonic: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val network = when (bitcoinNetwork.lowercase()) {
          "mainnet" -> BitcoinNetwork.MAINNET
          "testnet" -> BitcoinNetwork.TESTNET
          "testnet4" -> BitcoinNetwork.TESTNET4
          "regtest" -> BitcoinNetwork.REGTEST
          "signet" -> BitcoinNetwork.SIGNET
          else -> throw IllegalArgumentException("Unknown BitcoinNetwork: $bitcoinNetwork")
        }
        val keys = restoreKeys(bitcoinNetwork = network, mnemonic = mnemonic)
        val result = Arguments.createMap()
        result.putString("mnemonic", keys.mnemonic)
        result.putString("xpub", keys.xpub)
        result.putString("accountXpubVanilla", keys.accountXpubVanilla)
        result.putString("accountXpubColored", keys.accountXpubColored)
        result.putString("masterFingerprint", keys.masterFingerprint)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
      }
    }
  }

  override fun restoreBackup(path: String, password: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val rgbDir = AppConstants.rgbDir
          ?: throw IllegalStateException("RGB directory not initialized.")
        com.utexo.restoreBackup(path, password, rgbDir.absolutePath)

        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "restoreBackup error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }
  
  override fun decodeInvoice(invoice: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val invoiceData = Invoice(invoiceString = invoice).invoiceData()
        val map = Arguments.createMap()
        map.putString("invoice", invoice)
        map.putString("recipientId", invoiceData.recipientId)
        invoiceData.assetSchema?.let { schema ->
          val assetSchemaString = when (schema) {
            AssetSchema.NIA -> "Nia"
            AssetSchema.UDA -> "Uda"
            AssetSchema.CFA -> "Cfa"
            AssetSchema.IFA -> "Ifa"
          }
          map.putString("assetSchema", assetSchemaString)
        }
        map.putString("assetId", invoiceData.assetId)
        map.putMap("assignment", assignmentToMap(invoiceData.assignment))
        map.putString("assignmentName", invoiceData.assignmentName)
        map.putString("network", networkToString(invoiceData.network))
        val transportEndpointsArray = Arguments.createArray()
        invoiceData.transportEndpoints.forEach {
          transportEndpointsArray.pushString(it)
        }
        map.putArray("transportEndpoints", transportEndpointsArray)

        invoiceData.expirationTimestamp?.let {
          map.putDouble("expirationTimestamp", it.toDouble())
        } ?: run {
          map.putNull("expirationTimestamp")
        }
        withContext(Dispatchers.Main) {
          promise.resolve(map)
        }
      } catch (e: Exception) {
        Log.e(TAG, "decodeInvoice error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  private fun getNetwork(network: String): BitcoinNetwork {
    return when (network.lowercase()) {
      "mainnet" -> BitcoinNetwork.MAINNET
      "testnet" -> BitcoinNetwork.TESTNET
      "testnet4" -> BitcoinNetwork.TESTNET4
      "regtest" -> BitcoinNetwork.REGTEST
      "signet" -> BitcoinNetwork.SIGNET
      else -> throw IllegalArgumentException("Unknown BitcoinNetwork: $network")
    }
  }

  private fun networkToString(network: BitcoinNetwork): String {
    return when (network) {
      BitcoinNetwork.MAINNET -> "mainnet"
      BitcoinNetwork.TESTNET -> "testnet"
      BitcoinNetwork.TESTNET4 -> "testnet4"
      BitcoinNetwork.REGTEST -> "regtest"
      BitcoinNetwork.SIGNET -> "signet"
      BitcoinNetwork.SIGNET_CUSTOM -> "signetCustom"
      else -> "regtest"
    }
  }

  private fun getAssetSchema(schema: String): AssetSchema {
    return when (schema) {
      "Nia" -> AssetSchema.NIA
      "Uda" -> AssetSchema.UDA
      "Cfa" -> AssetSchema.CFA
      "Ifa" -> AssetSchema.IFA
      // Backward compatibility with uppercase
      "NIA" -> AssetSchema.NIA
      "UDA" -> AssetSchema.UDA
      "CFA" -> AssetSchema.CFA
      "IFA" -> AssetSchema.IFA
      else -> throw IllegalArgumentException("Unknown AssetSchema: $schema")
    }
  }

  override fun initializeWallet(
    network: String,
    accountXpubVanilla: String,
    accountXpubColored: String,
    mnemonic: String,
    masterFingerprint: String,
    supportedSchemas: ReadableArray,
    maxAllocationsPerUtxo: Double,
    vanillaKeychain: Double,
    reuseAddresses: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val rgbDir = AppConstants.rgbDir
          ?: throw IllegalStateException("RGB directory not initialized. Call AppConstants.initContext() first.")

        val rgbNetwork = getNetwork(network)
        val networkDir = java.io.File(rgbDir, network.lowercase()).also { it.mkdirs() }
        val schemaList = mutableListOf<AssetSchema>()
        for (i in 0 until supportedSchemas.size()) {
          val schemaStr = supportedSchemas.getString(i)
          schemaList.add(getAssetSchema(schemaStr ?: throw IllegalArgumentException("Invalid schema at index $i")))
        }

        val singlesigKeys = SinglesigKeys(
          accountXpubVanilla = accountXpubVanilla,
          accountXpubColored = accountXpubColored,
          vanillaKeychain = vanillaKeychain.toLong().toUByte(),
          masterFingerprint = masterFingerprint,
          mnemonic = mnemonic
        )
        val walletData = WalletData(
          dataDir = networkDir.absolutePath,
          bitcoinNetwork = rgbNetwork,
          databaseType = DatabaseType.SQLITE,
          maxAllocationsPerUtxo = maxAllocationsPerUtxo.toLong().toUInt(),
          supportedSchemas = schemaList,
          reuseAddresses = reuseAddresses
        )
        val wallet = try {
          Wallet(walletData, singlesigKeys)
        } catch (e: Exception) {
          val msg = e.message.orEmpty()
          val isCorruptedStoreError =
            msg.contains("bincode error while reading entry", ignoreCase = true) ||
            msg.contains("failed to fill whole buffer", ignoreCase = true)

          if (!isCorruptedStoreError) {
            throw e
          }

          Log.w(
            TAG,
            "initializeWallet detected corrupted wallet store in ${networkDir.absolutePath}; clearing and retrying once"
          )
          networkDir.deleteRecursively()
          networkDir.mkdirs()
          Wallet(walletData, singlesigKeys)
        }
        val walletId = WalletStore.create(wallet)
        withContext(Dispatchers.Main) {
          promise.resolve(walletId)
        }
      } catch (e: Exception) {
        Log.e(TAG, "initializeWallet error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun goOnline(
    walletId: Double,
    skipConsistencyCheck: Boolean,
    indexerUrl: String,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.wallet.goOnline(
          skipConsistencyCheck = skipConsistencyCheck,
          indexerUrl = indexerUrl
        )
        WalletStore.setOnline(walletId.toInt(), online)

        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "goOnline error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getBtcBalance(
    walletId: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val btcBalance = session.wallet.getBtcBalance(
          online = session.online,
          skipSync = skipSync
        )

        val result = Arguments.createMap()

        val vanilla = Arguments.createMap()
        vanilla.putDouble("settled", btcBalance.vanilla.settled.toDouble())
        vanilla.putDouble("future", btcBalance.vanilla.future.toDouble())
        vanilla.putDouble("spendable", btcBalance.vanilla.spendable.toDouble())

        val colored = Arguments.createMap()
        colored.putDouble("settled", btcBalance.colored.settled.toDouble())
        colored.putDouble("future", btcBalance.colored.future.toDouble())
        colored.putDouble("spendable", btcBalance.colored.spendable.toDouble())

        result.putMap("vanilla", vanilla)
        result.putMap("colored", colored)

        withContext(Dispatchers.Main) {
          promise.resolve(result)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getBtcBalance error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun walletClose(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        WalletStore.remove(walletId.toInt())
        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "walletClose error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  // Helper functions for type conversions
  private fun getAssignment(assignmentMap: ReadableMap): Assignment {
    val type = assignmentMap.getString("type") ?: throw IllegalArgumentException("Assignment type is required")
    return when (type) {
      "Fungible" -> {
        val amount = assignmentMap.getDouble("amount").toULong()
        Assignment.Fungible(amount)
      }
      "NonFungible" -> Assignment.NonFungible
      "InflationRight" -> {
        val amount = assignmentMap.getDouble("amount").toULong()
        Assignment.InflationRight(amount)
      }
      "Any" -> Assignment.Any
      else -> throw IllegalArgumentException("Unknown Assignment type: $type")
    }
  }

  private fun getRefreshFilter(filterMap: ReadableMap): RefreshFilter {
    val statusStr = filterMap.getString("status") ?: throw IllegalArgumentException("RefreshFilter status is required")
    val status = when (statusStr) {
      "WaitingCounterparty" -> RefreshTransferStatus.WAITING_COUNTERPARTY
      "WaitingConfirmations" -> RefreshTransferStatus.WAITING_CONFIRMATIONS
      else -> throw IllegalArgumentException("Unknown RefreshTransferStatus: $statusStr")
    }
    val incoming = filterMap.getBoolean("incoming")
    return RefreshFilter(status, incoming)
  }

  private fun getRecipient(recipientMap: ReadableMap): Recipient {
    val recipientId = recipientMap.getString("recipientId") ?: throw IllegalArgumentException("Recipient recipientId is required")
    val assignmentMap = recipientMap.getMap("assignment") ?: throw IllegalArgumentException("Recipient assignment is required")
    val assignment = getAssignment(assignmentMap)

    val transportEndpointsArray = recipientMap.getArray("transportEndpoints") ?: throw IllegalArgumentException("Recipient transportEndpoints is required")
    val transportEndpoints = mutableListOf<String>()
    for (i in 0 until transportEndpointsArray.size()) {
      transportEndpoints.add(transportEndpointsArray.getString(i) ?: "")
    }

    val witnessData = if (recipientMap.hasKey("witnessData") && recipientMap.getType("witnessData") == ReadableType.Map) {
      val witnessDataMap = recipientMap.getMap("witnessData")
        ?: throw IllegalArgumentException("WitnessData map is null")

      val amountSat = witnessDataMap.getDouble("amountSat").toULong()
      val blinding = if (witnessDataMap.hasKey("blinding") && !witnessDataMap.isNull("blinding")) {
        witnessDataMap.getDouble("blinding").toULong()
      } else {
        null
      }

      WitnessData(amountSat, blinding)
    } else {
      null
    }

    return Recipient(recipientId, witnessData, assignment, transportEndpoints)
  }

  private fun assignmentToMap(assignment: Assignment): WritableMap {
    val map = Arguments.createMap()
    when (assignment) {
      is Assignment.Fungible -> {
        map.putString("type", "Fungible")
        map.putDouble("amount", assignment.amount.toDouble())
      }
      is Assignment.NonFungible -> {
        map.putString("type", "NonFungible")
      }
      is Assignment.InflationRight -> {
        map.putString("type", "InflationRight")
        map.putDouble("amount", assignment.amount.toDouble())
      }
      is Assignment.Any -> {
        map.putString("type", "Any")
      }
    }
    return map
  }

  private fun outpointToMap(outpoint: com.utexo.Outpoint): WritableMap {
    val map = Arguments.createMap()
    map.putString("txid", outpoint.txid)
    map.putDouble("vout", outpoint.vout.toDouble())
    return map
  }

  private fun balanceToMap(balance: com.utexo.Balance): WritableMap {
    val map = Arguments.createMap()
    map.putDouble("settled", balance.settled.toDouble())
    map.putDouble("future", balance.future.toDouble())
    map.putDouble("spendable", balance.spendable.toDouble())
    return map
  }

  private fun assetCfaToMap(asset: com.utexo.AssetCfa): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("issuedSupply", asset.issuedSupply.toDouble())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", balanceToMap(asset.balance))
    asset.media?.let { media ->
      val mediaMap = Arguments.createMap()
      mediaMap.putString("filePath", media.filePath)
      mediaMap.putString("mime", media.mime)
      mediaMap.putString("digest", media.digest)
      map.putMap("media", mediaMap)
    }
    return map
  }

  private fun assetIfaToMap(asset: com.utexo.AssetIfa): WritableMap {
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
    map.putMap("balance", balanceToMap(asset.balance))
    asset.media?.let { media ->
      val mediaMap = Arguments.createMap()
      mediaMap.putString("filePath", media.filePath)
      mediaMap.putString("mime", media.mime)
      mediaMap.putString("digest", media.digest)
      map.putMap("media", mediaMap)
    }
    asset.rejectListUrl?.let { map.putString("rejectListUrl", it) }
    return map
  }

  private fun assetNiaToMap(asset: com.utexo.AssetNia): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("ticker", asset.ticker)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("issuedSupply", asset.issuedSupply.toDouble())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", balanceToMap(asset.balance))
    asset.media?.let { media ->
      val mediaMap = Arguments.createMap()
      mediaMap.putString("filePath", media.filePath)
      mediaMap.putString("mime", media.mime)
      mediaMap.putString("digest", media.digest)
      map.putMap("media", mediaMap)
    }
    return map
  }

  private fun assetUdaToMap(asset: com.utexo.AssetUda): WritableMap {
    val map = Arguments.createMap()
    map.putString("assetId", asset.assetId)
    map.putString("ticker", asset.ticker)
    map.putString("name", asset.name)
    asset.details?.let { map.putString("details", it) }
    map.putInt("precision", asset.precision.toInt())
    map.putDouble("timestamp", asset.timestamp.toDouble())
    map.putDouble("addedAt", asset.addedAt.toDouble())
    map.putMap("balance", balanceToMap(asset.balance))
    asset.token?.let { tokenLight ->
      val token = Arguments.createMap()
      token.putInt("index", tokenLight.index.toInt())
      tokenLight.ticker?.let { token.putString("ticker", it) }
      tokenLight.name?.let { token.putString("name", it) }
      tokenLight.details?.let { token.putString("details", it) }
      token.putBoolean("embeddedMedia", tokenLight.embeddedMedia)

      tokenLight.media?.let { media ->
        val mediaMap = Arguments.createMap()
        mediaMap.putString("filePath", media.filePath)
        mediaMap.putString("mime", media.mime)
        mediaMap.putString("digest", media.digest)
        token.putMap("media", mediaMap)
      }

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

  private fun operationResultToMap(result: com.utexo.OperationResult): WritableMap {
    val map = Arguments.createMap()
    map.putString("txid", result.txid)
    map.putInt("batchTransferIdx", result.batchTransferIdx)
    return map
  }

  private fun receiveDataToMap(data: com.utexo.ReceiveData): WritableMap {
    val map = Arguments.createMap()
    map.putString("invoice", data.invoice)
    map.putString("recipientId", data.recipientId)
    data.expirationTimestamp?.let { map.putDouble("expirationTimestamp", it.toDouble()) }
    map.putInt("batchTransferIdx", data.batchTransferIdx)
    return map
  }

  // Wallet methods
  override fun backup(walletId: Double, backupPath: String, password: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        session.wallet.backup(backupPath, password)

        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "backup error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun backupInfo(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val hasBackup = session.wallet.backupInfo()

        withContext(Dispatchers.Main) {
          promise.resolve(hasBackup)
        }
      } catch (e: Exception) {
        Log.e(TAG, "backupInfo error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun blindReceive(
    walletId: Double,
    assetId: String?,
    assignment: ReadableMap,
    expirationTimestamp: Double?,
    transportEndpoints: ReadableArray,
    minConfirmations: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val assignmentObj = getAssignment(assignment)
        val endpoints = mutableListOf<String>()
        for (i in 0 until transportEndpoints.size()) {
          endpoints.add(transportEndpoints.getString(i) ?: "")
        }

        val receiveData = session.wallet.blindReceive(
          assetId,
          assignmentObj,
          expirationTimestamp?.toLong()?.toULong(),
          endpoints,
          minConfirmations.toLong().toUByte()
        )

        withContext(Dispatchers.Main) {
          promise.resolve(receiveDataToMap(receiveData))
        }
      } catch (e: Exception) {
        Log.e(TAG, "blindReceive error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun createUtxos(
    walletId: Double,
    upTo: Boolean,
    num: Double?,
    size: Double?,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val count = session.wallet.createUtxos(
          online,
          upTo,
          num?.toLong()?.toUByte(),
          size?.toLong()?.toUInt(),
          feeRate.toULong(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(count.toInt())
        }
      } catch (e: Exception) {
        Log.e(TAG, "createUtxos error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun createUtxosBegin(
    walletId: Double,
    upTo: Boolean,
    num: Double?,
    size: Double?,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val psbt = session.wallet.createUtxosBegin(
          online,
          upTo,
          num?.toLong()?.toUByte(),
          size?.toLong()?.toUInt(),
          feeRate.toULong(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(psbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "createUtxosBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun createUtxosEnd(
    walletId: Double,
    signedPsbt: String,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val count = session.wallet.createUtxosEnd(online, signedPsbt, skipSync)

        withContext(Dispatchers.Main) {
          promise.resolve(count.toInt())
        }
      } catch (e: Exception) {
        Log.e(TAG, "createUtxosEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun deleteTransfers(
    walletId: Double,
    batchTransferIdx: Double?,
    noAssetOnly: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val deleted = session.wallet.deleteTransfers(
          batchTransferIdx?.toInt(),
          noAssetOnly
        )

        withContext(Dispatchers.Main) {
          promise.resolve(deleted)
        }
      } catch (e: Exception) {
        Log.e(TAG, "deleteTransfers error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun drainTo(
    walletId: Double,
    address: String,
    destroyAssets: Boolean,
    feeRate: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val txid = session.wallet.drainTo(online, address, destroyAssets, feeRate.toULong())

        withContext(Dispatchers.Main) {
          promise.resolve(txid)
        }
      } catch (e: Exception) {
        Log.e(TAG, "drainTo error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun drainToBegin(
    walletId: Double,
    address: String,
    destroyAssets: Boolean,
    feeRate: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val psbt = session.wallet.drainToBegin(online, address, destroyAssets, feeRate.toULong())

        withContext(Dispatchers.Main) {
          promise.resolve(psbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "drainToBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun drainToEnd(
    walletId: Double,
    signedPsbt: String,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val txid = session.wallet.drainToEnd(online, signedPsbt)

        withContext(Dispatchers.Main) {
          promise.resolve(txid)
        }
      } catch (e: Exception) {
        Log.e(TAG, "drainToEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun failTransfers(
    walletId: Double,
    batchTransferIdx: Double?,
    noAssetOnly: Boolean,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val failed = session.wallet.failTransfers(
          online,
          batchTransferIdx?.toInt(),
          noAssetOnly,
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(failed)
        }
      } catch (e: Exception) {
        Log.e(TAG, "failTransfers error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun finalizePsbt(walletId: Double, signedPsbt: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val finalizedPsbt = session.wallet.finalizePsbt(signedPsbt)

        withContext(Dispatchers.Main) {
          promise.resolve(finalizedPsbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "finalizePsbt error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getAddress(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val address = session.wallet.getAddress()

        withContext(Dispatchers.Main) {
          promise.resolve(address)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getAddress error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rotateVanillaAddress(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val address = session.wallet.rotateVanillaAddress()

        withContext(Dispatchers.Main) {
          promise.resolve(address)
        }
      } catch (e: Exception) {
        Log.e(TAG, "rotateVanillaAddress error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun rotateColoredAddress(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val address = session.wallet.rotateColoredAddress()

        withContext(Dispatchers.Main) {
          promise.resolve(address)
        }
      } catch (e: Exception) {
        Log.e(TAG, "rotateColoredAddress error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }



  override fun getAssetBalance(walletId: Double, assetId: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val balance = session.wallet.getAssetBalance(assetId)

        withContext(Dispatchers.Main) {
          promise.resolve(balanceToMap(balance))
        }
      } catch (e: Exception) {
        Log.e(TAG, "getAssetBalance error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getAssetMetadata(walletId: Double, assetId: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val metadata = session.wallet.getAssetMetadata(assetId)
        val map = Arguments.createMap()
        map.putString("assetId", assetId)
        val assetSchemaString = when (metadata.assetSchema) {
          AssetSchema.NIA -> "Nia"
          AssetSchema.UDA -> "Uda"
          AssetSchema.CFA -> "Cfa"
          AssetSchema.IFA -> "Ifa"
        }
        map.putString("assetSchema", assetSchemaString)
        map.putString("name", metadata.name)
        map.putInt("precision", metadata.precision.toInt())
        map.putDouble("initialSupply", metadata.initialSupply.toDouble())
        map.putDouble("maxSupply", metadata.maxSupply.toDouble())
        map.putDouble("knownCirculatingSupply", metadata.knownCirculatingSupply.toDouble())
        map.putDouble("timestamp", metadata.timestamp.toDouble())
        metadata.ticker?.let { map.putString("ticker", it) }
        metadata.details?.let { map.putString("details", it) }
        metadata.rejectListUrl?.let { map.putString("rejectListUrl", it) }
        metadata.token?.let { token ->
          val tokenMap = Arguments.createMap()
          tokenMap.putInt("index", token.index.toInt())
          token.ticker?.let { tokenMap.putString("ticker", it) }
          token.name?.let { tokenMap.putString("name", it) }
          token.details?.let { tokenMap.putString("details", it) }
          token.embeddedMedia?.let { embeddedMedia ->
            val embeddedMediaMap = Arguments.createMap()
            embeddedMediaMap.putString("mime", embeddedMedia.mime)
            val dataArray = Arguments.createArray()
            embeddedMedia.data.forEach { dataArray.pushInt(it.toInt()) }
            embeddedMediaMap.putArray("data", dataArray)
            tokenMap.putMap("embeddedMedia", embeddedMediaMap)
          }
          token.media?.let { media ->
            val mediaMap = Arguments.createMap()
            mediaMap.putString("filePath", media.filePath)
            mediaMap.putString("mime", media.mime)
            mediaMap.putString("digest", media.digest)
            tokenMap.putMap("media", mediaMap)
          }
          val attachmentsArray = Arguments.createArray()
          token.attachments.forEach { (key, media) ->
            val attachmentMap = Arguments.createMap()
            attachmentMap.putInt("key", key.toInt())
            attachmentMap.putString("filePath", media.filePath)
            attachmentMap.putString("mime", media.mime)
            attachmentMap.putString("digest", media.digest)
            attachmentsArray.pushMap(attachmentMap)
          }
          tokenMap.putArray("attachments", attachmentsArray)
          token.reserves?.let { reserves ->
            val reservesMap = Arguments.createMap()
            val utxoMap = Arguments.createMap()
            utxoMap.putString("txid", reserves.utxo.txid)
            utxoMap.putDouble("vout", reserves.utxo.vout.toDouble())
            reservesMap.putMap("utxo", utxoMap)
            val proofArray = Arguments.createArray()
            reserves.proof.forEach { proofArray.pushInt(it.toInt()) }
            reservesMap.putArray("proof", proofArray)
            tokenMap.putMap("reserves", reservesMap)
          }
          map.putMap("token", tokenMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(map)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getAssetMetadata error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getFeeEstimation(
    walletId: Double,
    blocks: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val feeRate = session.wallet.getFeeEstimation(online, blocks.toInt().toUShort())

        withContext(Dispatchers.Main) {
          promise.resolve(feeRate)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getFeeEstimation error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getMediaDir(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val mediaDir = session.wallet.getMediaDir()

        withContext(Dispatchers.Main) {
          promise.resolve(mediaDir)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getMediaDir error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getWalletData(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val walletData = session.wallet.getWalletData()
        val keys = session.wallet.getKeys()
        val map = Arguments.createMap()
        map.putString("dataDir", walletData.dataDir)

        val networkString = when (walletData.bitcoinNetwork) {
          BitcoinNetwork.MAINNET -> "mainnet"
          BitcoinNetwork.TESTNET -> "testnet"
          BitcoinNetwork.TESTNET4 -> "testnet4"
          BitcoinNetwork.REGTEST -> "regtest"
          BitcoinNetwork.SIGNET -> "signet"
          BitcoinNetwork.SIGNET_CUSTOM -> "signetCustom"
          else -> {
            throw Exception("Unknown bitcoin network")
          }
        }
        map.putString("bitcoinNetwork", networkString)

        val dbTypeString = when (walletData.databaseType) {
          DatabaseType.SQLITE -> "SQLITE"
        }
        map.putString("databaseType", dbTypeString)

        map.putDouble("maxAllocationsPerUtxo", walletData.maxAllocationsPerUtxo.toDouble())
        map.putString("accountXpubVanilla", keys.accountXpubVanilla)
        map.putString("accountXpubColored", keys.accountXpubColored)
        keys.mnemonic?.let { map.putString("mnemonic", it) }
        map.putString("masterFingerprint", keys.masterFingerprint)
        keys.vanillaKeychain?.let { map.putInt("vanillaKeychain", it.toInt()) }
        val schemasArray = Arguments.createArray()
        walletData.supportedSchemas.forEach { schema ->
          val schemaString = when (schema) {
            AssetSchema.NIA -> "NIA"
            AssetSchema.UDA -> "UDA"
            AssetSchema.CFA -> "CFA"
            AssetSchema.IFA -> "IFA"
          }
          schemasArray.pushString(schemaString)
        }
        map.putArray("supportedSchemas", schemasArray)

        withContext(Dispatchers.Main) {
          promise.resolve(map)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getWalletData error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun getWalletDir(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val walletDir = session.wallet.getWalletDir()

        withContext(Dispatchers.Main) {
          promise.resolve(walletDir)
        }
      } catch (e: Exception) {
        Log.e(TAG, "getWalletDir error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun inflate(
    walletId: Double,
    assetId: String,
    inflationAmounts: ReadableArray,
    feeRate: Double,
    minConfirmations: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val amounts = mutableListOf<ULong>()
        for (i in 0 until inflationAmounts.size()) {
          amounts.add(inflationAmounts.getDouble(i).toULong())
        }

        val result = session.wallet.inflate(
          online,
          assetId,
          amounts,
          feeRate.toULong(),
          minConfirmations.toLong().toUByte()
        )

        withContext(Dispatchers.Main) {
          promise.resolve(operationResultToMap(result))
        }
      } catch (e: Exception) {
        Log.e(TAG, "inflate error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun inflateBegin(
    walletId: Double,
    assetId: String,
    inflationAmounts: ReadableArray,
    feeRate: Double,
    minConfirmations: Double,
    dryRun: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val amounts = mutableListOf<ULong>()
        for (i in 0 until inflationAmounts.size()) {
          amounts.add(inflationAmounts.getDouble(i).toULong())
        }

        val inflateBeginResult = session.wallet.inflateBegin(
          online,
          assetId,
          amounts,
          feeRate.toULong(),
          minConfirmations.toLong().toUByte(),
          dryRun
        )

        val map = Arguments.createMap()
        map.putString("psbt", inflateBeginResult.psbt)
        inflateBeginResult.batchTransferIdx?.let { map.putInt("batchTransferIdx", it) } ?: map.putNull("batchTransferIdx")
        val details = Arguments.createMap()
        details.putString("fasciaPath", inflateBeginResult.details.fasciaPath)
        details.putInt("minConfirmations", inflateBeginResult.details.minConfirmations.toInt())
        details.putDouble("entropy", inflateBeginResult.details.entropy.toDouble())
        map.putMap("details", details)

        withContext(Dispatchers.Main) {
          promise.resolve(map)
        }
      } catch (e: Exception) {
        Log.e(TAG, "inflateBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun inflateEnd(
    walletId: Double,
    signedPsbt: String,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val result = session.wallet.inflateEnd(online, signedPsbt)

        withContext(Dispatchers.Main) {
          promise.resolve(operationResultToMap(result))
        }
      } catch (e: Exception) {
        Log.e(TAG, "inflateEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun issueAssetCfa(
    walletId: Double,
    name: String,
    details: String?,
    precision: Double,
    amounts: ReadableArray,
    filePath: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val amountsList = mutableListOf<ULong>()
        for (i in 0 until amounts.size()) {
          amountsList.add(amounts.getDouble(i).toULong())
        }

        val asset = session.wallet.issueAssetCfa(
          name,
          details,
          precision.toLong().toUByte(),
          amountsList,
          filePath
        )

        withContext(Dispatchers.Main) {
          promise.resolve(assetCfaToMap(asset))
        }
      } catch (e: Exception) {
        Log.e(TAG, "issueAssetCfa error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun issueAssetIfa(
    walletId: Double,
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
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val amountsList = mutableListOf<ULong>()
        for (i in 0 until amounts.size()) {
          amountsList.add(amounts.getDouble(i).toULong())
        }

        val inflationAmountsList = mutableListOf<ULong>()
        for (i in 0 until inflationAmounts.size()) {
          inflationAmountsList.add(inflationAmounts.getDouble(i).toULong())
        }

        val asset = session.wallet.issueAssetIfa(
          ticker,
          name,
          precision.toLong().toUByte(),
          amountsList,
          inflationAmountsList,
          rejectListUrl
        )

        withContext(Dispatchers.Main) {
          promise.resolve(assetIfaToMap(asset))
        }
      } catch (e: Exception) {
        Log.e(TAG, "issueAssetIfa error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun issueAssetNia(
    walletId: Double,
    ticker: String,
    name: String,
    precision: Double,
    amounts: ReadableArray,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val amountsList = mutableListOf<ULong>()
        for (i in 0 until amounts.size()) {
          amountsList.add(amounts.getDouble(i).toULong())
        }

        val asset = session.wallet.issueAssetNia(
          ticker,
          name,
          precision.toLong().toUByte(),
          amountsList
        )

        withContext(Dispatchers.Main) {
          promise.resolve(assetNiaToMap(asset))
        }
      } catch (e: Exception) {
        Log.e(TAG, "issueAssetNia error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun issueAssetUda(
    walletId: Double,
    ticker: String,
    name: String,
    details: String?,
    precision: Double,
    mediaFilePath: String?,
    attachmentsFilePaths: ReadableArray,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val attachmentsList = mutableListOf<String>()
        for (i in 0 until attachmentsFilePaths.size()) {
          attachmentsList.add(attachmentsFilePaths.getString(i) ?: "")
        }

        val asset = session.wallet.issueAssetUda(
          ticker,
          name,
          details,
          precision.toLong().toUByte(),
          mediaFilePath,
          attachmentsList
        )

        withContext(Dispatchers.Main) {
          promise.resolve(assetUdaToMap(asset))
        }
      } catch (e: Exception) {
        Log.e(TAG, "issueAssetUda error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun listAssets(
    walletId: Double,
    filterAssetSchemas: ReadableArray,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val schemaList = mutableListOf<AssetSchema>()
        for (i in 0 until filterAssetSchemas.size()) {
          val schemaStr = filterAssetSchemas.getString(i)
          schemaList.add(getAssetSchema(schemaStr ?: ""))
        }

        val assets = session.wallet.listAssets(schemaList)
        val result = Arguments.createMap()

        val niaArray = Arguments.createArray()
        assets.nia?.forEach { asset ->
          niaArray.pushMap(assetNiaToMap(asset))
        }
        result.putArray("nia", niaArray)

        val udaArray = Arguments.createArray()
        assets.uda?.forEach { asset ->
          udaArray.pushMap(assetUdaToMap(asset))
        }
        result.putArray("uda", udaArray)

        val cfaArray = Arguments.createArray()
        assets.cfa?.forEach { asset ->
          cfaArray.pushMap(assetCfaToMap(asset))
        }
        result.putArray("cfa", cfaArray)

        val ifaArray = Arguments.createArray()
        assets.ifa?.forEach { asset ->
          ifaArray.pushMap(assetIfaToMap(asset))
        }
        result.putArray("ifa", ifaArray)

        withContext(Dispatchers.Main) {
          promise.resolve(result)
        }
      } catch (e: Exception) {
        Log.e(TAG, "listAssets error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun listTransactions(
    walletId: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online

        val transactions = session.wallet.listTransactions(online, skipSync)
        val transactionsArray = Arguments.createArray()

        transactions.forEach { tx ->
          val txMap = Arguments.createMap()
          val txTypeString = when (tx.transactionType) {
            com.utexo.TransactionType.RGB_SEND -> "RgbSend"
            com.utexo.TransactionType.DRAIN -> "Drain"
            com.utexo.TransactionType.CREATE_UTXOS -> "CreateUtxos"
            com.utexo.TransactionType.USER -> "User"
          }
          txMap.putString("transactionType", txTypeString)
          txMap.putString("txid", tx.txid)
          txMap.putDouble("received", tx.received.toDouble())
          txMap.putDouble("sent", tx.sent.toDouble())
          txMap.putDouble("fee", tx.fee.toDouble())
          tx.confirmationTime?.let { blockTime ->
            txMap.putDouble("confirmationTime", blockTime.timestamp.toDouble())
          }
          transactionsArray.pushMap(txMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(transactionsArray)
        }
      } catch (e: Exception) {
        Log.e(TAG, "listTransactions error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun listTransfers(
    walletId: Double,
    assetId: String?,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val transfers = session.wallet.listTransfers(assetId)
        val transfersArray = Arguments.createArray()

        transfers.forEach { transfer ->
          val transferMap = Arguments.createMap()
          transferMap.putInt("idx", transfer.idx)
          transferMap.putInt("batchTransferIdx", transfer.batchTransferIdx)
          transferMap.putDouble("createdAt", transfer.createdAt.toDouble())
          transferMap.putDouble("updatedAt", transfer.updatedAt.toDouble())

          val kindString = when (transfer.kind) {
            com.utexo.TransferKind.ISSUANCE -> "Issuance"
            com.utexo.TransferKind.RECEIVE_BLIND -> "ReceiveBlind"
            com.utexo.TransferKind.RECEIVE_WITNESS -> "ReceiveWitness"
            com.utexo.TransferKind.SEND -> "Send"
            com.utexo.TransferKind.INFLATION -> "Inflation"
          }
          transferMap.putString("kind", kindString)

          val statusString = when (transfer.status) {
            com.utexo.TransferStatus.INITIATED -> "Initiated"
            com.utexo.TransferStatus.WAITING_COUNTERPARTY -> "WaitingCounterparty"
            com.utexo.TransferStatus.WAITING_CONFIRMATIONS -> "WaitingConfirmations"
            com.utexo.TransferStatus.SETTLED -> "Settled"
            com.utexo.TransferStatus.FAILED -> "Failed"
          }
          transferMap.putString("status", statusString)

          transfer.txid?.let { transferMap.putString("txid", it) }
          transfer.recipientId?.let { transferMap.putString("recipientId", it) }
          transfer.expirationTimestamp?.let { transferMap.putDouble("expiration", it.toDouble()) }

          transfer.requestedAssignment?.let {
            transferMap.putMap("requestedAssignment", assignmentToMap(it))
          }

          val assignmentsArray = Arguments.createArray()
          transfer.assignments.forEach { assignment ->
            assignmentsArray.pushMap(assignmentToMap(assignment))
          }
          transferMap.putArray("assignments", assignmentsArray)

          transfer.receiveUtxo?.let {
            transferMap.putMap("receiveUtxo", outpointToMap(it))
          }

          transfer.changeUtxo?.let {
            transferMap.putMap("changeUtxo", outpointToMap(it))
          }

          val transportEndpointsMap = Arguments.createArray()
          transfer.transportEndpoints.forEach {
            val endpoint = Arguments.createMap()
            endpoint.putString("endpoint", it.endpoint)
            endpoint.putBoolean("used", it.used)
            endpoint.putString("transportType", it.transportType.toString())
            transportEndpointsMap.pushMap(endpoint)
          }
          transferMap.putArray("transportEndpoints", transportEndpointsMap)

          transfer.invoiceString?.let { transferMap.putString("invoiceString", it) }
          transfer.consignmentPath?.let { transferMap.putString("consignmentPath", it) }

          transfersArray.pushMap(transferMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(transfersArray)
        }
      } catch (e: Exception) {
        Log.e(TAG, "listTransfers error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun listUnspents(
    walletId: Double,
    settledOnly: Boolean,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online

        val unspents = session.wallet.listUnspents(online, settledOnly, skipSync)
        val unspentsArray = Arguments.createArray()

        unspents.forEach { unspent ->
          val unspentMap = Arguments.createMap()
          val utxoMap = Arguments.createMap()
          val outpointMap = Arguments.createMap()
          outpointMap.putString("txid", unspent.utxo.outpoint.txid)
          outpointMap.putDouble("vout", unspent.utxo.outpoint.vout.toDouble())
          utxoMap.putMap("outpoint", outpointMap)
          utxoMap.putDouble("btcAmount", unspent.utxo.btcAmount.toDouble())
          utxoMap.putBoolean("colorable", unspent.utxo.colorable)
          utxoMap.putBoolean("exists", unspent.utxo.exists)
          unspentMap.putMap("utxo", utxoMap)
          unspentMap.putDouble("pendingBlinded", unspent.pendingBlinded.toDouble())

          val rgbAllocationsArray = Arguments.createArray()
          unspent.rgbAllocations.forEach { allocation ->
            val allocationMap = Arguments.createMap()
            allocation.assetId?.let { allocationMap.putString("assetId", it) }
            allocationMap.putMap("assignment", assignmentToMap(allocation.assignment))
            allocationMap.putBoolean("settled", allocation.settled)
            rgbAllocationsArray.pushMap(allocationMap)
          }
          unspentMap.putArray("rgbAllocations", rgbAllocationsArray)

          unspentsArray.pushMap(unspentMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(unspentsArray)
        }
      } catch (e: Exception) {
        Log.e(TAG, "listUnspents error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun refresh(
    walletId: Double,
    assetId: String?,
    filter: ReadableArray,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val filterList = mutableListOf<RefreshFilter>()
        for (i in 0 until filter.size()) {
          val filterMap = filter.getMap(i) ?: continue
          filterList.add(getRefreshFilter(filterMap))
        }

        val refreshed = session.wallet.refresh(online, assetId, filterList, skipSync)
        val result = Arguments.createMap()

        refreshed.forEach { (idx, refreshedTransfer) ->
          val refreshedMap = Arguments.createMap()
          refreshedTransfer.updatedStatus?.let { status ->
            val statusString = when (status) {
              com.utexo.TransferStatus.INITIATED -> "Initiated"
              com.utexo.TransferStatus.WAITING_COUNTERPARTY -> "WaitingCounterparty"
              com.utexo.TransferStatus.WAITING_CONFIRMATIONS -> "WaitingConfirmations"
              com.utexo.TransferStatus.SETTLED -> "Settled"
              com.utexo.TransferStatus.FAILED -> "Failed"
            }
            refreshedMap.putString("updatedStatus", statusString)
          }
          refreshedTransfer.failure?.let {
            refreshedMap.putString("failure", it.toString())
          }
          result.putMap(idx.toString(), refreshedMap)
        }

        withContext(Dispatchers.Main) {
          promise.resolve(result)
        }
      } catch (e: Exception) {
        Log.e(TAG, "refresh error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun send(
    walletId: Double,
    recipientMap: ReadableMap,
    donation: Boolean,
    feeRate: Double,
    minConfirmations: Double,
    expirationTimestamp: Double?,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        // Convert ReadableMap to Map<String, List<Recipient>>
        val recipientMapNative = mutableMapOf<String, List<Recipient>>()
        val keys = recipientMap.keySetIterator()
        while (keys.hasNextKey()) {
          val key = keys.nextKey()
          val recipientsArray = recipientMap.getArray(key) ?: continue
          val recipientsList = mutableListOf<Recipient>()
          for (i in 0 until recipientsArray.size()) {
            val recipientMapItem = recipientsArray.getMap(i) ?: continue
            recipientsList.add(getRecipient(recipientMapItem))
          }
          recipientMapNative[key] = recipientsList
        }

        val result = session.wallet.send(
          online,
          recipientMapNative,
          donation,
          feeRate.toULong(),
          minConfirmations.toLong().toUByte(),
          expirationTimestamp?.toLong()?.toULong(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(operationResultToMap(result))
        }
      } catch (e: Exception) {
        Log.e(TAG, "send error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendBegin(
    walletId: Double,
    recipientMap: ReadableMap,
    donation: Boolean,
    feeRate: Double,
    minConfirmations: Double,
    expirationTimestamp: Double?,
    dryRun: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        // Convert ReadableMap to Map<String, List<Recipient>>
        val recipientMapNative = mutableMapOf<String, List<Recipient>>()
        val keys = recipientMap.keySetIterator()
        while (keys.hasNextKey()) {
          val key = keys.nextKey()
          val recipientsArray = recipientMap.getArray(key) ?: continue
          val recipientsList = mutableListOf<Recipient>()
          for (i in 0 until recipientsArray.size()) {
            val recipientMapItem = recipientsArray.getMap(i) ?: continue
            recipientsList.add(getRecipient(recipientMapItem))
          }
          recipientMapNative[key] = recipientsList
        }

        val sendBeginResult = session.wallet.sendBegin(
          online,
          recipientMapNative,
          donation,
          feeRate.toULong(),
          minConfirmations.toLong().toUByte(),
          expirationTimestamp?.toLong()?.toULong(),
          dryRun
        )

        val map = Arguments.createMap()
        map.putString("psbt", sendBeginResult.psbt)
        sendBeginResult.batchTransferIdx?.let { map.putInt("batchTransferIdx", it) } ?: map.putNull("batchTransferIdx")
        val details = Arguments.createMap()
        details.putString("fasciaPath", sendBeginResult.details.fasciaPath)
        details.putInt("minConfirmations", sendBeginResult.details.minConfirmations.toInt())
        details.putDouble("entropy", sendBeginResult.details.entropy.toDouble())
        details.putBoolean("isDonation", sendBeginResult.details.isDonation)
        map.putMap("details", details)

        withContext(Dispatchers.Main) {
          promise.resolve(map)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendBtc(
    walletId: Double,
    address: String,
    amount: Double,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val txid = session.wallet.sendBtc(
          online,
          address,
          amount.toULong(),
          feeRate.toULong(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(txid)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendBtc error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendBtcBegin(
    walletId: Double,
    address: String,
    amount: Double,
    feeRate: Double,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val psbt = session.wallet.sendBtcBegin(
          online,
          address,
          amount.toULong(),
          feeRate.toULong(),
          skipSync
        )

        withContext(Dispatchers.Main) {
          promise.resolve(psbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendBtcBegin error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendBtcEnd(
    walletId: Double,
    signedPsbt: String,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val txid = session.wallet.sendBtcEnd(online, signedPsbt, skipSync)

        withContext(Dispatchers.Main) {
          promise.resolve(txid)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendBtcEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sendEnd(
    walletId: Double,
    signedPsbt: String,
    skipSync: Boolean,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        val result = session.wallet.sendEnd(online, signedPsbt, skipSync)

        withContext(Dispatchers.Main) {
          promise.resolve(operationResultToMap(result))
        }
      } catch (e: Exception) {
        Log.e(TAG, "sendEnd error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun signPsbt(walletId: Double, unsignedPsbt: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val signedPsbt = session.wallet.signPsbt(unsignedPsbt)

        withContext(Dispatchers.Main) {
          promise.resolve(signedPsbt)
        }
      } catch (e: Exception) {
        Log.e(TAG, "signPsbt error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun sync(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val online = session.online
          ?: throw IllegalStateException("Wallet is not online")

        session.wallet.sync(online)
        val refresh = session.wallet.refresh(online, null, emptyList(), false)
        val failed = session.wallet.failTransfers(online, null, false, false)
        val delete = session.wallet.deleteTransfers(null, false)
        val assets = session.wallet.listAssets(listOf())
        val rgb25Assets = assets.cfa
        val rgb20Assets = assets.nia
        val udaAssets = assets.uda
        if (rgb20Assets != null) {
          for (rgb20Asset in rgb20Assets) {
            val assetRefresh = session.wallet.refresh(online, rgb20Asset.assetId, listOf(), false)
          }
        }
        if (rgb25Assets != null) {
          for (rgb25Asset in rgb25Assets) {
            val assetRefresh = session.wallet.refresh(online, rgb25Asset.assetId, listOf(), false)
          }
        }
        if (udaAssets != null) {
          for (udaAsset in udaAssets) {
            val assetRefresh = session.wallet.refresh(online, udaAsset.assetId, listOf(), false)
          }
        }
        withContext(Dispatchers.Main) {
          promise.resolve(null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "sync error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun witnessReceive(
    walletId: Double,
    assetId: String?,
    assignment: ReadableMap,
    expirationTimestamp: Double?,
    transportEndpoints: ReadableArray,
    minConfirmations: Double,
    promise: Promise
  ) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")

        val assignmentObj = getAssignment(assignment)
        val endpoints = mutableListOf<String>()
        for (i in 0 until transportEndpoints.size()) {
          endpoints.add(transportEndpoints.getString(i) ?: "")
        }

        val receiveData = session.wallet.witnessReceive(
          assetId,
          assignmentObj,
          expirationTimestamp?.toLong()?.toULong(),
          endpoints,
          minConfirmations.toLong().toUByte()
        )

        withContext(Dispatchers.Main) {
          promise.resolve(receiveDataToMap(receiveData))
        }
      } catch (e: Exception) {
        Log.e(TAG, "witnessReceive error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  // ── VSS Backup helpers ──────────────────────────────────────────────────────

  private fun hexToUByteList(hex: String): List<UByte> =
    hex.chunked(2).map { it.toInt(16).toUByte() }

  private fun buildVssConfig(map: ReadableMap): VssBackupConfig {
    val mode = when (map.getString("backupMode")?.lowercase()) {
      "blocking" -> VssBackupMode.BLOCKING
      else -> VssBackupMode.ASYNC
    }
    return VssBackupConfig(
      serverUrl = map.getString("serverUrl")!!,
      storeId = map.getString("storeId")!!,
      signingKey = hexToUByteList(map.getString("signingKeyHex")!!),
      encryptionEnabled = if (map.hasKey("encryptionEnabled")) map.getBoolean("encryptionEnabled") else true,
      autoBackup = if (map.hasKey("autoBackup")) map.getBoolean("autoBackup") else false,
      backupMode = mode
    )
  }

  // ── VSS Backup @ReactMethod overrides ──────────────────────────────────────

  override fun restoreFromVss(configMap: ReadableMap, targetDir: String, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val config = buildVssConfig(configMap)
        val walletPath = nativeRestoreFromVss(config, targetDir)
        resolvePromise(promise, walletPath)
      } catch (e: Exception) {
        Log.e(TAG, "restoreFromVss error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun configureVssBackup(walletId: Double, configMap: ReadableMap, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")
        val config = buildVssConfig(configMap)
        session.wallet.configureVssBackup(config)
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        Log.e(TAG, "configureVssBackup error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun vssBackup(walletId: Double, configMap: ReadableMap, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")
        val config = buildVssConfig(configMap)
        val client = VssBackupClient(config)
        val version = session.wallet.vssBackup(client)
        withContext(Dispatchers.Main) { promise.resolve(version.toDouble()) }
      } catch (e: Exception) {
        Log.e(TAG, "vssBackup error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun vssBackupInfo(walletId: Double, configMap: ReadableMap, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")
        val config = buildVssConfig(configMap)
        val client = VssBackupClient(config)
        val info = session.wallet.vssBackupInfo(client)
        val result = Arguments.createMap().apply {
          putBoolean("backupExists", info.backupExists)
          if (info.serverVersion != null) {
            putDouble("serverVersion", info.serverVersion!!.toDouble())
          } else {
            putNull("serverVersion")
          }
          putBoolean("backupRequired", info.backupRequired)
        }
        withContext(Dispatchers.Main) { promise.resolve(result) }
      } catch (e: Exception) {
        Log.e(TAG, "vssBackupInfo error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

  override fun disableVssAutoBackup(walletId: Double, promise: Promise) {
    coroutineScope.launch(Dispatchers.IO) {
      try {
        val session = WalletStore.get(walletId.toInt())
          ?: throw IllegalStateException("Wallet with id $walletId not found")
        session.wallet.disableVssAutoBackup()
        withContext(Dispatchers.Main) { promise.resolve(null) }
      } catch (e: Exception) {
        Log.e(TAG, "disableVssAutoBackup error: ${e.message}", e)
        withContext(Dispatchers.Main) {
          promise.reject(getErrorClassName(e), parseErrorMessage(e.message), e)
        }
      }
    }
  }

}