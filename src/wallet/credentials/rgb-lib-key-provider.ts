export interface IRgbLibKeyProvider {
  /** Called on each new native session; storage and authentication belong to the app. */
  getMnemonic(): Promise<string>;
}

/** Integrates an app's existing SecureStore/keychain without retaining its mnemonic. */
export class CallbackRgbLibKeyProvider implements IRgbLibKeyProvider {
  constructor(private readonly readMnemonic: () => Promise<string>) {}

  getMnemonic(): Promise<string> {
    return this.readMnemonic();
  }
}
