# A — R1-shaped Offline Mock capability inventory

This is a source/test inventory of the main App, not live/native certification.
Implemented means the named layer is implemented; preview alone is not a saved
FormData transaction. Unknown schemas remain Unsupported rather than invented.

| Capability | Status / scope | Code and behavioral evidence |
| --- | --- | --- |
| text / textarea / phone / IDNumber | Implemented: scalar draft + forms/repeat save/readback; leading zeros preserved | dynamic-form/values, r1-local-form-fields, r1-special-mock-form-fields; stage2b-r1-special-fields, stage2b-r1-primitive-fields H5 |
| number / digit | Implemented: safe integers; finite decimals; special write precision guard | same modules; invalid and partial numeric inputs tested |
| switch | Implemented: R1 special wire strings 1/0, no default value | shared field controls; Stage 2B H5 |
| date / time / datetime / rate | Implemented: common native controls and forms/repeat record save, edit, clear, restart readback | R1FormFieldControl reuses AppDateTimeField/AppRatingField and field-control-registry; stage2d-r1-temporal-fields H5; controller negative tests reject impossible dates, UTC conversion and out-of-range rating |
| select / radio / checkbox | Implemented with resolved source options; array bounds/membership enforced | Runtime + local/special validators; Stage 2B/2C H5 |
| cascade | Implemented: ordered paths; two-level layout retained, deeper trees use recursive leaves; forged sibling paths rejected | Runtime values; Stage 2C H5 and deep-cascade-record H5 (three-level selection/edit/save/reload with exact persisted path) |
| multiple cascade / arbitrary nested objects | Unsupported: no verified generic R1 write representation | explicit local/special validation fence |
| bizSelect | Implemented in generic Runtime/provider scope boundary; resolved scalar/string-array special submission validation implemented; Missing special Provider loading and main-App transaction acceptance | provider-visibility suite proves authorization change causes reread, no CodeService fallback. A resolved preview is not a transaction; no fabricated business provider or schema |
| area / button / unknown controls | Unsupported: generic region/action protocol is not established; area is NOT decimal area measurement | classifyFieldType/normalizeFieldValue fail closed; existing named area measurement compatibility rule remains isolated |
| title / gap / reference image | Implemented presentation only, excluded from writes | Runtime presentation capability; R1 reference image never an uploader |
| visibility / required / readonly | Implemented in shared Runtime; complete special submissions now independent of field order | full input used for submit-time normalization; regression reverses dependent/controller row order, missing/hidden values remain rejected |
| providers / conditional branches | Implemented for verified finite providers; malformed expressions fail closed | dynamic-form-provider-visibility, dynamic-form-r1-complex-closure |
| ordinary dynamic-form media | Implemented shared policy/dispatch/queue/retry/local restore; source-specific media codecs remain Adapter-owned | dynamic-media-policy, media-upload-queue, Action Workspace; media-queue / c3c / c3c2 tests; main-App media H5 |
| special forms/repeat writable media | Missing, independently from real-upload HOLD: current R1 special transaction value type is primitive/string-array and the known inspection image is a read-only reference | do not relabel reference image or accept arbitrary media objects into that protocol. Needs source-backed writable ExtField + its existing codec composed through shared queue, not a new uploader |
| multiple FormDefs / repeat | Implemented: independently saved records, edit/delete, authoritative readback, explicit finish, no replay after uncertain ACK | a-stage-special-mock-ui + r1-multistep-offline-transaction; controller/protocol tests; Stage 1B/2A/2C and a-stage-p1-acceptance H5 |
| optional clear | Implemented in offline protocol including arrays and temporal/rating values; required/read-only values stay fenced | special validator + Mock protocol clear allowlist; Stage 2C/2D and controller tests |
| Action Draft Repository | Implemented identity-keyed records + metadata registry, role/node/work-order/content isolation, no command payloads | shared Action Runtime repository and existing lifecycle; dedicated weak-network H5 adds special editor coverage |
| incomplete special editor drafts | Implemented on existing Action Draft Repository; form-definition AND saved-record identity, local autosave, restart recovery, completed tombstone before cleanup | controller draft methods + actual special panel; weak-network-recovery H5 |
| network recovery | Explicit user resubmit only; offline edits/autosave continue; no automatic command replay | existing NetworkStatusPort + platform adapter, special controller pre-dispatch guard |
| browser media bytes | Implemented IndexedDB DurableMediaStorePort; task metadata alone is insufficient; fresh Blob URL after restart | browser-durable-media-store; main-App media failure → full reload → manual retry H5 |
| MP/App media files | Existing native saveFile DurableMediaStorePort retained | build checks + existing unit contracts; native operation is outside A completion criteria |

## Weak network acceptance boundaries

LOCAL_DRAFT_PASS, WEAK_NETWORK_PASS and MEDIA_RECOVERY_PASS must each cite a
successful main-App H5 user path, not just unit tests. Browser document restart
uses the already-installed test shell while network connectivity is restored;
this does not claim a PWA cold launch with no cached App shell. Offline editing
of an already-open App and recoverability of local records/files are separate
from offline installation/bootstrap.

## Remaining Cloud-only work

Compose source-backed special writable media into the existing shared queue and
transaction codec; finish special bizSelect transaction coverage only for a
verified offline provider contract. Expand interrupted submit/reconciliation,
storage quota and record-conflict user-path tests. No live API work is required
or proposed by this inventory. A is not declared complete while these Missing
items remain.

## Independent HOLD ledger (not A tasks or completion gates)

LIVE_BIZSELECT_HOLD; Optional Clear Beta business writes; real media upload/save;
real Workflow progression; Mac WeChat device operations. No Production/Beta
writes, merge or deployment are authorized by this document.
