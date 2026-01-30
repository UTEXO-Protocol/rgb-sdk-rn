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

export interface Spec extends TurboModule {
  generateKeys(
    bitcoinNetwork: 'mainnet' | 'testnet' | 'testnet4' | 'regtest' | 'signet'
  ): Promise<{
    mnemonic: string;
    xpub: string;
    accountXpubVanilla: string;
    accountXpubColored: string;
    masterFingerprint: string;
  }>;
  restoreKeys(
    bitcoinNetwork: 'mainnet' | 'testnet' | 'testnet4' | 'regtest' | 'signet',
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
    vanillaKeychain: number
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
      type:
        | 'Fungible'
        | 'NonFungible'
        | 'InflationRight'
        | 'ReplaceRight'
        | 'Any';
      amount?: number;
    },
    durationSeconds: number | null,
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
    minConfirmations: number
  ): Promise<string>;
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
    replaceRightsNum: number,
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
      status: 'WaitingCounterparty' | 'WaitingConfirmations';
      incoming: boolean;
    }>,
    skipSync: boolean
  ): Promise<{
    [key: string]: {
      updatedStatus?:
        | 'WaitingCounterparty'
        | 'WaitingConfirmations'
        | 'Settled'
        | 'Failed';
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
          type:
            | 'Fungible'
            | 'NonFungible'
            | 'InflationRight'
            | 'ReplaceRight'
            | 'Any';
          amount?: number;
        };
        transportEndpoints: string[];
      }>;
    },
    donation: boolean,
    feeRate: number,
    minConfirmations: number,
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
          type:
            | 'Fungible'
            | 'NonFungible'
            | 'InflationRight'
            | 'ReplaceRight'
            | 'Any';
          amount?: number;
        };
        transportEndpoints: string[];
      }>;
    },
    donation: boolean,
    feeRate: number,
    minConfirmations: number
  ): Promise<string>;
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
      type:
        | 'Fungible'
        | 'NonFungible'
        | 'InflationRight'
        | 'ReplaceRight'
        | 'Any';
      amount?: number;
    },
    durationSeconds: number | null,
    transportEndpoints: string[],
    minConfirmations: number
  ): Promise<{
    invoice: string;
    recipientId: string;
    expirationTimestamp: number | null;
    batchTransferIdx: number;
  }>;
  decodeInvoice(invoice: string): Promise<InvoiceData>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Rgb');



