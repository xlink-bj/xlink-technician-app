# M1-S1｜工程基础与 Mock 冻结验收（Owner Stage 2 handoff）

**Owner decision: `SOURCE_BACKED_ENGINEERING_LOCKED / READY_FOR_S2_UX`.** This is a **scoped engineering and product-design handoff**, **not** a claim of fully verified live API parity or the original all-evidence S1 Gate. Do not infer missing production samples from CI or synthetic fixtures.

Date: 2026-10-13. Control: [#119](https://github.com/xlink-bj/xlink-technician-app/issues/119) and [#33](https://github.com/xlink-bj/xlink-technician-app/issues/33). Consolidated stack: #116→#117→#118→#121→#122→#123; current review branch `lead/m1-s1-foundation-source-parity-closeout`. Old R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`; Backend `xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`.

## What is frozen for Phase 2

1. **Domain/identity:** ServiceAppointment → current WorkflowNode + typed FormDef/FormData → typed quotation Order (`type=0` separate from `type=1`) → separately read and verified Contract. WorkOrder, User/Role/Tenant/Order IDs must remain consistent; synthetic Mock IDs never authorize Real writes.
2. **Adapters:** Login/session, role-constrained ServiceAppointment list/detail/action, dynamic appointment/survey form and code/media references, four catalog endpoints + Package/detail/SKU conditional, pure grouped draft and Order encoding, official Order/Contract read, signing intents intentionally non-dispatchable. All use project typed Ports, explicit error/unknown/loading states and fail-closed authorization.
3. **Dynamic forms:** The stage 2 UI must follow FormDef presentation with special UX on appointment time and survey leakage/media only; no fixed production field list invented from R1 sample; absent/unknown definitions produce a safe state, not fictional input.
4. **Catalog:** Pinned `FlipPageInfo`/`EMongoTemplate` source proves `page/rows` with no `_all`; 20-row pages, explicit load more, 50-page cap, sourceType+serviceType identity, original status/order and backend tenant/org price overrides. Current Production DB role has ordinary active Material matching source filters; **API response not executed**. The main default Mock includes **ordinary products without `spuid` or sales attributes**, and a separate **synthetic** optional SKU exercise. Lack of active current-role SKU never blocks ordinary catalog. All fixture IDs/labels are synthetic.
5. **Quotation vs signing:** Local draft and calculated amounts do not become official Order or a legally signed Contract. Independent source-shaped sample Order+Contract read supports Stage2 signing visual work. Command fences, role handler status, uncertain readback and no blind retry remain intact.

## Evidence matrix at S1 freeze

| Stage | Source-model / actual App + synthetic contract tests | Existing scoped Production/Beta evidence | Remaining gated facts |
| --- | --- | --- | --- |
| L | `SOURCE_VERIFIED / CODE_TESTED` — R1 exact mobile regex, six-digit SMS, auth/session Port, role safety | Historical scoped login and role-tree read; no new real auth in this tranche | L02 explicit consent and legal URLs need Phase2 product/legal UI decision; L03 restored session intentionally fails closed until policy/real reauth evidence |
| W | `SOURCE_VERIFIED / CODE_TESTED` — ServiceAppointment primary route, stage and identity separation | Historical role-limited list (20 rows) and one list-owned detail read | Rare SANode view/sort/handler branches not all live tested; if a delta occurs fix adapter only |
| A | `SOURCE_VERIFIED / CODE_TESTED` — dynamic FormDef, need/time branch, local save-vs-complete, readback | No newly authorized current active appointment FormDef/FormData sample | `NEEDS_SCOPE_APPROVAL` for exact live field set; no hardcoded field assumptions; S4 read-first reconfirmation |
| S | `SOURCE_VERIFIED / CODE_TESTED` — dynamic survey schema, leakage causes, media references and async error states | Historical Beta Survey examples cannot be promoted to current Production active FormDef | `NEEDS_SCOPE_APPROVAL` for active schema; physical camera/watermark is S3; real upload/process is S4 |
| Q | `SOURCE_VERIFIED / CODE_TESTED` — list/package + data identity + grouped pricing + Order types; Q01 bounded paging Mock equivalent | Q01 positive ordinary Material in current Production DB; **API_NOT_RUN**. Q02 no current-role active SKU | Q01 live API response unverified; SKU `NO_SAMPLE` independent optional branch. Real pricing/Order updates/PDF are S4 |
| C | `SOURCE_VERIFIED / CODE_TESTED` — canonical ServiceAppointment Contract/Order identities, bounded reads, handler/unknown and command fence | No newly authorized Production Contract API response | `NEEDS_SCOPE_APPROVAL` Contract/status and signer ACL; -3 source ambiguity deliberately fail-closed; real SMS/signature/PDF S4 |

**Definitions:** `SOURCE_VERIFIED` = exact pinned code contract; `CODE_TESTED` = actual App pure/Mock and browser simulation; `DB_STRUCTURAL_POSITIVE` = authorized current-role data schema, not API success; `API_NOT_RUN`, `NO_SAMPLE`, `NEEDS_SCOPE_APPROVAL` are factual live-evidence limits. None are aliases of `LIVE_VERIFIED`.

## Owner acceptance check

- [x] Source R1 / Backend contract map and separate six-stage typed Ports checked; no currently identified **unmitigated UX-breaking** domain/model change.
- [x] Main App H5 shared components and page navigation covered by automated six-stage **synthetic** flows; role/WorkOrder, errors and Contract dispatch boundaries remain protected.
- [x] Equivalent **source-modeled Mock transport** and default current-role **ordinary Material structural scenario** included; optional SKU test data is clearly synthetic and segregated.
- [x] One exact-HEAD full unit/contract/H5/MP/App CI **required before final CODE_PASS and Ready-for-Stage2 claim**; verify the PR exact HEAD and record the run results on #119/#123, not an ancestor HEAD.
- [x] Every live-sample/access/write/physical-device limitation has an explicit downstream owner/stage; no production business write or expanded read authority implied.

**Scoped Owner waiver for Stage 2:** Active appointment/survey field catalog, Q01 actual API wire response, current-role SKU options and real Contract rows cannot be promoted from source/DB evidence to proven live parity. These are **not S1 implementation backlogs** when the UI works through dynamic/optional typed contracts and safe states; they remain **S4 READ-FIRST integration checks** (or a separately approved local restricted-read exercise). If any authorized live read later contradicts a field identity, gate that individual API slice and patch its adapter **before** enabling real writes; do not silently rewrite a UX page. This scoped waiver **does not fulfill the original `ALL LIVE EVIDENCE` interpretation** of S1 and must never be called a completed real API integration.

## Stage transition rules

- Stage 2 can begin the **commercial H5 UX/UI** review based on this source-backed engineering snapshot, without re-running R1 source research or authorizing production business operations.
- Stage 3 remains actual WeChat DevTools visual/runtime QA, not replaced by H5/simulator build.
- Stage 4 first validates authorized real read schema, then separately approved non-production business writes, authoritative server readback, Order/Contract/SMS/PDF side effects and final error/retry semantics. Unknown/absent legitimate SKU sample stays a gated optional feature, not an ordinary Material catalog blocker.
- Existing M1 formal #33 **1/8 unchanged**; I1–I8 formal gates still require individual evidence. A Draft PR is not a merge or release; no main update in this handoff.

**Final decision form: `ENGINEERING_SOURCE_FREEZE = APPROVED`; `START_S2_COMMERCIAL_H5_UX = APPROVED_ON_SOURCE_MODELED_MOCK`; `LIVE_API_PARITY = NOT_VERIFIED`; `PROD_BETA_BUSINESS_WRITE = DENIED`; `M1_RELEASE_READY = NO`.**
