# C3-C1 — Media Queue Recovery and User-Directed Retry

> Status: DRAFT · Based on `main@713389a13082ad2cfd7dd22d7ebfbd69f32f1b7c` · Owner Review required

Move media queue **readback recovery** and **user-directed retry iteration** out of the 2,240-line Action Workspace into `action-workspace-media-queue.ts`, using narrow callback ports. This is not a new uploader or change to underlying `MediaUploadQueuePort`.

## Safety and ownership

- Action Workspace still owns actor/role/workOrder and command-generation checks, picker and capture permissions, in-flight leases, mutation of media/form/draft state and local draft saving.
- The new helper lists tasks for exactly the current user/workOrder/node/form, filters field/form identity, resumes only known `postprocessing` recovery, and reports confirmed uploaded refs. It cannot mutate store state itself.
- Retry loop is invoked only from the existing explicit user retry action. `source_uploaded` uses `process`, known retryable failures use `retry`, and `ambiguous_postprocess` is **never** selected.
- Every queue await retains stale-scope denial; no remote result is applied after revocation. Readback failure never fabricates a completed media ref.
- Keep original upload request path, URL mapping, watermarks, local persistence, FormData schema and Production/Beta write policy untouched.

## Required evidence
Direct unit tests include scope filtering, pending postprocessing resume, ambiguous denial, stale role cancellation, read failure, explicit retry routing and missing successful result. Run full exact-head Validate, H5/MP/APP build, DEV Mock H5 media/survey/regression and visual contracts. Keep PR OPEN pending independent Owner merge review.
