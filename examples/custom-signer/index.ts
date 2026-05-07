/**
 * Custom External Signer — JavaScript usage example
 *
 * This file shows how to wire a custom native signer (implemented in
 * CustomExternalSigner.swift / CustomExternalSigner.kt) into the SDK
 * from the React Native JS side.
 *
 * Prerequisites:
 *   - iOS: add CustomExternalSigner.swift + CustomSignerBridge.swift to your
 *     Xcode target and add the Rgb.mm additions shown in CustomSignerBridge.swift.
 *   - Android: add CustomExternalSigner.kt to your app module and register
 *     CustomSignerPackage in MainApplication.kt.
 */

import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWalletManager } from '@utexo/rgb-sdk-rn';

// ─────────────────────────────────────────────────────────────────────────────
// Native module reference (registered as "CustomSigner" in both platforms)
// ─────────────────────────────────────────────────────────────────────────────

const CustomSigner = NativeModules.CustomSigner as {
  /**
   * Creates a custom signer from a seed and returns the signerId plus
   * the full bootstrap dictionary needed to initialise the node on first run.
   */
  createCustomSigner(
    seedHex: string,
    network: string
  ): Promise<{
    signerId: number;
    nodePublicKeyHex: string;
    accountXpubVanilla: string;
    accountXpubColored: string;
    masterFingerprint: string;
    protocolVersion: string;
    apiLevel: number;
    ldkInboundPaymentKeyHex: string;
    ldkPeerStorageKeyHex: string;
    ldkReceiveAuthKeyHex: string;
    asyncPaymentsRootSeedHex: string;
  }>;

  /**
   * Attaches a previously created custom signer to a node and unlocks it.
   * Combines attachExternalSigner + unlockWithAttachedExternalSigner in one call.
   */
  attachAndUnlock(
    nodeId: number,
    signerId: number,
    nodePublicKeyHex: string,
    accountXpubVanilla: string,
    accountXpubColored: string,
    masterFingerprint: string,
    protocolVersion: string,
    apiLevel: number,
    ldkInboundPaymentKeyHex: string,
    ldkPeerStorageKeyHex: string,
    ldkReceiveAuthKeyHex: string,
    asyncPaymentsRootSeedHex: string,
    bitcoindRpcUsername: string,
    bitcoindRpcPassword: string,
    bitcoindRpcHost: string,
    bitcoindRpcPort: number,
    indexerUrl: string | null,
    proxyEndpoint: string | null,
    announceAddresses: string[],
    announceAlias: string | null
  ): Promise<void>;

  /** Releases the native signer object. Call when you no longer need it. */
  destroyCustomSigner(signerId: number): Promise<void>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap persistence helpers
// ─────────────────────────────────────────────────────────────────────────────

const BOOTSTRAP_KEY = 'rln_custom_signer_bootstrap';

type BootstrapFields = {
  nodePublicKeyHex: string;
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
  protocolVersion: string;
  apiLevel: number;
  ldkInboundPaymentKeyHex: string;
  ldkPeerStorageKeyHex: string;
  ldkReceiveAuthKeyHex: string;
  asyncPaymentsRootSeedHex: string;
};

async function saveBootstrap(fields: BootstrapFields): Promise<void> {
  await AsyncStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(fields));
}

async function loadBootstrap(): Promise<BootstrapFields | null> {
  const json = await AsyncStorage.getItem(BOOTSTRAP_KEY);
  return json ? (JSON.parse(json) as BootstrapFields) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node connection parameters (fill in your values)
// ─────────────────────────────────────────────────────────────────────────────

const RPC_PARAMS = {
  bitcoindRpcUsername: 'user',
  bitcoindRpcPassword: 'password',
  bitcoindRpcHost: '127.0.0.1',
  bitcoindRpcPort: 18443,
  indexerUrl: 'http://127.0.0.1:3000/json-rpc',
  proxyEndpoint: 'rpc://127.0.0.1:3001/json-rpc',
  announceAddresses: [] as string[],
  announceAlias: null as string | null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Main example: start a node with a custom external signer
// ─────────────────────────────────────────────────────────────────────────────

export async function startNodeWithCustomSigner(
  seedHex: string,
  storageDirPath: string
): Promise<void> {
  // 1. Create a WalletManager in RLN mode (node must be created first).
  const wm = createWalletManager({
    dataDir: storageDirPath,
    network: 'regtest',
    bindingMode: 'rln',
  });

  // 2. Create the RLN node (allocates native node object, returns nodeId).
  const nodeId = await wm.rlnCreateNode({
    storageDirPath,
    daemonListeningPort: 3001,
    ldkPeerListeningPort: 9735,
    network: 'regtest',
    maxMediaUploadSizeMb: 5,
  });

  // 3. Create the custom signer — returns signerId + bootstrap key material.
  const signerResult = await CustomSigner.createCustomSigner(seedHex, 'regtest');
  const { signerId, ...bootstrap } = signerResult;

  const existingBootstrap = await loadBootstrap();

  if (!existingBootstrap) {
    // ── First run ────────────────────────────────────────────────────────────
    // Initialise the node with the external signer bootstrap. This stores the
    // key material to disk so subsequent runs can skip this step.
    await wm.rlnInitNodeWithExternalSigner({
      nodePublicKeyHex: bootstrap.nodePublicKeyHex,
      accountXpubVanilla: bootstrap.accountXpubVanilla,
      accountXpubColored: bootstrap.accountXpubColored,
      masterFingerprint: bootstrap.masterFingerprint,
      protocolVersion: bootstrap.protocolVersion,
      apiLevel: bootstrap.apiLevel,
      ldkInboundPaymentKeyHex: bootstrap.ldkInboundPaymentKeyHex,
      ldkPeerStorageKeyHex: bootstrap.ldkPeerStorageKeyHex,
      ldkReceiveAuthKeyHex: bootstrap.ldkReceiveAuthKeyHex,
      asyncPaymentsRootSeedHex: bootstrap.asyncPaymentsRootSeedHex,
    });

    // Persist bootstrap fields so subsequent runs can call attachAndUnlock
    // directly without re-deriving key material from the signer.
    await saveBootstrap(bootstrap);

    // Attach the live signer instance and unlock the node.
    await CustomSigner.attachAndUnlock(
      nodeId,
      signerId,
      bootstrap.nodePublicKeyHex,
      bootstrap.accountXpubVanilla,
      bootstrap.accountXpubColored,
      bootstrap.masterFingerprint,
      bootstrap.protocolVersion,
      bootstrap.apiLevel,
      bootstrap.ldkInboundPaymentKeyHex,
      bootstrap.ldkPeerStorageKeyHex,
      bootstrap.ldkReceiveAuthKeyHex,
      bootstrap.asyncPaymentsRootSeedHex,
      RPC_PARAMS.bitcoindRpcUsername,
      RPC_PARAMS.bitcoindRpcPassword,
      RPC_PARAMS.bitcoindRpcHost,
      RPC_PARAMS.bitcoindRpcPort,
      RPC_PARAMS.indexerUrl,
      RPC_PARAMS.proxyEndpoint,
      RPC_PARAMS.announceAddresses,
      RPC_PARAMS.announceAlias
    );
  } else {
    // ── Subsequent runs ──────────────────────────────────────────────────────
    // The node is already initialised on disk. Just attach the signer and
    // unlock using the previously saved bootstrap fields.
    await CustomSigner.attachAndUnlock(
      nodeId,
      signerId,
      existingBootstrap.nodePublicKeyHex,
      existingBootstrap.accountXpubVanilla,
      existingBootstrap.accountXpubColored,
      existingBootstrap.masterFingerprint,
      existingBootstrap.protocolVersion,
      existingBootstrap.apiLevel,
      existingBootstrap.ldkInboundPaymentKeyHex,
      existingBootstrap.ldkPeerStorageKeyHex,
      existingBootstrap.ldkReceiveAuthKeyHex,
      existingBootstrap.asyncPaymentsRootSeedHex,
      RPC_PARAMS.bitcoindRpcUsername,
      RPC_PARAMS.bitcoindRpcPassword,
      RPC_PARAMS.bitcoindRpcHost,
      RPC_PARAMS.bitcoindRpcPort,
      RPC_PARAMS.indexerUrl,
      RPC_PARAMS.proxyEndpoint,
      RPC_PARAMS.announceAddresses,
      RPC_PARAMS.announceAlias
    );
  }

  console.log('Node unlocked with custom external signer.');
  console.log('Node info:', await wm.rlnNodeInfo());

  // ── Use the node normally ────────────────────────────────────────────────
  // From here on the WalletManager API is identical whether you used
  // rlnInitNode (password), rlnCreateNativeExternalSigner, or a custom signer.

  // Example: get on-chain address
  const address = await wm.rlnAddress();
  console.log('Receive address:', address);

  // When shutting down, clean up in order:
  //   1. Shut down the LDK node (stops all background tasks)
  //   2. Destroy the native signer object (frees native memory)
  await wm.rlnShutdown();
  await CustomSigner.destroyCustomSigner(signerId);
}
