# Agent Working Rules

Primary writable repository:

/Users/yesun/Code/xlink-technician-app

Legacy reference repository:

/Users/yesun/Code/xlink-business-jishi-3.0

Rules:

- New repository is the only writable application target.
- Treat the legacy repository as read-only reference.
- Never modify legacy files while working on the new application unless separately and explicitly authorized.
- Never copy large legacy components/modules as the implementation strategy.
- Reuse business behavior, API contracts and validated rules — not legacy architecture.
- New code must not import or reference files from the legacy repository.
- Cross-repository inspection of legacy code is allowed.
- Preserve exact existing backend API contracts unless an explicit decision changes that rule.
- Unsupported low-code workflow/form capabilities must fail explicitly rather than silently behaving incorrectly.
- MP-WEIXIN and APP must remain first-class targets.
- Platform/native differences must be isolated behind explicit platform adapters where practical.
- Do not commit secrets, local credentials, generated build output or environment files.
- No main merge or destructive git action without explicit human authorization.
- Prefer coherent capability slices over micro-refactors.
- Each meaningful implementation slice must be independently reviewable and rollbackable.
