# Normal Repeat appointment: restricted same-ID edit

Integration baseline: main `b833fc71b2c54d52b8e5cc99b0f62cb7c6efaacc`. This change is the appointment-only 11-file adaptation, plus its dedicated CI step. It excludes the unreleased media candidate and is not a complete product release. Exact-commit remote CI results are reported separately after submission; no future CI result is asserted here.

## Source-backed behavior and authority

Fixed R1 frontend `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/serviceAppointment/serviceAppointment.vue`: repeat edit at 1121–1127/1262–1278, `viewAddForm` at 10193–10224 and exact record load at 6987–7017. Existing `_id` and sid/run/node are retained at 7208–7240. The upsert at 7401–7405 is followed by repeat refresh at 7437–7445, without Process. Configured `submitHideNodeId` is conservatively read-only in this slice; handler, visibility and active-node checks remain mandatory.

The positive route requires fresh same-tenant Ext string `type="0"`, `colName="appointment"`, matching ExtField collection identities and the known six mobile/writable fields. It uses a private reader-issued, exact-record replacement context, not a display projection, ACK, copied token, generic forms capability or editable `_id`. The six keys are need/reasons1/otherReason/datetime/note/modifyReason. Condition-only `_id` comes from trusted dataId. Need 1/2, verified options and visible required fields are enforced; hidden datetime is retained, hidden edits rejected, optional empty text allowed, whitespace-only required input rejected. Unknown/ambiguous original content, typed Survey, unsupported provider/schema, media and arrays remain blocked.

Version 1 Repeat create/complete grants are unchanged. New version 2 is edit-only: exact tenant/user/role/workOrder/run/runtimeNode/formDefinition scope, expiry, fieldIds and recordIds. It cannot create, complete, start children, delete, upload or invoke calendar/PDF. Actor/session/roleVersion, full schema/fillable/readonly state, exact original bytes and reader generation are rechecked. One same-ID special upsert is followed by full relist/exact reads; no node EXTS update or Process occurs. Lost ACK or inconsistent readback leaves a persistent uncertain lock, including after cold login; explicit read does not authorize blind replay. Pending keys use a fixed identity order.

## Candidate separation and synthetic verification

The original Cloud 13-path candidate was reviewed on a frozen media baseline. Mac independently extracted appointment-only 11 paths: five existing before files match public b833fc71, six paths are new, all media runtime hunks and the two media-only unit-harness adaptations are excluded. Its independent source-adaptation review passed. Patch SHA-256: `51cd7418950951393aae2ac2741345ae432806b7a55f451daaf430afc28fe51c`.

Mac verification on that adaptation: 466 targeted tests, typecheck, architecture/dependency boundaries and three normal App browser scenarios passed. Cloud's earlier 503 tests and three browser scenarios were run on the combined private tree and are not clean-index proof. The new CI step explicitly runs the three scenarios through `repeat-appointment-edit.config.ts`; default opt-in skips are not passes. Existing CI gates, permissions, triggers and timeouts are unchanged.

The browser scenarios cover ordinary note/reason edit and normal page reentry; need 1→2→1→2 with normal reason and hidden datetime retention; mismatched readback followed by explicit reread and cold re-login with no replay. Each sends one synthetic upsert and zero EXTS/Process/upload, preserves the sibling and blocks unexpected network. Browser API interception is synthetic evidence, separate from the following real local HTTP experiment.

## Real local Java save and cold readback

Executed by the Mac verification owner using a real 430×932 App, fixed R1 Java WAR and new isolated Mongo/Redis. Its execution baseline was `b88a298532c68873f47608b335b324b3c6a07c22` with the reviewed local appointment adaptation, not the Cloud media workspace. The recorded final report/result and BSON audit were reviewed separately; raw account/session/HTTP/DB evidence is not copied into this repository.

- 70 actual API responses: 16 preflight with zero business writes, 35 edit-phase with exactly one same-ID upsert, and 19 cold-read responses with zero business writes. Three normal logins. Create, EXTS update, Process, upload and replay were all zero.
- The need switches occurred before that one save, not as multiple writes. Blank/whitespace modifyReason disabled saving. The upsert returned success/status=1 and the same ID, followed by authoritative full relist/exact reads with the node still active.
- Appointment count stayed two. The sibling, including its unknown EXTS, remained unchanged. Datetime, reasons1 and createTime were retained. Raw BSON count 36→38 added only changeLog/tenantLog; the target business fields and Account/automatic audit metadata changed as documented.
- All new services were normally stopped and restarted on the same database directory. The 38 raw BSON objects matched before/after restart. A new no-grant, writes-disabled browser session logged in normally and reread the same records and edited values. Original materials, databases, QA and fixed WAR were preserved.
- The first cold launcher failed an incorrectly narrowed harness mode enumeration before any HTTP. The harness was corrected, the failed attempt retained, and the cold read passed. This was not a failed business save or business retry.

## Inherited backend boundaries and remaining scope

Fixed backend `xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`, `ExtFormServiceImpl.java` 123–132 converts top-level Date to seconds strings; 282–323 performs existing-ID full Map save with metadata/script/log effects. In the actual edit, createDateTime changed from BSON Date to a seconds string, losing its type/milliseconds. This is verified business-value persistence and restart continuity, not BSON losslessness, a partial patch, CAS or backend governance.

Only the six-field, type0/appointment, precisely granted existing-record route is supported here. Unknown originals remain read-only; preserving an unedited sibling's unknown EXTS does not permit editing unknown data. Arbitrary appointments, typed/complete59 forms, production/Beta, native devices and external media services are not released by this evidence. No deployment or production access is part of this integration.
