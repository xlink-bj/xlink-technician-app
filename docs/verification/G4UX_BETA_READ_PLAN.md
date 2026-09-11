# G4-UX Beta Read Plan

Status: Plan only. No Beta call was executed in Phase A because no approved non-production configuration/credentials were supplied through an approved local mechanism.

## UX reference and gate priority

- R2 — `xlink-business-3.0`, pinned main `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` — primary UX/visual/IA reference.
- R2 staged Login and task-first Home are the locked product directions for this read plan. Only accepted auth/session and task/list capabilities may be wired or rendered.
- R1 — `xlink-business-jishi-3.0`, pinned `6ada6b5375324bfcd09ca7c569b96a4ff328173f` — secondary business/field-service evidence.
- MP-WEIXIN is the primary G4-UX human visual gate.
- Android/iOS are checked for source/build integrity in G4-UX; native/device visual parity belongs to G5.

## Objective

Validate the target UX baseline against real, read-only Technician data without changing product code in Phase A. The minimum path is:

`Login → authenticated Home → role-visible Work Order List → Work Order Detail → contact masking/availability`

The read verifies actual data shape, density, nullability, role scope, state behavior, and MP rendering. It does not authorize business mutation.

## Preconditions and redaction

- Use only an explicitly approved Beta/test environment and approved local configuration.
- Do not search repositories, reference projects, shell history, or logs for credentials.
- Do not place phone numbers, verification codes, tenant values, cookies, tokens, customer names, addresses, or raw response bodies in this document, screenshots, issue comments, or command output.
- The exact-version MP compiler correction retained from `c0128a06fff271532d0e88f04d44066cf192ddd4` is required to generate the MP artifact; no further dependency or toolchain change is part of this plan.
- Authentication is allowed only as needed to establish a read-only session. No verification-code send flow is implied.

## Allowed and forbidden operations

Allowed, only in approved Beta/test:

- Auth/session bootstrap and Login.
- Role/function context resolution if required by the accepted read path.
- Role-visible Work Order list read, including ordinary/SANode adapter mapping.
- Work Order detail read.
- Read-only observation of masked contact display and whether direct contact is available.

Forbidden:

- Production calls.
- Any workflow, appointment, inspection, form, quotation, construction, acceptance, contact, note, or customer-data write.
- `send verification code` unless a separately accepted endpoint exists.
- Real phone calls, relay/private-number calls, `getMiddleNumberBySid`, camera/location/scan/upload actions.
- Discovering, printing, or committing credentials or session material.

## Execution sequence

1. **Bootstrap/Login:** Confirm the initialization shell is non-interactive while restore is pending. Establish whether the locked R2 staged Login experience and primary Sign in action are actually visible and usable in the MP simulator. Use approved test input, observe validation and in-flight behavior, and record only sanitized outcomes. Unsupported R2 auth methods remain contract-gated.
2. **Home:** Confirm the locked R2 task-first landing hierarchy, Work Orders/current-task entry, sign-out affordance, safe area/back behavior, and no stale data before authentication. Do not treat metrics-first as an alternative.
3. **Role-visible list:** Enter through Home. Record the semantic role-visible scope, ordinary/SANode mode at the adapter boundary, observed field presence/nullability, density, empty behavior, and refresh/retry behavior. Do not label it “My” or “Assigned” unless evidence supports that claim. Do not treat R2 search/tabs/counts as required without a business decision.
4. **Detail:** Open one sanitized row using only its semantic WorkOrderId. Record accepted detail field presence/nullability, long-text/address behavior, loading/error/retry/session-invalid states, and whether information remains read-oriented.
5. **Contact:** Verify masked display and direct-contact availability only. The `Call customer` action must remain uninvoked in Beta verification; no real call or relay request is permitted. Record contact-only/no-phone as unavailable and relay/private-number as deferred unless a later approved slice changes that scope.

## Capture matrix

| Checkpoint | Record (sanitized) | Do not record |
| --- | --- | --- |
| Login/bootstrap | state sequence, validation category, action visibility, loading/disabled behavior, target/device | phone, code, cookies, token, raw response |
| Home | hierarchy, entry label, safe-area/back result, stale-data result, MP rendering | user identity, role ID, sessionRef |
| List | semantic scope, ordinary/SANode mode, field presence/nullability, density, state/retry result | raw menu/functionList, endpoint/query/body, customer data |
| Detail | accepted field presence/nullability, hierarchy, long text, state/recovery result | raw DTO, nodeDef, backend status code, address/customer PII |
| Contact | masked/unavailable/direct-action decision, button state, target behavior | phone, contactRef, real call result, relay request |

## Mismatch handling

1. Record the observation and exact screen/state first.
2. Classify it as copy, visual hierarchy, density, state behavior, semantic contract, adapter mapping, target rendering, or environment limitation.
3. Do not broaden a contract or rescan Legacy from a screenshot alone.
4. If the mismatch is a business fact, run the smallest read-only evidence check under the owning G4 issue.
5. If it is target/device-only, record it for G5 unless it blocks the MP G4-UX gate. If it requires a new write or native capability, stop and open the appropriate guarded slice.

## Exit evidence

The read plan is complete when each checkpoint has a sanitized observation or an explicit `NOT_RUN / CREDENTIAL_REQUIRED` result, the role-visible list meaning is documented, no raw data is retained, and all remaining UNKNOWNs have an owner gate. Phase A can be accepted without Beta execution; the missing Beta evidence must remain visible rather than being represented as a successful observation.

Current status: `LIVE_BETA_G4_UX_READ = NOT_RUN / CREDENTIAL_REQUIRED`.
