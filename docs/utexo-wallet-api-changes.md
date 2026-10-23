# `UTEXOWallet`: до і після

Порівняння публічних методів `UTEXOWallet<'RGB_LN'>` і `UTEXOWallet<'RGB_L1'>` між гілкою `feat/rgb-lib-bfa` (база) і `feat/native-api-parity`. Сюди входять обидва PR:

- [#69](https://github.com/UTEXO-Protocol/rgb-sdk-rn/pull/69): RLN з rgb-lightning-node#212 (`sendrgbinvoice`).
- [#70](https://github.com/UTEXO-Protocol/rgb-sdk-rn/pull/70): паритет нативних API.

Колонка «Сигнатура» звірена з TypeScript compiler API: розв'язані типи кожного методу для обох протоколів, до і після. Поведінкові зміни, яких не видно в типах, описані окремо.

Позначки: **LN** — RGB_LN (RLN), **L1** — RGB_L1 (rgb-lib).

---

## 1. Нові методи

| Метод              | Протоколи | Сигнатура                                                                                 | Що робить                                                                                                               | PR      |
| ------------------ | --------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| `issueAssetCfa`    | LN, L1    | `(params: IssueAssetCfaParams) => Promise<AssetCFA>`                                      | Випуск CFA. LN спочатку завантажує `filePath` на ноду (`postassetmedia`) і випускає з digest. L1 передає шлях у rgb-lib | #70 |
| `issueAssetUda`    | LN, L1    | `(params: IssueAssetUdaParams) => Promise<AssetUDA>`                                      | Випуск UDA з `mediaFilePath` та `attachmentsFilePaths`; LN завантажує кожен файл                                        | #70 |
| `getAssetMetadata` | LN, L1    | `(assetId: string) => Promise<AssetMetadata>`                                             | Метадані контракту; supply — точні u64-рядки                                                                            | #70 |
| `drainTo`          | L1        | `(this: UTEXOWallet<'RGB_L1'>, { address, feeRate? }) => Promise<string>`                 | Відправляє весь vanilla BTC на адресу, повертає txid. На LN кидає `UNSUPPORTED_CAPABILITY`                              | #70 |
| `deleteTransfers`  | L1        | `(this: UTEXOWallet<'RGB_L1'>, { batchTransferIdx?, noAssetOnly? }?) => Promise<boolean>` | Видаляє failed-трансфери з локальної БД. На LN кидає `UNSUPPORTED_CAPABILITY`                                           | #70 |

## 2. Методи, що стали спільними

| Метод             | Було                                                                                           | Стало                                                                                                                               | PR      |
| ----------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `checkIndexerUrl` | лише LN (`this: UTEXOWallet<'RGB_LN'>`), повертав `{ indexerProtocol }` у вигляді `"Electrum"` | обидва протоколи, `(url) => Promise<{ indexerProtocol: string }>`; значення в нижньому регістрі (`electrum`, `esplora`, `bitcoind`) | #70 |

## 3. Змінені сигнатури (сумісно: лише нові необов'язкові параметри або ширші типи)

| Метод                    | Протоколи | До                                                  | Після                                                                                                                                            | PR      |
| ------------------------ | --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `getBtcBalance`          | LN, L1    | `()`                                                | `(options?: { skipSync? })`                                                                                                                      | #70 |
| `listUnspents`           | LN, L1    | `()`                                                | `(options?: { skipSync? })`                                                                                                                      | #70 |
| `listTransactions`       | LN, L1    | `()`                                                | `(options?: { skipSync? })`                                                                                                                      | #70 |
| `createUtxos`            | LN, L1    | `({ upTo?, num?, size?, feeRate? })`                | `+ skipSync?`                                                                                                                                    | #70 |
| `listAssets`             | LN, L1    | `()`                                                | `(options?: { filterAssetSchemas?: ('Nia'\|'Cfa'\|'Uda'\|'Ifa'\|'Bfa')[] })`                                                                     | #70 |
| `blindReceive`           | LN, L1    | `(params: InvoiceRequest)`                          | `(params: ReceiveParams)` = `InvoiceRequest + assignmentKind?`                                                                                   | #70 |
| `witnessReceive`         | LN, L1    | `(params: InvoiceRequest)`                          | `(params: ReceiveParams)`                                                                                                                        | #70 |
| `onchainReceive`         | LN, L1    | `(params: OnchainReceiveRequestModel)`              | `(params: OnchainReceiveParams)` = `+ assignmentKind?`                                                                                           | #70 |
| `decodeRGBInvoice`       | LN        | `Promise<InvoiceData>`                              | `Promise<InvoiceData & { publicKey?, encryption? }>` (L1 уже повертав ці поля)                                                                   | #69     |
| `createLightningInvoice` | LN        | `{ …, minFinalCltvExpiryDelta?, descriptionHash? }` | `+ description?`                                                                                                                                 | #70 |
| `createHodlInvoice`      | LN        | `{ …, descriptionHash? }`                           | `+ description?`                                                                                                                                 | #70 |
| `getNodeInfo`            | LN        | `Promise<LightningNodeInfo>`                        | `Promise<LightningNodeDetails>` = `LightningNodeInfo + eventualCloseFeesSat, pendingOutboundPaymentsSat, accountXpubVanilla, accountXpubColored` | #70 |
| `decodeLnInvoice`        | LN        | `Promise<DecodedLnInvoice>`                         | `Promise<DecodedLnInvoiceDetails>` = `+ minFinalCltvExpiryDelta`                                                                                 | #70 |

Правила `assignmentKind` однакові для обох рушіїв (`resolveReceiveAssignment`):

| `assignmentKind`             | `amount`     | LN                   | L1                                             |
| ---------------------------- | ------------ | -------------------- | ---------------------------------------------- |
| не задано                    | є            | `Fungible`           | `Fungible`                                     |
| не задано                    | немає        | `Any`                | `Any`                                          |
| `Fungible`, `InflationRight` | обов'язковий | ✅                   | ✅                                             |
| `NonFungible`, `Any`         | заборонений  | ✅                   | ✅ (rgb-lib вимагає `assetId` для NonFungible) |
| `MintRight`                  | заборонений  | ❌ `ValidationError` | ✅                                             |

## 4. Та сама сигнатура, змінена поведінка

| Метод                                                              | Протоколи | До                                                                                                                                                                                | Після                                                                                                                                                                                                                                 | PR      |
| ------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `onchainSend`                                                      | LN        | Декодував інвойс і слав через `send_rgb` з окремих полів; RLN #212 такі proxy-отримувачі відхиляє. `feeRate` за замовчуванням `1.5` (міст обрізав до 1). Дробові числа обрізались | Весь інвойс іде в `sendrgbinvoice`. `amount` за замовчуванням береться з fungible-інвойсу. `amount`, `feeRate`, `minConfirmations`, `witnessData` мають бути цілими в межах, інакше `ValidationError`. `feeRate` за замовчуванням `1` | #69     |
| `onchainSend`                                                      | L1        | без змін                                                                                                                                                                          | без змін                                                                                                                                                                                                                              | —       |
| `createUtxos`                                                      | LN        | Повертав `params.num ?? 0`, а не реальну кількість. `feeRate` за замовчуванням `1.5` (→1)                                                                                         | Повертає кількість нових colorable UTXO (різниця outpoint до і після; rgb-lib одразу пише broadcast-tx у локальний стан). `num`, `size`, `feeRate` валідуються                                                                        | #70 |
| `inflate`                                                          | LN        | `feeRate ?? 1.5` (→1), без валідації                                                                                                                                              | `feeRate ?? 1`; `inflationAmounts`, `feeRate`, `minConfirmations` валідуються                                                                                                                                                         | #70 |
| `sendBtc`                                                          | LN        | Числа без перевірки                                                                                                                                                               | `amount`, `feeRate` — додатні safe integer                                                                                                                                                                                            | #70 |
| `issueAssetNia`, `issueAssetIfa`                                   | LN        | Без перевірки                                                                                                                                                                     | `precision` 0..18, суми — додатні safe integer (як на L1)                                                                                                                                                                             | #70 |
| `estimateFeeRate`                                                  | LN        | Повертав дробове значення ноди                                                                                                                                                    | Округлює вгору до цілого, як L1 (результат можна передати як `feeRate`)                                                                                                                                                               | #70 |
| `failTransfers`                                                    | LN        | `batchTransferIdx` без перевірки                                                                                                                                                  | `batchTransferIdx` 1..2^31−1                                                                                                                                                                                                          | #70 |
| `keysend`, `payLightningInvoice`                                   | LN        | `amtMsat`, `assetAmount` без перевірки                                                                                                                                            | Безпечні цілі для мосту (`toSafeBridgeNumber`)                                                                                                                                                                                        | #70 |
| `getNodeInfo`                                                      | LN        | Обидва бриджі передавали лише 6 полів; `rgbHtlcMinMsat`, ліміти каналів, `networkNodes` тощо завжди були `undefined`                                                              | Передаються всі 18 полів `NodeInfo`                                                                                                                                                                                                   | #70 |
| `getLightningReceiveStatus` (і `getPayment`)                       | LN        | Android шукав лише `OUTBOUND`, тож вхідні платежі не знаходились                                                                                                                  | Android перебирає `OUTBOUND`, `INBOUND_AUTO_CLAIM`, `INBOUND_HODL`, як iOS                                                                                                                                                            | #70 |
| `listPayments`                                                     | LN        | `paymentType` приходив як `OUTBOUND` / `INBOUNDAUTOCLAIM`, mapper порівнював з `'Outbound'`, тож **кожен** платіж був `inbound: true`                                             | `paymentType` нормалізується до `Outbound`/`InboundAutoClaim`/`InboundHodl`; `inbound` правильний                                                                                                                                     | #70 |
| `listOnchainTransfers`, `listTransfers`                            | LN        | Трансфер `Mint` (rgb-lib-bfa) показувався як `Send`                                                                                                                               | `kind: 'Mint'`, як на L1                                                                                                                                                                                                              | #69     |
| `unlock` з `NativeExternalRLNSigner`                               | LN        | `ethRpcUrl` не передавався (BFA-валідація недоступна), `gossipRgsServerUrl` мовчки губився                                                                                        | `ethRpcUrl` передається (`unlockWithNativeExternalSignerRequest`); `gossipRgsServerUrl` → `ValidationError`, бо в RLN для external signer такого параметра немає                                                                      | #70 |
| `new UTEXOWallet(params, signer)`                                  | LN        | `reuseAddresses: true` падав у нативі під час `init`                                                                                                                              | `ConfigurationError` одразу в конструкторі                                                                                                                                                                                            | #69     |
| `getBtcBalance`, `listUnspents`, `listTransactions`, `createUtxos` | LN, L1    | `skipSync` захардкоджений `false` в обох рушіях                                                                                                                                   | Передається з `options.skipSync`; за замовчуванням `false`, як раніше                                                                                                                                                                 | #70 |
| `listAssets`                                                       | LN, L1    | Фільтр захардкоджений `[]` в обох бриджах                                                                                                                                         | Передається `filterAssetSchemas`                                                                                                                                                                                                      | #70 |
| receive-методи                                                     | L1        | Бридж будував лише `Fungible`/`Any`                                                                                                                                               | Будь-який `assignmentKind` з таблиці вище                                                                                                                                                                                             | #70 |

## 5. Без змін (47 методів)

Сигнатура і поведінка не змінились:

`apayNew`, `apayNewWithAddress`, `backupNow`, `burn`, `cancelHodlInvoice`, `checkProxyEndpoint`, `claimHodlInvoice`, `closeChannel`, `connectPeer`, `createBackup`, `createLsp`, `destroy`, `disconnectPeer`, `dispose`, `getAddress`, `getAssetBalance`, `getBfaCapabilities`, `getChannelId`, `getConsignment`, `getConsignmentPath`, `getLightningSendStatus`, `getLspConfig`, `getNetwork`, `getNetworkInfo`, `getWalletIdentity`, `goOnline`, `init`, `initialize`, `invoiceStatus`, `isDisposed`, `listChannels`, `listLightningPayments`, `listPeers`, `listTransactionsByTxid`, `listTransfersByTxid`, `openChannel`, `refreshTransfers`, `refreshWallet`, `reinit`, `rotateVanillaAddress`, `shutdown`, `signMessage`, `syncWallet`, `unlock` (з `PasswordRLNSigner`), `verifyMessage`, `vssClearFence`.

Ще 13 методів з тією ж сигнатурою змінили поведінку, див. розділ 4: `estimateFeeRate`, `listPayments`, `failTransfers`, `inflate`, `issueAssetIfa`, `issueAssetNia`, `keysend`, `payLightningInvoice`, `sendBtc`, `getLightningReceiveStatus`, `listOnchainTransfers`, `listTransfers`, `onchainSend`. Типи RLN-only методів `getNodeInfo` і `decodeLnInvoice` компілятор показує як `ReturnType<RlnWallet[...]>`, тому їхня зміна типу видна лише в розділі 3.

## 6. Нативний шар (для рев'ю)

- **TurboModule `Rgb` (RLN):**
  - нові `rlnPostAssetMedia`, `rlnAssetMetadata`;
  - `rlnLnInvoice` отримав `description` в кінці;
  - в `rlnUnlockNodeWithNativeExternalSigner` останній параметр `gossipRgsServerUrl` замінено на `ethRpcUrl`.

  Селектори ObjC звірені зі згенерованим `RgbSpec`.

- **TurboModule `RgbLib`:**
  - нові `getAssetMetadata`, `issueAssetCfa`, `issueAssetUda`, `deleteTransfers`, `drainTo`, `checkIndexerUrl`;
  - `listAssets` отримав `filterAssetSchemas`;
  - `receive` отримав `assignmentKind` в кінці;
  - `bridgeVersion` 2 → 3: JS відхилить старий нативний модуль, а не викличе його з новими параметрами.
- **Перевірки:**
  - `npm test`: 50 + 25 + 47 тестів;
  - iOS UniFFI smoke для rgb-lib: реальні виклики, включно з новими операціями;
  - `swiftc -typecheck` RLN-бриджа;
  - Android `compileDebugKotlin` у rgb-sdk-rn-demo з локальним AAR RLN з #212.

## 7. Що свідомо не змінювалось

Ці пункти потребують змін у RLN або нового продуктового рішення:

- **RLN unlock з external signer без RGS:** у `SdkExternalUnlockRequest` немає поля gossip.
- **RLN `sendrgbinvoice` лише для fungible:** немає NonFungible/batch send через RLN.
- **RLN `inflate` повертає тільки `txid`:** у нативній відповіді немає `batchTransferIdx`.
- **RLN-only методи без UI в SDK:** swaps, import contract/consignment, onion messages.
- **L1-only опції rgb-lib без аналогів у RLN:**
  - вибір `encryption` у receive;
  - `settledOnly` у `listUnspents`;
  - фільтри `refresh`;
  - опції `goOnline`;
  - BFA mint, out-of-band, pending vanilla tx;
  - PSBT begin/end (свідомо прибрано з RN).
