import { TurboModuleRegistry, type TurboModule } from 'react-native';

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
}

export default TurboModuleRegistry.getEnforcing<Spec>('Rgb');
