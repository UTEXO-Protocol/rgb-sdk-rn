import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// CustomExternalSigner.swift
//
// Drop this file into your iOS target alongside the RN SDK native files.
// It shows how to implement ExternalSignerHost for a custom signing backend
// (hardware wallet, Secure Enclave, remote HSM, etc.).
//
// Wire it into the RN bridge by following CustomSignerBridge.swift.
// ─────────────────────────────────────────────────────────────────────────────

// MARK: - Signing backend protocol

/// Implement this to plug in your own key source.
/// The SDK calls back into this during every signing operation the LDK node performs.
protocol SignerBackend {
    /// Produce bootstrap key material from this signer.
    /// Called once on first run; the result is stored to disk by the node.
    func bootstrap() throws -> SdkExternalSignerBootstrap

    /// Handle a raw VLS protobuf request and return the encoded response.
    ///
    /// The bytes are a `SignerEnvelope { version, payload_encoding, payload }` wrapping
    /// a `SignerRequest` oneof. Decode using any Swift protobuf library against the
    /// schema at: https://github.com/UTEXO-Protocol/rgb-lightning-node/blob/main/proto/
    ///
    /// Operations the node will send (non-exhaustive):
    ///   Bootstrap, GetNodeId, GetDestinationScript, GetShutdownScriptpubkey,
    ///   Ecdh, SignInvoice, SignBolt12Invoice, SignGossipMessage, SignMessage,
    ///   GenerateChannelKeysId, DeriveChannelSigner, SetupChannel,
    ///   GetPerCommitmentPoint, ReleaseCommitmentSecret,
    ///   SignHolderCommitment, SignCounterpartyCommitment, SignClosingTransaction,
    ///   SignRgbPsbt, SignSpendableOutputsPsbt, and more.
    ///
    /// Called synchronously on a background thread.
    func processRequest(_ requestBytes: Data) throws -> Data
}

// MARK: - ExternalSignerHost bridge

/// Wraps your SignerBackend and satisfies the UniFFI-generated ExternalSignerHost protocol.
final class CustomExternalSigner: ExternalSignerHost {
    private let backend: SignerBackend

    init(backend: SignerBackend) {
        self.backend = backend
    }

    /// UniFFI-generated protocol method — called by the LDK node for every signing op.
    func call(request: Data) throws -> Data {
        return try backend.processRequest(request)
    }

    func bootstrap() throws -> SdkExternalSignerBootstrap {
        return try backend.bootstrap()
    }
}

// MARK: - NativeBacked backend (recommended starting point)

/// Uses NativeExternalSigner to derive bootstrap key material from a seed.
/// Replace processRequest() with your HSM / hardware wallet / Secure Enclave logic.
///
/// For development and testing: throw NotImplemented — use rlnCreateNativeExternalSigner
/// from the JS side instead, which handles the full VLS protocol automatically.
final class NativeBackedSignerBackend: SignerBackend {
    private let nativeSigner: NativeExternalSigner

    init(seedHex: String, network: String) throws {
        // NativeExternalSigner handles all bootstrap field derivation from the seed.
        // For production, replace this with your own key derivation if needed.
        nativeSigner = try NativeExternalSigner(
            seedHex: seedHex,
            network: network,
            permissivePolicy: false
        )
    }

    func bootstrap() throws -> SdkExternalSignerBootstrap {
        return try nativeSigner.bootstrap()
    }

    func processRequest(_ requestBytes: Data) throws -> Data {
        // ─────────────────────────────────────────────────────────────────
        // INSERT YOUR SIGNING LOGIC HERE.
        //
        // Example for a Secure Enclave signer:
        //   1. Decode requestBytes → determine operation type
        //   2. Route to appropriate SE key for signing
        //   3. Encode response → return bytes
        //
        // Example for a remote HSM:
        //   let response = try remoteHSM.sign(request: requestBytes)
        //   return response
        //
        // Example for a hardware wallet (USB/BLE):
        //   let response = try hardwareWallet.roundTrip(requestBytes)
        //   return response
        //
        // See proto schema for request/response format:
        //   https://github.com/UTEXO-Protocol/rgb-lightning-node/blob/main/proto/
        // ─────────────────────────────────────────────────────────────────
        throw CustomSignerError.notImplemented(
            "Implement processRequest() for your signing backend. " +
            "For development, use rlnCreateNativeExternalSigner() from JS instead."
        )
    }
}

// MARK: - Remote HSM backend example

/// Forwards raw VLS protobuf bytes to a remote signing server over HTTP.
/// The server must implement the VLS protocol and return the encoded response.
final class RemoteHSMSignerBackend: SignerBackend {
    private let serverURL: URL
    private let storedBootstrap: SdkExternalSignerBootstrap

    /// - Parameters:
    ///   - serverURL: Your signing server endpoint, e.g. https://signer.example.com/vls
    ///   - bootstrap: Pre-computed bootstrap (fetch from server on first run, cache locally)
    init(serverURL: URL, bootstrap: SdkExternalSignerBootstrap) {
        self.serverURL = serverURL
        self.storedBootstrap = bootstrap
    }

    func bootstrap() throws -> SdkExternalSignerBootstrap {
        return storedBootstrap
    }

    func processRequest(_ requestBytes: Data) throws -> Data {
        // Synchronous HTTP POST — runs on background thread so blocking is acceptable.
        var request = URLRequest(url: serverURL, timeoutInterval: 5.0)
        request.httpMethod = "POST"
        request.httpBody = requestBytes
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")

        let semaphore = DispatchSemaphore(value: 0)
        var responseData: Data?
        var responseError: Error?

        URLSession.shared.dataTask(with: request) { data, _, error in
            responseData = data
            responseError = error
            semaphore.signal()
        }.resume()

        semaphore.wait()

        if let error = responseError { throw error }
        guard let data = responseData else {
            throw CustomSignerError.emptyResponse
        }
        return data
    }
}

// MARK: - Store

/// Holds CustomExternalSigner instances by ID, keyed by the signerId returned to JS.
final class CustomSignerStore {
    static let shared = CustomSignerStore()
    private var signers: [Int: CustomExternalSigner] = [:]
    private var nextId = 1
    private let queue = DispatchQueue(label: "com.rgbsdkrn.customsignerstore")

    private init() {}

    func create(backend: SignerBackend) -> (id: Int, signer: CustomExternalSigner) {
        return queue.sync {
            let signer = CustomExternalSigner(backend: backend)
            let id = nextId
            nextId += 1
            signers[id] = signer
            return (id, signer)
        }
    }

    func get(id: Int) -> CustomExternalSigner? {
        return queue.sync { signers[id] }
    }

    func remove(id: Int) {
        queue.sync { signers.removeValue(forKey: id) }
    }
}

// MARK: - Errors

enum CustomSignerError: Error, LocalizedError {
    case notImplemented(String)
    case signerNotFound(Int)
    case nodeNotFound(Int)
    case emptyResponse

    var errorDescription: String? {
        switch self {
        case .notImplemented(let msg): return "CustomSigner not implemented: \(msg)"
        case .signerNotFound(let id): return "Custom signer with id \(id) not found"
        case .nodeNotFound(let id): return "RLN node with id \(id) not found"
        case .emptyResponse: return "Remote signer returned empty response"
        }
    }
}
