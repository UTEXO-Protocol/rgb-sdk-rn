import { TurboModuleRegistry, type TurboModule } from 'react-native';
import type {
  InvoiceData,
  Transfer,
  Unspent,
  AssetMetadata,
  AssetCfa,
  AssetIfa,
  AssetNia,
} from './Interfaces';

/** Bitcoin networks accepted by rgb-lib native bindings (maps to `BitcoinNetwork`). */
export type NativeRgbBitcoinNetwork =
  | 'mainnet'
  | 'testnet'
  | 'testnet4'
  | 'regtest'
  | 'signet'
  | 'signet_custom';

export interface InflateBeginResult {
  psbt: string;
  batchTransferIdx: number | null;
  details: {
    fasciaPath: string;
    minConfirmations: number;
    entropy: number;
  };
}

export interface SendBeginResult {
  psbt: string;
  batchTransferIdx: number | null;
  details: {
    fasciaPath: string;
    minConfirmations: number;
    entropy: number;
    isDonation: boolean;
  };
}

export interface Spec extends TurboModule {
  // ── RLN native node methods (rgb_lightning_node) ───────────────────────────
  rlnCreateNode(
    storageDirPath: string,
    daemonListeningPort: number,
    ldkPeerListeningPort: number,
    network: string,
    maxMediaUploadSizeMb: number,
    enableVirtualChannelsV0: boolean | null
  ): Promise<number>;
  rlnInitNode(nodeId: number, password: string, mnemonic?: string | null): Promise<string>;
  rlnCreateNativeExternalSigner(
    seedHex: string,
    network: string,
    permissivePolicy: boolean
  ): Promise<number>;
  rlnInitNodeWithNativeExternalSigner(nodeId: number, signerId: number): Promise<void>;
  rlnAttachNativeExternalSigner(nodeId: number, signerId: number): Promise<void>;
  rlnUnlockNodeWithNativeExternalSigner(
    nodeId: number,
    signerId: number,
    bitcoindRpcUsername: string,
    bitcoindRpcPassword: string,
    bitcoindRpcHost: string,
    bitcoindRpcPort: number,
    indexerUrl: string | null,
    proxyEndpoint: string | null,
    announceAddresses: string[],
    announceAlias: string | null
  ): Promise<void>;
  rlnDestroyNativeExternalSigner(signerId: number): Promise<void>;
  rlnInitNodeWithExternalSigner(
    nodeId: number,
    nodePublicKeyHex: string,
    accountXpubVanilla: string,
    accountXpubColored: string,
    masterFingerprint: string,
    protocolVersion: string,
    apiLevel: number,
    ldkInboundPaymentKeyHex: string,
    ldkPeerStorageKeyHex: string,
    ldkReceiveAuthKeyHex: string,
    asyncPaymentsRootSeedHex: string
  ): Promise<void>;
  rlnUnlockNode(
    nodeId: number,
    password: string,
    bitcoindRpcUsername: string,
    bitcoindRpcPassword: string,
    bitcoindRpcHost: string,
    bitcoindRpcPort: number,
    indexerUrl: string | null,
    proxyEndpoint: string | null,
    announceAddresses: string[],
    announceAlias: string | null
  ): Promise<void>;
  rlnDestroyNode(nodeId: number): Promise<void>;
  rlnNodeInfo(nodeId: number): Promise<object>;
  rlnNetworkInfo(nodeId: number): Promise<object>;
  rlnListPeers(nodeId: number): Promise<object[]>;
  rlnConnectPeer(nodeId: number, peerPubkeyAndAddr: string): Promise<void>;
  rlnDisconnectPeer(nodeId: number, peerPubkey: string): Promise<void>;
  rlnListChannels(nodeId: number): Promise<object[]>;
  rlnOpenChannel(
    nodeId: number,
    peerPubkeyAndOptAddr: string,
    capacitySat: number,
    pushMsat: number,
    publicChannel: boolean,
    withAnchors: boolean,
    feeBaseMsat: number | null,
    feeProportionalMillionths: number | null,
    temporaryChannelId: string | null,
    assetId: string | null,
    assetAmount: number | null,
    pushAssetAmount: number | null,
    virtualOpenMode: string | null
  ): Promise<object>;
  rlnCloseChannel(
    nodeId: number,
    channelId: string,
    peerPubkey: string,
    force: boolean
  ): Promise<void>;
  rlnListPayments(nodeId: number): Promise<object[]>;
  rlnAddress(nodeId: number): Promise<object>;
  rlnAssetBalance(nodeId: number, assetId: string): Promise<object>;
  rlnBackup(nodeId: number, backupPath: string, password: string): Promise<void>;
  rlnBtcBalance(nodeId: number, skipSync: boolean): Promise<object>;
  rlnCheckIndexerUrl(nodeId: number, indexerUrl: string): Promise<object>;
  rlnCheckProxyEndpoint(nodeId: number, proxyEndpoint: string): Promise<void>;
  rlnCreateUtxos(
    nodeId: number,
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: number,
    skipSync: boolean
  ): Promise<void>;
  rlnDecodeLnInvoice(nodeId: number, invoice: string): Promise<object>;
  rlnDecodeRgbInvoice(nodeId: number, invoice: string): Promise<object>;
  rlnEstimateFee(nodeId: number, blocks: number): Promise<object>;
  rlnFailTransfers(
    nodeId: number,
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<object>;
  rlnGetChannelId(nodeId: number, temporaryChannelId: string): Promise<string>;
  rlnGetPayment(nodeId: number, paymentHash: string): Promise<object>;
  rlnInvoiceStatus(nodeId: number, invoice: string): Promise<object>;
  rlnKeysend(
    nodeId: number,
    destPubkey: string,
    amtMsat: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<object>;
  rlnListAssets(nodeId: number, filterAssetSchemas: string[]): Promise<object>;
  rlnListTransactions(nodeId: number, skipSync: boolean): Promise<object[]>;
  rlnListTransfers(nodeId: number, assetId: string): Promise<object[]>;
  rlnListUnspents(nodeId: number, skipSync: boolean): Promise<object[]>;
  rlnLnInvoice(
    nodeId: number,
    amtMsat: number | null,
    expirySec: number,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<object>;
  rlnRefreshTransfers(nodeId: number, skipSync: boolean): Promise<void>;
  rlnRgbInvoice(
    nodeId: number,
    assetId: string | null,
    assignmentAmount: number | null,
    durationSeconds: number | null,
    minConfirmations: number,
    witness: boolean
  ): Promise<object>;
  rlnSendBtc(
    nodeId: number,
    amount: number,
    address: string,
    feeRate: number,
    skipSync: boolean
  ): Promise<object>;
  rlnSendPayment(
    nodeId: number,
    invoice: string,
    amtMsat: number | null,
    assetId: string | null,
    assetAmount: number | null
  ): Promise<object>;
  rlnSendRgb(
    nodeId: number,
    donation: boolean,
    feeRate: number,
    minConfirmations: number,
    skipSync: boolean,
    assetId: string,
    recipientId: string,
    amount: number,
    transportEndpoints: string[]
  ): Promise<object>;
  rlnShutdown(nodeId: number): Promise<void>;
  rlnSync(nodeId: number): Promise<void>;

  generateKeys(bitcoinNetwork: NativeRgbBitcoinNetwork): Promise<{
    mnemonic: string;
    xpub: string;
    accountXpubVanilla: string;
    accountXpubColored: string;
    masterFingerprint: string;
  }>;
  restoreKeys(
    bitcoinNetwork: NativeRgbBitcoinNetwork,
    mnemonic: string
  ): Promise<{
    mnemonic: string;
    xpub: string;
    accountXpubVanilla: string;
    accountXpubColored: string;
    masterFingerprint: string;
  }>;
  restoreBackup(path: string, password: string): Promise<void>;
  initializeWallet(
    network: string,
    accountXpubVanilla: string,
    accountXpubColored: string,
    mnemonic: string,
    masterFingerprint: string,
    supportedSchemas: string[],
    maxAllocationsPerUtxo: number,
    vanillaKeychain: number,
    reuseAddresses: boolean
  ): Promise<number>;
  goOnline(
    walletId: number,
    skipConsistencyCheck: boolean,
    indexerUrl: string
  ): Promise<void>;
  getBtcBalance(
    walletId: number,
    skipSync: boolean
  ): Promise<{
    vanilla: {
      settled: number;
      future: number;
      spendable: number;
    };
    colored: {
      settled: number;
      future: number;
      spendable: number;
    };
  }>;
  walletClose(walletId: number): Promise<void>;
  backup(walletId: number, backupPath: string, password: string): Promise<void>;
  backupInfo(walletId: number): Promise<boolean>;
  blindReceive(
    walletId: number,
    assetId: string | null,
    assignment: {
      type: 'Fungible' | 'NonFungible' | 'InflationRight' | 'Any';
      amount?: number;
    },
    /** Absolute Unix time (seconds) when the invoice expires; matches rgb-lib / Swift. */
    expirationTimestamp: number | null,
    transportEndpoints: string[],
    minConfirmations: number
  ): Promise<{
    invoice: string;
    recipientId: string;
    expirationTimestamp: number | null;
    batchTransferIdx: number;
  }>;
  createUtxos(
    walletId: number,
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: number,
    skipSync: boolean
  ): Promise<number>;
  createUtxosBegin(
    walletId: number,
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: number,
    skipSync: boolean
  ): Promise<string>;
  createUtxosEnd(
    walletId: number,
    signedPsbt: string,
    skipSync: boolean
  ): Promise<number>;
  deleteTransfers(
    walletId: number,
    batchTransferIdx: number | null,
    noAssetOnly: boolean
  ): Promise<boolean>;
  drainTo(
    walletId: number,
    address: string,
    destroyAssets: boolean,
    feeRate: number
  ): Promise<string>;
  drainToBegin(
    walletId: number,
    address: string,
    destroyAssets: boolean,
    feeRate: number
  ): Promise<string>;
  drainToEnd(walletId: number, signedPsbt: string): Promise<string>;
  failTransfers(
    walletId: number,
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<boolean>;
  finalizePsbt(walletId: number, signedPsbt: string): Promise<string>;
  getAddress(walletId: number): Promise<string>;
  rotateVanillaAddress(walletId: number): Promise<string>;
  rotateColoredAddress(walletId: number): Promise<string>;
  getAssetBalance(
    walletId: number,
    assetId: string
  ): Promise<{
    settled: number;
    future: number;
    spendable: number;
  }>;
  getAssetMetadata(walletId: number, assetId: string): Promise<AssetMetadata>;
  getFeeEstimation(walletId: number, blocks: number): Promise<number>;
  getMediaDir(walletId: number): Promise<string>;
  getWalletData(walletId: number): Promise<{
    dataDir: string;
    bitcoinNetwork: string;
    databaseType: string;
    maxAllocationsPerUtxo: number;
    accountXpubVanilla: string;
    accountXpubColored: string;
    mnemonic?: string;
    masterFingerprint: string;
    vanillaKeychain?: number;
    supportedSchemas: string[];
    reuseAddresses?: boolean;
  }>;
  getWalletDir(walletId: number): Promise<string>;
  inflate(
    walletId: number,
    assetId: string,
    inflationAmounts: number[],
    feeRate: number,
    minConfirmations: number
  ): Promise<{
    txid: string;
    batchTransferIdx: number;
  }>;
  inflateBegin(
    walletId: number,
    assetId: string,
    inflationAmounts: number[],
    feeRate: number,
    minConfirmations: number,
    dryRun: boolean
  ): Promise<InflateBeginResult>;
  inflateEnd(
    walletId: number,
    signedPsbt: string
  ): Promise<{
    txid: string;
    batchTransferIdx: number;
  }>;
  issueAssetCfa(
    walletId: number,
    name: string,
    details: string | null,
    precision: number,
    amounts: number[],
    filePath: string | null
  ): Promise<AssetCfa>;
  issueAssetIfa(
    walletId: number,
    ticker: string,
    name: string,
    precision: number,
    amounts: number[],
    inflationAmounts: number[],
    rejectListUrl: string | null
  ): Promise<AssetIfa>;
  issueAssetNia(
    walletId: number,
    ticker: string,
    name: string,
    precision: number,
    amounts: number[]
  ): Promise<AssetNia>;
  issueAssetUda(
    walletId: number,
    ticker: string,
    name: string,
    details: string | null,
    precision: number,
    mediaFilePath: string | null,
    attachmentsFilePaths: string[]
  ): Promise<{
    assetId: string;
    ticker: string;
    name: string;
    details?: string;
    precision: number;
    timestamp: number;
    addedAt: number;
    balance: {
      settled: number;
      future: number;
      spendable: number;
    };
    media?: {
      filePath: string;
      mime: string;
    };
    attachments: Array<{
      filePath: string;
      mime: string;
    }>;
  }>;
  rlnIssueAssetNia(
    nodeId: number,
    ticker: string,
    name: string,
    precision: number,
    amounts: number[]
  ): Promise<any>;
  rlnIssueAssetCfa(
    nodeId: number,
    name: string,
    details: string | null,
    precision: number,
    amounts: number[],
    fileDigest: string | null
  ): Promise<any>;
  rlnIssueAssetIfa(
    nodeId: number,
    ticker: string,
    name: string,
    precision: number,
    amounts: number[],
    inflationAmounts: number[],
    rejectListUrl: string | null
  ): Promise<any>;
  rlnIssueAssetUda(
    nodeId: number,
    ticker: string,
    name: string,
    details: string | null,
    precision: number,
    mediaFileDigest: string | null,
    attachmentsFileDigests: string[]
  ): Promise<any>;
  listAssets(
    walletId: number,
    filterAssetSchemas: string[]
  ): Promise<{
    nia: Array<{
      assetId: string;
      ticker: string;
      name: string;
      details?: string;
      precision: number;
      issuedSupply: number;
      timestamp: number;
      addedAt: number;
      balance: {
        settled: number;
        future: number;
        spendable: number;
      };
      media?: {
        filePath: string;
        mime: string;
        digest: string;
      };
    }>;
    uda: Array<{
      assetId: string;
      ticker: string;
      name: string;
      details?: string;
      precision: number;
      timestamp: number;
      addedAt: number;
      balance: {
        settled: number;
        future: number;
        spendable: number;
      };
      token?: {
        index: number;
        ticker?: string;
        name?: string;
        details?: string;
        embeddedMedia: boolean;
        media?: {
          filePath: string;
          mime: string;
          digest: string;
        };
        attachments: Array<{
          key: number;
          filePath: string;
          mime: string;
          digest: string;
        }>;
        reserves: boolean;
      };
    }>;
    cfa: Array<{
      assetId: string;
      name: string;
      details?: string;
      precision: number;
      issuedSupply: number;
      timestamp: number;
      addedAt: number;
      balance: {
        settled: number;
        future: number;
        spendable: number;
      };
      media?: {
        filePath: string;
        mime: string;
        digest: string;
      };
    }>;
    ifa: Array<{
      assetId: string;
      ticker: string;
      name: string;
      details?: string;
      precision: number;
      initialSupply: number;
      maxSupply: number;
      knownCirculatingSupply: number;
      timestamp: number;
      addedAt: number;
      balance: {
        settled: number;
        future: number;
        spendable: number;
      };
      media?: {
        filePath: string;
        mime: string;
        digest: string;
      };
      rejectListUrl?: string;
    }>;
  }>;
  listTransactions(
    walletId: number,
    skipSync: boolean
  ): Promise<
    Array<{
      transactionType: 'RgbSend' | 'Drain' | 'CreateUtxos' | 'User';
      txid: string;
      received: number;
      sent: number;
      fee: number;
      confirmationTime?: number;
    }>
  >;
  listTransfers(walletId: number, assetId: string | null): Promise<Transfer[]>;
  listUnspents(
    walletId: number,
    settledOnly: boolean,
    skipSync: boolean
  ): Promise<Unspent[]>;
  refresh(
    walletId: number,
    assetId: string | null,
    filter: Array<{
      status: 'WaitingCounterparty' | 'WaitingConfirmations' | 'Initiated';
      incoming: boolean;
    }>,
    skipSync: boolean
  ): Promise<{
    [key: string]: {
      updatedStatus?:
        | 'WaitingCounterparty'
        | 'WaitingConfirmations'
        | 'Settled'
        | 'Failed'
        | 'Initiated';
      failure?: string;
    };
  }>;
  send(
    walletId: number,
    recipientMap: {
      [key: string]: Array<{
        recipientId: string;
        witnessData?: {
          amountSat: number;
          blinding?: number;
        };
        assignment: {
          type: 'Fungible' | 'NonFungible' | 'InflationRight' | 'Any';
          amount?: number;
        };
        transportEndpoints: string[];
      }>;
    },
    donation: boolean,
    feeRate: number,
    minConfirmations: number,
    expirationTimestamp: number | null,
    skipSync: boolean
  ): Promise<{
    txid: string;
    batchTransferIdx: number;
  }>;
  sendBegin(
    walletId: number,
    recipientMap: {
      [key: string]: Array<{
        recipientId: string;
        witnessData?: {
          amountSat: number;
          blinding?: number;
        };
        assignment: {
          type: 'Fungible' | 'NonFungible' | 'InflationRight' | 'Any';
          amount?: number;
        };
        transportEndpoints: string[];
      }>;
    },
    donation: boolean,
    feeRate: number,
    minConfirmations: number,
    expirationTimestamp: number | null,
    dryRun: boolean
  ): Promise<SendBeginResult>;
  sendBtc(
    walletId: number,
    address: string,
    amount: number,
    feeRate: number,
    skipSync: boolean
  ): Promise<string>;
  sendBtcBegin(
    walletId: number,
    address: string,
    amount: number,
    feeRate: number,
    skipSync: boolean
  ): Promise<string>;
  sendBtcEnd(
    walletId: number,
    signedPsbt: string,
    skipSync: boolean
  ): Promise<string>;
  sendEnd(
    walletId: number,
    signedPsbt: string,
    skipSync: boolean
  ): Promise<{
    txid: string;
    batchTransferIdx: number;
  }>;
  signPsbt(walletId: number, unsignedPsbt: string): Promise<string>;
  sync(walletId: number): Promise<void>;
  witnessReceive(
    walletId: number,
    assetId: string | null,
    assignment: {
      type: 'Fungible' | 'NonFungible' | 'InflationRight' | 'Any';
      amount?: number;
    },
    expirationTimestamp: number | null,
    transportEndpoints: string[],
    minConfirmations: number
  ): Promise<{
    invoice: string;
    recipientId: string;
    expirationTimestamp: number | null;
    batchTransferIdx: number;
  }>;
  decodeInvoice(invoice: string): Promise<InvoiceData>;

  // ── VSS Backup methods ──────────────────────────────────────────────────────

  /**
   * Restores a wallet from a VSS cloud backup into targetDir.
   * Returns the absolute path of the restored wallet directory.
   */
  restoreFromVss(
    config: {
      serverUrl: string;
      storeId: string;
      signingKeyHex: string;
      encryptionEnabled: boolean;
      autoBackup: boolean;
      backupMode: string;
    },
    targetDir: string
  ): Promise<string>;

  /**
   * Configures automatic VSS backup for an open wallet.
   */
  configureVssBackup(
    walletId: number,
    config: {
      serverUrl: string;
      storeId: string;
      signingKeyHex: string;
      encryptionEnabled: boolean;
      autoBackup: boolean;
      backupMode: string;
    }
  ): Promise<void>;

  /**
   * Uploads a VSS backup of the wallet state.
   * Returns the server-side version number after successful upload.
   */
  vssBackup(
    walletId: number,
    config: {
      serverUrl: string;
      storeId: string;
      signingKeyHex: string;
      encryptionEnabled: boolean;
      autoBackup: boolean;
      backupMode: string;
    }
  ): Promise<number>;

  /**
   * Queries the VSS server for backup status.
   */
  vssBackupInfo(
    walletId: number,
    config: {
      serverUrl: string;
      storeId: string;
      signingKeyHex: string;
      encryptionEnabled: boolean;
      autoBackup: boolean;
      backupMode: string;
    }
  ): Promise<{
    backupExists: boolean;
    serverVersion: number | null;
    backupRequired: boolean;
  }>;

  /**
   * Disables automatic VSS backup for an open wallet.
   */
  disableVssAutoBackup(walletId: number): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Rgb');
