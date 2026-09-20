# G4-E Survey Onsite Check-in Contract

Status: **CONTRACT / PARTIAL — awaiting verified Survey owner, command and
reconciliation contract**

Repository: `xlink-bj/xlink-technician-app`

Branch: `rebuild/g4e-onsite-inspection`

Issue: `#21`

This is an evidence artifact for the P0 Survey / 勘查 onsite check-in slice.
It does not claim that a real Survey check-in command has been identified or
implemented. The machine-readable contract is
`contracts/beta/survey/onsite-checkin-contract.json`; the checker is
`pnpm run check:survey-onsite-checkin`.

## Current product requirement

The current Yuhong requirement defines **工勘打卡 / Survey onsite check-in** as
a P0 capability:

- capture LBS location;
- use system time for the check-in business record;
- support a manual check-in action;
- define appointment-near automatic check-in only when its business trigger
  and lifecycle are proven;
- output a Survey onsite check-in record.

The stated business sequence is:

```text
预约确认 -> Survey / 勘查现场打卡 -> Survey / 勘查 -> 报价
```

The requirement is current product truth. R1 and Backend are supporting
evidence and are not allowed to turn an old generic endpoint into a new Survey
contract by naming similarity.

## Domain separation

Survey / 勘查 and `InspectionAppointment` / 巡检 are separate domains. This
slice uses Survey terminology (`SurveyOnsiteCheckIn` /
`SurveyCheckInRecord` conceptually) and does not reuse inspection appointment
semantics.

Photo location evidence is also separate. A camera capture may carry a
location snapshot for watermark or media evidence. That snapshot does not
mean that the technician checked in. The two paths may share the generic
`LocationPort` and `LocationSnapshot` types, but they do not share business
state, media queue state, persisted command results or completion status.

The check-in is not a Dynamic Form field. It must not be inferred from opening
Survey, saving Survey, completing Survey, uploading a photo, or creating a
quotation.

## Business sequence and boundaries

The intended boundary, pending proof of the command, is:

```text
user intent
  -> LocationPort.captureCurrentLocation()
  -> validate location evidence
  -> Survey onsite check-in command
  -> authoritative reread / reconciliation
```

The command must remain independent from:

- Survey form save;
- workflow/process completion;
- quotation creation;
- the durable media upload queue.

No command or UI implementation was added in this contract-only slice.

## R1 evidence

The R1 source scan did not find a current Survey-specific check-in command,
record owner, or authoritative Survey check-in read model. The inspection
pages provide evidence for generic workflow/form sequencing and media
handling, but not for this new Survey action.

The scan also searched the R1 source and configuration for `gpsPoint`,
latitude/longitude, 打卡, 签到, 到达, 上门, 工勘, check-in/sign-in/arrival,
appointment, action/log and workflow process terms. No verified Survey
onsite-check-in lifecycle was found. This is an evidence boundary, not a
claim that a backend capability cannot exist.

## Backend evidence and rejected inferences

The backend source contains two historical generic families:

1. `PunchController` exposes `/biz/punch/dot`. It accepts a GPS point and an
   optional timestamp, dispatches through the punch service/actor, and returns
   an immediate service result. `PunchServiceImpl` contains generic worker,
   active ServiceAppointment matching and configurable distance/time behavior.
   Its read paths include punch queries and ServiceAppointment-scoped punch
   periods.
2. `SignController`, `SignDetailController` and `SignAppointController`
   expose the legacy `Sign` family. `SignDetail` can contain a work-order or
   contract target and a GPS point.

These are recorded as **legacy generic candidates**, not as the current Survey
contract. In particular:

- `ServiceAppointment.gpsPoint` is a location-bearing appointment field, not
  proof of a check-in record;
- `InspectionAppointment.gpsPoint` belongs to the wrong domain and is not
  proof of Survey check-in;
- Survey has no proven `gpsPoint` field or Survey check-in command in the
  evidence reviewed;
- the old Punch distance/time thresholds are not appointment-near Survey
  rules;
- an immediate asynchronous Punch response is not an authoritative Survey
  mutation acknowledgement.

The exact source references are retained in the sanitized contract artifact
without persisting any production payload, session, token, phone, customer or
address data.

## Persistence ownership and command

| Contract item | Status | Decision |
| --- | --- | --- |
| Survey check-in record owner | `UNKNOWN` | Do not select Survey, ServiceAppointment, workflow node, Action/log or a new record without evidence. |
| Survey command endpoint | `UNKNOWN` | No real adapter or Mock command is introduced. |
| Request fields | `UNKNOWN` | No guessed appointment/workflow/actor fields are serialized. |
| Response / authoritative read | `UNKNOWN` | No blind retry can be authorized. |

The candidate endpoints and entities are machine-recorded in
`onsite-checkin-contract.json` with their non-Survey status. The contract
checker rejects a claimed verified command while the owner is unknown.

## Location contract

Location acquisition is reusable through the generic `LocationPort`. The
Survey business contract does not yet prove:

- GCJ02, WGS84 or another coordinate system;
- an accuracy requirement or acceptance threshold;
- a geofence or radius;
- whether the backend transforms coordinates.

The coordinate system and accuracy policy therefore remain `UNKNOWN`. No
client-side distance block, fake coordinate, `0,0` fallback or fake address is
introduced. Permission denial must remain a blocked location capability and
must never become business success when a command is eventually authorized.

## Timestamp authority

The requirement says system time, but the Survey command contract does not
identify the authoritative persisted timestamp. Device capture time can be
evidence metadata only. It must not be presented as the business check-in
time.

The legacy Punch path creates a server-side time when its optional timestamp
is absent, but also accepts a caller-provided timestamp. That behavior is not
adopted as the Survey timestamp contract. The Survey authority remains
`UNKNOWN` until a dedicated command/read contract or equivalent evidence is
verified.

## Manual check-in semantics

Manual check-in is a current requirement, but implementation is blocked until
record ownership, command, validation, and reconciliation are proven. The
safe expected flow is location capture followed by an explicit command and
authoritative reread. Opening the Survey Action Workspace does not check in;
Survey save does not check in; workflow completion does not check in.

When implemented, a denied location permission must prevent the command. A
successful check-in must not save Survey, complete the workflow, or create a
quotation as a side effect.

## Appointment-near and automatic semantics

The requirement mentions “预约临近自动/手工”, but no evidence currently
defines:

- the appointment state prerequisite;
- a time window;
- a distance threshold or geofence;
- whether the app prompts the user or sends a mutation automatically;
- foreground/background lifecycle rules;
- duplicate handling for automatic attempts.

Therefore automatic check-in is **not implemented** and remains
`UNKNOWN_NEEDS_BUSINESS_CONFIG`. No scheduler, background mutation, 100 m /
500 m rule, or ±30 minute / ±1 hour window was invented. The generic Punch
thresholds are historical evidence only and do not fill this gap.

## Idempotency and reconciliation

Check-in is a business mutation, not a media upload. The current evidence does
not prove first-write-wins, overwrite, append, multi-visit or arrival/leave
semantics. It also does not provide a Survey authoritative reread for an
ambiguous response.

Accordingly:

- no business command is implemented;
- no blind retry is allowed;
- no offline business-mutation queue is created;
- any future command must single-flight and reread authoritative state after
  an ambiguous result before offering an explicit retry.

## Offline policy

The existing durable media queue remains independent and is unaffected by
this contract. Current requirements do not prove queued offline Survey
check-in semantics. `businessMutationQueue` is therefore `false`.

Location evidence may be captured only as non-authoritative local evidence if
a later feature explicitly needs it; it must not silently replay as a future
business mutation or backdate a server check-in.

## Real / Mock execution

No real Beta or Production check-in write was performed. Real writes remain
disabled. Since the Survey command is not proven, no Mock-only command was
added either; this avoids creating a Mock semantic path that has no real
normalized contract behind it.

## Deferred UNKNOWNs

- Survey check-in record owner;
- exact command/API, request and response;
- coordinate system and accuracy policy;
- authoritative server timestamp;
- appointment-near trigger, time window and distance rule;
- manual mutation lifecycle;
- automatic foreground/background semantics;
- duplicate/idempotency behavior;
- authoritative reconciliation read;
- offline policy beyond “no business mutation queue”.

## Verification

The artifact is machine-checked with:

```text
pnpm run check:survey-onsite-checkin
```

The test proves Survey/Inspection separation, owner and command UNKNOWN
status, explicit coordinate/time/appointment-near UNKNOWN values, no invented
thresholds, no offline business mutation queue, no automatic scheduler or
background mutation, and real writes disabled.

This contract does not authorize G4-F and does not claim live business
mutation, visual implementation, or a completed Survey onsite check-in.
