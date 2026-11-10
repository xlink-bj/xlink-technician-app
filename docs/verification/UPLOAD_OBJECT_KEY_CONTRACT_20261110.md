# Upload object key contract and verification (2026-11-10)

## Scope and pinned inputs

Frontend source: `xlink-bj/xlink-technician-app@581d669da223565fe388c15f012955534e81b7ef`.
Application source is unchanged from parent b88a298; 581d669 only updates CI workflow.

- `src/adapters/upload/upload-adapter.ts`, baseline Git blob `7d746e14947a4f0836068e3682f2a3367dd12584`.
- `src/adapters/upload/uni-upload-port.ts`, baseline Git blob `12f926f3b191e3f8fbef978ba398ad59cfa8fcb4`.
- Existing token-only success fixture: `tests/g3c/fixtures.ts`, blob `2e43a6055f309556982e8c11822e06e0c339103b`.

Backend reference: `5fc008d32e771205260f120621c1c4fc62d0824e`, `modulemini/BackFileController.java` issues a random key and `QiniuFileUtil.getUpToken(bucket)`; the token is bucket-scoped. Legacy R1 frontend reference `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages2/project/project.vue`, sends the token response as provider form data, including key.

Qiniu documents the multipart `key` field and default key behavior at <https://developer.qiniu.com/kodo/api/upload>. A bucket token alone does not guarantee that a supplied backend key is used.

This upload sub-slice changes only the two upload files and adds this note plus a focused regression file. No reader, grants, API wire format, normalizer, page, backend, or existing QA evidence is changed.

## Contract

1. Keep the upload credential opaque and pass the issued object key separately through the upload driver into provider `formData.key`. A keyless token remains supported for existing token-only fixtures/providers that return their own complete identity.
2. Every supplied key alias (`key`, `fileKey`, `objectKey`) must be a nonblank string. Multiple aliases must agree exactly. No numeric coercion or trimming of meaningful key characters.
3. A successful provider response must contain an explicit valid key. If the token issued a key, the response must match it exactly, even when a provider URL is supplied.
4. Missing keys, conflicting keys, malformed/empty bodies, and explicit provider errors fail terminally. Token metadata alone cannot prove upload success.
5. Use a provider URL when present. A token URL is eligible as fallback only when the token key and confirmed provider key match. Preserve issued signed URLs verbatim; do not overwrite them with a configured base or rewrite them for another key.
6. Without a provider URL or identity-confirmed token URL, fail rather than returning a fabricated media reference. No URL path parsing is used to infer identity; custom/signed URLs remain opaque.
7. Keep existing Mock and Production/default-write guards. No real provider, upload token, media bytes, or backend mutation was used to validate this patch.

The normalized result still strips local paths and credentials. This change does not add credentials or raw response contents to new validation errors. Existing transport-error mapping remains unchanged.

## Focused red / green evidence

New test file: `tests/g4f/media-upload-key-binding.test.ts`.

The same 40 regression cases were executed against the untouched source subset and the candidate using Node 24.22.1 native TypeScript transformation and in-memory ESM loading. The evidence runner maps runtime barrels to their actual pinned leaf modules, uses Node test hooks/assertions, and supplies only Vitest environment-stubbing helpers. Provider and command callbacks are explicitly synthetic; they neither read the fake media path nor send a request.

- Untouched baseline: 40 tests, 13 passed, 27 failed (exit 1).
- Candidate: 40 tests, 40 passed, 0 failed (exit 0).
- Covers key propagation, mismatch with/without URL, malformed JSON/scalars/arrays, missing/type-invalid/blank/conflicting keys, provider errors, URL fallback, signed URLs, legacy fixtures, Mock bypass, retryable/terminal failures, and default/Production guards.
- These runs are focused source-execution evidence, **not** a Vitest, full-project typecheck, full verification, App/native, or real-media integration pass.

Evidence-runner commands from the private candidate evidence directory:

```sh
node --experimental-vm-modules run-focused.mjs baseline
node --experimental-vm-modules run-focused.mjs candidate
```

## Independent review

A separate read-only review reproduced the 13-pass/27-fail baseline and 40-pass candidate, verified all 10 pinned baseline Git blob hashes, and found no required fix within the current R1 contract. Additional checks preserved all three signed token URL aliases and rejected an error body even when it included key/URL.

This intentionally rejects URL-only provider responses and server-side key renaming. Future providers or saveKey policies require a separately verified contract; no such support is claimed here.

## Required integration verification

Apply only after checking the two source blobs against the integration checkout and preserving unrelated work. Run in the existing complete development checkout, not a new application copy:

```sh
pnpm exec vitest run tests/g4f/media-upload-key-binding.test.ts tests/g3c/adapters.test.ts tests/g4f/media-upload-command-transport.test.ts tests/g4e/onsite-inspection.test.ts tests/g4f/production-read-only.test.ts
pnpm run typecheck
pnpm run verify
```

At the 2026-11-10 verification checkpoint, the canonical Cloud checkout at main `581d669da223565fe388c15f012955534e81b7ef` plus the scoped 18-file combination ran the actual five-file Vitest selection: **180 PASS**, including **40** upload-key cases, exit 0. `VITE_XLINK_ENVIRONMENT=test pnpm verify:full` completed with **279 files / 4129 PASS**, exit 0, including the real project `vue-tsc` typecheck and engineering/quality gates. This is additional standard-project evidence; the earlier 13-pass/27-fail baseline, 40-case source-execution result and independent review remain separate history.

On that unchanged 18-file tree, the normal App generic edit H5 suite passed **6/6** and the existing `media-interrupted-receipt.spec.ts` passed **2/2**, both at 430×932 and exit 0. The media suite covers an interrupted final receipt staying uncertain across repeated refreshes without reupload, and a known retryable failure restoring and retrying the same task. External/unknown requests and page errors were zero; mock thumbnail responses and upload outcomes were synthetic. H5, MP-WEIXIN and App builds then ran serially with real writes disabled, all exit 0. The 4129-test full run was not repeated for those unchanged source hashes.

The CI integration adds only the dedicated generic six-case step and its artifact directory; the existing media-recovery step is retained without duplication. Its equivalent command passed six cases locally. The counts above describe local verification at the stated baseline; exact-commit remote CI is a separate gate and is not claimed here.

A real media round trip remains a separate acceptance gate requiring an authorized environment and upload scope. Synthetic tests do not prove Qiniu acceptance, URL reachability, image content, database persistence, or restart persistence.
