# Аудит нативного API: RLN, rgb-lib і `UTEXOWallet`

Дата: 2026-10-22. Гілка: `feat/rln-bfa-invoice-send` (після PR #69).

Джерела:

- **RLN:** `bindings/rgb_lightning_node.udl` і згенеровані Kotlin-біндінги з rgb-lightning-node#212 (`c29d1b2`).
- **rgb-lib:** `RGBLib.swiftinterface` з установленого бандла `v0.3.0-beta.7-upstream-dev-bfa.1`.
- **SDK:** `src/binding/NativeRgb.ts`, `NativeRgbLib.ts`, `RgbModule.kt`, `RgbSwiftHelper.swift`, `RgbLibSessionStore.kt`, `RgbLibSwiftHelper.swift`, `rln-wallet.ts`, `rgb-lib/backend.ts`.

> **Статус (2026-10-23):** у гілці `feat/native-api-parity` закрито все, що вирішується в rgb-sdk-rn:
>
> - P0 #1–#6;
> - для P0 #2 — `ethRpcUrl`, а gossip тепер явно відхиляється;
> - прокидання `assignmentKind`, `filterAssetSchemas`, `skipSync`, `description`, полів `NodeInfo` і CLTV delta;
> - нові `issueAssetCfa`/`issueAssetUda`, `getAssetMetadata`, `checkIndexerUrl` для L1, `drainTo` і `deleteTransfers`.
>
> Під час роботи знайдено ще баг із `paymentType`/`inbound`: усі платежі позначались як вхідні. Його теж виправлено.
>
> Що змінилось для користувача — [utexo-wallet-api-changes.md](./utexo-wallet-api-changes.md). Відкриті пункти, які потребують змін у RLN, — у розділі 7 того ж файлу.

Принцип перевірки: обгортка має робити нативну функцію зручнішою, але не обмежувати її. Між двома рушіями не повинно бути відмінностей, якщо їх не вимагає сам нативний шар.

Позначки: **P0**: баг або розбіжність між платформами. **P1**: нативна можливість недоступна з SDK. **P2**: розбіжність між RGB_LN і RGB_L1 або зайве обмеження.

---

## 1. Баги і розбіжності між платформами (P0)

| #   | Де                                                         | Проблема                                                                                                                                                                  | Наслідок                                                                                                              | Виправлення в rgb-sdk-rn                                                                                                                                                                       |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `RgbModule.kt` `rlnGetPayment`                             | Android викликає `getPayment(hash, PaymentType.OUTBOUND)`. iOS перебирає `outbound`, `inboundAutoClaim`, `inboundHodl`.                                                   | На Android `getLightningReceiveStatus` / `getPayment` не знаходять вхідні платежі                                     | так                                                                                                                                                                                            |
| 2   | `rlnUnlockNodeWithNativeExternalSigner` (обидві платформи) | Spec приймає `gossipRgsServerUrl`, але нативний `unlockWithNativeExternalSigner` не має такого параметра, тож значення мовчки губиться. `ethRpcUrl` у spec немає взагалі. | З `NativeExternalRLNSigner` немає RGS-gossip і немає EVM RPC для BFA-валідації. З `PasswordRLNSigner` обидва працюють | частково: перейти на `unlockWithNativeExternalSignerRequest(SdkExternalUnlockRequest)`, де є `ethRpcUrl`. Поля gossip нема і в `SdkExternalUnlockRequest`, тому для нього потрібна зміна в RLN |
| 3   | `RlnWallet.createUtxos`                                    | Повертає `params.num ?? 0`, а не реальну кількість (нативний метод повертає `void`)                                                                                       | RGB_L1 повертає справжню кількість, RGB_LN вигадує число                                                              | так: повертати `void`/`undefined` або документувати. Справжня кількість потребує змін у RLN                                                                                                    |
| 4   | `RlnWallet.createUtxos`, `inflate`                         | Дефолт `feeRate ?? 1.5`; міст обрізає до `1`. Дробові значення не відхиляються                                                                                            | Та сама проблема, що була в `onchainSend` (виправлено в `936657e`)                                                    | так: `bridgeInteger` + дефолт `1`                                                                                                                                                              |
| 5   | RLN, загалом                                               | u64-значення йдуть через міст як `double` (`amounts` в issue, `assetAmount`, `amtMsat`, `capacitySat` тощо). `toSafeBridgeNumber` стоїть лише в 9 місцях                  | Значення понад 2^53 або дробові тихо змінюються                                                                       | так: валідація на всіх числових входах RLN                                                                                                                                                     |
| 6   | `RgbModule.kt` `rlnNodeInfo`                               | Android не передає `maxMediaUploadSizeMb`, iOS передає                                                                                                                    | Різна форма `getNodeInfo()` на платформах                                                                             | так                                                                                                                                                                                            |

## 2. Нативні можливості, недоступні з SDK (P1)

### RLN (`SdkNode`)

Методи, яких немає в TurboModule spec:

| Нативний метод                                                                                       | Призначення                                 | Примітка                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `postassetmedia`, `get_asset_media`                                                                  | Завантаження і читання медіа                | Без них `issueassetcfa` / `issueassetuda` не мають звідки взяти `file_digest` |
| `asset_metadata`                                                                                     | Метадані активу                             | В rgb-lib теж є (`getAssetMetadata`)                                          |
| `importrgbcontract`, `importrgbtransferconsignment`                                                  | Імпорт контракту або consignment            |                                                                               |
| `makerinit`, `makerexecute`, `taker`, `get_swap`, `list_swaps`                                       | Swaps                                       |                                                                               |
| `sendonionmessage`                                                                                   | Onion messages                              |                                                                               |
| `asset_link`                                                                                         | Лінкування IFA                              | У rgb-lib-bfa вимкнено (#212), не потрібен                                    |
| `unlockWithNativeExternalSignerRequest`, `attachExternalSigner`, `unlockWithAttachedExternalSigner*` | Варіанти unlock для зовнішнього підписувача | Див. P0 #2                                                                    |

Методи, які є в spec, але не доходять до гаманця:

| Spec                                   | Проблема                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rlnIssueAssetCfa`, `rlnIssueAssetUda` | Реалізовані в бриджах, але в `RlnWallet` / `UTEXOWallet` немає `issueAssetCfa` / `issueAssetUda`                                                                              |
| `rlnRgbInvoice(..., assignmentKind)`   | Binding підтримує `assignmentKind`, а `onchainReceive` / `blindReceive` / `witnessReceive` його не передають. Інвойси NonFungible, InflationRight чи ReplaceRight не створити |
| `rlnSendRgb`                           | Тільки один актив і один отримувач, лише `Fungible`. Нативний `send_rgb` / `sendrgbinvoice` підтримує групи отримувачів (batch); `sendrgbinvoice` при цьому тільки fungible   |
| `rlnListAssets(filter)`                | `RlnWallet.listAssets` завжди передає `[]`                                                                                                                                    |

Поля запитів, які обгортка не передає:

| Нативний запит            | Відсутнє поле                                            |
| ------------------------- | -------------------------------------------------------- |
| `SdkIssueAssetIfaRequest` | `issuance_type` (у bfa фактично доступний лише `Legacy`) |
| `LnInvoiceRequest`        | `description` (передається тільки `description_hash`)    |

Поля відповідей, які бриджі не передають у JS:

| Відповідь                                       | Відсутні поля                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NodeInfo`                                      | `eventual_close_fees_sat`, `pending_outbound_payments_sat`, `account_xpub_vanilla`, `account_xpub_colored`, `rgb_htlc_min_msat`, `rgb_channel_capacity_min_sat`, `channel_capacity_min_sat`, `channel_capacity_max_sat`, `channel_asset_min_amount`, `channel_asset_max_amount`, `network_nodes`, `network_channels` (на Android ще й `max_media_upload_size_mb`) |
| `DecodeLnInvoiceResponse`                       | `min_final_cltv_expiry_delta`                                                                                                                                                                                                                                                                                                                                     |
| `EmbeddedMedia` / `ProofOfReserves` (UDA token) | `data`, `proof`                                                                                                                                                                                                                                                                                                                                                   |
| `AssetMetadataInfo`                             | `unspent_link_right_outpoint` (у bfa завжди `None`)                                                                                                                                                                                                                                                                                                               |

### rgb-lib (`Wallet`)

Методи, яких немає в бриджі (`NativeRgbLib` operations):

| Нативний метод                                                                   | Призначення                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `issueAssetCfa`, `issueAssetUda`, `issueAssetBfa`                                | Випуск CFA, UDA і BFA (BFA: `mintRights`, `chainId`, `contractAddress`)                          |
| `drainTo` (+ begin/end)                                                          | Вивести весь BTC                                                                                 |
| `deleteTransfers`                                                                | Видалити failed-трансфери                                                                        |
| `getAssetMetadata`                                                               | Метадані активу                                                                                  |
| `getReceivedMint`, `mintBegin`/`mintEnd`                                         | BFA mint flow                                                                                    |
| `provideOutOfBandAck`, `provideOutOfBandConsignment`                             | Out-of-band передача                                                                             |
| `listPendingVanillaTxs`, `abortPendingVanillaTx`                                 | Керування pending BTC tx                                                                         |
| `backupInfo`                                                                     | Чи потрібен бекап                                                                                |
| `*Begin`/`*End`, `signPsbt`, `finalizePsbt`, `inspectPsbt`, `inspectRgbTransfer` | PSBT-флоу. Свідомо прибрані з RN, у CLAUDE.md: «Web-only PSBT and begin/end carriers are absent» |
| `checkIndexerUrl`, `validateConsignment`, `inspectConsignment` (вільні функції)  | Перевірка indexer і consignment                                                                  |

Захардкоджені параметри в бриджах (`RgbLibSwiftHelper.swift` / `RgbLibSessionStore.kt`):

| Операція       | Захардкоджено                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `goOnline`     | `skipConsistencyCheck: false`, `vanillaSyncLookback: 20`, `failedWitnessReceiveGraceSecs: 86400`                 |
| `listAssets`   | `filterAssetSchemas: []`                                                                                         |
| `listUnspents` | `settledOnly: false`                                                                                             |
| `receive`      | Assignment лише `Fungible(n)` або `Any`; `encryption: nil` (немає вибору Required/Optional); один proxy endpoint |
| `refresh`      | `assetId: nil`, `filter: []`                                                                                     |
| `sync`         | Завжди `fullSync` для colored і vanilla, `lookback: 20`                                                          |
| `send`         | Один актив і один отримувач (без batch)                                                                          |

## 3. Розбіжності між RGB_LN і RGB_L1 у `UTEXOWallet` (P2)

| Метод                                   | RGB_LN                                                                                     | RGB_L1                                                  | Що робити                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `createUtxos`                           | повертає вигадане `num ?? 0`                                                               | реальна кількість                                       | див. P0 #3                                                                                  |
| `inflate`                               | `{ txid }`                                                                                 | `{ txid, batchTransferIdx }`                            | RLN `InflateResponse` має тільки `txid`: це обмеження нативного шару. Варто задокументувати |
| `onchainSend`                           | `{ txid, batchTransferIdx }`                                                               | + `entropy`                                             | Свідомо (`56e3624`)                                                                         |
| `onchainSend` assignment                | лише fungible                                                                              | fungible і будь-яке призначення з інвойсу               | Обмеження RLN `sendrgbinvoice`                                                              |
| `feeRate` дефолти                       | 1 (`onchainSend`), 1.5→1 (`createUtxos`, `inflate`), без дефолту (`sendBtc`)               | 2 скрізь, лише ціле                                     | Уніфікувати дефолт і валідацію                                                              |
| `durationSeconds`                       | 1…2 592 000 (RLN)                                                                          | 1…2^32−1                                                | Задокументувати                                                                             |
| `skipSync`                              | захардкоджено `false` в `getBtcBalance`, `listUnspents`, `listTransactions`, `createUtxos` | так само                                                | Обидва нативи підтримують `skipSync`: варто прокинути параметр                              |
| `checkIndexerUrl`, `checkProxyEndpoint` | є                                                                                          | немає (`checkIndexerUrl` є в rgb-lib як вільна функція) | Додати для RGB_L1                                                                           |
| `listAssets` filter                     | немає                                                                                      | немає                                                   | Додати опційний `filterAssetSchemas` для обох                                               |
| `issueAssetCfa` / `issueAssetUda`       | немає в гаманці, є в spec                                                                  | немає в бриджі                                          | Додати для обох                                                                             |
| `listUnspents` / `listTransfers` типи   | core `Unspent` / `Transfer`                                                                | `WalletUnspent` / `WalletTransfer`                      | Тип RLN вужчий (немає `MintRight`/`Mint`); RLN вже повертає `Mint` (#69)                    |

## 4. Пропонований порядок робіт

Кроки 1–3 повністю в rgb-sdk-rn. Кроки 4–5 потребують змін у RLN.

1. **Виправлення P0 #1, #3, #4, #5, #6** без нових API: Android `getPayment`, `createUtxos`, валідація чисел і дефолти `feeRate` у RLN, `maxMediaUploadSizeMb`.
2. **Native signer unlock (P0 #2):** перейти на `unlockWithNativeExternalSignerRequest` і додати `ethRpcUrl` у spec (позиційний параметр у кінці).
3. **Прокинути вже наявні параметри:**
   - `assignmentKind` у receive;
   - `filterAssetSchemas` у `listAssets`;
   - `skipSync` у read-методах;
   - `description` у LN-інвойсах;
   - поля `NodeInfo`;
   - `minFinalCltvExpiryDelta` у decode.
4. **Нові методи з паритетом для обох рушіїв:**
   - `issueAssetCfa`, `issueAssetUda` разом з медіа (`postAssetMedia` / `getAssetMedia`);
   - `getAssetMetadata`;
   - `checkIndexerUrl` для L1;
   - `drainTo` і `deleteTransfers` для L1.
5. **Тільки RLN:** import contract/consignment, swaps, onion messages. Тільки rgb-lib: BFA issue і mint, out-of-band, pending vanilla.

Зміни в TurboModule spec додаються в кінець списку параметрів або як нові методи, щоб не зсунути позиції (див. CLAUDE.md, «TurboModule positional parameters»).
