# Static protocol MCP integration audit — 2026-10-03, source audit .81, implemented .82

## Evidence and scope
Read-only source audit by protocol_mcp_audit. Adapter creation/edit/readback tests pass; MCP still defaults to legacy. No account data accessed. This report is a development artifact, not a completed feature claim.

## Confirmed integration gaps
- prepareProgramPayload / buildPresetPayload omits protocol options.
- resolveNewTemplateCode / verifyCreatedTemplateReadback omits protocol and accountUnit.
- saved edit replacement and baseline serializers omit protocol context.
- verifyUpdatedTemplateReadback omits protocol and accountUnit.
- reconciledProgramCoachNotes and creation saved identity reserialize with legacy defaults.
- buildReadableSavedTemplate / resolveSavedTemplateLoadPresentation assumes GET kg.
- profileConfigFingerprint omits protocol context; changing context would preserve an old approval.

## Required implementation order
1. Resolve explicit profile-bound protocol context, default labelled legacy-public-default.
2. Validate alternative protocol with actual matched static write/readback reference evidence and account unit, bound to account identity (email/region or stable API identity). Never infer from API version, unit answer, GitHub examples, RM marker, or GET alone. No automatic probing writes.
3. Thread one locked context through creation, update, baseline, diff, readback, presentation and identity reconciliation.
4. Bind protocol/evidence digest to approval validation; retain stable account identity independently. Account/region change invalidates evidence; password rotation does not. Fresh unit mismatch blocks alternative static writes.
5. Test real MCP preparation, preview, regeneration and readback for both protocols and units. Include approval invalidation, account mismatch and unknown evidence rejection. Preserve Smart RM and scientific gate.

Do not expose arbitrary model-selected protocol switching. Full parity remains unproven until integration and reference behavior are verified.

Implementation update: .82 threads context through the listed MCP paths. Local reference includes correlated userinfo observation and future-time rejection. Invalid static references preserve other read paths; alternate writes require fresh API unit. 612/612 latest installed-source tests pass. Physical firmware parity remains unproven.

