package com.rgbsdkrn.examples

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableNativeMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.utexo.rgblightningnode.ExternalSignerHost
import org.utexo.rgblightningnode.NativeExternalSigner
import org.utexo.rgblightningnode.SdkExternalSignerBootstrap
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

// ─────────────────────────────────────────────────────────────────────────────
// CustomExternalSigner.kt
//
// Add CustomSignerModule to your MainApplication's package list.
// Shows how to implement ExternalSignerHost for a custom signing backend.
// ─────────────────────────────────────────────────────────────────────────────

// MARK: - Signing backend interface

interface SignerBackend {
    /**
     * Produce bootstrap key material. Called once on first run;
     * the result is stored to disk by the node.
     */
    fun bootstrap(): SdkExternalSignerBootstrap

    /**
     * Handle a raw VLS protobuf request and return the encoded response.
     *
     * The bytes are a SignerEnvelope { version, payload_encoding, payload }
     * wrapping a SignerRequest oneof. See proto schema at:
     * https://github.com/UTEXO-Protocol/rgb-lightning-node/blob/main/proto/
     *
     * Operations the node will send (non-exhaustive):
     *   Bootstrap, GetNodeId, GetDestinationScript, GetShutdownScriptpubkey,
     *   Ecdh, SignInvoice, SignBolt12Invoice, SignGossipMessage, SignMessage,
     *   GenerateChannelKeysId, DeriveChannelSigner, SetupChannel,
     *   GetPerCommitmentPoint, ReleaseCommitmentSecret,
     *   SignHolderCommitment, SignCounterpartyCommitment, SignClosingTransaction,
     *   SignRgbPsbt, SignSpendableOutputsPsbt, and more.
     *
     * Called synchronously on a background thread.
     */
    fun processRequest(requestBytes: ByteArray): ByteArray
}

// MARK: - ExternalSignerHost bridge

/** Wraps your SignerBackend and satisfies the UniFFI-generated ExternalSignerHost interface. */
class CustomExternalSigner(private val backend: SignerBackend) : ExternalSignerHost {

    /** UniFFI-generated interface method — called by the LDK node for every signing op. */
    override fun call(request: ByteArray): ByteArray {
        return backend.processRequest(request)
    }

    fun bootstrap(): SdkExternalSignerBootstrap = backend.bootstrap()
}

// MARK: - NativeBacked backend (recommended starting point)

/**
 * Uses NativeExternalSigner to derive bootstrap key material from a seed.
 * Replace processRequest() with your HSM / hardware wallet / Android Keystore logic.
 *
 * For development and testing: throw NotImplementedError — use
 * rlnCreateNativeExternalSigner() from JS instead, which handles the full VLS protocol.
 */
class NativeBackedSignerBackend(seedHex: String, network: String) : SignerBackend {

    private val nativeSigner = NativeExternalSigner(seedHex, network, permissivePolicy = false)

    override fun bootstrap(): SdkExternalSignerBootstrap = nativeSigner.bootstrap()

    override fun processRequest(requestBytes: ByteArray): ByteArray {
        // ─────────────────────────────────────────────────────────────────
        // INSERT YOUR SIGNING LOGIC HERE.
        //
        // Example for Android Keystore:
        //   val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        //   val privateKey = keyStore.getKey("rln-node-key", null) as PrivateKey
        //   val sig = Signature.getInstance("SHA256withECDSA").apply {
        //       initSign(privateKey)
        //       update(requestBytes)
        //   }.sign()
        //   return encodeSignerResponse(sig)  // encode into SignerEnvelope
        //
        // Example for a remote HSM:
        //   return remoteHSM.sign(requestBytes)
        //
        // Example for a hardware wallet (USB/BLE):
        //   return hardwareWallet.roundTrip(requestBytes)
        //
        // See proto schema for request/response format:
        //   https://github.com/UTEXO-Protocol/rgb-lightning-node/blob/main/proto/
        // ─────────────────────────────────────────────────────────────────
        throw NotImplementedError(
            "Implement processRequest() for your signing backend. " +
            "For development, use rlnCreateNativeExternalSigner() from JS instead."
        )
    }
}

// MARK: - Remote HSM backend example

/**
 * Forwards raw VLS protobuf bytes to a remote signing server over HTTP.
 * The server must implement the VLS protocol and return the encoded response.
 */
class RemoteHSMSignerBackend(
    private val serverUrl: String,
    private val storedBootstrap: SdkExternalSignerBootstrap
) : SignerBackend {

    override fun bootstrap(): SdkExternalSignerBootstrap = storedBootstrap

    override fun processRequest(requestBytes: ByteArray): ByteArray {
        // Synchronous HTTP POST — called on background thread so blocking is acceptable.
        val url = URL(serverUrl)
        val connection = url.openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.setRequestProperty("Content-Type", "application/octet-stream")
            connection.outputStream.use { it.write(requestBytes) }
            connection.inputStream.use { it.readBytes() }
        } finally {
            connection.disconnect()
        }
    }
}

// MARK: - Store

object CustomSignerStore {
    private val signers = ConcurrentHashMap<Int, CustomExternalSigner>()
    private val nextId = AtomicInteger(1)

    fun create(backend: SignerBackend): Pair<Int, CustomExternalSigner> {
        val signer = CustomExternalSigner(backend)
        val id = nextId.getAndIncrement()
        signers[id] = signer
        return Pair(id, signer)
    }

    fun get(id: Int): CustomExternalSigner? = signers[id]

    fun remove(id: Int) { signers.remove(id) }
}

// MARK: - React Native module

/**
 * React Native module that exposes the custom signer to JS.
 * Register this in MainApplication.kt: packages.add(CustomSignerPackage())
 */
class CustomSignerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val coroutineScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    override fun getName() = "CustomSigner"

    /**
     * Creates a custom signer backed by NativeExternalSigner for VLS operations.
     * Returns a map with signerId + all bootstrap fields.
     *
     * JS: const result = await CustomSignerModule.createCustomSigner(seedHex, network)
     * result.signerId      — pass to attach/unlock methods
     * result.nodePublicKeyHex, result.accountXpubVanilla, ... — use for rlnInitNodeWithExternalSigner
     */
    @ReactMethod
    fun createCustomSigner(seedHex: String, network: String, promise: Promise) {
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val backend = NativeBackedSignerBackend(seedHex, network)
                val (signerId, signer) = CustomSignerStore.create(backend)
                val bootstrap = signer.bootstrap()

                val result = WritableNativeMap().apply {
                    putInt("signerId", signerId)
                    putString("nodePublicKeyHex", bootstrap.nodeId)
                    putString("accountXpubVanilla", bootstrap.accountXpubVanilla)
                    putString("accountXpubColored", bootstrap.accountXpubColored)
                    putString("masterFingerprint", bootstrap.masterFingerprint)
                    putString("protocolVersion", bootstrap.protocolVersion)
                    putInt("apiLevel", bootstrap.apiLevel.toInt())
                    putString("ldkInboundPaymentKeyHex", bootstrap.ldkInboundPaymentKeyHex)
                    putString("ldkPeerStorageKeyHex", bootstrap.ldkPeerStorageKeyHex)
                    putString("ldkReceiveAuthKeyHex", bootstrap.ldkReceiveAuthKeyHex)
                    putString("asyncPaymentsRootSeedHex", bootstrap.asyncPaymentsRootSeedHex)
                }
                withContext(Dispatchers.Main) { promise.resolve(result) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("CREATE_CUSTOM_SIGNER_ERROR", e.message, e)
                }
            }
        }
    }

    /**
     * Attaches a custom signer to an already-created node and unlocks it.
     * Combines attachExternalSigner + unlockWithAttachedExternalSigner in one call
     * to avoid passing the full bootstrap dict twice from JS.
     */
    @ReactMethod
    fun attachAndUnlock(
        nodeId: Double,
        signerId: Double,
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
            try {
                val node = com.rgbsdkrn.RlnNodeStore.get(nodeId.toInt())
                    ?: throw IllegalStateException("RLN node with id $nodeId not found")
                val signer = CustomSignerStore.get(signerId.toInt())
                    ?: throw IllegalStateException("Custom signer with id $signerId not found")

                val bootstrap = SdkExternalSignerBootstrap(
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

                val addresses = mutableListOf<String>()
                for (i in 0 until announceAddresses.size()) {
                    addresses.add(announceAddresses.getString(i) ?: "")
                }

                node.attachExternalSigner(host = signer, bootstrap = bootstrap)
                node.unlockWithAttachedExternalSigner(
                    bootstrap = bootstrap,
                    bitcoindRpcUsername = bitcoindRpcUsername,
                    bitcoindRpcPassword = bitcoindRpcPassword,
                    bitcoindRpcHost = bitcoindRpcHost,
                    bitcoindRpcPort = bitcoindRpcPort.toInt().toUShort(),
                    indexerUrl = indexerUrl,
                    proxyEndpoint = proxyEndpoint,
                    announceAddresses = addresses,
                    announceAlias = announceAlias
                )
                withContext(Dispatchers.Main) { promise.resolve(null) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("ATTACH_UNLOCK_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun destroyCustomSigner(signerId: Double, promise: Promise) {
        CustomSignerStore.remove(signerId.toInt())
        promise.resolve(null)
    }
}
