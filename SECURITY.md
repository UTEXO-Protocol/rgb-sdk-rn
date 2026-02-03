# Security Policy

## ⚠️ Important Security Disclosure

Earlier versions of the RGB JavaScript SDK (`rgb-sdk-rn`) relied on a **remote RGB Node server** and had architectural limitations that affect wallet privacy and security.

If you have **ever used `rgb-sdk-rn` with a remote RGB Node server**, you should assume that:

- Your wallet **extended public keys (xpubs)** were disclosed to that server
- Your wallet activity may be **fully observable** by that server
- This exposure is **permanent** and **cannot be revoked**
- Even after upgrading, past privacy leakage **cannot be undone**

This was a consequence of the design of the legacy SDK and **not a vulnerability that can be patched retroactively**.

---

## Affected Software

The following packages and versions are affected:

- `rgb-sdk-rn`

---

## Security Model: `@utexo/rgb-sdk-rn`

`@utexo/rgb-sdk-rn` was designed to address these issues by enforcing a **fully local, non-custodial security model**:

- All RGB operations are executed **locally**
- No xpubs are transmitted to any server
- PSBTs are constructed and validated client-side
- RGB protocol validation is enforced locally using `rgb-lib`
- No trusted remote server is required

This restores the intended security guarantees of the RGB protocol.

---

## Recommended User Actions

If you previously used `rgb-sdk-rn`, we **strongly recommend**:

1. **Migrating immediately** to `@utexo/rgb-sdk-rn`
2. Treating existing wallets as **privacy-compromised**
3. Creating a **new wallet** if privacy is a concern
4. Avoiding reuse of xpubs that were shared with any server
5. Reviewing the Migration Guide carefully

Migration prevents **future** data exposure but does **not** remove historical leakage.

---

## Reporting Security Issues

If you discover a **new security vulnerability** in `@utexo/rgb-sdk-rn`:

- Please **do not** open a public GitHub issue
- Contact us privately with technical details
- Include:
  - Affected version
  - Proof of concept (if available)
  - Impact assessment

Responsible disclosures are appreciated and taken seriously.

---

## Scope Clarification

This security notice applies to:

- Privacy leakage
- Key exposure
- Transaction construction and validation trust assumptions

It does **not** imply active exploitation, theft, or malicious behavior by any operator.

---

## Final Note

Wallet metadata (xpubs, derivation paths, transaction graphs) is **sensitive security information**.

If privacy matters to you, the **only complete mitigation** is migration to a new wallet using a local-only SDK.
