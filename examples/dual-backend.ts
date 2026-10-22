import {
  UTEXOWallet,
  type RlnWalletInit,
  type RgbLibWalletInit,
  type IRLNUnlockParams,
  type RgbLibUnlockParams,
  type AnyUtexoWallet,
} from '../src';

type SessionConfig =
  | (RlnWalletInit & { unlock: IRLNUnlockParams })
  | (RgbLibWalletInit & { unlock: RgbLibUnlockParams });

async function start(wallet: AnyUtexoWallet, connect: () => Promise<void>) {
  try {
    await wallet.init();
  } catch (error) {
    // Existing RLN profiles report AlreadyInitialized after an app restart.
    if (
      wallet.protocol !== 'RGB_LN' ||
      !/AlreadyInitialized|already (?:been )?initialized/i.test(String(error))
    ) {
      throw error;
    }
  }
  await connect();
  return {
    identity: await wallet.getWalletIdentity(),
    address: await wallet.getAddress(),
  };
}

/**
 * The app owns the facade before starting it, including if start/cleanup fails.
 * On a switch: stop polling, revoke sessions, await previous.wallet.dispose(),
 * then create/start the next session.
 */
export function createDemoSession(config: SessionConfig) {
  if (config.protocol === 'RGB_L1') {
    const wallet = new UTEXOWallet(config);
    return {
      wallet,
      start: () => start(wallet, () => wallet.goOnline(config.unlock)),
    };
  }
  const wallet = new UTEXOWallet(config);
  return {
    wallet,
    start: () => start(wallet, () => wallet.unlock(config.unlock)),
  };
}

export function lightningOnly(wallet: AnyUtexoWallet) {
  return wallet.protocol === 'RGB_LN' ? wallet : undefined;
}
