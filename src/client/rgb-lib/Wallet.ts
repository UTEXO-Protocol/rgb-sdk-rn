import Rgb from './NativeRgb';
import * as Interfaces from './Interfaces';

export interface WalletOptions {
  network?: Interfaces.BitcoinNetwork;
  supportedSchemas?: Interfaces.AssetSchema[];
  maxAllocationsPerUtxo?: number;
  vanillaKeychain?: number;
}

export class Wallet {
  private walletId: number | null = null;
  private keys: Interfaces.Keys;
  private network: Interfaces.BitcoinNetwork;
  private supportedSchemas: Interfaces.AssetSchema[];
  private maxAllocationsPerUtxo: number;
  private vanillaKeychain: number;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Creates a new Wallet instance with the provided keys and configuration.
   * @param keys - The cryptographic keys required for wallet operations (mnemonic, master fingerprint, xPubs)
   * @param options - Optional wallet configuration settings
   * @param options.network - The Bitcoin network to use (defaults to 'testnet')
   * @param options.supportedSchemas - List of RGB asset schemas the wallet supports (defaults to CFA, NIA, UDA)
   * @param options.maxAllocationsPerUtxo - Maximum number of RGB allocations allowed per UTXO (defaults to 1)
   * @param options.vanillaKeychain - Keychain index for the vanilla-side of the wallet (defaults to 0)
   */
  constructor(keys: Interfaces.Keys, options?: WalletOptions) {
    this.keys = keys;
    this.network = options?.network || 'testnet';
    this.supportedSchemas = options?.supportedSchemas || [
      Interfaces.AssetSchema.CFA,
      Interfaces.AssetSchema.NIA,
      Interfaces.AssetSchema.UDA,
    ];
    this.maxAllocationsPerUtxo = options?.maxAllocationsPerUtxo ?? 1;
    this.vanillaKeychain = options?.vanillaKeychain ?? 0;
  }

  /**
   * Ensures the wallet is initialized before performing operations.
   * This method is called automatically by other wallet methods and handles
   * concurrent initialization attempts safely.
   * @returns Promise that resolves when wallet initialization is complete
   */
  private async ensureInitialized(): Promise<void> {
    if (this.walletId !== null) {
      return; // Already initialized
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise !== null) {
      return this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = (async () => {
      this.walletId = await Rgb.initializeWallet(
        this.network,
        this.keys.accountXpubVanilla,
        this.keys.accountXpubColored,
        this.keys.mnemonic,
        this.keys.masterFingerprint,
        this.supportedSchemas,
        this.maxAllocationsPerUtxo,
        this.vanillaKeychain
      );
    })();

    await this.initializationPromise;
  }

  /**
   * Connects the wallet to an online indexer service for syncing and transaction operations.
   * Must be called before performing operations that require network connectivity.
   * @param indexerUrl - The URL of the RGB indexer service to connect to
   * @param skipConsistencyCheck - If true, skips the consistency check with the indexer (default: false)
   * @returns Promise that resolves when the wallet is successfully connected online
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The indexer URL is invalid or unreachable
   *   - Network connectivity issues occur
   *   - The consistency check fails (if skipConsistencyCheck is false)
   */
  async goOnline(
    indexerUrl: string,
    skipConsistencyCheck: boolean = false
  ): Promise<void> {
    await this.ensureInitialized();

    if (this.walletId === null) {
      throw new Error('Failed to initialize wallet');
    }

    await Rgb.goOnline(this.walletId, skipConsistencyCheck, indexerUrl);
  }

  /**
   * Retrieves the Bitcoin balance for both vanilla and colored wallets.
   * Returns settled, future, and spendable balances for each wallet side.
   * @param skipSync - If true, skips syncing with the indexer before calculating balance (default: false)
   * @returns Promise resolving to BtcBalance containing vanilla and colored wallet balances
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Sync operation fails (if skipSync is false)
   */
  async getBtcBalance(
    skipSync: boolean = false
  ): Promise<Interfaces.BtcBalance> {
    await this.ensureInitialized();

    if (this.walletId === null) {
      throw new Error('Failed to initialize wallet');
    }

    return await Rgb.getBtcBalance(this.walletId, skipSync);
  }

  /**
   * Closes the wallet and releases all associated resources.
   * After calling this method, the wallet instance can no longer be used for operations.
   * @returns Promise that resolves when the wallet has been successfully closed
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - An error occurs while closing the wallet
   */
  async close(): Promise<void> {
    if (this.walletId === null) {
      return; // Already closed or never initialized
    }

    await Rgb.walletClose(this.walletId);
    this.walletId = null;
    this.initializationPromise = null;
  }

  /**
   * Checks whether the wallet has been initialized.
   * @returns True if the wallet is initialized and ready to use, false otherwise
   */
  isInitialized(): boolean {
    return this.walletId !== null;
  }

  /**
   * Retrieves the internal wallet identifier.
   * @returns The wallet ID number
   * @throws Error if the wallet is not initialized
   * @internal This method is for internal use only
   */
  private getWalletId(): number {
    if (this.walletId === null) {
      throw new Error('Wallet is not initialized');
    }
    return this.walletId;
  }

  /**
   * Creates an encrypted backup of the wallet data to the specified location.
   * The backup includes all wallet state necessary for full restoration.
   * @param backupPath - The file path where the backup should be saved
   * @param password - The encryption password for securing the backup file
   * @returns Promise that resolves when the backup has been successfully created
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The backup path is invalid or inaccessible
   *   - Encryption fails
   *   - File system errors occur
   */
  async backup(backupPath: string, password: string): Promise<void> {
    await this.ensureInitialized();
    await Rgb.backup(this.getWalletId(), backupPath, password);
  }

  /**
   * Checks whether a backup of the wallet has been created.
   * @returns Promise resolving to true if a backup exists, false otherwise
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - An error occurs while checking backup status
   */
  async backupInfo(): Promise<boolean> {
    await this.ensureInitialized();
    return await Rgb.backupInfo(this.getWalletId());
  }

  /**
   * Creates a blinded UTXO for receiving RGB assets and generates an invoice.
   * This method blinds an existing UTXO to maintain privacy when receiving assets.
   * An optional asset ID can be specified to restrict the invoice to a specific asset.
   * @param assetId - Optional asset ID to embed in the invoice (null accepts any asset)
   * @param assignment - The type and amount of assignment to receive (Fungible, NonFungible, etc.)
   * @param durationSeconds - Optional invoice expiration duration in seconds (null uses default, 0 means no expiration)
   * @param transportEndpoints - Array of transport endpoint URLs (1-3 endpoints) for RGB data exchange (e.g., 'rpc://127.0.0.1')
   * @param minConfirmations - Minimum number of confirmations required for the transaction to be considered settled
   * @returns Promise resolving to ReceiveData containing invoice, recipient ID, expiration, and batch transfer index
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid assignment parameters
   *   - Insufficient UTXOs available
   *   - Invalid transport endpoints
   */
  async blindReceive(
    assetId: string | null,
    assignment: Interfaces.Assignment,
    durationSeconds: number | null,
    transportEndpoints: string[],
    minConfirmations: number
  ): Promise<Interfaces.ReceiveData> {
    await this.ensureInitialized();
    return await Rgb.blindReceive(
      this.getWalletId(),
      assetId,
      assignment,
      durationSeconds,
      transportEndpoints,
      minConfirmations
    );
  }

  /**
   * Creates a Bitcoin address for receiving RGB assets via witness transaction and generates an invoice.
   * This method generates a new address from the vanilla wallet for receiving assets.
   * An optional asset ID can be specified to restrict the invoice to a specific asset.
   * @param assetId - Optional asset ID to embed in the invoice (null accepts any asset)
   * @param assignment - The type and amount of assignment to receive (Fungible, NonFungible, etc.)
   * @param durationSeconds - Optional invoice expiration duration in seconds (null uses default, 0 means no expiration)
   * @param transportEndpoints - Array of transport endpoint URLs (1-3 endpoints) for RGB data exchange (e.g., 'rpc://127.0.0.1')
   * @param minConfirmations - Minimum number of confirmations required for the transaction to be considered settled
   * @returns Promise resolving to ReceiveData containing invoice, recipient ID, expiration, and batch transfer index
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid assignment parameters
   *   - Invalid transport endpoints
   */
  async witnessReceive(
    assetId: string | null,
    assignment: Interfaces.Assignment,
    durationSeconds: number | null,
    transportEndpoints: string[],
    minConfirmations: number
  ): Promise<Interfaces.ReceiveData> {
    await this.ensureInitialized();
    return await Rgb.witnessReceive(
      this.getWalletId(),
      assetId,
      assignment,
      durationSeconds,
      transportEndpoints,
      minConfirmations
    );
  }

  /**
   * Creates new UTXOs for RGB operations in a single operation.
   * UTXOs are necessary for receiving and managing RGB asset allocations.
   * This method creates the PSBT, signs it, finalizes it, and broadcasts the transaction.
   * @param upTo - If true, creates UTXOs until reaching the target count (ignores num parameter)
   * @param num - Target number of UTXOs to create (required if upTo is false)
   * @param size - Size in sats for each UTXO to create (required if upTo is false)
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @param skipSync - If true, skips syncing with the indexer before creating UTXOs (default: false)
   * @returns Promise resolving to the number of UTXOs successfully created
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Insufficient funds for UTXO creation
   *   - Invalid fee rate
   *   - Sync operation fails (if skipSync is false)
   */
  async createUtxos(
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: number,
    skipSync: boolean = false
  ): Promise<number> {
    await this.ensureInitialized();
    return await Rgb.createUtxos(
      this.getWalletId(),
      upTo,
      num,
      size,
      feeRate,
      skipSync
    );
  }

  /**
   * Begins the process of creating UTXOs by generating an unsigned PSBT.
   * Use this method when you need to sign the transaction externally.
   * Must be followed by createUtxosEnd to complete the operation.
   * @param upTo - If true, creates UTXOs until reaching the target count (ignores num parameter)
   * @param num - Target number of UTXOs to create (required if upTo is false)
   * @param size - Size in sats for each UTXO to create (required if upTo is false)
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @param skipSync - If true, skips syncing with the indexer before creating UTXOs (default: false)
   * @returns Promise resolving to an unsigned PSBT string that needs to be signed externally
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Insufficient funds for UTXO creation
   *   - Invalid fee rate
   *   - Sync operation fails (if skipSync is false)
   */
  async createUtxosBegin(
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: number,
    skipSync: boolean = false
  ): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.createUtxosBegin(
      this.getWalletId(),
      upTo,
      num,
      size,
      feeRate,
      skipSync
    );
  }

  /**
   * Completes the UTXO creation process by finalizing and broadcasting a signed PSBT.
   * This method should be called after createUtxosBegin and external signing.
   * @param signedPsbt - The PSBT string that has been signed externally
   * @param skipSync - If true, skips syncing with the indexer after processing (default: false)
   * @returns Promise resolving to the number of UTXOs successfully created
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid or improperly signed PSBT
   *   - Transaction broadcast fails
   *   - Sync operation fails (if skipSync is false)
   */
  async createUtxosEnd(
    signedPsbt: string,
    skipSync: boolean = false
  ): Promise<number> {
    await this.ensureInitialized();
    return await Rgb.createUtxosEnd(this.getWalletId(), signedPsbt, skipSync);
  }

  /**
   * Deletes eligible failed transfers from the wallet database.
   * Only transfers in FAILED status can be deleted. When batchTransferIdx is provided,
   * only that specific batch transfer is deleted (if noAssetOnly is true, transfers with
   * an associated asset ID will be rejected). When batchTransferIdx is null, all failed
   * transfers are deleted (if noAssetOnly is true, transfers with asset IDs are skipped).
   * @param batchTransferIdx - Optional specific batch transfer index to delete (null deletes all failed transfers)
   * @param noAssetOnly - If true, only deletes transfers without associated asset IDs
   * @returns Promise resolving to true if any transfers were deleted, false otherwise
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Database operation fails
   */
  async deleteTransfers(
    batchTransferIdx: number | null,
    noAssetOnly: boolean
  ): Promise<boolean> {
    await this.ensureInitialized();
    return await Rgb.deleteTransfers(
      this.getWalletId(),
      batchTransferIdx,
      noAssetOnly
    );
  }

  /**
   * Marks eligible transfers as failed in the wallet database.
   * This is useful for cleaning up stuck or expired transfers. When batchTransferIdx
   * is provided, only that batch transfer is marked as failed. When null, all eligible
   * transfers are marked as failed (subject to noAssetOnly filter).
   * @param batchTransferIdx - Optional specific batch transfer index to mark as failed (null marks all eligible)
   * @param noAssetOnly - If true, only affects transfers without associated asset IDs
   * @param skipSync - If true, skips syncing with the indexer before failing transfers (default: false)
   * @returns Promise resolving to true if any transfers were marked as failed, false otherwise
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Sync operation fails (if skipSync is false)
   *   - Database operation fails
   */
  async failTransfers(
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean = false
  ): Promise<boolean> {
    await this.ensureInitialized();
    return await Rgb.failTransfers(
      this.getWalletId(),
      batchTransferIdx,
      noAssetOnly,
      skipSync
    );
  }

  /**
   * Drains all funds (Bitcoin and RGB assets) from the wallet to a specified address in a single operation.
   * This method creates the PSBT, signs it, finalizes it, and broadcasts the transaction.
   * When destroyAssets is true, RGB assets are destroyed rather than transferred.
   * @param address - The Bitcoin address to send all funds to
   * @param destroyAssets - If true, RGB assets are destroyed; if false, they are transferred if possible
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @returns Promise resolving to the transaction ID of the drain transaction
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid Bitcoin address
   *   - Insufficient funds
   *   - Invalid fee rate
   */
  async drainTo(
    address: string,
    destroyAssets: boolean,
    feeRate: number
  ): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.drainTo(
      this.getWalletId(),
      address,
      destroyAssets,
      feeRate
    );
  }

  /**
   * Begins the drain operation by generating an unsigned PSBT.
   * Use this method when you need to sign the transaction externally.
   * Must be followed by drainToEnd to complete the operation.
   * @param address - The Bitcoin address to send all funds to
   * @param destroyAssets - If true, RGB assets are destroyed; if false, they are transferred if possible
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @returns Promise resolving to an unsigned PSBT string that needs to be signed externally
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid Bitcoin address
   *   - Insufficient funds
   *   - Invalid fee rate
   */
  async drainToBegin(
    address: string,
    destroyAssets: boolean,
    feeRate: number
  ): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.drainToBegin(
      this.getWalletId(),
      address,
      destroyAssets,
      feeRate
    );
  }

  /**
   * Completes the drain operation by finalizing and broadcasting a signed PSBT.
   * This method should be called after drainToBegin and external signing.
   * @param signedPsbt - The PSBT string that has been signed externally
   * @returns Promise resolving to the transaction ID of the drain transaction
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid or improperly signed PSBT
   *   - Transaction broadcast fails
   */
  async drainToEnd(signedPsbt: string): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.drainToEnd(this.getWalletId(), signedPsbt);
  }

  /**
   * Finalizes a partially signed Bitcoin transaction (PSBT).
   * This completes the transaction by combining all signatures and preparing it for broadcast.
   * @param signedPsbt - The PSBT string that has been signed (may be partially signed)
   * @returns Promise resolving to the finalized PSBT string ready for broadcast
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid or improperly formatted PSBT
   *   - Insufficient signatures
   */
  async finalizePsbt(signedPsbt: string): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.finalizePsbt(this.getWalletId(), signedPsbt);
  }

  /**
   * Signs a Bitcoin transaction (PSBT) with the wallet's keys.
   * This method signs all inputs that the wallet can sign and returns the signed PSBT.
   * @param unsignedPsbt - The unsigned PSBT string to sign
   * @returns Promise resolving to the signed PSBT string
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid or improperly formatted PSBT
   *   - The wallet cannot sign the required inputs
   */
  async signPsbt(unsignedPsbt: string): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.signPsbt(this.getWalletId(), unsignedPsbt);
  }

  /**
   * Generates and returns a new Bitcoin address from the vanilla wallet.
   * Each call returns the next address in the derivation sequence.
   * @returns Promise resolving to a new Bitcoin address string
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Address generation fails
   */
  async getAddress(): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.getAddress(this.getWalletId());
  }

  /**
   * Retrieves the balance information for a specific RGB asset.
   * Returns settled, future, and spendable balances for the asset.
   * @param assetId - The RGB asset identifier to query balance for
   * @returns Promise resolving to Balance containing settled, future, and spendable amounts
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid asset ID
   *   - Asset not found in wallet
   */
  async getAssetBalance(assetId: string): Promise<Interfaces.Balance> {
    await this.ensureInitialized();
    return await Rgb.getAssetBalance(this.getWalletId(), assetId);
  }

  /**
   * Retrieves comprehensive metadata for a specific RGB asset.
   * Includes information such as supply, precision, schema type, token data (for UDA), and more.
   * @param assetId - The RGB asset identifier to retrieve metadata for
   * @returns Promise resolving to AssetMetadata containing all asset information
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid asset ID
   *   - Asset not found in wallet
   */
  async getAssetMetadata(assetId: string): Promise<Interfaces.AssetMetadata> {
    await this.ensureInitialized();
    return await Rgb.getAssetMetadata(this.getWalletId(), assetId);
  }

  /**
   * Estimates the fee rate required for a transaction to be confirmed within a target number of blocks.
   * @param blocks - The target number of blocks for confirmation
   * @returns Promise resolving to the estimated fee rate in sat/vbyte
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Fee estimation service unavailable
   */
  async getFeeEstimation(blocks: number): Promise<number> {
    await this.ensureInitialized();
    return await Rgb.getFeeEstimation(this.getWalletId(), blocks);
  }

  /**
   * Returns the file system path to the wallet's media directory.
   * This directory stores media files associated with RGB assets (e.g., images for UDA tokens).
   * @returns Promise resolving to the absolute path of the media directory
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Media directory path cannot be determined
   */
  async getMediaDir(): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.getMediaDir(this.getWalletId());
  }

  /**
   * Retrieves the wallet configuration and metadata.
   * Returns information such as network, supported schemas, xPubs, and wallet directory.
   * @returns Promise resolving to WalletData containing all wallet configuration
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Wallet data cannot be retrieved
   */
  async getWalletData(): Promise<Interfaces.WalletData> {
    await this.ensureInitialized();
    return await Rgb.getWalletData(this.getWalletId());
  }

  /**
   * Returns the file system path to the wallet's data directory.
   * This directory contains all wallet files including the database and media files.
   * @returns Promise resolving to the absolute path of the wallet directory
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Wallet directory path cannot be determined
   */
  async getWalletDir(): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.getWalletDir(this.getWalletId());
  }

  /**
   * Inflates an Inflatable Fungible Asset (IFA) by minting additional supply in a single operation.
   * This method creates the PSBT, signs it, finalizes it, and broadcasts the transaction.
   * The asset must support inflation and you must have inflation rights.
   * @param assetId - The IFA asset identifier to inflate
   * @param inflationAmounts - Array of amounts to mint (each amount is allocated to a separate UTXO)
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @param minConfirmations - Minimum number of confirmations required for the transaction to be considered settled
   * @returns Promise resolving to OperationResult containing the transaction ID and batch transfer index
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid asset ID
   *   - Asset does not support inflation
   *   - Insufficient inflation rights
   *   - Insufficient funds for fees
   *   - Invalid fee rate
   */
  async inflate(
    assetId: string,
    inflationAmounts: number[],
    feeRate: number,
    minConfirmations: number
  ): Promise<Interfaces.OperationResult> {
    await this.ensureInitialized();
    return await Rgb.inflate(
      this.getWalletId(),
      assetId,
      inflationAmounts,
      feeRate,
      minConfirmations
    );
  }

  /**
   * Begins the inflation process by generating an unsigned PSBT.
   * Use this method when you need to sign the transaction externally.
   * Must be followed by inflateEnd to complete the operation.
   * @param assetId - The IFA asset identifier to inflate
   * @param inflationAmounts - Array of amounts to mint (each amount is allocated to a separate UTXO)
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @param minConfirmations - Minimum number of confirmations required for the transaction to be considered settled
   * @returns Promise resolving to an unsigned PSBT string that needs to be signed externally
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid asset ID
   *   - Asset does not support inflation
   *   - Insufficient inflation rights
   *   - Insufficient funds for fees
   *   - Invalid fee rate
   */
  async inflateBegin(
    assetId: string,
    inflationAmounts: number[],
    feeRate: number,
    minConfirmations: number
  ): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.inflateBegin(
      this.getWalletId(),
      assetId,
      inflationAmounts,
      feeRate,
      minConfirmations
    );
  }

  /**
   * Completes the inflation process by finalizing and broadcasting a signed PSBT.
   * This method should be called after inflateBegin and external signing.
   * @param signedPsbt - The PSBT string that has been signed externally
   * @returns Promise resolving to OperationResult containing the transaction ID and batch transfer index
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid or improperly signed PSBT
   *   - Transaction broadcast fails
   */
  async inflateEnd(signedPsbt: string): Promise<Interfaces.OperationResult> {
    await this.ensureInitialized();
    return await Rgb.inflateEnd(this.getWalletId(), signedPsbt);
  }

  /**
   * Issues a new Collectible Fungible Asset (CFA) with the specified parameters.
   * CFA assets are fungible tokens that can have associated media files.
   * Each amount in the amounts array will be allocated to a separate UTXO.
   * @param name - The name of the asset
   * @param details - Optional detailed description of the asset
   * @param precision - The decimal precision (divisibility) of the asset (0-18)
   * @param amounts - Array of initial amounts to issue (each allocated to a separate UTXO)
   * @param filePath - Optional path to a media file to associate with the asset
   * @returns Promise resolving to AssetCfa containing the asset ID and details
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid asset parameters (name, precision, amounts)
   *   - Media file not found or invalid (if filePath provided)
   *   - Insufficient UTXOs for allocation
   */
  async issueAssetCfa(
    name: string,
    details: string | null,
    precision: number,
    amounts: number[],
    filePath: string | null
  ): Promise<Interfaces.AssetCfa> {
    await this.ensureInitialized();
    return await Rgb.issueAssetCfa(
      this.getWalletId(),
      name,
      details,
      precision,
      amounts,
      filePath
    );
  }

  /**
   * Issues a new Inflatable Fungible Asset (IFA) with the specified parameters.
   * IFA assets are fungible tokens that support inflation and replace rights.
   * The inflationAmounts array can be empty. If provided, the sum of inflationAmounts
   * and amounts cannot exceed the maximum u64 value. replaceRightsNum can be 0 or
   * represent the number of replace rights to create.
   * @param ticker - The ticker symbol of the asset (e.g., 'BTC', 'USD')
   * @param name - The name of the asset
   * @param precision - The decimal precision (divisibility) of the asset (0-18)
   * @param amounts - Array of initial amounts to issue (each allocated to a separate UTXO)
   * @param inflationAmounts - Array of inflation amounts to issue initially (each allocated to a separate UTXO)
   * @param replaceRightsNum - Number of replace rights to create (can be 0)
   * @param rejectListUrl - Optional URL to a reject list for the asset
   * @returns Promise resolving to AssetIfa containing the asset ID and details
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid asset parameters (ticker, name, precision, amounts)
   *   - Invalid inflation amounts or replace rights configuration
   *   - Invalid reject list URL (if provided)
   *   - Insufficient UTXOs for allocation
   */
  async issueAssetIfa(
    ticker: string,
    name: string,
    precision: number,
    amounts: number[],
    inflationAmounts: number[],
    replaceRightsNum: number,
    rejectListUrl: string | null
  ): Promise<Interfaces.AssetIfa> {
    await this.ensureInitialized();
    return await Rgb.issueAssetIfa(
      this.getWalletId(),
      ticker,
      name,
      precision,
      amounts,
      inflationAmounts,
      replaceRightsNum,
      rejectListUrl
    );
  }

  /**
   * Issues a new Non-Inflatable Asset (NIA) with the specified parameters.
   * NIA assets are simple fungible tokens that cannot be inflated after issuance.
   * Each amount in the amounts array will be allocated to a separate UTXO.
   * @param ticker - The ticker symbol of the asset (e.g., 'BTC', 'USD')
   * @param name - The name of the asset
   * @param precision - The decimal precision (divisibility) of the asset (0-18)
   * @param amounts - Array of initial amounts to issue (each allocated to a separate UTXO)
   * @returns Promise resolving to AssetNia containing the asset ID and details
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid asset parameters (ticker, name, precision, amounts)
   *   - Insufficient UTXOs for allocation
   */
  async issueAssetNia(
    ticker: string,
    name: string,
    precision: number,
    amounts: number[]
  ): Promise<Interfaces.AssetNia> {
    await this.ensureInitialized();
    return (await Rgb.issueAssetNia(
      this.getWalletId(),
      ticker,
      name,
      precision,
      amounts
    )) as Interfaces.AssetNia;
  }

  /**
   * Issues a new Unique Digital Asset (UDA) with the specified parameters.
   * UDA assets are non-fungible tokens that represent unique digital items.
   * Each UDA can have a primary media file and multiple attachment files.
   * @param ticker - The ticker symbol of the asset
   * @param name - The name of the asset
   * @param details - Optional detailed description of the asset
   * @param precision - The decimal precision (divisibility) of the asset (typically 0 for NFTs)
   * @param mediaFilePath - Optional path to the primary media file for the asset
   * @param attachmentsFilePaths - Array of paths to additional attachment files (max 20)
   * @returns Promise resolving to AssetUda containing the asset ID and details
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid asset parameters (ticker, name, precision)
   *   - Media file not found or invalid (if mediaFilePath provided)
   *   - Attachment files not found or invalid (if attachmentsFilePaths provided)
   *   - Too many attachment files (max 20)
   *   - Insufficient UTXOs for allocation
   */
  async issueAssetUda(
    ticker: string,
    name: string,
    details: string | null,
    precision: number,
    mediaFilePath: string | null,
    attachmentsFilePaths: string[]
  ): Promise<Interfaces.AssetUda> {
    await this.ensureInitialized();
    return await Rgb.issueAssetUda(
      this.getWalletId(),
      ticker,
      name,
      details,
      precision,
      mediaFilePath,
      attachmentsFilePaths
    );
  }

  /**
   * Lists all RGB assets known to the wallet, optionally filtered by schema type.
   * Returns assets grouped by schema (NIA, UDA, CFA, IFA). If filterAssetSchemas is empty,
   * all assets are returned. Otherwise, only assets matching the provided schemas are returned.
   * @param filterAssetSchemas - Array of asset schemas to filter by (empty array returns all schemas)
   * @returns Promise resolving to Assets object containing arrays of assets grouped by schema
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid schema filter values
   *   - Database query fails
   */
  async listAssets(
    filterAssetSchemas: Interfaces.AssetSchema[]
  ): Promise<Interfaces.Assets> {
    await this.ensureInitialized();
    return await Rgb.listAssets(this.getWalletId(), filterAssetSchemas);
  }

  /**
   * Lists all Bitcoin transactions known to the wallet.
   * Includes transactions created for RGB operations (sends, UTXO creation, drains) as well as regular Bitcoin transactions.
   * @param skipSync - If true, skips syncing with the indexer before listing transactions (default: false)
   * @returns Promise resolving to an array of Transaction objects
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Sync operation fails (if skipSync is false)
   *   - Database query fails
   */
  async listTransactions(
    skipSync: boolean = false
  ): Promise<Interfaces.Transaction[]> {
    await this.ensureInitialized();
    return await Rgb.listTransactions(this.getWalletId(), skipSync);
  }

  /**
   * Lists all RGB transfers for a specific asset or all assets.
   * Returns user-driven transfers including incoming, outgoing, issuance, and inflation transfers.
   * @param assetId - Optional asset ID to filter transfers for a specific asset (null returns all transfers)
   * @returns Promise resolving to an array of Transfer objects
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Invalid asset ID (if provided)
   *   - Database query fails
   */
  async listTransfers(assetId: string | null): Promise<Interfaces.Transfer[]> {
    await this.ensureInitialized();
    return await Rgb.listTransfers(this.getWalletId(), assetId);
  }

  /**
   * Lists all unspent transaction outputs (UTXOs) in the wallet.
   * Each UTXO includes its Bitcoin balance and any RGB asset allocations.
   * @param settledOnly - If true, only includes settled RGB allocations (default: false includes all)
   * @param skipSync - If true, skips syncing with the indexer before listing unspents (default: false)
   * @returns Promise resolving to an array of Unspent objects
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - Sync operation fails (if skipSync is false)
   *   - Database query fails
   */
  async listUnspents(
    settledOnly: boolean,
    skipSync: boolean = false
  ): Promise<Interfaces.Unspent[]> {
    await this.ensureInitialized();
    return await Rgb.listUnspents(this.getWalletId(), settledOnly, skipSync);
  }

  /**
   * Refreshes RGB transfers by checking for new consignments and updating transfer statuses.
   * This method queries the transport endpoints to fetch new transfer data and processes any
   * pending incoming or outgoing transfers. The filter parameter controls which transfers to refresh.
   * @param assetId - Optional asset ID to refresh transfers for a specific asset (null refreshes all)
   * @param filter - Array of RefreshFilter values to control which transfers are refreshed
   * @param skipSync - If true, skips syncing with the indexer before refreshing (default: false)
   * @returns Promise resolving to a record mapping transfer IDs to RefreshedTransfer objects
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid filter parameters
   *   - Transport endpoint connection fails
   *   - Sync operation fails (if skipSync is false)
   */
  async refresh(
    assetId: string | null,
    filter: Interfaces.RefreshFilter[],
    skipSync: boolean = false
  ): Promise<Record<string, Interfaces.RefreshedTransfer>> {
    await this.ensureInitialized();
    return await Rgb.refresh(this.getWalletId(), assetId, filter, skipSync);
  }

  /**
   * Sends RGB assets to recipients in a single operation.
   * This method creates the PSBT, signs it, finalizes it, and broadcasts the transaction.
   * The recipientMap maps asset IDs to arrays of recipients. When donation is true, assets
   * that cannot be fully sent are donated (destroyed) rather than creating change.
   * @param recipientMap - Map of asset IDs to arrays of recipients for that asset
   * @param donation - If true, assets that cannot be fully sent are donated rather than creating change
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @param minConfirmations - Minimum number of confirmations required for the transaction to be considered settled
   * @param skipSync - If true, skips syncing with the indexer before sending (default: false)
   * @returns Promise resolving to OperationResult containing the transaction ID and batch transfer index
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid recipient data
   *   - Insufficient asset balance
   *   - Insufficient funds for fees
   *   - Invalid fee rate
   *   - Sync operation fails (if skipSync is false)
   */
  async send(
    recipientMap: Record<string, Interfaces.Recipient[]>,
    donation: boolean,
    feeRate: number,
    minConfirmations: number,
    skipSync: boolean = false
  ): Promise<Interfaces.OperationResult> {
    await this.ensureInitialized();
    return await Rgb.send(
      this.getWalletId(),
      recipientMap,
      donation,
      feeRate,
      minConfirmations,
      skipSync
    );
  }

  /**
   * Begins the send operation by generating an unsigned PSBT.
   * Use this method when you need to sign the transaction externally.
   * Must be followed by sendEnd to complete the operation.
   * @param recipientMap - Map of asset IDs to arrays of recipients for that asset
   * @param donation - If true, assets that cannot be fully sent are donated rather than creating change
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @param minConfirmations - Minimum number of confirmations required for the transaction to be considered settled
   * @returns Promise resolving to an unsigned PSBT string that needs to be signed externally
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid recipient data
   *   - Insufficient asset balance
   *   - Insufficient funds for fees
   *   - Invalid fee rate
   */
  async sendBegin(
    recipientMap: Record<string, Interfaces.Recipient[]>,
    donation: boolean,
    feeRate: number,
    minConfirmations: number
  ): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.sendBegin(
      this.getWalletId(),
      recipientMap,
      donation,
      feeRate,
      minConfirmations
    );
  }

  /**
   * Completes the send operation by finalizing and broadcasting a signed PSBT.
   * This method should be called after sendBegin and external signing.
   * @param signedPsbt - The PSBT string that has been signed externally
   * @param skipSync - If true, skips syncing with the indexer after processing (default: false)
   * @returns Promise resolving to OperationResult containing the transaction ID and batch transfer index
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid or improperly signed PSBT
   *   - Transaction broadcast fails
   *   - Sync operation fails (if skipSync is false)
   */
  async sendEnd(
    signedPsbt: string,
    skipSync: boolean = false
  ): Promise<Interfaces.OperationResult> {
    await this.ensureInitialized();
    return await Rgb.sendEnd(this.getWalletId(), signedPsbt, skipSync);
  }

  /**
   * Sends Bitcoin to a specified address in a single operation.
   * This method creates the PSBT, signs it, finalizes it, and broadcasts the transaction.
   * @param address - The Bitcoin address to send to
   * @param amount - The amount to send in satoshis
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @param skipSync - If true, skips syncing with the indexer before sending (default: false)
   * @returns Promise resolving to the transaction ID of the Bitcoin transaction
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid Bitcoin address
   *   - Insufficient balance
   *   - Invalid fee rate
   *   - Sync operation fails (if skipSync is false)
   */
  async sendBtc(
    address: string,
    amount: number,
    feeRate: number,
    skipSync: boolean = false
  ): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.sendBtc(
      this.getWalletId(),
      address,
      amount,
      feeRate,
      skipSync
    );
  }

  /**
   * Begins the Bitcoin send operation by generating an unsigned PSBT.
   * Use this method when you need to sign the transaction externally.
   * Must be followed by sendBtcEnd to complete the operation.
   * @param address - The Bitcoin address to send to
   * @param amount - The amount to send in satoshis
   * @param feeRate - Transaction fee rate in sat/vbyte
   * @param skipSync - If true, skips syncing with the indexer before creating the PSBT (default: false)
   * @returns Promise resolving to an unsigned PSBT string that needs to be signed externally
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid Bitcoin address
   *   - Insufficient balance
   *   - Invalid fee rate
   *   - Sync operation fails (if skipSync is false)
   */
  async sendBtcBegin(
    address: string,
    amount: number,
    feeRate: number,
    skipSync: boolean = false
  ): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.sendBtcBegin(
      this.getWalletId(),
      address,
      amount,
      feeRate,
      skipSync
    );
  }

  /**
   * Completes the Bitcoin send operation by finalizing and broadcasting a signed PSBT.
   * This method should be called after sendBtcBegin and external signing.
   * @param signedPsbt - The PSBT string that has been signed externally
   * @param skipSync - If true, skips syncing with the indexer after processing (default: false)
   * @returns Promise resolving to the transaction ID of the Bitcoin transaction
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Invalid or improperly signed PSBT
   *   - Transaction broadcast fails
   *   - Sync operation fails (if skipSync is false)
   */
  async sendBtcEnd(
    signedPsbt: string,
    skipSync: boolean = false
  ): Promise<string> {
    await this.ensureInitialized();
    return await Rgb.sendBtcEnd(this.getWalletId(), signedPsbt, skipSync);
  }

  /**
   * Synchronizes the wallet with the connected indexer.
   * Updates the wallet's view of the blockchain state, including UTXO status,
   * transaction confirmations, and RGB transfer states. This method requires
   * the wallet to be online (goOnline must be called first).
   * @returns Promise that resolves when synchronization is complete
   * @throws {RgbError} Throws RgbError with a code from {@link RgbLibErrors} if:
   *   - The wallet is not found
   *   - The wallet is not online
   *   - Indexer connection fails
   *   - Network connectivity issues occur
   */
  async sync(): Promise<void> {
    await this.ensureInitialized();
    await Rgb.sync(this.getWalletId());
  }
}
