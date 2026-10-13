# M1-I6 — R1 signing command review and readback

Engineering scope: offline intent analysis, independent readback state reduction, and hard-disabled signing commands. Existing backend unchanged; no actual signing, messages or Contract mutation.

## Source parity
- R1 frontend SHA: xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d, business/subpackages2/workOrder/workOrder.vue.
- Electronic signing: lines 5117–5139, signature/applyForElectronicSignature, orderId_thread.
- Offline signing: lines 5077–5115, signature/applyForElectronicSignature.do, orderId_thread plus type=1.
- Repeat signing: lines 5231–5245, signature/againApplyForElectronicSignature, contractId.
- SMS reminder: lines 5246–5260, signature/handleReminderContract, contractId.
- Contract cancellation: lines 5199–5229, basic/contract/remove, id and cancelReason.
- Backend SHA: xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e. SignatureController.java lines 54–94 and 114–170; SignatureServiceImpl.java lines 117–160 and 248–325. Request acceptance may precede asynchronous processing, storage updates and customer notification. Retry for status -3 has a frontend/backend disagreement.
- Request method is not proven solely by backend RequestMapping.

## Engineered boundaries
- r1-signing-command-intents.ts: five source-pinned metadata contracts, status/identity preflight and reasons. No executable command payload; mayDispatch is always false.
- r1-signing-command-readback.ts: pure state machine distinguishing acceptance, fresh readback, pending, ambiguous/failed and recorded signature status, without polling or sending.
- uni-api-command-transport.ts: separate hard-deny for signing and Contract mutations across all environments, independent of generic real-write flags.
- Signing main page: DEV synthetic-only intent inspection; no signing buttons enabled.
- Test gates: TypeScript, source and safety unit tests, H5 375/390, MP/App bundles.

Outstanding evidence: R1 Contract query workOrderId vs backend serviceAppointmentId, role permissions, real signer identity, backend state/notification side effects, physical device. I6 remains 2/4, M1 1/8; Draft PR must remain unmerged.
