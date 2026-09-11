# G4-UX Beta Read Plan

Status: Plan only. Phase A did not execute a Beta call because no approved non-production configuration/credentials were supplied through an approved local mechanism.

## Objective

Validate the production UX baseline against real, read-only Technician data without changing product code in Phase A. The minimum path is:

`Login → authenticated Home → role-visible Work Order List → Work Order Detail → contact masking/availability`

This plan verifies actual data shape, density, nullability, role scope, state behavior, and cross-target constraints. It does not authorize business mutation.

## Preconditions and redaction

- Use only an explicitly approved Beta/test environment and approved local configuration.
- Do not search repositories, reference projects, shell history, or logs for credentials.
- Do not place phone numbers, verification codes, tenant values, cookies, tokens, customer names, addresses, or raw response bodies in this document, screenshots, issue comments, or command output.
- Prefer MP DevTools and the already verified generated artifact at `/Users/yesun/Code/xlink-technician-app/dist/build/mp-weixin` for source-level Beta preparation. The artifact is ignored build output and is not committed.
- Authentication is allowed only as needed to establish a read-only session. No verification-code send flow is implied.

## Allowed and forbidden operations

Allowed, only in approved Beta/test:

- Auth/session bootstrap and Login.
- Role/function context resolution if required by the accepted read path.
- Role-visible Work Order list read, including the already accepted ordinary/SANode adapter mapping.
- Work Order detail read.
- Read-only observation of masked contact display and whether direct contact is available.

Forbidden:

- Production calls.
- Any workflow, appointment, inspection, form, quotation, construction, acceptance, contact, note, or customer-data write.
- `send verification code` unless a separately accepted endpoint exists.
- Real phone calls, relay/private-number calls, `getMiddleNumberBySid`, camera/location/scan/upload actions.
- Discovering, printing, or committing credentials or session material.

## Execution sequence

1. **Bootstrap/Login:** Confirm the initialization shell is non-interactive while restore is pending. Use approved test input, observe validation and in-flight behavior, and record only sanitized outcomes.
2. **Home:** Confirm a usable authenticated landing state, the Work Orders entry, sign-out affordance, safe-area/back behavior, and the absence of stale data before authentication.
3. **Role-visible list:** Enter through the Home entry. Record the role-visible scope in semantic terms, whether the result is ordinary or SANode-shaped at the adapter boundary, item count only as a test observation, title/address/status nullability, density, empty behavior, and refresh/retry behavior. Do not label it “My” or “Assigned” unless evidence supports that claim.
4. **Detail:** Open one sanitized row using only its semantic WorkOrderId. Record which accepted detail fields are present/null, long-text/address behavior, loading/error/retry/session-invalid states, and whether the information region remains read-oriented.
5. **Contact:** Verify masked display and direct-contact availability only. The `Call customer` action must remain uninvoked in Beta verification; no real call or relay request is permitted. Record contact-only/no-phone as unavailable and relay/private-number as deferred unless a later approved slice changes that scope.

## Capture matrix

| Checkpoint | Record (sanitized) | Do not record |
| --- | --- | --- |
| Login/bootstrap | state sequence, validation category, loading/disabled behavior, target/device | phone, code, cookies, token, raw response |
| Home | visible hierarchy, entry label, safe-area/back result, stale-data result | user identity, role ID, sessionRef |
| List | semantic scope, ordinary/SANode mode, field presence/nullability, density, state and retry result | raw menu/functionList, endpoint/query/body, customer data |
| Detail | accepted field presence/nullability, hierarchy, long text, state/recovery result | raw DTO, nodeDef, backend status code, address/customer PII |
| Contact | masked/unavailable/direct-action decision, button state, target behavior | phone, contactRef, real call result, relay request |

## Cross-target checks

Repeat the safe source/UX checks for MP-WEIXIN, Android App source target, and iOS App source target where local tooling permits. Capture differences in safe area, keyboard, back navigation, loading height, touch target, line wrapping, and disabled/in-flight rendering. Native packaging/device verification belongs to G5 and is not a Phase A prerequisite.

## Mismatch handling

1. Record the observation and exact screen/state first.
2. Classify it as copy, visual hierarchy, density, state behavior, semantic contract, adapter mapping, or environment limitation.
3. Do not broaden a contract or rescan Legacy from a screenshot alone.
4. If the mismatch is a business fact, run the smallest read-only evidence check under the owning G4 issue.
5. If it is target/device-only, record it for G5. If it requires a new write or native capability, stop and open the appropriate guarded slice.

## Exit evidence

The read plan is complete when each checkpoint has a sanitized observation or an explicit `NOT_RUN / CREDENTIAL_REQUIRED` result, the role-visible list meaning is documented, no raw data is retained, and all remaining UNKNOWNs have an owner gate. Phase A can be accepted without Beta execution; the missing Beta evidence must remain visible rather than being represented as a successful observation.

Current status: `LIVE_BETA_G4_UX_READ = NOT_RUN / CREDENTIAL_REQUIRED`.
