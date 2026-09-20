# G4-E Survey Leakage Cause Contract

Status: `PARTIAL` — controlled read/selection experience is implemented; the
visible-to-visible part transition cleanup policy remains explicitly UNKNOWN.

## Evidence

R1 `business_jishi/subpackages2/inspectionAppointment/inspectionAppointment.vue`
proves the following behavior:

- opening `leakageCauseSelect` queries `biz/extForm/queryByColName/leakageCause`;
- the request is a POST form request with `_all=1`, sorted by
  `partOrder,leakageCauseOrder` ascending;
- rows are grouped by `part`, and child selection toggles the
  `leakageCause` identifier into a multi-value array;
- `leakageCauseSelect` is UI state for opening the tree and is not a persisted
  FormData value;
- the selected repair-part path uses `formData.part[0]` to select the active
  tree group;
- R1 clears dependent fields when a part change makes their effective
  visibility false.

Backend source confirms the persistence shape:

- `Survey.leakageCause` is `List<String>`;
- `ExtFormController` exposes the column-name read endpoint;
- `ExtFormServiceImpl` returns the dynamic collection rows without a
  leakage-specific transformation;
- `SurveyController` consumes each persisted value as a string identifier.

The machine-readable sanitized contract is
`contracts/beta/survey/leakage-cause-contract.json`.

## New-app boundary

The generic Dynamic Form Runtime does not recognize `leakageCause` or
`leakageCauseSelect`. The Survey experience registry requires the verified
two-row shape (`select` trigger plus required multi-value `data` field), and a
Survey-only provider adapts raw rows to `{ part, id, label }`.

The provider failure path preserves existing IDs and does not save or complete
the workflow. New selection is disabled until a successful provider read.
Selection changes only local form state and mark the form unsaved; explicit
form save and workflow completion remain separate commands.

Mock rows use synthetic IDs and labels only. They preserve the raw-response →
adapter → provider → experience path, but do not assert production leakage
cause vocabulary.

## Explicit unknowns / exclusions

- production option rows are not persisted in this repository;
- the exact visible-to-visible part transition cleanup/filter policy is UNKNOWN;
- `serviceGoods` / `projPackage` remains UNKNOWN;
- media, real Survey writes, workflow completion, offline queues, location and
  watermark behavior are outside this slice;
- G4-F is not started.
