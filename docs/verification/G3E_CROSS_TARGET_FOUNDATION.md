# G3-E Cross-target Foundation Verification

## Scope

This record verifies the accepted G3 foundation as one Vue 3 / uni-app /
TypeScript source architecture for MP-WEIXIN, Android App, and iOS App
targets. It does not claim native packaging, signing, device verification, or
production readiness.

## Accepted baseline and toolchain

- Parent baseline: `cd2b4f1c927c63a2becdedf653175798015b914d`
- Node: `v25.8.0`
- pnpm: `10.31.0`
- uni CLI: `3.0.0-alpha-1000920260909822`
- uni compiler: `4.81 (vue3)`
- Vue: `3.4.21`
- TypeScript: `5.9.3`

The installed uni CLI advertises `app` as the App source target. It does not
provide separate Android and iOS source-compilation targets; both consume the
same App source build and are distinguished later by native packaging and
platform adapters.

## Build results

| Target | Command | Result |
| --- | --- | --- |
| MP-WEIXIN source | `pnpm run build:mp-weixin` | PASS |
| App source | `pnpm run build:app` (`uni build -p app`) | PASS |
| Android native package | Not run | ENVIRONMENT_REQUIRED |
| iOS native package | Not run | ENVIRONMENT_REQUIRED |

The App build completed to an HBuilderX-importable App output. It is source
compilation, not an Android APK/AAB or iOS archive.

Native packaging is deferred because this environment has no configured
HBuilderX native packaging workflow or Gradle project/signing configuration;
Android platform tools alone do not establish a package build. Xcode.app is
not installed; `xcodebuild` is available only through Command Line Tools.
No Android SDK or native toolchain was installed as part of this task; the
available platform-tools do not establish a native package build. No Xcode
setup, signing certificate, provisioning profile, or large native toolchain
was added.

## Target and configuration consistency

- First-class semantic targets are exactly `mp-weixin`, `android`, and `ios`.
- H5 is not accepted by the semantic environment parser and is not a V1 build
  script.
- Manifest statistics are disabled.
- No production credentials, app signing values, tenant values, or customer
  data were added.
- No target depends on Legacy source or Legacy configuration.

## Foundation composition

`tests/g3e/cross-target.test.ts` composes sanitized injected instances of:

- shared environment/contracts;
- API, Auth, Storage, and Upload adapter foundations;
- explicit unsupported/default Platform adapters;
- Workflow Runtime;
- Dynamic Form Runtime.

The composition performs no network calls and no native calls. Platform
unsupported behavior remains explicit. The composition smoke test passes.

## Boundary verification

- `pnpm run check:boundaries`: PASS
- Authored shared, feature, and runtime source contains no direct `wx`, `uni`,
  `plus`, Android, iOS, or Legacy imports.
- Runtime modules remain independent of concrete adapters.
- No framework-generated build output is included in the authored-source
  boundary decision.

## Remaining prerequisites and G3 exit assessment

- Android native package: a project-specific HBuilderX/native Android build
  environment, SDK/toolchain, signing configuration, and later G5 verification.
- iOS native package: Xcode, signing/provisioning configuration, and later G5
  verification.
- Device/native capability verification remains G5.

FOUNDATION_SOURCE_COMPILE = PASS
ANDROID_NATIVE_PACKAGE = NOT_RUN / ENVIRONMENT_REQUIRED
IOS_NATIVE_PACKAGE = NOT_RUN / ENVIRONMENT_REQUIRED
G3_READY_TO_CLOSE = YES
BLOCKS_G4 = 0
