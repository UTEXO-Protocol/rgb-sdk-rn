# PoisonError — Cross-Flow Mutex Pollution Repro

## Summary

Running `runRlnUtexoWalletChannelPaymentFlow` (which uses `NativeExternalRLNSigner` for nodeA)
followed by `runRLNUtexoPaymentFlow` (all `PasswordRLNSigner`) in the same process causes
`runRLNUtexoPaymentFlow` to fail at `wPayOpenChannel` with:

```
called `Result::unwrap()` on an `Err` value: PoisonError { .. }
org.utexo.rgblightningnode.InternalException: called `Result::unwrap()` on an `Err` value: PoisonError { .. }
```

## Environment

- Platform: Android (tested on emulator, API 34)
- App: rgb-sdk-rn-demo
- Both flows run sequentially in the **same process** (no app restart between them)

## Steps to Reproduce

1. Start the app.
2. Run **`runRlnUtexoWalletChannelPaymentFlow`** and wait for it to complete successfully.
   - nodeA uses `NativeExternalRLNSigner` (VLS in-process)
   - nodeB uses `PasswordRLNSigner`
   - All steps (`wChanAInit` → `wChanPayment2`) finish with `success`
3. **Without restarting the app**, run **`runRLNUtexoPaymentFlow`**.
   - nodeA, nodeB, nodeC all use `PasswordRLNSigner`
4. Observe that the flow fails at step `wPayOpenChannel` (reported as `lastStep="wPayConnectPeers"` because the step error is not caught before the step marks itself running).

## Observed Behaviour

```
FLOW FAILED  flowName="runRLNUtexoPaymentFlow"
lastStep="wPayConnectPeers"
error="called `Result::unwrap()` on an `Err` value: PoisonError { .. }"
```

LDK log for `wPay` nodeA shows `FundingGenerationReady` fires but never logs
`Done handling event` — the handler throws before returning:

```
09:38:17.883  Handling event FundingGenerationReady { temporary_channel_id: bb61c3a6… }
09:38:17.883  Building commitment transaction … for channel 528f090c…
09:38:17.883    ...including to_remote output with value 3500
09:38:17.883    ...including to_local output with value 93569
              ← no "Done handling event" line
09:38:18.946  Disconnecting peer … due to client request to disconnect all peers
```

wPay nodeB log confirms the channel never got funded:

```
09:38:19.038  Closed channel bb61c3a6… due to close-required error:
              Channel closed because the peer disconnected prior to the channel being funded
```

## Root Cause

During `runRlnUtexoWalletChannelPaymentFlow`, the `NativeExternalRLNSigner` (VLS) background
thread panics and poisons a `Mutex` in the shared native RLN signing infrastructure.
Because VLS uses its own signing path it bypasses the poisoned mutex, so `wChan` completes
without error. The poisoned mutex persists for the lifetime of the OS process.

When `runRLNUtexoPaymentFlow` subsequently calls `openChannel`, the `FundingGenerationReady`
handler tries to sign the commitment tx via `PasswordRLNSigner`, which goes through the
standard key-manager path that locks the same shared mutex. The lock returns
`Err(PoisonError)`, the `.unwrap()` panics, and the error surfaces as
`InternalException: PoisonError`.

### Key evidence

| Flow | Signer (nodeA) | FundingGenerationReady result | Duration |
|------|----------------|-------------------------------|----------|
| `wChan` | `NativeExternalRLNSigner` | `Ok(())` logged | 32 ms |
| `wPay`  | `PasswordRLNSigner`       | never logged — PoisonError thrown | 1063 ms then disconnect |

## Fix Direction

The fix must be in the **Rust layer**. Replace every `.unwrap()` on a `Mutex::lock()` result
that can be reached from the commitment-tx signing path with poison-tolerant recovery:

```rust
// instead of:
let guard = mutex.lock().unwrap();

// use:
let guard = mutex.lock().unwrap_or_else(|e| e.into_inner());
```

This recovers the guarded value even when the mutex is poisoned, preventing one signer's
background-thread panic from permanently breaking all other signers in the same process.
