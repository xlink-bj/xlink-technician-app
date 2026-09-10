# Native / Platform Capability Matrix

## Status

**NOT STARTED — foundation placeholder only.**

No native capability is declared available or compatible by this foundation
document.

## Planned matrix schema

| Capability | Source evidence | Reference SHA / observation | MP-WEIXIN | APP-PLUS Android | APP-PLUS iOS | Permission/setup | Fallback behavior | Adapter boundary | Runtime verification | Gap/conflict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Rows should cover at least:

- authentication/session persistence;
- camera, photo, upload, preview, and attachment handling;
- location, maps, navigation, and background/keepalive behavior;
- push/notification and deep-link behavior;
- file sharing, download, and preview;
- signature and other device input;
- network/error/offline behavior;
- platform-specific permission and lifecycle differences.

Platform/native differences should be isolated behind explicit platform
adapters where practical. MP-WEIXIN and APP must remain first-class targets.

## Evidence rule

Record what was actually observed separately from what the framework is expected
to support. Detailed capability discovery remains pending targeted reuse and
verification of the existing R1–R3 assets.
