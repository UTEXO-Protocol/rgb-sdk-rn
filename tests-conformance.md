# Conformance suite — не підключено

`rgb-sdk-rn` не має тестової інфраструктури: немає `tests/`, немає `test`-скрипта,
немає jest-конфіга. Налаштування Jest під React Native (preset, babel, mocks для
нативного модуля) — окрема задача, не частина цієї міграції.

Коли інфраструктура зʼявиться, підключення — один файл:

```ts
// tests/conformance.test.ts
import { describe, it, expect } from '@jest/globals';
import { runConformanceChecks } from '@utexo/rgb-sdk-core/conformance';
import { UTEXOWallet } from '../src';

runConformanceChecks({
  name: 'rgb-sdk-rn',
  walletClass: UTEXOWallet,
  describe, it, expect: expect as never,
});
```

Те саме вже працює в `rgb-sdk-web/tests/conformance.test.ts` (219 тестів).

Незалежно від раннера, у CI має бути:

```sh
node ../rgb-sdk-core/scripts/check-rln-versions.mjs
```
