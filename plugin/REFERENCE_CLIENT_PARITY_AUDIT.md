> Historical audit record: old menu paths, forced global-instance restart and optional-startup configuration notes below are retained as historical observations, not current recovery instructions. Use only supported observed controls for the exact current instance; otherwise an authorized fresh diagnostic verifies only its own instance. No universal attachment fix is established.

## Release 1.0.616 — client version policy (API 98 and 1004)

The Versioncode request header is now one stable value per region for login and for every request (speediance-app-version.mjs, native-login.mjs, speedianceApiRequest). It starts at the community baseline 41000, rises only after API 98 along the Android anchors 41000, 41600, 41900 and 42300, and after API 1004 returns to the highest code below the rejected one that the API processed (code 0 or the 98 answer of the version gate). A 1004 on an already accepted code is a short throttle until it repeats three times, at least 30 seconds apart. Reads are repeated with the new code (at most four times per request); writes are never replayed. The public iOS number is a one-time candidate, consulted only for reads and only after every anchor answered 98. The state is kept per region in speediance-client-version.json; its override field or GM_COACH_SPEEDIANCE_VERSIONCODE forces a code. speediance_check_connection reports the declared code as clientVersion.

Verification on the source tree, without account calls: node --check on the three changed modules; speediance-client-version 25/25, native-login 14/14, client-version-negotiation (real server process with a fake API) 6/6, session-reference-client-parity 2/2; the 13 files that extract speedianceApiRequest into a vm context 197/197; training-evidence to workout-json-interop 274/274. A full run was stopped after 2593 passes and 41 failures in the first 156 of 169 files. All 41 failures also fail on 1.0.615 (accessory-confirmation-cycle: 16, structuredClone missing in the vm harness; 25 more in 13 other files, compared by test name against a 1.0.615 tree), so none comes from this change. The live server was not queried: whether 41000 or a higher anchor is accepted for the account today is unverified. The only live evidence is the 1004 returned on 2026-11-05 for the iOS derived code 42400.

## Release 1.0.432 — QuickTest speed and pending recovery

The explicit QuickTest route now reads one focused instruction module. A read-only preflight returns all missing plan fields and exact preference scope digests before the expensive preview. Catalog category/detail reads use bounded concurrency; QuickTest preview/create may reuse a ten-minute account-bound catalog, and selected exercise metadata reads run in small parallel batches. New reconciliation can bind an old pending-write marker with no saved local note to the exact pending plan digest, original date, current account, exact-code saved-template detail and full readback. It reconstructs local identity before deleting only unchanged marker bytes, then allows a fresh date-bound schedule preview without another template create POST. The marker's historical account fingerprint is absent, so proof is limited to current profile binding plus exact plan/template match. Focused tests cover concurrency, legacy reconciliation, calendar idempotence and unchanged ordinary write gates. Live calendar scheduling remains to be verified.

## Release 1.0.430 — exact-code quick-test recovery

Quick-test schedule recovery now reads the exact saved template directly by code and verifies the detail response, so unrelated saved-template list-count metadata cannot block it. It still requires an unchanged digest and exact local identity. Static syntax checks only; no account calls or test suite run.

## Release 1.0.429 — quick-test recovery hardening

Schedule recovery now requires a persisted local QuickTest marker; older GM Coach notes can migrate the marker only after exact local identity/readback and absence of a reviewed scientific record. A previously verified calendar operation can be retried only when fresh complete readback proves the desired reservation is currently missing (or the exact reservation remains before a removal); conflicts and unavailable reads still block mutation. Static syntax checks only; no account calls or test suite run.

## Release 1.0.428 — quick-test calendar recovery

Quick-test creation now skips the scientific reviewed-plan record that requires source evidence, while retaining a local saved-plan identity and continuing to the requested calendar reservation. Create binds the server-generated unique name to the original preview input so the digest remains stable. When a verified template was saved but its reservation failed, a schedule-only quick-test preview can recover that exact code, digest, plan, and date without creating a duplicate or claiming scientific review. Calendar readback requires the full date structure and classifies only the requested day, so unknown entries elsewhere no longer prevent target-day verification. Static syntax checks only; no account calls or test suite run in this source edit.

## Release 1.0.427 — target-day calendar completeness

Quick-test calendar preflight requires complete month date structure plus an empty, valid target day. Unclassified entries on other dates no longer block a safe reservation for the requested day; existing entries on the target date still block both create and reservation. Static syntax checks only; no account calls or tests in this source edit.

## Release 1.0.426 — quick-test identity and calendar preflight

Quick-test previews assign a short random suffix to the program name, and create checks for a complete empty target date before sending the template POST. This reduces name collisions when the account list cannot confirm prior codes; the create response code and exact detail readback must still match the approved payload, and quota remains unknown. Calendar reservation repeats its own complete-month/empty-day check immediately before dispatch. API status `code=0`/`"0"` is no longer mistaken for a template code. Static syntax checks only; no account calls or tests in this source edit.

## Release 1.0.425 — quick one-off workout path and faster verification

The explicit `quickTestSession` path avoids the saved-template inventory scan during preset lookup and preview. At create it relies on the exact code returned by the create response plus a full `detailByCode` readback matching the approved payload; quota remains unknown, and a missing/ambiguous code retains the pending-write guard. Ordinary creates still require a complete pre-create list, while a direct response code avoids redundant post-create relisting. Calendar reservation now checks complete month coverage and an empty target day before POST, then keeps the existing journal and final readback. Static syntax checks only; no account calls or tests in this source edit.

## Provenance clarification — 2026-10-22

The hosted public reference web client links its public feedback repository, whose README states that source repositories are private. The pinned hbui3 and labatt repositories below are separate public community clients; their writers establish compatibility with those versions, not the current hosted its author backend. reference client tool metadata declares account-unit inputs/outputs and verbatim preference values; it does not expose internal HTTP conversions. Keep the directly captured hosted reference client rep-max table and assessment suggestion observations separate from community writer evidence. Neither establishes physical firmware load parity.


## Current official catalog and completed-history scope — reviewed against 1.0.296

This dated section supersedes the historical 261 introduction below. Official courses and programs already have public read-only MCP tools: speediance_browse_official_courses and speediance_browse_official_programs (mcp_server.mjs public definitions/dispatch; official-courses.mjs and official-programs.mjs). Course page/detail and program page/week-day course lists are bounded returned catalog data. Their partial=false means the implemented reader did not encounter its recognized catalog failures; it is not scientific approval or full executable prescription coverage.

The course-detail reader exposes prescriptionCoverage with requested/returned identity scope, bounded observed paths, scienceExecutability:unknown and scientificApproval:false. Source-confirmed full per-set variant/load-unit/preset/mode/rest/section bindings remain missing; catalog titles, recommendedWeight and completionMethod renderings must not be promoted into a science-approved personal plan. Public completed course/AI detail history and the separate explicit courseTrainingInfo reported-summary reader are different namespaces from catalog course_id. They do not authorize a reservation or provide catalog identity linkage.

Pinned reference client api_client.py455–477 and app.py552–567 implement courseReservation with status/deviceType/thatDay/courseId. Coach official-course-reservation.mjs implements only an isolated helper and source payload, not a discoverable public reservation tool. Its unsupported readback intentionally returns scheduled:false, calendarReadbackVerified:false and retryBlocked:true after attempted writes. Public catalog tools send no courseReservation POST. Local helper tests are not actual public preview/approval/transport integration coverage.

Highest-value remaining gap is scientifically gated official-course selection and reservation. Before wiring public mutation, establish exact current course per-set executable contract and a source-confirmed calendar course identity/status readback. Then bind account/profile/recovery, immutable exact course detail, science assessment, expiry and source revalidation to preview/approval; journal uncertain outcomes and never replay or infer courseId from completed training_id or template calendar codes. A submitted-but-unverified outcome cannot be reported as scheduled. Whole official-program adoption needs separate explicit per-course/week-day coverage and approval; catalog browse alone is not this feature.

This section is a source audit and documentation correction only. No private API calls, changed tests, installation, physical-device or native-platform validation were performed. Runtime verification remains in the release-owner ledger.

## Documentation scope correction prepared for 1.0.261 — 2026-10-08

Read-only review of259, staged against260: the feature reference now distinguishes implemented exact completed course/AI detail history from the old identity gap, shared bounded coverage and unsupported reservation readback. A dated current-scope section separates later durable display and confirmed Customize source binding from historical197/220 records. Official-course reservation remains unwired public MCP integration work. No tests, installation, account API calls or new physical/native-platform evidence were produced by this documentation correction; release-owner verification is separate.

## Release 1.0.220 — strict input regression repair

219 initial suite had two failed fixtures: mixed normalized rest/public restSeconds and deliberately supplied derived load metadata. Preserve independent normalized science binding while passing clean public input; explicitly assert derived-key rejection before valid saved-edit commit/readback. Runtime strict guard unchanged. Install before full test.

## Release 1.0.219 — runtime public set field validation

Actual normalizePlan rejects unknown per-set keys instead of silently ignoring readback-only fields. Canonical doses/modes/rests retain public contract. Real-normalizer and concrete-schema regressions added; existing rmLevel diagnostic retained. Internal replay callsites retain original public arguments. Scientific gate/approval unchanged. Offline evidence is not device parity.

## Release 1.0.218 — public input guidance and intake provenance

Canonical per-set examples use public mode/restSeconds and explicit durationSeconds. Guidance distinguishes normalized readback from input, preserves unavailable recovery and explicit user intake provenance, and recovers stale skill paths. Only tool descriptions and instructions changed; parser, approval and scientific gate unchanged. Regression checks examples against dose normalization and public field contract; does not prove full scientific preview or physical device equivalence. Verification recorded externally.

## Release 1.0.217 — collection-bound statistics history

Rejects competing recognized arrays as unknown pagination instead of choosing by length/order. Historical candidates follow the validated collection and local record limit; envelope aggregate provenance is explicit and unrelated metadata excluded. Requests retain stable page size across pages. Sanitized diagnostic fields are distinguished from verified history. Actual reader regressions cover ambiguity, limits, totals and stable pagination. No device or private reference client resolver equivalence is claimed. Install/test evidence recorded externally.

## Release 1.0.216 — explicit rest-week deload and actual working baseline

A scheduled deload can contain zero sessions when the cycle explicitly declares that rest week and authorizes the corresponding schedule exception. It is reported as zero prescribed sessions, not measured biological recovery. The comparison requires the last actual working week before the deload, skipping declared intervening rest weeks. Public preview discloses exact baseline/target dates, calendar gap and gap endpoint; missing/empty/older baselines and undeclared rest still reject. The existing science, scope, approval and no-automatic-write rules remain enforced.

Adds actual public-preview regressions and the prescription-helper regression for zero work, rest gaps, and invalid baselines. Root will install this matching shared release before execution; exact install, test and ZIP results are recorded in the dated release-owner verification ledger `C:/TQ3D/gm-coach-current-verification.md` and `.216` logs. This source review does not claim physical device parity, native macOS/Linux installation or independent scientific semantic proof.
## Release 1.0.215 — missing recovery inputs and native-history instructions

A nonempty placeholder such as `not_requested`, `unknown`, `unavailable` or an explicit refusal no longer qualifies as an actual history summary or recovery report for `not-indicated` deload. Intake auditing and cycle assessment share the classification; genuine numerical sleep data remains reported context. The actual public cycle preview rejects insufficient personal inputs before approval or writes and discloses missing context for planning-only strategies. This is input classification, not a physiological readiness measurement or proof that a deload is unnecessary. The scientific gate is preserved.

Root coaching instructions now name the native GM Coach API history path rather than the obsolete CLI diagnostic path. The previously failed `.214` fixture/text checks have been corrected; no old test result is carried forward. Matching installation completed before the full suite: 1200 tests, 1197 passed, 1 failed, 2 platform skips. The actual early scheduled deload regression exposed a zero-session target rejection; .216 addresses it. A fresh diagnostic chat confirmed .215 loaded/installed, restartRequired=false and API connectivity, which is historical .215 evidence only.
## Release 1.0.214 — complete workout tables and audit interpretation

Requires full workout tables before assessment in all three skill entrypoints and MCP initialization instructions, including per-series load/preset, resistance mode and rest. Preserves each stretching movement, unknown fields and asymmetric settings. Clarifies Smart RM machine-selected load, specific preference scope and seconds versus reps; presentation does not change plan evidence or execution digests. Corrects a missing fixture brace and capitalization-sensitive text assertion found in the failed213 suite. No green213 test claim; fresh214 installation precedes retesting.
## Release 1.0.213 — individualized deload policy and immutable personal context

Removes fixed final-week authorization requirements while retaining final deload as an organizational default. Scheduled deload compares executable dose with the preceding actual work week, including earlier block boundaries. Separates science-assessed not-indicated from explicit user-declined and readiness planning-only. Server binds available history/recovery context to the cycle digest; missing history/self-report blocks not-indicated. No automatic readiness monitor or physiological confirmation is claimed. Adds actual dispatch regressions for changed personal inputs, early reduced-dose deload and rest-week boundaries. Install/test evidence is recorded externally after execution.
## Release 1.0.212 — history namespace correction and exact load oracles

Replaces broad history type-to-free fallback with pinned type namespaces; manual summaries retain unqualified reported metrics without Free Lift requests, while unsupported detail namespaces stay explicit. Actual reader/annotation regressions preserve unknown units. Customize tests assert independently sourced exact weights and capacities; alternative writer oracle covers load/capacity only, not its zero-rest fallback. Skill reads gain bounded UTF-8 guidance. Install/test evidence recorded externally; no physical-device or native-Mac proof.

## Staged complete workout audit presentation (2026-10-07)

All three trainer skill entrypoints and actual MCP initialization instructions now require full Markdown exercise/set tables before assessment, including preset/Customize, mode/rest and every stretching exercise. Different series cannot be hidden by aggregation. Correct Smart RM without kg is not a defect; assessment requires real effort/history. Movement-specific preferences must not be generalized, and seconds cannot be reinterpreted from a title. Existing instruction regression covers each entrypoint/runtime. No plan/evidence/digest or account changed; no tests run by this agent.

## Staged exact mixed Customize writer oracle (2026-10-07)

Strengthened the existing four mixedmanual regressions with independent literal wire weights, action capacity and totalCapacity for kg/lb under both protocols. Capacity tolerance covers only binary floating-point error, not one-decimal wire drift. Source: pinned hbui3 api_client.py531–564 and labatt api_client.py739–786. Alternative labatt writer substitutes60 for numeric rest0; oracle scope is load/capacity, while Coach retains explicit prescribed zero rest. Legacy lb includes separately documented pre-writer snapping to7/8kg. No runtime/science changes, tests or installation performed by this agent; release owner must freeze/install before execution.

## Release 1.0.211 — health completeness and cycle response correction

Rejects conflicting aggregate heart-rate bounds and marks absent zone lists partial, preserves explicit empty lists and genuine zero durations. Aligns all skill entrypoints on two-week product blocks, eight weeks/four blocks, final deload within horizon and undated health limitations. Adds four mixed-unit asymmetric manual Customize serializer/readback regressions with isolated science dependencies, not full preview/commit or physical proof. Install/test evidence recorded externally.

## Staged mixed manual Customize regression (2026-10-07)

Added four existing-path regressions in `tests/manual-customize-path.test.mjs`: actual plan normalization with confirmed strength catalog, actual preparation/serializer and saved readback for asymmetric explicit L/R reps + seconds, kg/lb and both static protocols. Checks independent load/mode/rest, zero rest, unit/count alignment, unchanged decision evidence and rejection of each readback array drift. Missing catalog confirmation and Smart RM seconds remain rejected. Scientific dependencies are isolated fixtures: this does not establish full scientific preview/commit integration, native machine behavior or live account writes. Tests are staged and have not been run by this agent; installation and execution belong to the release owner.

## Release 1.0.210 — reported heart-rate zones and Bash compatibility

Adds the pinned reference client aggregate heart-rate-zone GET through explicit health consent, preserves unknown measurement period and partial data, and fixes first manifest entry under Bash 3.2 nounset. Native macOS/device verification remains unproven. Install and test results are recorded externally.

## Staged macOS Bash 3.2 manifest repair (2026-10-07)
Installer previously expanded an empty files array under set-u on the first manifest entry, incompatible with Bash3.2 invoked by the Mac launcher. Indexed duplicate checking preserves nounset and rejects duplicate paths. Remaining files-array expansions follow the mandatory nonempty gate; required_files and keyring_args start populated. Added source regression plus actual extracted-loop first-entry/multiple-entry/duplicate regression gated on verified Bash3.2 availability. Tests and matching installation are pending root release coordination; no native macOS installation or Keychain execution has been verified.
## Release 1.0.209 — final approval expiry and presentation schema (2026-10-07)
Single-create transport beforeSend rechecks approval expiry after all awaited preflight/storage/session preparation. Real create/transport regressions assert zero fetch, own pending cleanup and no consumed-approval reuse. Research presentation labels moved outside publicPlan.evidence into evidencePresentation to preserve strict input schema. Existing scientific gates remain; install/test evidence recorded externally.
## Release 1.0.208 — research preview provenance (2026-10-07)
Public single/cycle research previews distinguish canonical PubMed metadata from assistant interpretation without changing scientific plan/snapshot/digests or acceptance. Actual presentation expressions and unchanged snapshots covered; existing HTML semantic-limit disclosure retained. No independent semantic-support guarantee. Install/test evidence recorded externally.
## Release 1.0.207 — reference client comma-decimal weight inspection (2026-10-07)
Strict whole-token comma decimals accepted for imported weight only, with explicit source-spelling diagnostics; original JSON, unknown units and unapproved selector semantics preserved. Junk/prefix parsing refused. Three actual public inspection dispatch regressions added. Scientific gate unchanged; install/test evidence recorded externally.
## Release 1.0.206 — preserve zero rest in reference client JSON import (2026-10-07)
reference-client-targeted export encodes only zero rest as string0 because public importer parseInt(s.rest ||60) otherwise changes it to60. Separate representation normalizations disclose this; scientific source and direct API serialization unchanged. Three actual dispatch/captured importer/inspection regressions cover bilateral and explicit pairs and unchanged named RM. Install/test evidence recorded externally.
## Release 1.0.205 — reference client JSON UI compatibility diagnostics (2026-10-07)
Local inspection now discloses valid imported amounts/rests outside named-preset and Customize editor ranges, preserving original data and unknown dose units. Import parsing itself does not establish clamping; these are UI compatibility warnings, not API limits or science/firmware proof. Five actual public dispatch regressions added. Install/test evidence recorded externally in gm-coach-current-verification.md.
## Release 1.0.204 — official program schedule reader (2026-10-07)
Adds source-supported exclusivePlanWeekList/day/course structure alongside legacy weekList with explicit conflict diagnostics and bounded sanitized output. Explicit raw empty course lists alone establish restDay; filtered/truncated emptiness does not. Regression covers actual MCP branch, identity, limits, invalid fields and secrecy. Install/test results are recorded externally in gm-coach-current-verification.md; do not infer live/hardware/science proof from this read-only parser.
## Release 1.0.203 — installed catalog pagination (2026-10-07)
Bounded explicit course/program page, page size and result limit; public MCP schemas/branches and ten regressions. Defaults1/200/50, no automatic page loops or exhaustion guarantee, no science acceptance or permission bypass. Matching source installed before full tests:1154 total,1153 pass,0 fail,1 platform skip. Software fixtures only; no personal API or physical-device proof.
## Release 1.0.202 — installed software verification (2026-10-07)
Matching source reinstalled before final full run: 1144 tests, 1143 pass, 0 fail, 1 platform skip. Five health workflow paragraphs moved verbatim to a packaged mandatory reference; independently compared against the actual201 recovery backup. Packaged coach entry is reduced by3000 UTF-8 bytes. Root-specific knowledge and required recovery/science/cycle rules remain inline. Router, resolved links, package graph and obsolete-text checks have regression coverage; this modest extraction does not establish faster complete onboarding.
The new regression caught actual obsolete rootSKILL history-CLI and code91 automatic-request-replay guidance. Corrected to native API/native login and GET/HEAD-only retry without write replay; reinstalled before final tests. Current root/packaged knowledge is consistent on this transport instruction. No personalAPI, nativeMac or physical-load proof. Latest model-response test201 passed synthetically; it is historical201 evidence, not202 liveMCP verification. Automatic verified orphan cleanup remains unfinished.
## Release 1.0.201 — installed software verification (2026-10-07)
Matching source installed before full run: 1143 tests, 1142 pass, 0 fail, 1 platform skip. All three skill entry points now require a readable comparison of comparable exercise doses, disclose decreases/unknowns and distinguish an individual increase from overall or muscle-specific progression. No automatic increase of every exercise is prescribed; seconds/reps and RM selectors/static tonnage stay separate. Deload requires actual reduced comparable dose, not a label. New source-contract regression covers these instructions; runtime scientific gates unchanged. Synthetic second-chat evaluation was started on200 and remains pending, so it does not verify201 response behavior.
No personal API reads, native macOS or physical-machine parity verification. Automated verified orphan cleanup remains unfinished.
## Release 1.0.200 — installed software verification (2026-10-07)
Matching source reinstalled before final full run: 1142 tests, 1141 pass, 0 fail, 1 platform skip. Windows promotion now retains the complete prior installation rather than attempting recursive deletion that could remove unlocked JS before failing on mapped files. Rollback and temporary cleanup remain separate. First run's new source-regression selected the nested rollback by substring; corrected the newline boundary and reinstalled before rerunning without changing runtime gates. This prevents partial recovery deletion; automatic verified orphan cleanup remains unfinished.
Fresh public hbui3 app.py confirms device_type is configured and owned accessory/device lists are user-selected IDs persisted locally, not machine-generation or possession autodetection. Added this source distinction to plugin knowledge. No personal API or physical/native macOS verification. Current release software coverage is not proof of private reference client load-resolver equivalence.
## Release 1.0.199 — installed software verification (2026-10-07)
Installed matching release before full run: 1141 tests, 1140 pass, 0 fail, 1 platform skip. Unix installer retains the prior installation after promotion when file-use safety is unproven; no command-line-only inference or ambiguous lsof exit authorizes deletion. Both transaction restore branches and temporary-path cleanup remain separate. Regression checks actual source retention, both restore paths, truthful messaging and LF-only shell files. Native macOS execution and automatic later orphan cleanup remain unverified/unfinished.
Read-only parity audit found no additional confirmed defect in inspected actual Smart RM conversion, Customize formatting and per-set readback paths. This is bounded software evidence, not physical-machine equivalence. The science gate remains intact; no personal account reads were performed.
## Release 1.0.198 — installed software verification (2026-10-07)
Matching source installed before full run: 1140 tests, 1139 pass, 0 fail, 1 platform skip. Saved-template dose resolution now retains malformed countType as diagnostic metadata without vetoing independently valid explicit reps/seconds when completionMethod is absent. The actual resolver regression covers 8/12 reps, 30/45 seconds, misaligned metadata and strict unsupported/misaligned completionMethod, invalid explicit units and missing-dose evidence. Endpoint-specific completion codes remain separate from countType.
Safe local diagnostics after installation: loaded MCP 1.0.194, installed 1.0.198, restartRequired=true. Credentials remain ready for the configured profile; this is not an API connectivity check. No personal account reads or live feature tests were run through the stale process. Software tests do not establish physical load/RIR parity, all-generation device testing or native macOS execution.
## Release 1.0.197 — installed software verification (2026-10-07)
Matching source installed before full run: 1139 tests, 1138 pass, 0 fail, 1 platform skip. Fixed remaining GM1-only global-preset instructions in create-tool description and equipment reference: all Gym Monster generations use supported family1, variant confirmation stays separate; families2/3 are different unsupported products. Native history wording and -1 Customize/nonRM interpretation corrected. New regression caught two stale technique paragraphs; fixed actual content to not_used rather than weakening its assertion.
Scientific model contract now names all16 plan categories including recovery_context and preserves exact source/excerpt reuse and showCalculatedLoads rules across all3 skill entry points. Existing runtime science gate remains unchanged. No new verified generation-detection or ownership endpoint was discovered; global accessory catalog and configured family are not possession/model autodetection. Source evidence: https://raw.githubusercontent.com/labatt/speediance-smartgym-workout-manager/main/api_client.py and https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/releases . No personal account/native macOS/physical-generation verification.
## Release 1.0.196 — installed software verification (2026-10-07)
Final matching source installed before full run: 1137 tests, 1136 pass, 0 fail, 1 platform skip. Four legacy transport fixtures were repaired with the actual private classifier and safe-error assertions, preserving exact profile/path/method proof, zero-fetch and no-replay checks; runtime gates were not weakened. Full pre-fetch failure provenance and rejected Promise guard regressions were added. Recovery workflow instructions now include exact local resolution, scientific context binding, honest declined/unavailable/not_requested states and report expiry. Rejected native Promise guards are consumed without await, and a stopped GET retry cannot erase an earlier sent request. Required recovery workflow is covered across all three coaching entry points. No personal account, native macOS or physical-machine proof.
## Release 1.0.195 — installed software verification (2026-10-07)
Latest installed full run: 1133 tests, 1132 pass, 0 fail, 1 platform skip. Installed matching source before each run; repaired legacy VM dependencies using the real recovery registry and dispatch guards. Earlier candidate failures remain historical evidence. This proves software regression coverage only.
Named Smart RM presentation now gives independently valid presets priority over generic unknown-kind level warnings, preserving spring/Vita and malformed-selector safeguards. Rest presentation resolves breakTime and breakTime2 independently and retains disagreement as unknown. Recovery declarations and account-bound expiring report provenance are required through scientific preview and final pre-send checks; private transport provenance now distinguishes a synchronous before-fetch rejection from uncertain sent outcomes. Owned creation markers and current calendar/cycle checkpoints are restored only for that exact proof; prior verified cycle steps survive. Spoofed error fields, wrong profiles/endpoints and lost responses remain uncertain.
The monitored chat “Sprawdź dzisiejszy i jutrzejszy plan” used 1.0.194. It confirmed response errors: unsupported blanket Standard, raw internal IDs in user tables, Smart RM described as missing kg, inferred sections, and partial-list/detail conflation. Its existing results establish an observed presentation problem, not physical load or full account verification. No new personal account reads were made for this audit. Native macOS and physical Gym Monster generation equivalence remain unverified.
## Release 1.0.194 — installed verification: 1114 tests, 1113 pass, 0 fail, 1 platform skip
Saved details reject mismatched or ambiguous template identities, conflicting/invalid aliases and wrong wrapper/sibling identities without treating exercise IDs as template IDs. Lists validate row types and code aliases, disclose duplicate/missing-code incompleteness and retain strict mutation gates. Actual helper/public-list regressions include the real ID resolver.
Today reports distinguish recorded-session history from calendar reservations, expose real session arrays and preserve annotations. Real annotator regression covers empty/plain/timed JSON histories. No personal-account or physical firmware verification; last loaded MCP192 remains older than installed194.

## Release 1.0.193 — installed verification: 1109 tests, 1108 pass, 0 fail, 1 platform skip
Read-only saved-list and exact found-template detail preserve structurally valid observed rows despite count/page incompleteness, disclose partial status and safe numeric issues, never infer absence or actual occupied slots. Strict mutation list gates unchanged. Actual public list and detail helper regressions cover the same count mismatch; full-list capacity fixture updated. Screenshot chat confirmed error from loaded191 (instance ef403b9c47eee74e1276b2e3); new193 account behavior untested untilrefresh.
Also includes192 staging changes: reported walking/nutrition health cards with renderer-labelled units/raw timestamp, no extData/age/alert inference. Original superset member declarations preserved and explicitly unverified, versioned scientific binding and snapshot legacy compatibility. Shared fixture extraction repaired without changing runtime validators. No personal account/nativeMac/firmware proof.

## Release 1.0.191 — installed verification: 1098 tests, 1097 pass, 0 fail, 1 platform skip
Seven consented health-context feeds now include exact documented body measurement fields and dated physical-condition blocks. Account IDs stripped; weight/height units unknown, measurement freshness and biological readiness not inferred. Five reader regressions plus actual dispatch route/date regression. Aggregate retains independent errors and real/demo gating. Pinned primary docs inspected directly. No personal account or firmware proof.

## Release 1.0.190 — installed verification: 1092 tests, 1091 pass, 0 fail, 1 platform skip
Cycle transitions use bounded actual working-week baselines across explicit rest weeks, expose dates/gaps/missing baselines, retain strict variant/unit guards. Health documentation corrected. No personal account proof.

## Release 1.0.189 — installed verification: 1090 tests, 1089 pass, 0 fail, 1 platform skip
Combined saved dose/rest/name/resistance-mode edits preserve independently valid per-set RM selectors without authorizing load changes. Four actual preview/commit/readback/v2-record cases plus strict preset/variant/unit/side/count guards. Negated or contradictory goals never select a rejected preset; clear separated hypertrophy exclusions remain Gain Muscle. Bare power is not Strength. Real normalizer regressions cover goal routing. No personal API/native Mac/firmware proof.

## Release 1.0.188 — installed verification: 1080 tests, 1079 pass, 0 fail, 1 platform skip
Health reports require actual metrics for availability. Identity/date/unit or recommendation-only rows are not measurements; zero remains valid. Unknown and mixed missing rows are explicit partial schemas. Coaching instructions distinguish retrieval and measurement time. No personal API proof.
## Release 1.0.187 — installed verification: aggregate health context
Aggregate selected-date/range feed combines confirmed fatigue/load/score/sleep and recovery availability. Independent errors sanitized, real/demo and unknown schemas retained; no readiness heuristic. Explicit coaching instructions consider dated data alongside history/selfreport through science. No personal API or firmware proof.

## Release 1.0.186 — installed verification: 1068 tests, 1067 pass, 0 fail, 1 platform skip
Separate consented profile-bound GET health feeds, strict real/demo flags, reported sleep seconds vs target minutes, unsupported/empty/partial schema distinction. No guessed recovery scalar aliases or biological readiness heuristic. Actual dispatch regressions verify missing consent/dates zero API and account isolation. No personal API/native Mac/physical-machine proof.

## Release 1.0.185 — installed verification: 1055 tests, 1054 pass, 0 fail, 1 platform skip
Actual normalized/prepared cycle regressions cover paired unilateral, asymmetric explicit sides, distinct CSV and supersets for both static protocols. Assert L/R and A/B order, loads, rows, recovery rests and unchanged scientific inputs. Deload rejects shortened recovery or higher effort despite lower wire load. No personal API/native Mac/physical-machine proof.

## Release 1.0.183 — installed verification: 1043 tests, 1042 pass, 0 fail, 1 platform skip
Cycle progression/deload static facts use actual wire encode/decode in a separate projection; scientific requested loads remain unchanged. Twenty-eight actual normalize/prepare/cycle-preview regressions cover both protocols, kg/lb and manual/profile-auto/fixed loads. Identical legacy16/17lb wire cannot qualify as progression/deload. Initial test fixture schema/authorization/expected-error mismatches repaired without weakening runtime. Device model autodetection remains unverified; candidate endpoint knowledge recorded. No personal API/native Mac/physical-device proof.

## Release 1.0.182 — installed verification: 1015 tests, 1014 pass, 0 fail, 1 platform skip
Safe numeric API refusal code retained in single-create errors; uncertain outcome and pending duplicate guard remain. Actual failure/retry tests do not expose raw secret text. Releases180–181 add saved patch-to-record coverage and unknown account template quota; historical reference client 50 no longer blocks creation. No personal API/native Mac/physical device proof.

## Release 1.0.179 — installed verification complete: 1008 tests, 1007 pass, 0 fail, 1 platform skip
Saved-edit reviewed records bind scientific snapshots to baseline/digest/scope/occurrence/final wire and regenerate reconciliation before readback. Actual dose/rest/mode preview-commit-record-write-inspect regressions retain12,11 while science defaults13 remain unchanged. V1 historical semantics retained; no record grants scientific approval. No personal API/native Mac/physical device verification.

## Release 1.0.178 — installed verification complete: 1005 tests, 1004 pass, 0 fail, 1 platform skip
Template list/single/cycle previews expose usage, reference client limit provenance, required new templates, shortage and alternatives. Existing edit/schedule need zero new slots via private server symbol. Complete-list and concurrency guards retained; shortage before POST. No automatic deletion or reduction of progression. No personal API/native Mac/physical device verification.

## Release 1.0.177 — installed verification complete: 1001 tests, 1000 pass, 0 fail, 1 platform skip
Dose-only scientific saved edits retain valid per-set named RM selectors, recompute reference client capacity from changed reps, preserve unchanged rows and reject forged aggregates. Actual preview/approval/intercepted POST/readback verified synthetically. No personal API/native Mac/physical device verification.

## Release 1.0.176 — installed verification complete: 999 tests, 998 pass, 0 fail, 1 platform skip
Reviewed-plan snapshots accept validated internal session limits and omit undefined values, preserving old record digests. Actual validator output now flows into actual snapshots in regressions. Goal/preset audit found no public bypass of interview goal. No personal API/native Mac/physical device verification.

## Release 1.0.175 — installed verification complete: 998 tests, 997 pass, 0 fail, 1 platform skip
Profile-auto Customize reveals requested versus rounded serialized account-unit loads while preserving science. Actual plan validator and serializer reject a confirmed session-time lower bound above the profile limit; sides/supersets follow execution and final rest is excluded. This is not proof the remaining plan fits or is physiologically optimal. No personal API/native Mac/physical device verification.

## Release 1.0.174 — installed verification complete: 995 tests, 994 pass, 0 fail, 1 platform skip
Patch-specific tests cover changed baseline/static unit/protocol and expiry during awaited readiness (zero POST), plus mode edits preserving RM12/11. Deletion note reports local cleanup uncertainty honestly; actual deletion branch regression with confirmed remote absence and failed local cleanup. No personal API or physical device verification.

## Release 1.0.173 — installed verification complete: 994 tests, 993 pass, 0 fail, 1 platform skip
Saved Smart RM and resistance-mode patches route through full scientific preview, immutable patch/wire binding and renewed commit checks. Unix Node reuse verifies runtime platform/architecture, preventing mixed Rosetta/native keyring selection. No personal API or native Mac/device verification.

## Release 1.0.172 — installed verification complete: 991 tests, 990 pass, 0 fail, 1 platform skip
Unix installer required_files comma removed: shell interpreted punctuation as filename and aborted Mac/Linux installation. Regression parses every actual required shell token against canonical manifest. Added actual serializer and saved-edit preview/commit gate mixed section regression: timed warmup, main RM distinct selectors, timed Customize, stretching and shared catalog identity. No native Mac/device or personal API verification.

## Release 1.0.171 — installed verification complete: 989 tests, 988 pass, 0 fail, 1 platform skip
Accessory ownership identity validates every supplied ID/name alias and catalog agreement. Remote exact IDs never expand duplicate names into other owned items; local user-confirmed name groups remain separate. Public reference client ownership/settings evidence refreshed. No personal API or physical firmware verification.

## Release 1.0.170 — installed verification complete: 988 tests, 987 pass, 0 fail, 1 platform skip
Identity v4 normalizes independently valid shared completionMethod encoding for Customize and named RM; versions 1–3 retain original semantics, mixed/invalid unit declarations remain strict. Inventory ownership flags require consistent actual booleans; malformed/conflicting flags cannot establish ownership. No personal API or physical firmware verification.

## Current release — 1.0.169+codex.20261005

Installed before full984tests:983pass0fail1platformskip. Saved identity v3 normalizes independently valid static shared weights with confirmed units, valid agreeing Customize aliases and empty RM counters. V1/v2 retain original semantics. Actual notes/baseline compression and unique/trusted duplicate mode-plus-reorder tests pass; changed loads/doses and invalid aliases/units stay strict. No personal API or physical firmware verification.

## Previous release — 1.0.168+codex.20261005

Installed before full981tests:980pass0fail1platformskip. Forty-eight static shared-load preview/commit validation cases cover manual/profile-auto, kg/lb, both protocols, numeric/string/CSV and rest/mode edits. Initial24failures proved static-mode capacity preservation defect, fixed narrowly for unchanged identity/dose/load and authorized scope. Changed dose/load and unauthorized mode remain rejected. Computed wire/readback verifier tested; no remote POST or physical firmware proof.

## Previous release — 1.0.167+codex.20261005

Installed before full933tests:932pass0fail1platformskip. reference client JSON export checks destination preset-specific UI rest bounds without changing prescriptions. Four boundary/rejection matrices preserve original input. These export constraints do not restrict scientific training or API rest limits. No account API or physical device verification.

## Previous release — 1.0.166+codex.20261005

Installed before full929tests:928pass0fail1platformskip. Local reference client JSON export preserves compatible rep-based static loads and actual named RM selectors, validates static limits/steps and explicit side structure, rejects unsupported rows without omission, and reports lost coaching/research/variant metadata. Six regressions include local dispatch. Supplied metadata is not account verification; export grants no scientific approval or mutation. Physical firmware and native macOS remain unverified.

## Previous release — 1.0.165+codex.20261005

Installed before full923tests:922pass0fail1platformskip. reference client JSON inspection checks named-preset selector ranges without changing values, enforces UTF8 byte limits and tests prototype-shaped keys, inherited prototypes, nesting and sparse arrays. No scientific approval, account reads or writes granted.

## Previous release — 1.0.164+codex.20261005

Installed before full917tests:916pass0fail1platformskip. Local reference client JSON inspection preserves original and ordered sets, distinguishes static source units from named RM selector metadata, and exposes unresolved dose/variant/side/science requirements. No account reads or mutations. Five regressions include actual local dispatch. Initial required-file-list failure corrected in package and both platform installers; final suite green. Native macOS and physical firmware remain unverified.

## Previous release — 1.0.163+codex.20261005

Installed before full912tests:911pass0fail1platformskip. Actual saved-edit preview/commit validation gates use real manual Customize normalizer and preparer for 15/18/21lb with legacy7/8/9.5kg readback, opaque capacity preservation, normalization disclosure, digest, independent readback verifier and reviewed snapshot. Changed unit/protocol/digest reject. Synthetic gates do not exercise remote POST or physical machine. Corrected model-facing blanket anchor/time restrictions: anchor only profile-auto; confirmed-strength timed static manual route allowed. Science/defaultSmartRM retained.

## Previous release — 1.0.162+codex.20261005

Installed before full911tests:910pass0fail1platformskip. Manual Customize shows requested load and protocol-normalized API display when different, in approval and public preview. Eight matrix regressions cover kg/lb, both protocols and reps/seconds; preparation stability and unchanged science binding checked. Native login/history descriptions corrected. ZIP148 and bothinstalled146 hashmatches verified. No personal API or physical device proof.

## Previous release — 1.0.161+codex.20261005

Installed before full903tests:902pass0fail1platformskip. Manualaccountunit Customize supports explicit per-set weight/weightUnit with staticLoadRequested, noanchor, freshAPIunitmatch, reference client limits/imperialadapter, scientificset_load/preview/serializer/readback/cycles. Actualnormalizer/evidencevalue/prepare/readback kg/lb+bothprotocols tested; researchservicesisolated, notphysicalproof. Recovery now retains email/region/client across tokenread/native login/retry and separates concurrent bindings; writesnotreplayed. Initialfixturefailures fixed; finalfullgreen. DefaultSmartRM/science preserved. No personalAPI/physicalverification.

## Previous release — 1.0.160+codex.20261005

Installed before full892tests:891pass0fail1platformskip. Saved identity v2 recognizes independently valid confirmed-reps RM shared-marker/counter representations; version1 remains strict and unchanged. Actualnotes/builder compressedGET regression, invalidaliases/units/changedselectors and legacycompat pass. Completion semantics remain strict; occurrenceapproval baseline remains strictcurrentwire. Manualaccountunit Customize input gap audited and retained below. Science unchanged; no personalAPI/physicalproof.

## Previous release — 1.0.159+codex.20261005

Installed before full890tests:889pass0fail1platformskip. Duplicate reorder uses old account/digest-matched saved identity and server-derived new normalized-plan mappings; per-entry ordinals preserve repeated superset rows. Preview freezes mapping; commit rereads/regenerates and compares binding before mapped wire/diff validation. Actualduplicatepreviewcommit/readback, stale/forged mapping and mixedstatic tests pass. Legacy plans without trusted identity remain unsupported for ambiguous reorder. Customize stable-order audit found no new defect. Official Speediance live1RM/mode evidence added without inventing API fields. Science retained; no personalAPI/physicalverification.

## Previous release — 1.0.158+codex.20261005

Installed before full887tests:886pass0fail1platformskip. Unique complete identity permutations compare matched exercises and preserve stored Smart RM counters/capacities through scientific preview and commit. Actual order preview/commit wire equality and readback tested; dose/preset/load changes remain strict. Duplicate reorder remains unsupported without verified occurrence mapping and rejects ambiguity. Science retained; no personal API/physical verification.

## Previous release — 1.0.157+codex.20261005

Installed before full884tests:883pass0fail1platformskip. Trusted scientific edits scoped to name/rest/resistance_mode preserve valid stored Smart RM counters and opaque capacity when all other prescription fields remain equivalent. Scope cannot include load/dose/selection/order/unknown metadata; explicit overrides disable reconciliation. Actual mode preview/commit wire equality and readback regressions passed. Science gate retained. No personal API or physical device proof.

## Previous release — 1.0.156+codex.20261005

Installed before full suite:882 total,881 pass,0 fail,1 platform skip. Scientific rest-only preview and commit preserve valid stored per-set Smart RM selectors when normalization generates preset defaults. Exact rest-only scope and unchanged preset/dose/mode/load intent required; explicit raw edits remain strict. Regression covers actual preview/commit and readback plus negative changes and duplicate occurrences. Native API history descriptions corrected. No personal API or physical device validation.

## Previous release — 1.0.155+codex.20261005

Installer exit0 before full880tests:879pass0fail1platformskip. Actual API transport rechecks email, region and login client after awaited session/memory preparation; changed identity prevents fetch. Final memory expiry validation has no new await. Regression executes actual request for all three changed identity fields, zero sends. Native authentication/history and scientific gates remain as154. No live personal API or physical device verification.

## Previous release — 1.0.154+codex.20261005

Installed before tests. Native two-step reference-client-style login replaces actual connect and code91 recovery; sessions bind email, region and explicit client identity. Native GET history/day/session replaces actual CLI reads. Exact namespace, int64 ID preservation, partial-data labels and no-write-replay remain required. Final full suite before description cleanup:879total878pass0fail1platformskip. Both145installed files matched source. No personal API login/read, physical coexistence or native macOS verification claimed. Explicit client setting exists in local config; a supported UI for selecting it remains unfinished. Science and Smart RM/Customize behavior retained.

## Previous release — 1.0.153+codex.20261004

Authoritative newest release: source and both installed roots153, installer exit0 before full suite859total858pass0fail1platformskip. ZIP140canonicalfiles and both installed138nonadaptedfiles hashmatched. Last active MCP diagnostic:loaded149/installed152/restartRequiredtrue before153 installation; no newest live feature test claimed. Historical release sections below retain their original evidence and limitations.

Current load paths preserve named goal-bound Smart RM and explicitly requested Customize/fixedkg separately. Create/edit/diff/readback cover distinct per-set values, duplicate occurrence matching and malformed preset aliases. Complete template-list preflight rejects explicit multi-page evidence. Science gate remains required. Exact public curve and observed assessment suggestion are implemented; private history-to-load resolver and physical preset load calculations remain unverified.

Cycle preview/review/executor and profile-scoped expiring memory are now implemented and tested offline, superseding earlier historical statements that those features were absent. Cycle execution currently supports one calendar reservation per date, durable checkpoints and readback, not atomic API transactions. Scientific gates verify bound provenance and decisions, not a proof of each plan's optimal physiology.

Remaining fidelity work: private reference client history resolver; account-specific static protocol evidence; writable Pilates-band contract; consistent client-slot authentication; affirmative cloud machine generation/accessory inventory; physical later-generation and native macOS validation. No personal API or workout writes in recent audits. Do not declare the overall goal complete from offline tests.

## Historical release — 1.0.110+codex.20261004

Installed before full tests:732tests,731passed,0failed,1Windowsfile-symlinkskip. Independent Python binary64 f-string .1f capture revealed3.75kg*2.2=>8.2 versus previous JS8.3. Exact binary64 rational ties-even decimal formatter now shared by static protocol and accountCustomize adapter; imperial UI halfkg Math.round remains unchanged. Eight captured Python boundary outputs cover canonicalkg and Customizekg. Source pinned API formatting inspected previous turn. No personal API calls, no physical parity proof, no fullcycle certification. Goal active.

## Previous release — 1.0.109+codex.20261004

Installed before tests. Final730 tests:729 passed,0 failed,1 Windows file-symlink skip. Cycle facts validate reps1..100,time1..86400,integer rest0..600,modes1/2/3 and modality-specific prepared load fields, exact named preset/id match and total snapshot8MB bound. First suite exposed bodyweight fixture with weightKg; replaced with real fixed-kg shape, synchronized and reran. These structural checks are not full normalizer/catalog/science validation, API identity proof or whole-cycle approval. Full-cycle scientific binding/batch executor and physical/nativeMac parity remain incomplete. Retained in-use installer recovery backup. No account API or Desktop restart. Goal active.

## Previous release — 1.0.108+codex.20261003

Installed before tests; corrected module synchronized to both installed roots before full suite:728 tests,727 passed,0 failed,1 Windows file-symlink skip. Derived cycle facts now permit distinct occurrences on one date via optional occurrenceId(defaultsessionId), reject duplicate date+occurrence identity, canonicalize same-date order, distinguish weekly sessionCount from trainingDayCount, and mark intraday separation unknown. Same-day regression proves counted sessions, stable reversed input digest and duplicate rejection. Zero calendar-day gap is not zero hours recovery. Calendar/API write behavior unchanged. Safe local diagnostic found live97 versus installed107 before update, restartRequiredtrue and local example-profile credentialsready. No latest features tested through stale instance. Whole-cycle scientific binding/execution, complete normalized input validation/resource bounds, physical allgeneration/nativeMac parity remain incomplete. Goal active.

## Previous release — 1.0.107+codex.20261003

Installed before full source tests:727 tests,726 passed,0 failed,1 Windows file-symlink skip. Execution signature deliberately selects exercise/set prescription fields and supersets; name/research/anchor provenance remains bound in full planDigest but no longer falsely changes reused session execution identity. Actual MCP local dispatch regression uses the real helper, with no account capability and noapproval flags. Deload comparison reports reduced/increased/mixed/unchanged aggregate counts, actual execution change and physiologicalDeloadConfirmed=false. Load-only changes can be reviewed without invented work-count reduction; unchanged prescription still cannot justify declared deload. New regressions cover provenance versus prescription, load/mode/rest/RIR identity changes and mixed/load-only comparisons.

Remaining: signatures provide exact differences but no paired exercise progression or load reduction direction; same-day multi-session representation, whole-cycle bounded normalization, verified API execution identities, cycle scientific binding and batch calendar executor incomplete. Live107/nativeMac/physical parity unverified. No personal account API calls or Desktop restart. Goal active.

## Previous release — 1.0.106+codex.20261003

Installed before full source tests:723 tests,722 passed,0 failed,1 Windows file-symlink skip. Positive safe catalog/entry IDs are separate from work-dose bounds; large valid identifiers no longer fail at100000. Weekly transitions now expose whether executable exercise snapshot sequences changed, covering load/mode changes at equal aggregate dose. Two regressions confirm large ID and equal totals with changed mode/static field. Snapshot signature is conservative and includes exercise evidence/anchor metadata; it is not a paired exercise comparison or physiological progression claim. New read-only audit identified remaining mixed-metric deload, same-day occurrences, execution/provenance separation, structural normalization and cycle resource limits. These are open, not certified by green tests. Whole-cycle scientific approval/batch executor and live106/nativeMac/physical parity remain unverified. No account API or Desktop restart. Goal active.

## Previous release — 1.0.105+codex.20261003

Installed successfully before full source tests:721 tests,720 passed,0 failed,1 Windows file-symlink capability skip. Added local gm_coach_derive_training_cycle_prescription: derives dated weekly main set rows/reps/seconds, frequency, gaps and explicit deload comparisons from bounded complete normalized snapshots. Digests bind dates/template identities/full plan snapshots; declared weekly counts cannot replace actual counts. Five new helper regressions cover canonical ordering, exact changes, contradictory identities/counts, deload and malformed input. Public dispatch is wired; no separate actual-dispatch regression added for this local branch. Supplied executionDigest is an identity, not independently verified API evidence. Main set rows exclude warmup/stretch and do not infer muscle attribution or bilateral firmware expansion. Comparison is not physiological recovery proof. Scientific approval remains false; full cycle scientific gate/batch calendar executor remain incomplete.

Source skills supplemented with verified Refalo2024 PMID38393985 abstract, population/intervention/limitations; no universal RIR-to-RM conversion. Source and installed files match this release. Running MCP105 and nativeMac/physical device parity separately unverified. No personal account API calls or Desktop restart. Goal active.

## Previous release — 1.0.104+codex.20261003

Installer exit0 before full source suite716 tests:715 passed,0 failed,1 Windows file-symlink skip. Saved scheduling now rereads exact template after awaited science/catalog/calendar/profile checks, compares raw baseDigest, then immediately repeats source/expiry/date checks before consumption/mutation. Actual dispatch regression changes template on second read and confirms zero sends, approval retained. This reduces remote concurrency window; API does not provide atomic conditional reservation, so this is not proof of immunity to all external races. No personal account API calls or Desktop restart; in-use recovery backup preserved. Runtime104 separately unverified.

Whole-cycle audit found explicit gap: weekly_volume/frequency/progression_rotation/recovery_deload values are assistant declarations, not derived exact facts of actual dated session occurrences. Current organization audit does not independently confirm physical dose reduction, muscle attribution or executed cycle. Single-date gate remains fresh; whole-cycle approval/batch execution incomplete. Updated implementation document removes stale current raw-add-bypass claim. Goal active.
## Previous release — 1.0.103+codex.20261003

Installer exit0 before tests. Final full source suite715 tests:714 passed,0 failed,1 Windows file-symlink skip. First run exposed incomplete preview mock (missing plan) and obsolete error regex; fixed fixtures/message, synchronized installed roots and reran all tests.

New saved-program scheduling preview runs existing full scientific public-plan pipeline, checks exact current GET/approved dose and template baseDigest, binds profile/intake/static context, code/date and raw complete-month calendar digest. Calendar preview rejects incomplete/unknown/foreign/completed/conflicting target entries. Existing add=true requires saved-schedule approval, re-normalizes/revalidates/prepares original arguments, compares enriched payload/digests, fresh GET/calendar, final profile/research/expiry/date, consumes approval before durable reservation executor. add=false independent. Creation rejects both saved-update and saved-schedule kinds. Approval page shows existing code/date and calendar-only scope; HTTP POST legacy approval disabled for these kinds.

Actual extracted branch regressions cover unapproved add/removal, consume once, changed calendar/research, missing approval/stale template/readback mismatch, expiry during calendar await, foreign/incomplete calendar and approval HTML. Scientific/catalog functions in these integration fixtures are mocked; full suite existing gate tests remain, but no real personal account mutation or physical firmware proof. Raw whole-month JSON binding conservatively rejects unrelated calendar changes and ordering changes. Single-session validation is not full-cycle volume/frequency/recovery certification; full finite multiweek executor remains incomplete. Running MCP103 and nativeMac remain unverified. Goal active.

Refreshed official Speediance FAQ source notes distinguish four resistance modes/separate Spotter, account kg/lb and strength assessment from undocumented API/physiological mappings. FAQ hardware limits not assumed universal across GM3/Ultra; eccentric50% phrase remains ambiguous. GM2/GM2S PDF fetch limitations explicitly recorded.
## Previous release — 1.0.102+codex.20261003

Installer exit0 before testing. Final full suite708 tests:707 passed,0 failed,1 Windows file-symlink skip. Optional include_coach_review on actual get_saved_program returns account/code-bound cloned historical plan/evidence after whitelist and digest integrity checks; status historical-unverified, scientificApproval=false, currentPrescriptionVerified=false and fresh review required. Missing/stale/invalid/unavailable never return a plan. Default reads do not load durable record. Actual extracted dispatch regression verifies opt-in and read-only status; no personal API calls.

This enables model-facing historical review recovery, not direct normalized-plan replay or saved scheduling approval. Full fresh per-session/cycle calendar flow still incomplete; old add=true scheduling bypass remains open. Running MCP102, physical firmware and nativeMac separately unverified. Source skill documents limits. Goal active.
## Previous release — 1.0.101+codex.20261003

Installer exit0 before full source tests:706 tests,705 passed,0 failed,1 Windows file-symlink skip. New real normalizePlan -> serializer -> synthetic confirmed legacy GET kg -> saved identity -> JSON record -> inspection tests cover Customize/profile-auto and fixed-kg on kg/lb accounts. Checks include fraction .77, canonical manual kg, preserved nonenumerable authorization and rejection of altered weights/reps/rest/absent unit/wrong protocol/stale contexts. Research/catalog services in normalizer are isolated: these are persistence/serialization tests, NOT full scientific assessment or physical firmware proof. Account-unit-verbatim positive roundtrip and mixed load record cases still require coverage.

Inspection now requires a present nonempty string current display name before tolerating rename; creation retains exact-name verification. Safe local diagnostic before install101: runtime97, installed100, restartRequired=true, example-profile credentials ready. No personal API calls or Desktop restart. Installed101 does not prove current process refresh. Full scientifically reviewed saved-calendar/batch flow remains incomplete. Goal active.
## Previous release — 1.0.100+codex.20261003

Installer exit0 before full source tests. Sandbox spawn EPERM prevented first run; authorized local-process run passed700/701,0 failures,1 platform file-symlink skip. Historical reviewed-plan inspection now tolerates display-only rename while creation still requires exact name and any changed dose remains invalid. Regression checks rename, approval=false, creation mismatch and altered reps. No personal API access. Static Customize/fixed-kg record matrix still needs real normalizer/science/GET kg-lb coverage; full saved scheduling science integration remains incomplete. Running MCP100 separately unverified.
## Previous release — 1.0.99+codex.20261003

2026-10-03: installer exit0 before tests. Full source suite:700 tests,699 passed,0 failed,1 skipped (Windows file-symlink capability unavailable). Separate bounded reviewed-plan record/store now integrated into verified create and scientific edits; removal clears record. Fresh serializer/readback and identity checks are mandatory. Smart RM records do not require kg/lb. Records always require fresh scientific review and are never approval tokens. Full scientific saved-calendar/batch flow remains incomplete. No personal account API reads/writes. Running MCP99 and native macOS/physical firmware remain unverified.

Scientific source reference updated with freshly checked PMID39205815 population, sample size, uncertainty and limits; no invented optimum rest or RM mapping. Existing source-repair procedure retained.
## Previous release — 1.0.98+codex.20261003

2026-10-03: installer terminal exit0 before tests; updated Unix required-file list synchronized before tests. Final full source node --test --test-isolation=none:687/687 passed, zero skipped. Public source schedule_planner.py pinned fdd62c8fcecbb22f195ca9d86020026173d6cb78 freshly read via HTTPS.

Added pure finite weekly/anchored-cycle schedule expansion and diff: inclusive date range, positive modulo before anchor, rest slots, inclusive protectBefore, noop/write/replace/clear, preserve completed/foreign/unknown entries. Public gm_coach_expand_training_schedule dispatch returns organization-only, scientificApproval:false, mutationSent:false. Maximum366 days is a Coach local bound. This does NOT implement full calendar approval/execution and does not close standalone saved scheduling science gap.

Actual verified-create completion now reports created:true/readbackVerified:true even when local note/identity save fails, separately reports coachNotesSaved:false, attempts pending marker cleanup and suppresses calendar scheduling. Cleanup failure separately diagnosed. Regression exercises all four note-save/cleanup combinations; no remote services used.

Skills now require autonomous source supplementation, correction of conflicting/missing scientific support and whole-plan re-audit without rewriting evidence or asking user to perform research. Rechecked Robinson2024 PMID38970765: estimated RIR/exploratory moderate-fit models do not establish exact optimum RIR or %1RM/rmLevel conversion. Recorded limitations in source reference. Existing bibliography remains starting knowledge, not approval tokens.

Runtime97 was locally verified before this update, restartRequired=false, credentialStatus ready for example-profile; runtime98 separately unverified after install. Installer retained an in-use recovery backup, intentionally preserved. No personal Speediance API reads/writes, no Desktop restart. Remaining: durable reviewed-plan record and scientifically bound full multiweek scheduling, automatic confirmed equipment discovery, physical preset/static parity and nativeMac execution. Goal active.

## Previous release — 1.0.97+codex.20261003

2026-10-03: installer terminal exit0 before tests. Final full source node --test --test-isolation=none:678/678 passed, zero skipped. Initial run676/678 exposed missing RIR in new synthetic fixture and outdated injury-gate source regex; corrected, synchronized both installed roots, reran full suite.

Live validatePlanForProfile now reruns full normalizeEvidenceCoverage after catalog name canonicalization and returns revalidated decisionEvidence. It never rewrites value/reviewedValue. Actual normalizer -> live validator -> real coverage regression rejects stale exercise-selection bindings when catalog changes case or internal spacing. Existing exact variant resolver preserves explicit actionLibraryId; no variant overwrite found. Account/research services isolated in regression, not physical firmware proof.

Safe local runtime diagnostic still loaded87 versus installed96 at start of this audit; after installation97 running process remains independently unverified. Profile example-profile reported credentialStatus ready; no Speediance API calls, account writes or Desktop restart. Full multiweek calendar, confirmed equipment discovery, physical RM parity and native Mac execution remain incomplete. Screenshot audit saved separately in workspace. Goal active.

## Previous release — 1.0.96+codex.20261003

2026-10-03: installer terminal exit0 before tests; final corrected fixture synced into both installed roots before full source node --test --test-isolation=none:677/677 passed, zero skipped. Exercise selection now binds canonical JSON catalogId, entryId, title, actionLibraryId when present, section. Exercise dose binds exact setCount; existing per-set gates bind work dose/load/RIR/resistance/rest. Changes in group/title/variant/section/entry or count reject stale decision value and require updated per-source reviewedValue. Live validatePlanForProfile additionally requires positive exact actionLibraryId before equipment/readiness/write preparation; model fetches variant metadata, never asks user to enter technical ID.

Real full normalizeEvidenceCoverage regressions test changed identifiers/variant/name/section/count and obsolete title-only/free-text values. Actual extracted live validator rejects missing variant before ownership or writes. First full suite failed an old duplicate-exercise fixture that replaced catalogId with entryId; fixed factory set targets through resolveEvidenceEntryId and preserve real IDs, then reran whole suite. Model-facing schema and training-science instructions describe exact formats. Scientific gate still checks provenance and structured assessments, not independent semantic truth or a trial of every firmware/variant.

No personal account reads/writes or Desktop restart. Remaining: full scientifically bound multiweek execution, live newest-MCP refresh verification, confirmed generation/accessory discovery and physical RM/Customize/nativeMac verification. Goal active.
## Previous release — 1.0.95+codex.20261003

2026-10-03: installer terminal exit0, final additional Mac line-ending fixes synced into both installed roots before full source node --test --test-isolation=none:675/675 passed, zero skipped. Source/install/cache/ZIP consistency is verified separately after packaging. No account requests or Desktop restart.

Science gate real bypass closed: exercise_selection and exercise_dose could be declared not_applicable/not_used despite an executable exercise. Both now require applied, invoking existing mandatory sources/excerpts/per-source semantic assessments. Full coverage regression rejects both bypass statuses. Exact selection/variant decision-value binding remains to be audited; per-set values already bind dose/load/RIR/mode/rest. The gate enforces provenance, completeness and assessment consistency, not independent truth of every assistant interpretation; never claim that a bibliography proves optimal physiology.

Legacy static protocol context digest now includes accountUnit (missing -> null). Existing create already compares fresh displayUnit; no demonstrated kg/lb create bypass was claimed. Regression checks kg/lb/unknown context differences, stable password rotation, equal physical wire values with different unit context and actual create/edit context comparisons.

Mac/Linux installer: quoted the private Node executable in GitHub release metadata parsing so paths with spaces remain one command. Found12 CR bytes mixed into the Unix script; normalized LF and added packager rejection of CR in any .sh/.command. Source regressions verify quoting and byte absence. Native macOS Intel/ARM installation/runtime/Keychain remains untested on this Windows host; tests are not native Mac execution proof.

### Historical screenshot audit — source94

| Reported issue | Current evidence and remaining limit |
| --- | --- |
| Login save failure, undefined approval | Actual handler regression and fix since93; not a Mac-only failure. |
| GM2 blocked because device_type2 | Public family2=GymPal, family1=GymMonster. Selector removed, new default1, existing config preserved. Wrong prior config requires independently confirmed correction. Physical GM2 execution not proven by screenshots. |
| Warmup/stretching only prose | Actual executable section normalizer/serializer and approval HTML regression;94 corrected stale prose. |
| Four templates mistaken for full6wk plan, missingC | Cycle audit requires full week/session refs and default1–2/3–4/5–6 blocks. Four days can be a weekly split; complete distinct block variants and calendar executor still needed. |
| Missing progression/deload | Explicit progression/rotation and deload policy required by cycle audit plus scientific per-plan categories. Dose declarations do not independently prove physiological quality; full cycle execution remains incomplete. |
| User told to increase kg despite machineRM | Named goal-bound RM default preserved; Customize/fixedkg explicit only, actual normalizer/serializer/readback regressions. Device firmware physical parity not independently verified. |
| Accessories unavailable | Ownership unknown is honest fallback; user-confirmed inventory preserved with provenance. Global catalog not ownership. Confirmed automatic ownership endpoint not found. |
| Training too short vs requested duration | Intake requires session time or explicit unknown/refusal. Audit enforces maximum estimated time; no fixed40/60min deload, no requirement to fill90min when scientifically unnecessary. Expected duration remains estimate. |
| Request to use the reference client live to bypass failure | Coach standalone, no live substitute; public solutions copied into own code. Quoted screenshot instruction did not authorize personal tool fallback. |

Remaining original objective: durable scientifically reviewed full-plan identity plus full finite multiweek schedule preview/diff/execution; exact exercise/variant decision binding; confirmed machine/accessory discovery; physicalRM/Customize parity on supported generations; nativeMac verification. Goal active.
## Previous release — 1.0.94+codex.20261003

2026-10-03: installer terminal exit0 before full source node --test --test-isolation=none:671/671 passed, zero skipped. Public reference client schedule_planner.py pinned fdd62c8fcecbb22f195ca9d86020026173d6cb78 distinguishes type3/isFinish0 custom reservations, type3/isFinish1 completed entries and type4 official/suggested entries. Calendar verifier now accepts that confirmed shape without requiring synthetic isReservation aliases; conflicting aliases, unknown shapes, wrong codes/dates and incomplete months remain blocked. Official/suggested entries never certify a custom template even when code matches. No foreign entries are mutated.

Verified-journal shortcut now reads the live month again. A previously confirmed entry removed externally or an unavailable fresh read returns unverified without sending a second mutation. Durable journal stays intact; fresh restored state can be rechecked without automatic POST. Regression covers one mutation/four reads, present/missing/unavailable current calendar and unknown/contradictory finish aliases.

Approval HTML now correctly states executable warmup/stretching are ordered catalog actions sent in the template. Actual normalizer -> serializer -> approval regression checks ordered warmup/main/stretching, seconds, rendering and retained Row/Ski/superset limitations. Existing scientific gate unchanged. No personal API calls or Desktop restart. Runtime previously reported87 while installed94 must be independently checked after MCP refresh; no stale live behavior tests were run.

Full bounded multiweek batch scheduling remains incomplete: saved notes retain executable identity and sections, not a durable scientifically reviewed full-plan record. A correct batch flow needs fresh per-template scientific review plus whole-week frequency/recovery evidence, exact template/intake/account/calendar diff approval and sequential journaled writes/readback with partial failure reporting. Existing single-date scheduler is not proof of complete batch support. Goal active.
## Previous release — 1.0.93+codex.20261003

2026-10-03: installer terminal exit0 before full source node --test --test-isolation=none:667/667 passed, zero skipped. Actual setup handler no longer references undefined approval; POST without device input preserves existing API family or sets new Gym Monster profile family1. No machine selector; no false claim of generation autodetection. Public reference client settings.html pinned fdd62c8fcecbb22f195ca9d86020026173d6cb78 confirms API family1=GymMonster,2=GymPal,3=Velonix; numeric2 must not be guessed from GM2 generation. Write diagnostics corrected, unchanged safety gate for other product families.

New public local gm_coach_audit_training_cycle verifies block/week coverage, session references, time limits, executable-section declarations or user opt-out, progression/rotation declarations and deload policy. Six-week default is three two-week blocks, with explicit user-custom alternative. This audits organizational completeness, not scientific truth, actual exercises, account writes or calendar readback. Actual MCP dispatch regression plus missing thirdblock/weeks/progression/deload, sections/time, custom layout and malformed input checks pass. Skills require this before presenting a complete multieweek plan, plus a separate scientific preview for every distinct resulting session. Input declarations are not independent verification and this tool does not bypass or replace the existing science gate.

Coaching reference procedure keeps persistent intake, user duration/preferences, machine-managed RM, goal-driven accessory rotation and minimal setup changes, executable warmup/stretching, progression beyond kg and planned individualized deload. Six-week structure is product organization, not established physiological optimum. Deload evidence: https://pubmed.ncbi.nlm.nih.gov/38274324/ randomized complete-break study and https://pubmed.ncbi.nlm.nih.gov/37730925/ Delphi consensus; neither establishes universally ideal week/dose. No live account reads, profile changes, workout writes or Desktop restart.

Outstanding: automatic account machine-generation/accessory ownership discovery lacks confirmed public endpoint; existing wrongly configured device family requires independently verified correction, not silent remapping. Physical later-generation/load parity unverified. Full finite multieweek calendar executor remains separate work (see previous release next capability); local audit does not implement it. Latest installed release does not prove a running chat MCP reloaded it. Goal active.
## Previous release — 1.0.92+codex.20261003

2026-10-03: terminal install exit0 before full source node --test --test-isolation=none:658/658 passed zero skipped. Normalization derives global presetID1/3/5 from goal-bound GainMuscle/Stamina/Strength before scientific set_load binding; explicit conflicting or coerced ID rejects. Fresh prepare still confirms model, variant and account1RM presence. Actual normalizer and real scientific decision-value regression covers all three names with omitted/matching/conflicting IDs. This closes an earlier-stage gap not covered by .91 prepare-only fixture. Science gate preserved; no account requests or Desktop restart. Physical parity remains unverified; goal active.

Next source-backed missing capability: finite weekly/rotating schedule expansion (public schedule_planner.py, templates/schedule.html pinnedfdd62c8fcecbb22f195ca9d86020026173d6cb78). Implementing this requires per-template science gate, explicit approved dates/diff, exact template digests, persistent write journal and per-date readback. Official-course calendar type4/code distinguishes course entries, but numeric courseId-to-code identity remains unproven; do not certify course scheduling from category alone.

## Previous release — 1.0.91+codex.20261003

2026-10-03: terminal installer exit0 before full source node --test --test-isolation=none:657/657 passed zero skipped. Fix actual create/scientific saved-edit digest ordering: validate profile/intake first, rerun preparation to restore server-owned SmartRM fields, compare enriched plan digest and payload/context before approval consumption or mutation. Preview already hashed after preparation; all paths now agree. Regression executes real extracted prepare, catalog variant resolver and serializer with mocked account readiness/metadata, then real create gate for name-only GainMuscle. Mutating prepare create/edit fixtures preserve changed-prescription rejection and no premature approval use. No personal API calls or Desktop restart; science gate preserved. This proves software ordering, not device load calculations. Full reference client parity remains unverified; goal active.

## Previous release — 1.0.90+codex.20261003

2026-10-03: terminal installer success before full tests. Final node --test --test-isolation=none:654/654 passed zero skipped, corrected fixture synchronized first. User-confirmed local accessory names now resolve exact trim/lowercase catalog-name groups to all IDs with explicit provenance. Remote numeric IDs remain exact; account ownership is not inferred from catalog. Persisted profile/intake inventory, required-accessory validation and public equipment output carry the grouped resolution. Scientific approval intake fingerprint binds group membership and is rederived during create/edit checks. Public reference client evidence accessories.py pinned fdd62c8fcecbb22f195ca9d86020026173d6cb78 records duplicate-ID name groups. This is catalog-equivalence evidence, not cross-model write permission.

Regression covers names vs distinct/accent names, remote/local numeric selections, required alternate ID, changed catalog group, actual MCP fingerprint expression and public equipment dispatch. An initial fixture regex matched the inner fingerprint object instead of the ternary boundary; fixed extraction and reran full suite. Science gate unchanged. No personal API requests or Desktop restart. Device execution/load parity and broader feature completion remain unverified. Goal active.

## Previous release — 1.0.89+codex.20261003

2026-10-03: installer terminal exit0 verified before tests; corrected files synchronized before final full node --test --test-isolation=none.650/650 passed, zero skipped. Shared saved numeric parser accepts finite numeric singleton without broadcasting. SmartRM conversion and its independent unit/dose validation use the same parser, normalize converted setsAndReps to writer CSV, reject fractional/out-of-range/nonfinite dose and mismatched set count, preserve known seconds rejection. Numeric8 and textual8 produce identical converted payload. Initial regression exposed second parser call; corrected centrally, synchronized and reran full suite. No account requests or Desktop restart. Science gate unchanged, firmware parity and broader goal remain unfinished.

## Previous release — 1.0.88+codex.20261003

2026-10-03: installer terminal exit0 verified before tests. Final full source node --test --test-isolation=none:649/649 passed, zero skipped; updated regeneration fixtures synchronized into both installed roots first. Saved-edit semantic unit comparison now recognizes confirmed GET/POST completion aliases (including Vita5 with exact catalog metadata and seconds0/2), preserves strict real-dose changes, raw baseDigest concurrency and allowed_changes. Unrelated countType is not reinterpreted globally. Preview and regenerated write gate receive exact current metadata context.

Regression exercises actual saved-edit regeneration gate with mocked profile/research/network services: rest-only and Vita-level-only edits pass; changed time outside scope and missing fresh catalog map reject before mutation and leave approval unused. Helper regressions check bodyweight aliases and unchanged source objects. Science gate and default named Smart RM preserved. No personal account API reads/writes or Desktop restart. Firmware load parity, complete auth identity and overall reference client parity remain unfinished. Installer retained an in-use recovery copy; preserve it until the owning process releases files.

## Previous release — 1.0.87+codex.20261003

2026-10-03: terminal installer success verified, then changed files synchronized and SHA-matched in both installed roots before full source node --test --test-isolation=none. 645/645 passed, zero skipped. Fixes scientific set_load binding for Vita: requires catalog-confirmed dataStatType6, individual integer level1–999, explicit seconds/reps dose, rejects kg/RM/percent mixed loads. Actual normalizer, scientific decision value, approval HTML, serializer and readback regression covers different levels and mixed timed/rep sets; changed levels alter evidence binding and fail readback. Services are mocked; this does not prove a real source assessment or physical machine execution.

Additional bilateral regression binds different reps/load/RIR/mode/rest per set, checks exact CSV serialization and rejects reordered dose, weights, modes and either rest field on readback. RIR remains a coaching target, not a verified API execution field. Smart RM remains exercise-level named machine preset; no arbitrary per-set percentage support is claimed. Science gate preserved. No personal account API reads/writes or Desktop restart. Complete device parity and auth identity remain unfinished; goal active.

## Previous release — 1.0.86+codex.20261003

Installed successfully before the full source test run on 2026-10-03: node --test --test-isolation=none, 643/643 passed, zero skipped. Adds code90 session-displacement diagnostics without automatic relogin; code91 recovery remains bounded and mutations are not replayed. Tests exercise actual MCP GET/POST branches using mocked transport only. Science gate unchanged. No personal account API reads/writes and no Desktop restart.

Safe local runtime diagnostic reports loaded MCP1.0.79, installed1.0.86, restartRequired=true, instance710522c99662672020a2d369. Profile example-profile credentialStatus=ready. This is stale-process evidence, not logout evidence; live feature tests are withheld. Physical machine load parity, comprehensive authentication client identity, and full feature parity remain unverified or incomplete. Goal active.

Previous release .85 final verification supersedes its developmental notes below: 640/640 tests passed after terminal installation and fixture synchronization. Its ZIP had117 entries verified against source and both installed roots. Actual asymmetric normalization, scientific decision values, approval HTML, serialization and readback were exercised with mocked services; full live scientific-source verification and device execution were not performed.

## Previous release — 1.0.85+codex.20261003

Explicit asymmetric unilateral contract introduced: unilateralPrescription=explicit-sides, ordered side1/2 pairs, confirmed unilateral metadata, actual sets preserved without duplication. Scientific per-set values bind side, preview labels left/right; unsupported asymmetric supersets reject. Serializer counts actual API steps. Whole source installed .85 before final full node --test --test-isolation=none:630/630. Earlier preliminary run overlapped pending installer and exposed VM fixture extraction missing new base function; that run is not release evidence. Installer terminal success checked, fixture synchronized, then final full run completed. Science gate unchanged.

Development status: helper/serializer and evidence regressions pass, full actual MCP normalization→scientific preview→approval→write/readback coverage still required before claiming complete asymmetric feature. Current verified shareable package remains .84. No personal API reads/writes, no Desktop restart. Goal active.
## Previous release — 1.0.84+codex.20261003

Actual saved-edit Vita5 metadata detection now trims CSV tokens consistently with downstream parsers. Public saved-program dispatch preserves separate account unit/source and static protocol diagnostics; invalid-reference display remains unknown. Two actual MCP extraction regressions exercise whitespace/array detection and final public output assembly. Latest .84 installed before full source node --test --test-isolation=none: 623/623 passed 2026-10-03. No account API reads/writes or Desktop restart. Science gate preserved; full firmware parity remains unproven.

Next feature audit: explicit asymmetric unilateral requires per-set side and paired metadata validation through schema/normalization, scientific decision binding, approval display, serializer, readback and actual API step limits. Superset expansion must be pair-aware or explicitly reject unsupported asymmetric blocks. Do not add an upstream flag alone; it would bypass side-aware validation and risk duplicate volume. Goal active.
## Previous release — 1.0.83+codex.20261003

Vita finished-history completionMethod5 is scoped to explicit nonconflicting dataStatType6. Target duration, achieved repetitions and elapsed duration are separate; unknown types remain unknown and volume is not certified. Saved Vita5 dose resolves only with verified catalog metadata. Pinned Labatt API-NOTES section7 records timed Vita write2/readback5; tests verify real serializer roundtrip and reject changed dose/intensity/reps interpretation. MCP passes confirmed metadata to presentation and readback. Actual readable MCP regression checks 30 s and separate Vita level12.

Static alternative reference is detail-endpoint-specific: MCP forces exact detailByCode instead of taking appPage weights; list-only identity marked unverified. Invalid reference exports unknown display unit separately from actual account unit. Tests deliberately give list999/detail50 to prove endpoint selection.

Latest .83 installed before full source node --test --test-isolation=none on 2026-10-03. First run620/620; root found and corrected missing metadata in first-summary call, added actual readable Vita regression, synchronized installed files then final621/621. No account API reads/writes, no Desktop restart; science gate and named Smart RM preserved. Synthetic serialized-field parity is not firmware resistance proof. Asymmetric unilateral and remaining full feature parity remain unfinished; goal active.
## Previous release — 1.0.82+codex.20261003

Static protocol context now passes through MCP creation, saved edit/baseline/diff, readback verification, presentation and saved identity reconstruction. Alternative account-unit-verbatim requires a local matched static write/readback reference plus correlated userinfo unit observation, bound to canonical account identity. Future timestamps, mismatched account/unit and nondiscriminating references reject. Alternative writes require fresh actual API unit. Reference validation is structural local evidence, not cryptographic proof of origin. No personal reference configured or account data accessed.

Approval fingerprints include static configuration, regeneration compares protocol context; real create branch regression rejects changed context before mutation. Invalid static references preserve readable Smart RM/time/bodyweight while static units remain unknown. Presentation rejects out-of-range GET as an unknown diagnostic rather than failing the full report. Completed dual-cable reporting no longer presents derived aggregate weights min/max as resistance when side telemetry exists; no volume proof is inferred.

Newest .82 installed before full source node --test --test-isolation=none on 2026-10-03: initial 609/611, two fixture regressions (authorization missing and stale signature regex); synchronized corrected tests before rerun. Final 612/612 passed including additional actual mutation-gate context regression. Science gate and named Smart RM remain preserved. Installed release is separate from running MCP; no Desktop restart, personal API reads or writes. Full private/firmware parity, Vita5 semantic normalization and asymmetric unilateral prescriptions remain incomplete; goal active.
## Previous release — 1.0.81+codex.20261003

Static protocol adapter integrated into real create serializer, saved-template update and readback verifier. Explicit protocol, account unit and canonical-kg versus account-Customize intent preserve unchanged values and avoid double conversion. Five roundtrip regressions cover both protocols and units. Profile-level protocol selection and normalized display are not yet enabled in MCP; alternate protocol must not be claimed live-ready. Named Smart RM and scientific gates preserved.

Newest .81 installed before full tests: 594/594 passed on 2026-10-03. Safe local MCP diagnostics still report running .79, installed .81, restartRequired=true; stored example-profile credentials ready. No personal workout API reads or writes, no Desktop restart. Full parity remains unproven; goal active.
## Previous release — 1.0.80+codex.20261003

Adds explicit static-load-protocol adapter for incompatible public reference client contracts: legacy-reference-client-wire-lb-get-kg and account-unit-verbatim. Encode requires explicit protocol, input/account unit and static intent; decode requires wire/readback phase. Named RM metadata rejected. Current formatDisplayWeightForApi delegates to the adapter with explicit legacy contract, preserving existing wire and imperial snap. Alternative protocol is pure supported encoding/decoding, NOT exposed as verified account selection in MCP; template update/readback/display must be integrated together before any account switch. No private protocol detection inferred from names or numerals.

Pinned source conflict and commit-history evidence included as REFERENCE_CLIENT_UPSTREAM_CONFLICTS.md. Newest .80 installed before full node --test --test-isolation=none: 589/589 passed on 2026-10-03. First run found strict numeric test equality at binary 110/2.2; corrected tests use only a four-ULP numeric comparison, not physical load tolerance; synchronized before rerun. No account data/API reads/writes or Desktop restart. Full parity remains unproven; goal active.
## Previous release — 1.0.79+codex.20261003

Readback verification now compares named Smart RM technical markers exactly, while bounded static GET kg rounding tolerance remains only for preset -1. Real serializer/readback regressions prove shared exact RM markers/counters accepted, marker drift and changed selector rejected; manual kg static precision tolerance retains both account units. These tests verify stored fields, not firmware physical resistance.

Newest .79 installed before node --test --test-isolation=none: 582/582 passed on 2026-10-03. User-reset active gm_coach_local safely checked through speediance_list_accounts: pluginVersion=installedPluginVersion=1.0.79+codex.20261003, restartRequired=false, mcpInstanceId=710522c99662672020a2d369, one credential-ready configured profile. No personal workout API reads or account mutations. This local readiness is not proof of API connectivity/history access. Full private reference client/physical parity remains unproven; goal active.
## Previous release — 1.0.78+codex.20261003

Fixes the .77 Customize percentage integration defect: serializer public loadEstimates percent=77 is explicitly normalized to scientific internal fraction=0.77, retaining the serializer's actual step+1 suggestion and method. The unmodified science gate accepts the fraction; both actual public preview and approval HTML render 77%, not 7700%. Regression extracts the real normalizer, preview expression, full HTML renderer and real scientific set_load decision. The previous .77 tests had not covered those consumers; green isolated calculations were insufficient evidence of full path correctness.

Explicit fixed-kg validation now uses prescribed canonical kg limits/half-kg step independently of account units; kg and lb accounts serialize identical manual kg wire and unilateral sides. Customize retains account-unit limits and imperial UI snapping.

Newest .78 installed before full source command node --test --test-isolation=none. Final 580/580 passed on 2026-10-03 after correcting synthetic decisionEvidence list shape and synchronizing the corrected test before rerun. No account reads/writes, no Desktop restart. Physical Smart RM/private resolver parity remain unproven; goal active.
## Previous release — 1.0.77+codex.20261003

Fixes Customize preview: calculatedLoad/loadUnit/loadEstimate come from the real serializer display suggestion, never wire pounds relabeled kg. For 100 kg reported 1RM and 8 reps the observed reference client assessment adapter gives 77 kg /77%, while wire is 169.4. lb suggestion and imperial half-kg wire snap remain distinct; neither is a firmware readback. Manual fixed-kg preview explicitly labels weightUnit=kg separately from accountDisplayUnit.

Saved identity now rejects nonfinite/undefined/sparse/cyclic/accessor/deep metadata rather than letting JSON erase differences; unknown nested fields retain their types. Pure official-course reservation module added with strict selected detail, permission, date, GM1 and caller science approval requirements; it is NOT connected to MCP and does not claim scheduled success without confirmed course-calendar semantics. Persistent journal/integration/readback remain required before exposure.

Newest plugin installed and final code/tests synchronized before full test run. No personal account reads or writes. Full private reference client/firmware parity remains unproven; goal active.
## Previous release — 1.0.76+codex.20261003

Saved executable entry identity is bound to the actual verified template GET after creation or scientific edit, with a local email/region account fingerprint. Reads expose local entryId, section and executionRef only for matched current execution fields and valid section references. Rename and password rotation preserve identity. External execution changes invalidate links; legacy notes without identity do not invent sections. The fingerprint is not exposed to the model. Partial list rows may report invalid; detailed GET is the recovery path.

Installed newest release before tests. Full source command: node --test --test-isolation=none. On 2026-10-03: **563/563 passed** after correcting two VM harness dependencies and synchronizing latest code/tests to both installed roots before rerun. Four added duplicate-unit regressions confirm existing memory cannot transfer units across repeated group/variant occurrences; known API completionMethod remains authoritative. No personal workout data read or account mutation performed.

Public reference client Smart RM wire/menu parity remains confirmed; private history resolver and physical firmware behavior are unproven. Official course scheduling is a documented future extension, not implemented by this release. Full goal remains active. See skills/speediance-coach/references/reference-client-load-parity-76.md.
# reference client parity audit

Audit date: 2026-10-03
Historical source/test snapshot: `1.0.32+codex.20261001` (the 308/308 offline test result belongs to that revision; no live Speediance write was performed). The current release verification is recorded below.

## Persistent release-version gate

The user requires tests to target only the newest GM Coach plugin and MCP release. The version recorded in the root `plugin.json` is the expected release; `.codex-plugin/plugin.json`, the packaged ZIP, installed cache, and MCP `serverInfo.version` are checked as separate artifacts. Offline test results apply only to the exact checked-out source version. Before live behavior tests, `speediance_list_accounts` must report `pluginVersion == installedPluginVersion == expected release` and `restartRequired == false`; a stale process is not a test target or evidence about current behavior. If the server is stale, restart only the matching GM Coach MCP when available, then open a new chat; never restart Codex Desktop or request credentials just to reload updated files. This permanent rule is recorded in `AGENTS.md` and regression-tested in `tests/plugin-version-coherence.test.mjs`.

## Current source release — 1.0.75+codex.20261003

Included warmup/stretch sections now require confirmed executable exercise entries, not notes alone. Exercises carry optional unique local entryId (default catalog id) and section warmup/main/stretching. The list must already be in section order; no hidden reorder is performed. Each included section item requires an exact executionRef to an entry in that same section; every section entry must be referenced once. Opt-out retains neither section entries nor notes. The main section must contain at least one entry. Normalization runs this validator before preview/write, with existing preference/scientific/catalog/equipment/load checks retained.

Evidence and superset identities are entry-based while actual catalog id/variant remain unchanged for API/metadata/strength/inventory. Repeated catalog exercises can therefore have separate warmup and working sets and separate scientific targets. Supersets are limited to main; the serializer emits all ordered entries with true doses and existing unilateral expansion. Preview exposes entryId/section and labels evidence by local entry. Structured legacy group/variant patches reject selected duplicate occurrences rather than converting the wrong timed or resistance entry; use the full resulting-plan scientific edit for them. Saved readback remains positional.

Exact latest runtime was installed before node --test --test-isolation=none: **553/553 passed** on 2026-10-03. One initial regression expected the old duplicate-catalog-ID error text; it was corrected to unresolved-entry-ID uniqueness and synchronized to both installed roots before rerun. New tests execute the real serializer, including repeated catalog IDs, independent seconds/reps, section order, opt-outs, unilateral expansion and main supersets without capturing warmup. Fresh installed MCP loaded=installed=1.0.75+codex.20261003, restartRequired=false, instance ead7ec5dcd535be60ca3e7e2, 33 tools, executionRef required in both included-section item schemas, one credential-ready profile. No personal training read or account mutation was performed; device physical execution remains untested.

Known migration boundary: older note-only plans cannot pass a new preview without adding executable catalog entries or a genuinely requested opt-out. Never fabricate IDs/load/dose or silently omit a section to avoid this validation. API does not store local section/entry tags; local supplemental notes retain their links, but rendering/recovering local identity against externally edited saved templates remains separate work. Full reference client/private firmware parity and non-GM1 writes remain unproven; goal remains active.

## Previous release — 1.0.74+codex.20261003

Adds an exact edit-scope gate to full scientific saved-template edits. Preview requires allowed_changes from the user's actual request and returns a complete bounded wire-payload diff. The comparison is between normalized original wire and resulting wire, never raw GET kg versus wire pounds. Removals/additions and order, variant, dose, rest, load/preset, resistance-mode and unknown-metadata differences are explicit. Unknown metadata values are not exposed; limits block rather than truncate. Numeric CSV representations and known IDs normalize without inventing broadcasting or unit meaning. The neutral diff does not grant permissions. Scope and diff are cloned/frozen on the process approval and rechecked from regenerated payload before write. An unintended removed warmup/stretch action requires exercise_selection permission; note-only section instructions do not preserve executable actions.

Boundaries: derived capacity changes currently require load scope even if arising from dose changes; reordering may require exercise_selection and exercise_order. These are explicit conservative scope constraints. They do not infer physiological load from API capacity. Semantic coaching/scientific gates remain in place. The separate explicit requirement for every included warmup/stretch section to serialize executable catalog entries remains incomplete; notes alone are not machine execution. A future implementation needs stable plan-entry identity so repeated catalog groups across sections do not collide in evidence and superset targets.

After installing/synchronizing all latest runtime files in both Windows roots, node --test --test-isolation=none passed **536/536** on 2026-10-03. First run exposed a regression-test extraction selecting the new preview block rather than update block; corrected selector then reinstalled before rerun. Fresh installed MCP loaded=installed=1.0.74+codex.20261003, restartRequired=false, instance 16447b2e35f87eb0a1c273ea, 33 tools, one credential-ready profile. Invalid edit scope was rejected before account/network reads. No personal workouts or live catalog contents were read and no account writes were performed. Full private/device parity remains unproven; goal stays active.

## Previous release — 1.0.73+codex.20261003

Adds speediance_preview_saved_program_update: full-result-plan scientific preview for saved edits. Every training change must use the preview's exact approved payload; raw action changes, modes and Smart RM conversion cannot bypass the gate. Unknown changed action fields also require scientific review. Rename-only and unchanged prescriptions are exempt. The write rechecks research evidence, account and intake fingerprints, original code/base digest, payload equality and approval expiry inside the profile lock, then consumes the approval once. It preserves the template code/calendar and verifies readback. Older plans are not scientific evidence; even rest-only edits pass current full-plan validation and Smart RM readiness. Warmup/stretch notes remain local, and a local note save failure must not cause retry of a verified API write.

Fixes concurrent creation replay: two calls capturing the same preview can no longer both write, because map identity and expiry are rechecked inside the profile mutation lock. Edit approval cannot create a new template or pass the legacy approval route. Regression tests execute real branches with synthetic dependency fixtures; no user plan is mutated.

Adds bounded speediance_browse_official_courses based on public reference client commit 4e12bc6108f43c2705e935aa3d5db563cb8a3c06 api_client.py/templates/browse.html. It scans one page up to 200 records and returns up to 50, or reads one exact course ID. Permission flags and partial coverage are retained. recommendedWeight/estimatedCapacity have unknown units; setsAndReps/completionMethod are not interpreted through completed-session mappings. Tests use synthetic values, not captured live API fixtures. Catalog contents do not satisfy the scientific gate by themselves.

Installed latest runtime into both Windows roots before executing node --test --test-isolation=none: **529/529 passed** on 2026-10-03. Fresh installed MCP loaded=installed=1.0.73+codex.20261003, restartRequired=false, instance 46e7bcd1f4a7d31956b5f12e, 33 tools, one credential-ready profile. A course call with consent=false was rejected before account/network reads. No live official course/program or personal training data was fetched and no account writes were performed. Active old chat remains .68 and was not used for feature validation. Device firmware/private reference client identity and unsupported-model write parity remain unproven; macOS/Linux remain offline-covered. Full goal remains active.

## Previous release — 1.0.72+codex.20261003

Adds the independently authenticated read-only speediance_browse_official_programs tool, following pinned Labatt calendar.py/API/fixtures at 96efbb3da0fa9d903defecbd2f726ea1885ce12e. One program page (200 scanned, 50 returned) may be query-filtered; one positive exact program ID retrieves allowed scalar fields and at most 50 week-name records. Permission is retained, never bypassed. No scheduling, template creation or scientific approval is implied. Missing weekList, inconsistent week counts, unsupported objects/lists, malformed rows and bounded field/text truncation remain explicitly partial. Unknown fields and exception text are not returned. No exhaustive catalog claim is made.

Independent review found missing week structure and unknown object structures could appear complete; these were fixed before installation. All final runtime files were installed into both Windows roots before testing: 513/513 passed with node --test --test-isolation=none on 2026-10-03. A fresh installed MCP reported loaded=installed=1.0.72+codex.20261003, restartRequired=false, instance f2735c139e66ec4878a6d2d6, 31 tools including the new browse tool, and one credential-ready profile. A black-box call with consent=false was rejected before account/network access. No official program or personal workout was actually fetched. Live API shape and access remain untested; Windows startup is verified, macOS/Linux remain offline-covered. Scientific gates and Smart RM/Customize behavior are retained. Full private reference client/device parity and the previously listed remaining features are not proven; the goal remains active.

Primary source: https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/tools/calendar.py . MIT notices retained in THIRD_PARTY_NOTICES.md.
## Historical source release — 1.0.71+codex.20261003

Creation of account-unit Customize/profile-auto now shares reference client imperial normalization with template editing: lb/2.2 snapped to half kg, then kg×2.2 serialized. Previously creation sent lb directly. Input limits are checked before snapping; 50 lb is valid input even though its wire load becomes 49.5. Canonical manual fixed-kg, unchanged GET kg and Smart RM remain separate. All integer lb inputs 8–220 have synthetic adapter/edit regression coverage, including a real create serializer with 100 lb anchor and 20 reps yielding the suggested 50 lb. Public templates/create.html and static/workout-logic.js confirm the software adapter; no physiological or physical device accuracy claim follows.

Final runtime was installed before regression: 504/504 passed with node --test --test-isolation=none on 2026-10-03. The first run exposed two old imperial expectations; they were updated from the source formula and the complete suite rerun after installation synchronization. A fresh installed MCP reported loaded=installed=1.0.71+codex.20261003, restartRequired=false, instance 8eba4828ad02c04ea4032691, 30 tools and one ready profile. No workout account data was read or changed. Existing chat instances need a separate version check. Windows install and startup are verified; macOS/Linux remain offline-covered.

Next confirmed missing public feature: bounded read-only official exclusive-plan browse/detail (/mobile/exclusivePlan/page and /app/exclusivePlan/{id}), with manufacturer permission fields retained. It is not implemented in this release. Private reference client history fallback, physical device behavior, other-device writes and social OAuth remain unverified/incomplete. The scientific gate remains.

Sources: https://raw.githubusercontent.com/hbui3/UnofficialSpeedianceWorkoutManager/main/templates/create.html and https://raw.githubusercontent.com/hbui3/UnofficialSpeedianceWorkoutManager/main/static/workout-logic.js
## Historical source release — 1.0.70+codex.20261003

Audit found equal-numeral ambiguity between static GET kg and new account-unit input: 50 kg GET could incorrectly preserve the old load for a request of 50 lb. Explicit staticLoadChanged=true now forces edit authorization, account-unit normalization and catalog-limit validation, including equal-number edits; it is rejected on Smart RM and removed before API serialization. Unchanged legacy values retain their distinct path. Imperial edit conversion follows public reference client lbsToKg snapping: 50 lb becomes 22.5 canonical kg and wire 49.5, rather than old 50 kg/wire 110. No silent reinterpretation of old GET values is permitted.

Named Smart RM edit capacity now follows public api_client.py save_workout: sum(reps × RM selector × 2.2), matching new-plan serialization. This is API compatibility metadata, not physical resistance or lifted volume. Side expansion and static limits now share explicit detail/batch metadata; batch-only unilateral flags expand both sides, while conflicting flags block serialization.

Final runtime source was installed into both Windows roots before the complete regression: 502/502 passed with node --test --test-isolation=none on 2026-10-03. The first run exposed obsolete capacity expectations and an incorrect synthetic expectation ignoring the existing imperial snap; expected values were corrected from the public writer formula and the entire suite rerun after synchronization. A fresh installed MCP reported loaded=installed=1.0.70+codex.20261003, restartRequired=false, instance 4939821acd0d4edaf198694b, 30 tools, the staticLoadChanged schema and one credential-ready profile. No training was read or written. Existing chat runtime must be checked separately. Scientific gating and coaching rules remain. Physical firmware and private reference client behavior remain unverified; this release does not establish complete parity.

Sources: https://raw.githubusercontent.com/hbui3/UnofficialSpeedianceWorkoutManager/main/api_client.py and https://raw.githubusercontent.com/hbui3/UnofficialSpeedianceWorkoutManager/main/static/workout-logic.js
## Historical source release — 1.0.69+codex.20261003

Public reference client static/workout-logic.js getRules and templates/create.html were re-read on 2026-10-03. Static account-display limits now cover creation and changed positive static loads during template editing: kg unilateral 3.5–50, barbell 7–100, other 3.5–100, step 0.5; lb unilateral 8–110, other 15–220, step 1. Explicit API detail/batch flags must agree; missing relevant flags block the change. Values are rejected rather than silently clamped. Smart RM markers and unchanged legacy loads remain outside this static validation. These are public UI limits, not independent proof of firmware limits. Scientific gate and goal-selected presets remain intact.

Final source was installed into both Windows roots before regression testing: 499/499 passed with node --test --test-isolation=none. The first run exposed a misplaced executable shebang after an import; this was repaired, installed again, and the complete suite rerun. A fresh installed MCP reported loaded=installed=1.0.69+codex.20261003, restartRequired=false, instance 11f9fab72d5fdaaabc1daea9, 30 tools and one credential-ready profile. No account workout was read or changed. Running chat instances require a separate version check; fresh-process evidence does not prove an existing chat refreshed. Windows installation was verified; macOS/Linux remain offline-covered. Full private reference client parity and physical Smart RM behavior remain unverified.

Sources: https://raw.githubusercontent.com/hbui3/UnofficialSpeedianceWorkoutManager/main/static/workout-logic.js and https://raw.githubusercontent.com/hbui3/UnofficialSpeedianceWorkoutManager/main/templates/create.html
## Historical source release — 1.0.68+codex.20261002

Pinned Labatt parsing.py distinguishes side cable telemetry from aggregate weights and treats side arrays as independent, possibly ragged samples. The adapter exposes a source-qualified peak without manufacturing per-rep measurements. Audit also found that display filtering could turn malformed original weight arrays into apparently valid tonnage input; volume validation now retains raw evidence and rejects ambiguous side telemetry. Permanent lessons are recorded in AGENTS.md. Final source was installed before exact-release tests: 487/487 passed with node --test --test-isolation=none on 2026-10-02. Regression coverage includes malformed arrays/CSV, side ambiguity, independent ragged peaks, safe history provenance and unresolved-peak partial reporting. A fresh installed diagnostic reported loaded=installed=1.0.68+codex.20261002, restartRequired=false, instance d1e10ba51915cb67296bdc83, 30 tools and one ready configured profile. After the user restarted MCP, this active chat independently reported the same matching version and restartRequired=false, instance cf2cc2a5ece5577d6198c0bd. No workout was modified. Physical firmware behavior and exhaustive account-history parity remain unverified. Windows installation was checked; macOS/Linux remain offline-covered. The 478/478 result belongs only to .67.
## Historical source release — 1.0.67+codex.20261002

Audit found obsolete model-facing Smart RM instructions requiring local/e1RM numeric anchors and per-variant readiness, contradicting the implemented reported account 1RM group-presence registry. These descriptions and generated preview guidance now align with the backend; static Customize retains its unit-qualified numeric anchor. Public reference client api_client.py uses reps multiplied by its selected RM counter and 2.2 for Smart RM capacity metadata, while weights remains the 3.5 placeholder. GM Coach now follows this formula; static paths are unchanged. This metadata is not physical load or measured tonnage. Final source was installed before the full regression: 478/478 tests passed with node --test --test-isolation=none on 2026-10-02. Two obsolete snapshots were corrected using their actual ordered reps/RM values; floating-point fixture precision was aligned to the serializer precision. A freshly installed MCP reported loaded=installed=1.0.67+codex.20261002, restartRequired=false, instance bbcd1b44eda6322f00926911, 30 tools and one ready configured profile. Its catalog was checked for obsolete Smart RM anchor/variant instructions. No workouts were changed and no physical firmware parity is claimed. The 475/475 result belongs only to .66. Windows installation was checked; macOS/Linux remain offline-covered.
## Historical source release — 1.0.66+codex.20261002

Adds source-qualified Free Lift actionList/setList summary decoding and completed-exercise history coverage. Scalars remain distinct from per-repetition telemetry; no total tonnage is manufactured. Scientific gates and Smart RM/Customize routing remain. Final source was installed before the full exact-release regression: 475/475 tests passed with node --test --test-isolation=none on 2026-10-02. An initial fixture bug supplied a default capacity instead of a missing field; the fixture was corrected, reinstalled and the entire suite rerun. Reviewed coverage handles repeated blocks and mismatched detailed/summary sets with explicit partial status, suppressing whole-session tonnage. A fresh installed MCP reported loaded=installed=1.0.66+codex.20261002, restartRequired=false, instance 2fb5961a866143c178ead5b4 and 30 tools; one configured profile remained credential-ready. This local diagnostic did not read account workouts or verify physical machine load. macOS/Linux remain offline-covered. Final artifact verification is separate from these test results.
## Historical source release — 1.0.65+codex.20261002

This continuation adds a bounded, read-only completed-session path to exercise history and a separate reader for empty Free Lift detail responses. The source behavior is based on the public Labatt MCP pinned at `96efbb3da0fa9d903defecbd2f726ea1885ce12e`, particularly `tools/coaching.py`, `tools/_common.py` and the session fallback fixture. It is not evidence of the active reference client's private history-to-load algorithm. Completed sets are matched by group ID before annotation; weekly dayStr is not promoted to a session date, and unmarked sets do not become 1RM/RIR estimates.

An authorized diagnostic through a freshly installed .65 MCP scanned a bounded completed-session window and found matching exercise entries, with no read failures and known kg units. Their dose units incorrectly remained unknown: a real record carried completionMethod=1 and countType=2. The older history parser treated countType as a competing dose code, recreating a bug already fixed for saved plans. The history fix removes countType as a unit claim and follows recognized completionMethod (1=reps, 0/2=seconds), explicit labels/durations and genuine conflict checks. Unsupported completion methods are not defaulted to reps. Public Labatt parsing.py and the earlier saved-plan evidence corroborate this distinction. Only generic field semantics and synthetic regression fixtures enter the package; account history is not stored there.

Final .65 source, installed root and Personal cache were updated before the exact-source regression. **447/447 tests passed** with `node --test --test-isolation=none` on 2026-10-02. The new module fixtures cover namespace isolation, empty non-cardio Free Lift fallback, wrong IDs/variants, skipped records, seconds, reps, kg/lb/unknown units, bounded scans and sanitized partial failures. Dose regressions now reproduce completionMethod=1,countType=2 as reps and completionMethod=0/2 as seconds; genuine explicit-unit conflicts and unsupported methods still remain unknown. The scientific gate and coaching knowledge remain intact.

The final installed diagnostic process reported loaded=installed=`1.0.65+codex.20261002`, restartRequired=false, instance `77735afd91c99cb7ee033473`, and 30 tools. Its forty synthetic kg/lb suggestions passed. The ready configured profile's read-only API connection returned connected=true, apiConnected=true, EU. The bounded completed-history check returned matching entries with reps and kg, reported zero errors and partial=false for the supplied summaries. This is not proof of exhaustive account history or a fully reproduced private history-to-load algorithm. The exact-session readback confirmed normalized strength sets; the Free Lift fallback was not needed in this live sample and remains fixture-tested. No plan or calendar was changed. Only the diagnostic child was closed, and personal workout payloads and assessment weights were not written into source, audit fixtures or ZIP.

The final archive is `C:\TQ3D\GM-Coach-1.0.65.zip`, with **69 canonical public files**, novice installation instructions for Windows/macOS/Linux and the single-dumbbell SVG. The explicit allowlist excludes account data and credentials. Final verification compares every ZIP entry's SHA-256 to source and the two installed roots, accounting for intentionally adapted runtime launch configs. Windows installation and a fresh Windows MCP were checked live; macOS/Linux remain offline-covered. Superseded archives and diagnostic/test temporary files are removed after verification; in-use recovery copies are preserved.

After the user restarted the exact MCP, this active conversation was independently checked: loaded=installed=1.0.65+codex.20261002, restartRequired=false, instance 1abcce326797bbaee5f87fb0. The configured profile remained credential-ready and the read-only GM Coach connection check returned connected=true and apiConnected=true in EU. History access was not checked by that connection probe. The earlier .60 mismatch is superseded for this conversation; no new login or Codex Desktop restart was required.

Remaining work: physical Smart RM behavior, the active reference client’s private history-anchor/load fallback, complete cross-account/unit parity, non-GM1 writes, social OAuth and verified cloud device/owned-accessory detection. The goal is not marked complete. The previous .64 evidence below remains historical and is not carried forward as .65 verification.

## Historical source release — 1.0.64+codex.20261002

User renewed authorization to do the necessary work without another consent prompt. The reference-only reference client get_strength_profile call returned the full universal repMaxCurve (1–20) and four goal ranges, including maintenance 6–10. Only the generic table and rules enter the shareable plugin. Personal assessment, equipment and body/profile values remain outside the source/package.

The captured table is `{1:1,2:.95,3:.93,4:.90,5:.87,6:.85,7:.83,8:.80,9:.77,10:.75,11:.73,12:.67,13:.66,14:.65,15:.64,16:.62,17:.58,18:.55,19:.53,20:.50}`. The old three rounded description examples are retained only as a legacy export; all 20 response values now drive direct table lookup. Supplied points must match the captured table. There is no interpolation, extrapolation or invented equation. Exact reproduction of software data is not proof of an individual physiological/VBT curve or scientific load/RIR prescription.

Reference-only suggest_load calls for each count 1–20 on one assessed lift in kg show selection from `curve[min(reps+1,20)]`, with a whole-account-unit result. The .5 boundary in counts 19/20 rounds toward its even floor, unlike JavaScript Math.round; all 20 results match the nearest-even adapter. No odd-floor .5 case was available among the four returned assessments: upward ties and lb are covered synthetically, not independently verified against that account's remote engine. We do not label the extra software step a measured 1 RIR.

Static Customize suggestion and profile-auto serialization now share that observed assessment adapter; direct raw curve lookup remains separate. Smart RM preset IDs, hidden counters, reps/RIR and fixed manual loads are not derived from it. Active schema permits 20 verified curve points and maintenance static suggestions. The scientific evidence gate is retained. The installed plugin must not call reference client as a runtime dependency or fallback.

Final source .64 was installed before the exact-source full run: **417/417 tests passed** with `node --test --test-isolation=none` on 2026-10-02. This includes a new regression check for both skill copies, rejecting obsolete local-anchor/e1RM and single-variant conditions for machine Smart RM. Their actual requirement is fresh reported account 1RM presence for the group, with an independently confirmed catalog variant and any explicitly narrower scope respected. Static Customize retains its unit-qualified anchor requirement.

A separate process started from the installed .64 root reported loaded=installed=`1.0.64+codex.20261002`, `restartRequired=false`, instance `cebe3a356b5cd95211bdb24d`, and **30 tools**. Forty synthetic suggestions through that MCP (all counts 1–20, explicit synthetic 1RM=100 in kg and lb) passed expected next-step/rounding checks without requesting account statistics or writing anything. The ready configured profile's read-only API connection check returned connected=true, apiConnected=true, EU; workoutHistoryAccess remained not_checked. Only this diagnostic child was closed. This does not demonstrate that an already-open chat reloaded its tools.

The already-open chat's safe local diagnostic still reported loaded .60 / installed .64 / restartRequired=true, instance `3e60f43421450f84347028d8`. No features were tested through it. The configured credential status remained ready; this mismatch is not a logout. Its existing tool catalog cannot be replaced by a separate diagnostic process. No Codex Desktop process was terminated.

The final shareable archive is `C:\TQ3D\GM-Coach-1.0.64.zip`, with 65 canonical public files, cross-platform installers and the single-dumbbell SVG. Packaging and final source/archive/installed-file comparison use the explicit allowlist; secrets and account data are excluded. Installed MCP launch configurations are intentionally adapted to the pinned local runtime. Windows installation is live-checked; macOS/Linux coverage is offline.

Remaining scope includes the private history-anchor resolver, full cross-account/unit behavior, physical Smart RM calculation, unimplemented health/recovery endpoints and non-GM1 writes. Capturing the universal table advances the original goal; it does not prove completion of all 1:1 requirements.

## Historical source release — 1.0.63+codex.20261002

The previous goal turn made concrete progress: release .62 was installed, packaged and independently connected. This continuation audits actual serialization behavior and new primary-source evidence; it does not use stale MCP features.

Non-RM create serialization now emits genuinely empty counterweight/counterweight2 fields. Previously a two-set Customize, fixed-load, bodyweight or cardio action emitted a comma, which disagreed with the public reference client writer and failed Coach's own readback verifier. A new integration test exercises the real serializer and verifier with multi-set Customize, fixed kg, timed bodyweight and Row, including a negative changed-weight readback. Existing unit snapshots were corrected rather than preserving that bug.

Smart RM parsing now normalizes finite numeric singleton fields consistently with existing numeric readback support and expands them for edits. Known global preset IDs display their verified names even when the API omits a name. Invalid fields and conflicting counters still fail. Model-facing initialize/schema instructions no longer require a local numerical/variant-specific 1RM anchor or e1RM for Smart RM; they match the recent reported account-presence registry, group scope and independently confirmed catalog variant. Regression tests reject those obsolete instructions. Static Customize still requires its own unit-qualified anchor and explicit request; scientific gating remains intact.

Nested explicit 1RM statistics inherit their record date and preserve more specific dates. Impossible dates cannot masquerade as valid working-set observations. New public source evidence establishes that direct dayStr rows can be WEEKLY buckets. Coach marks datePrecision=week and observationDateSource=dayStr, emits date semantics and distinguishes weekly-bucket-date from exact/date-invalid/date-not-returned statuses. It does not infer a session date, latest working set or daily volume from that label. Conflicting mixed weekly/point observations remain ambiguous. Earlier .62 notes about dates must be read with this correction.

The new API knowledge reference separates official sources, discovered routes, repo-author observations and implemented Coach tools. Newly discovered recovery/fatigue/strength-score/Row-Ski telemetry paths are documented, not claimed as tested or implemented account integrations. No personal reference client call was made: a separate one-time request to read its strength-profile/VBT result is pending; no response is not authorization.

Source .63 was installed before the final full suite: **408/408** passed with `node --test --test-isolation=none`. A separate installed diagnostic process reported loaded=installed=.63, restartRequired=false, instance `1a8e86f8a21bbbb03a4a792e`, 30 tools. Its safe configured connection check returned connected=true, apiConnected=true, EU, history not_checked. No program/calendar mutation occurred and only that diagnostic child was closed. The already-open conversation remained .60/installed .63/restartRequired=true; no stale feature check was used. Its temporary .63 archive was subsequently superseded by .64 work. Physical Smart RM behavior and full private resolver parity remained unproven.

## Historical source release — 1.0.62+codex.20261002

Source root and bundled manifests both report this release. The newest source suite, `node --test --test-isolation=none`, passed **397/397** on 2026-10-02 with local fixture child processes permitted. These are synthetic offline checks, not physical machine tests.

reference client exercise statistics and anchors are keyed by groupId; exercise variants are selected separately. A group-scoped reported account 1RM now supports an independently catalog-confirmed variant within the same group, even when that group contains multiple variants. Explicit narrower variant IDs still must match. Account/configuration isolation and the ten-minute observation expiry remain enforced.

Valid compressed Smart RM weights/counters expand consistently for writes and compare semantically with expanded readback. Rename, rest-only and resistance-mode-only edits no longer mistake representation compression for a dose change. Invalid counters still fail validation. Statistics retain dayStr and precision, and reject impossible calendar dates rather than treating a Date.parse rollover as the latest observation.

The new `skills/speediance-coach/references/reference-client-feature-parity.md` records source pins, the capability matrix and unresolved parity. `THIRD_PARTY_NOTICES.md` preserves upstream MIT notices. Both are included in the canonical cross-platform package; no account data or credentials are included.

The user reported resetting MCP. A subsequent diagnostic in this already-open conversation nevertheless reported loaded 1.0.60, installed 1.0.61, restartRequired=true, instance `3e60f43421450f84347028d8`. This process is not a valid latest-release feature test target. Its selected profile credentials are ready; the version mismatch does not establish logout. Release artifact and fresh-process verification follow below.

Final documentation review removed two obsolete single-variant restrictions from both skill copies and clarified account/group observation scope. The full newest-source suite was rerun after these edits: **397/397 passed**. The cross-platform installation section now names Linux download/checksum tools and the system Secret Service requirement.

The Windows installer updated local root and Personal cache to **1.0.62+codex.20261002**, preserving existing account data and the running Codex application. A separate diagnostic child from the installed root reported loaded=installed=1.0.62, restartRequired=false, instance `c6c3f731fcd71c4ff8bb278f`, and **30 tools**. After this version gate, `speediance_check_connection` for the ready `configured` profile returned connected=true, apiConnected=true, region EU, workoutHistoryAccess=not_checked. No workout history, statistics, catalog, programs or calendar data was requested; no account program/calendar write was performed. Only the diagnostic child was closed afterward. This does not demonstrate that an already-open chat has reloaded its tools.

The release archive is `C:\TQ3D\GM-Coach-1.0.62.zip`, containing **64 canonical public files**, including Windows/macOS/Linux installers and the single-dumbbell SVG icon. Packaging validates both manifests and exact allowed ZIP entries. Credentials, account directories and installed runtime binaries are excluded. macOS/Linux installers have offline coverage; this release was installed live only on Windows.

Remaining limitations: physical Smart RM resistance and full equivalence with the private reference client VBT/history load resolver remain unverified. Non-GM1 writes, social OAuth, and cloud device autodetection are not established. The current ZIP is a local Codex plugin, not a hosted ChatGPT/mobile connector. Coaching instructions and the scientific evidence gate remain intact.

## Historical source release — 1.0.61+codex.20261002

This release separates an account 1RM observation from a local training anchor. A new Smart RM preset write or conversion requires a recent explicit reported 1RM field from Speediance exercise statistics, fetched through the consent-gated strength-profile refresh. The observation is held for ten minutes in process memory, keyed by profile, credential/configuration fingerprint and exercise group. No kg/lb unit is required merely to confirm presence. Local/user-entered anchors and estimated e1RM do not establish account readiness; they remain available for the separately requested static Customize path.

Statistics preserve exact actionLibraryId and group scope through nested records and deduplication. Conflicting group/variant identifiers are rejected. A group-only 1RM is accepted only when the API confirms one variant; multiple variants require a matching explicit variant. The tool returns smartRmAccount1RM presence and variant IDs separately from numerical, unit-qualified candidates, so unknown units do not cause an unnecessary unit prompt for Smart RM.

Existing Smart RM rest-only and resistance-mode-only edits do not need a fresh account observation. A preset conversion or changes to reps, weights or internal RM counters do. Detection follows the known named preset ID even when readback compresses a shared weights=3.5 marker into one value for multiple sets, closing a raw-action-list bypass. If readiness cannot be confirmed, the write stops and never silently switches to static kg. A refresh failure invalidates the previous observation for that exercise.

The active reference client tool description says named presets use account 1RM times their own percentage (Gain Muscle 65%, Strength 83%; Stamina percentage unspecified), while static Customize uses per-set loads. Coach preserves its public serializer shape and goal-selected preset. These observations do not prove physical firmware resistance or complete 1:1 parity. No account workout, calendar or template mutation was performed for this release. Coaching rules and the scientific evidence gate remain in place.

Verification on source **1.0.61+codex.20261002**: matching root and bundled manifests; node --test --test-isolation=none passed **389/389** after allowing local fixture child processes. Tests cover account isolation, TTL expiry, reported-vs-estimated 1RM, missing units, variant preservation/conflicts, shared-marker bypass, rest/mode-only edits, unit serialization, modes, scientific gating and installers. After the final tool-description changes, the focused schema/installer suite passed **21/21** and the server syntax check passed. Physical machine load remains unverified.

The `.61` Windows installer updated the local plugin root and Personal cache, reusing Node.js 24.21.0 and the installed Speediance CLI; it kept the account data and did not restart Codex Desktop. The registered global command points to the updated local root. Installed root and cache manifests both report `.61`, and the installed MCP SHA-256 matches source: `60535975C62E4EF8986917AE632C7C7D94F360B796BCF4117A94BDA707E80A62`. A newly launched process from that installed root reported pluginVersion=installedPluginVersion=`1.0.61+codex.20261002`, restartRequired=false, instance `c2f9fd20e83fef8fb1c9c01b`, and 30 tools including the new account-1RM guidance. Only after this version gate did a read-only check_connection for `configured` return connected=true, apiConnected=true, region EU. No history/statistics/catalog/program/calendar data was requested in this live check. The diagnostic child process was closed afterward.

The current already-open conversation still reports loaded `.60`, installed `.61`, restartRequired=true, instance `3e60f43421450f84347028d8`. It is not a valid `.61` feature-test target. Reload the matching GM Coach MCP to update its process/catalog; existing credentials are ready, so a version mismatch must not trigger login. The release ZIP is `C:\TQ3D\GM-Coach-1.0.61.zip`, with **62 canonical files**, public source/skills/installers only and no account credentials. Windows/macOS/Linux installer files include the new readiness module.

Remaining parity scope is explicit: physical Smart RM behavior and equivalence to the active reference client implementation are not proven by API serialization; the full Customize/history/VBT auto-fill algorithm is still unavailable beyond the documented three rounded reference points; writes for machine types other than GM1 remain unverified. This release does not claim completion of the broader 1:1 parity goal.

## Historical source release — 1.0.60+codex.20261002

This release repairs whole-template saved-program updates. Saved-template GET exposes static load values in kg while direct reference-client-compatible writes use wire pounds (`kg × 2.2`). GM Coach now serializes unchanged GET loads safely even for rename-only, mode-only, or set edits; it recalculates capacity when the action list changes and verifies the normalized kg readback. New or changed loads require the existing explicit authorization and a freshly verified account display unit. Unknown preset/load markers fail closed. Smart RM placeholders and counters remain untouched by static-load conversion.

The reference-client-compatible resistance-mode field remains limited to `1=Standard`, `2=Chain`, `3=Eccentric`. Speediance markets a fourth feature as Constant/Fixed Speed on different model pages; neither the active reference client MCP nor this Speediance template field exposes it. The GM3 page's “Isokinetic” appears in image alt text, not a technical specification of constant angular velocity. Spotter is a separate assistance feature, not a writable `sportMode` here. “ISO” alone is ambiguous and must be resolved as isometric (timed contraction) or isokinetic (dynamic constant-speed claim) before planning. Sources: [Speediance equipment page](https://www.speediance.com/pages/equipment), [GM3 Core](https://www.speediance.com/products/speediance-gym-monster-3-core), [Spotter update](https://www.speediance.com/blogs/product-updates/whats-new-at-speediance-august-2026), [NCBI isometric definition](https://www.ncbi.nlm.nih.gov/books/NBK555914/), [isokinetic definition](https://pubmed.ncbi.nlm.nih.gov/2675256/).

Smart RM remains a named, machine-managed preset path. Coach does not display the hidden `weights=3.5` marker as a load or claim that readback proves the machine's 1RM-to-force calculation. The public reference client serializer confirms payload shape, while firmware behavior remains unverified. API `capacity` is metadata and must not be reported as workout tonnage.

Verification on source release **1.0.60+codex.20261002**: `node --test --test-isolation=none` passed **378/378**. The first sandboxed run passed 375 tests and blocked three child-process fixtures with `spawn EPERM`; rerunning that exact `.60` suite with permission for local fixture processes passed all 378. Tests use synthetic fixtures; no workout history, program, calendar, or account write was used.

The final release package `C:\TQ3D\GM-Coach-1.0.60.zip` contains exactly **60/60 canonical files**. Source, bundled, package-root and package-bundled manifests all report `1.0.60+codex.20261002`; packaged `mcp_server.mjs` SHA-256 matches source (`55EE4546EF772FE39EC22449ED59B61DBD8A633509CAE20DDD06117FFF2BA97E`).

The Windows installer updated both the local plugin root and Personal cache to `.60`, reused Node.js 24 and the installed Speediance CLI, installed the pinned Windows keyring runtime, and did not stop or restart Codex Desktop. It kept a recovery copy because files were still open: `~\.codex\plugins\.gm-coach-backup-c2b65fa83ea44b2ab1059c94224cd760`. The installer left the existing global MCP registration untouched because it could not verify entry ownership. A new, isolated diagnostic chat then explicitly used global `gm_coach_local` and returned `pluginVersion=installedPluginVersion=1.0.60+codex.20261002`, `restartRequired=false`, `mcpInstanceId=2e33f8e9106fed394f5265b4`, profile `configured` ready, and read-only `speediance_check_connection: connected=true, region EU`. That chat was archived after the check. No workout history, statistics, catalog, program, calendar, or write was used in the `.60` live verification.

## Historical source release — 1.0.57+codex.20261002

This release hardens the explicit static-load path at its final serializer boundary: `profile-auto` now requires both an allow-listed anchor provenance (local profile, user-confirmed 1RM/working set, or explicit Speediance reported/estimated statistic) and a known account display unit matching the anchor. This closes a helper-level bypass; the ordinary MCP preview/create flow already checked the unit and anchor. Offline regressions cover missing/unknown provenance, missing/mismatched units, and accepted local-profile serialization.

The active reference client tool contract exposes no RIR input or saved RIR field. GM Coach no longer assigns a default 1 RIR to saved-template conversion or attributes that value to reference client. It preserves RIR only when explicitly supplied/confirmed; for a new coaching plan the assistant must choose RIR from research and the user's context and present it as coaching guidance, not a device-stored value.

The resistance-mode source audit was refreshed against official Speediance material: the official FAQ lists Standard, Chains, Eccentric, and Constant, with Spotter separately described as assistance. The official GM3 page uses Fixed Speed and its image description contains “Isokinetic”; that supports a model/UI label, not a universal API enum or proof of constant angular velocity. Thus “ISO” can refer to the device's Constant/Fixed Speed option when that exact UI context is confirmed; isometric remains a distinct timed contraction. The current reference client template contract still writes only `1=Standard`, `2=Chain`, `3=Eccentric`, so Coach rejects other names/codes rather than importing the conflicting speediance-cli enum. [Official Speediance FAQ](https://me.speediance.com/pages/faq) · [Original Gym Monster modes](https://eu.speediance.com/en/pages/speediance-gym-monster) · [GM3 Fixed Speed page](https://eu.speediance.com/en/pages/speediance-gym-monster-3).

Smart RM parity remains **partially verified**. The active reference client contract describes named presets as machine-managed from the user's 1RM and a preset percentage. GM Coach emits the public reference-client-derived preset payload fields, but public serializer/readback evidence does not prove identical active-MCP behavior or the actual firmware resistance. The offline tests verify field serialization, not physical resistance. No program was written to the user's account for this audit.

Verification for this source release: root and `.codex-plugin` manifests report `1.0.57+codex.20261002`; package `C:\TQ3D\GM-Coach-1.0.57.zip` is checked separately below. Focused Smart RM/unit/mode/schema tests passed **48/48**. Full offline suite: `node --test --test-isolation=none`, **371 passed, 0 failed**. These tests are source-level only.

At the start of this continuation, the calling chat's safe runtime diagnostic reported loaded MCP `1.0.48+codex.20261001` versus installed files `1.0.56+codex.20261002` (`restartRequired=true`). After installing source `1.0.57+codex.20261002`, the installer reported the local `gm_coach_local` configuration matches the installed server, CLI, and data directory; the personal plugin cache now contains `1.0.57+codex.20261002`. A temporary fresh chat then ran only `speediance_list_accounts` diagnostics and reported `pluginVersion=installedPluginVersion=1.0.57+codex.20261002`, `restartRequired=false`, and a new `mcpInstanceId`; that chat was archived after verification. No Speediance API connection, training history, catalog, program, calendar, or write was checked. The original calling chat remains on its old tool catalog and must not be used for feature tests; no logout or credential issue is indicated.

After the user reported resetting the MCP server, this existing chat still returned `pluginVersion=1.0.48+codex.20261001`, `installedPluginVersion=1.0.57+codex.20261002`, `restartRequired=true` (`mcpInstanceId=b6d6d2b6ddaa60fd8dfe97c3`). A new temporary projectless chat then ran only `speediance_list_accounts` and confirmed `pluginVersion=installedPluginVersion=1.0.57+codex.20261002`, `restartRequired=false`, `mcpInstanceId=9e4a1a2bc8e541d56a3fa99`; it was archived after verification. Therefore the latest MCP is ready in fresh chats, while this already-open chat remains bound to its old server. This diagnostic did not read training history or modify the Speediance account.

Disk cleanup removed the obsolete `GM-Coach-1.0.55.zip` and `GM-Coach-1.0.56.zip` artifacts plus four unlocked installer-backup folders. Two backup folders remain partially present because Windows reports their in-use `node.exe`/keyring native binaries as locked: `.gm-coach-backup-5d1a5934a44c40ada3c8c43ffc2592c7` (~95,445,320 bytes) and `.gm-coach-backup-ac5da24c2ac649acbd2ec5bc520d48d1` (~93,580,104 bytes). Their unlocked contents were removed where possible; the running process was not terminated. The active `1.0.57` plugin, source, and share package were preserved.

## Historical source release — 1.0.56+codex.20261002

This release makes the separate static Customize/profile-auto calculation fail closed unless the requested repetition count is one of the three approximate reference examples exposed by the reference client tool description: 5≈87%, 8≈80%, or 12≈67% of 1RM. The references are rounded, are not a full exercise-specific velocity curve, and do not establish Speediance firmware behavior. Unsupported reps return `needsInput`; the adapter does not interpolate, infer a formula, or return a partial set of loads. Tests validate this limit and the refusal path.

The default training path remains the named, machine-managed Smart RM preset selected for the user's goal. Its observed adapter fields (`templatePresetId`, `counterweight`/`counterweight2`, `weights=3.5`) and software defaults are not exposed as a training dose. Static kg remain a separate opt-in Customize/manual path. Readback can confirm the saved preset fields but not the actual machine-side kg or firmware's 1RM calculation; exact equivalence with reference client's active MCP flow is not proven by the public serializer.

The device-mode audit confirms that Speediance describes Constant as a GM1 resistance mode, while newer product materials use Fixed Speed and sometimes the label Isokinetic. The public speediance-cli's write enum differs from reference client's saved-template enum; GM Coach follows the latter only (`1=Standard`, `2=Chain`, `3=Eccentric`). Constant/Fixed Speed and Spotter are not writable through that field. “ISO” is ambiguous without the device UI context; isometric is a static contraction, not isokinetic. Manufacturer copy does not establish constant angular velocity or prove that the modes are interchangeable across device generations.

Verification on 2026-10-02: root and `.codex-plugin` manifests report `1.0.56+codex.20261002`; `mcp_server.mjs` derives `serverInfo.version` from the root manifest. Full offline suite `node --test --test-isolation=none`: **369 passed, 0 failed**. The ordinary sandbox attempt blocked three fixture subprocesses (`spawn EPERM`); the same command completed successfully when local fixture process spawning was permitted. `C:\TQ3D\GM-Coach-1.0.56.zip` contains 60 canonical files; both manifests report `1.0.56+codex.20261002`, and packaged `mcp_server.mjs` SHA-256 matches source (`D2FBE60227225A5A4644D8950272B8A08E8E57C3F32A2B623447D3DD1F2BA58D`). The installer updated both local plugin root and Personal cache; a fresh diagnostic chat reported `pluginVersion=installedPluginVersion=1.0.56+codex.20261002`, `restartRequired=false`, and a new MCP instance ID. It reported credential readiness only; no account API call, workout history, equipment, programs, calendar, or writes were performed. The disposable diagnostic chat was archived. Tests cover payload/schema behavior, not physical machine resistance or firmware calculations.

The calling conversation was also checked using only the safe account/server diagnostic: its process remains `1.0.48+codex.20261001` while installed files are `1.0.56+codex.20261002` (`restartRequired=true`). Do not use that older process for feature tests; new chats start the verified 1.0.56 server. The installer retained one recovery copy because Windows reported old plugin files still open; remove it only after the old process has exited.

## Historical source release — 1.0.55+codex.20261002

This release aligns the coaching instructions, plan schema, evidence gate, and saved-template conversion around the public reference client preset defaults. GM Coach chooses the named goal preset and preserves repetitions and RIR as the visible prescription. It no longer asks the model or user for a raw RM counter, nor derives that hidden serializer field from repetitions, RIR, or `%1RM`; the adapter applies the matching visible reference client UI default when omitted (Gain Muscle 13, Stamina 17, Strength 7). These are software defaults, not research-derived doses. The reference client wire shape remains `weights=3.5` with `counterweight`/`counterweight2`. Readback and public source do not prove that the active reference client MCP uses an identical payload or disclose the device firmware's 1RM-to-load formula. The preview therefore exposes the named preset and device-managed resistance, not the counter or a guessed kg value. Static `Customize`/profile-auto and manual kg remain separate, explicit user-request paths.

Additional code audit: the hidden counter is currently the same preset default for every set in that preset (13/17/7); it is not selected per set from reps, RIR, exercise history, or a measured 1RM. This matches the public reference client UI's preset-reset default and wire shape, but does not establish behavioral parity with the separately described reference client MCP flow that applies a preset-specific `%1RM`. The available public serializer treats the per-set counter as an input and contains no verified formula connecting it to `%1RM` or kg. Do not describe this adapter as an independently verified RM calculation; resolving the active MCP/device mapping needs evidence beyond the public UI defaults and synthetic serialization tests. Existing tests assert those defaults and the payload fields, not dynamic resistance behavior.

Mode audit: Speediance's GM1 product describes four device resistance modes including Constant; newer product copy also uses Fixed Speed, and one manufacturer article calls it Isokinetic. This does not validate dynamometer-like constant angular velocity. Isometric means a static contraction, not that resistance profile. The public reference client custom-template write contract and Coach support only codes `1=Standard`, `2=Chain`, `3=Eccentric`; Constant/Fixed Speed and separate Spotter assistance are not writable through that template field. Offline tests reject translating their names or other clients' `4/5` values into the reference client mode enum.

Public references: [reference client preset UI rules](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/v1.2/static/workout-logic.js#L10-L35), [reference client API serializer](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/v1.2/api_client.py#L2604-L2753), [Speediance original GM product](https://www.speediance.com/products/speediance-home-gym), [Speediance GM3 mode description](https://eu.speediance.com/en/pages/speediance-gym-monster-3), [Speediance Constant/Isokinetic article](https://www.speediance.com/blogs/fitness/variable-resistance-training), and [isometric/isokinetic terminology review](https://pubmed.ncbi.nlm.nih.gov/12851415/).

Verification: root and bundled manifests report `1.0.55+codex.20261002`. `C:\TQ3D\GM-Coach-1.0.55.zip` contains 60 canonical files with matching root/bundled manifest versions. Packaged `mcp_server.mjs` SHA-256: `C6EADEA9B356A0000F8A3D199342D5931E35C60004B6AB367BD5CB5696701EC1`. Focused command `node --test --test-isolation=none tests\program-payload.test.mjs tests\program-serialization.test.mjs tests\saved-templates.test.mjs tests\training-evidence.test.mjs tests\smart-rm-server-schema.test.mjs`: **115 passed, 0 failed**. Full command `node --test --test-isolation=none`: **369 passed, 0 failed**; the sandbox first blocked three local process fixtures with `spawn EPERM`, then the full suite passed with test-process permission. These tests verify the serializer and payload gates, not physical machine behavior or firmware calculations.

After the user reset MCP, a fresh diagnostic chat first confirmed 1.0.54. The 1.0.55 installer then updated the personal plugin package and plugin root, reused Node.js 24 and Speediance CLI, and preserved the profile. It kept a recovery copy because the old plugin files were open; the existing global `gm_coach_local` registration was left unchanged because the installer could not verify its identity. A new chat after installation reported `pluginVersion=installedPluginVersion=1.0.55+codex.20261002`, `restartRequired=false`, `mcpInstanceId=9aae97ac4d562a8379a0a382`; `configured` was connected to EU (`connected=true`, `apiConnected=true`, `credentialStatus=ready`). `workoutHistoryAccess=not_checked`. No workout history, equipment, program, or calendar data was read, and no Speediance writes were made. The original conversation remains pinned to 1.0.48 and reports `restartRequired=true`; use a fresh chat for 1.0.55 tools.

Fresh restart verification on 2026-10-02: after the user restarted the MCP server, the existing conversation still reported the old loaded process (`pluginVersion=1.0.48`, installed `1.0.55`, `restartRequired=true`, old instance ID). Per the server's diagnostic instruction, a separate new GM Coach chat was used. It reported `pluginVersion=installedPluginVersion=1.0.55+codex.20261002`, `restartRequired=false`, and a new `mcpInstanceId=998c68056e7e71d2823b277b`; the authenticated read-only EU check for profile `configured` succeeded (`connected=true`, `apiConnected=true`). `workoutHistoryAccess=not_checked`; no history, equipment, programs, calendar, or writes were accessed. The temporary diagnostic chat was archived after the check. The original chat remains tied to its older process and should not be used for current MCP tools.

## Historical source release — 1.0.54+codex.20261002

This release removes an implicit kg assumption from the pure payload builder. A caller serializing explicit fixed kilograms must provide the verified account unit (`kg` or `lb`); missing units now fail closed even when the surrounding MCP guard is bypassed. Smart RM remains separate: named preset ID, reps, and the per-set RM level use the observed reference client wire fields (`weights=3.5`, `counterweight` and `counterweight2`). The RM marker is not displayed as a load.

Public reverse-engineered serializer evidence (`https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/main/api_client.py#L2604-L2753`) supports that wire shape and the distinct Customize path, where loads are converted into the API's account-unit field. The public reference client prompt (`https://github.com/ANPC86/SmartGymWorkoutManager/blob/main/llm_prompt.txt#L2036-L2063`) documents the preset selector and RM level, but neither source discloses the device firmware's RM-level-to-resistance formula. Therefore Coach can mirror the observed payload, but cannot claim the resulting kg or percent 1RM is verified. Current reference client tool descriptions also advertise named-preset 1RM percentages; treat that as documented intent, not proof of the wire-level or firmware calculation.

The mode audit remains bounded to reference client’s saved-template codes 1=Standard, 2=Chain, 3=Eccentric. Speediance's Constant/Fixed Speed mode and Spotter assistance are distinct device features with no confirmed write field in that template contract; isometric contraction is not isokinetic mode.

Verification: root and bundled manifests report `1.0.54+codex.20261002`. `C:\TQ3D\GM-Coach-1.0.54.zip` contains 60 canonical files; root/bundled ZIP manifests match, and the packaged `mcp_server.mjs` hash (`E088B92AF56C27D451EC29E78CF670CC9BCE99B6A199D91EB7EB22D040E39D7A`) matches source. ZIP SHA-256: `1D5A19F175DE550B3AA514689C7690C5AE90EC8B71CAF719CE2755341BACBDBD`. Focused offline command `node --test --test-isolation=none tests\\program-payload.test.mjs tests\\program-serialization.test.mjs tests\\load-type-movement-kind.test.mjs tests\\saved-templates.test.mjs tests\\smart-rm-server-schema.test.mjs`: **84 passed, 0 failed**. Full offline command `node --test --test-isolation=none`: **368 passed, 0 failed** after the sandbox's first attempt blocked three child-process fixtures with `spawn EPERM`; the same full suite passed with process-spawn permission. These tests verify the source serializer, not device firmware or a live template write.

The installer updated both the plugin root and personal plugin cache to `1.0.54+codex.20261002`, reusing Node.js 24 and the installed Speediance CLI; it preserved local profile data. It left the existing `gm_coach_local` registration unchanged because its identity check did not match the installer's exact expected shape. `codex mcp list` confirms that the registration points to `~\.codex\plugins\gm-coach\mcp_server.mjs`. The original chat stayed on `1.0.48+codex.20261001`, but a newly created diagnostic chat reported `pluginVersion=installedPluginVersion=1.0.54+codex.20261002`, `restartRequired=false`, and `mcpInstanceId=6d77c40107d111962f2b6b43`. A read-only `speediance_check_connection` there returned `apiConnected=true`; `workoutHistoryAccess=not_checked`. No training history, equipment, programs, or workout writes were accessed. The old chat's stale process is isolated to that chat; use the new one for current GM Coach.

## Historical source release — 1.0.53+codex.20261002

This release closes two unsafe plan-editing paths. The public load-type vocabulary no longer accepts a fake Pilates resistance type; the API only gets a Vita load mode when the catalog confirms `dataStatType=6`. Confirmed bodyweight, mat, recovery, and cardio exercises reject Smart RM, profile-auto, and fixed-weight loads. For saved-template full-list edits, a changed static load now needs the explicit `static_load_authorization` (`customize` or `fixed-load`) plus a fresh account-unit read from `/app/userinfo`. If Speediance does not return kg/lb, the caller must provide a current, direct user confirmation; a conflicting confirmation is rejected. Unchanged loads, reference client Smart RM placeholders, and zero-load timed rows keep their separate behavior. Static loads stay in the account display unit; GM Coach does not apply an unverified kg/lb conversion.

Smart RM continues to keep the preset ID, repetitions, and direct RM level in separate fields. The public reference client presets are global exercise-level choices (Gain Muscle=1, Stamina=3, Strength=5); the exact Speediance exercise variant is chosen separately. The matching wire shape does not establish a firmware 1RM formula or a kg/%1RM result, so this release does not claim the device-side calculation has been independently reproduced. Saved-template Dynamic Weight still exposes only the three reference client write codes: 1=Standard, 2=Chain, 3=Eccentric. Constant/Fixed Speed is a real GM1 device mode, but is not writable through this reference client template field; Spotter is separate assistance, and Isometric is not the same thing as Isokinetic.

Verification: source and bundled manifests report `1.0.53+codex.20261002`. `C:\TQ3D\GM-Coach-1.0.53.zip` contains 60 canonical files; packaged and source `mcp_server.mjs` SHA-256 is `E088B92AF56C27D451EC29E78CF670CC9BCE99B6A199D91EB7EB22D040E39D7A`. Focused regression command `node --test --test-isolation=none tests\saved-templates.test.mjs tests\smart-rm-server-schema.test.mjs tests\load-type-movement-kind.test.mjs tests\program-payload.test.mjs`: **75 passed, 0 failed**. Full offline command `node --test --test-isolation=none`: **368 passed, 0 failed**; three local-process fixtures required process-spawn permission. The date-based calendar test fixtures were moved to future dates so they remain valid over time. These offline tests do not prove device firmware calculations or a live template write.

After the user reset MCP, a fresh diagnostic chat reported installed and running GM Coach `1.0.52+codex.20261001`, `restartRequired=false`, and profile `configured` connected (`apiConnected=true`); it did not read workout history or write to Speediance. The `1.0.53` release was then installed into the personal plugin/cache locations, reusing the existing Node 24 and Speediance CLI and preserving separate account data. A new post-install diagnostic chat reported both versions `1.0.53+codex.20261002`, `restartRequired=false`, and profile `configured` connected (`connected=true`). It did not read workout history or write a plan. The original older conversation still reports running MCP `1.0.48+codex.20261001` against installed `1.0.53`, with `restartRequired=true`; use a new chat for the refreshed tool catalog. The installer retained a recovery copy because old files were still open. No password re-entry is indicated.

## Historical source release — 1.0.52+codex.20261001

This release fixes saved-template unit handling at the write boundary. Each action row now resolves every set as repetitions or seconds before an edit; known timed rows cannot be converted to Smart RM, and unknown units need explicit per-set confirmation. Read-side `completionMethod` is normalized to the reference client write contract (`1=reps`, `2=seconds`) with `selectCompletionMethod=1`; `countType` is not used as a unit. Readback checks unit meaning rather than assuming the GET and POST codes match. A preset-shaped row is described as Smart RM only when that exact set is confirmed as repetitions.

The code change was compared with the available reference client MCP contracts: weights remain in the account `displayUnit` throughout Coach input, preview, and readback. A separate community web client’s raw `×2.2` serializer is not evidence for the reference client MCP contract or this Coach endpoint, so no account-unit conversion was added. Smart RM's named preset, repetitions, and RM counter fields remain distinct. Resistance-mode behavior carries forward from 1.0.51: saved-template writes accept only reference client codes `1=Standard`, `2=Chain`, `3=Eccentric`; device-level Constant/Fixed Speed and separate Spotter cannot be written through this field.

Verification: root and bundled manifests report `1.0.52+codex.20261001`; `C:\TQ3D\GM-Coach-1.0.52.zip` contains 59 canonical files and its packaged `mcp_server.mjs` SHA-256 is `A3103D78AB727FA10ED15326BF15A313ED9632DA76596A7036410D7D4DD5965A`, matching source. Focused offline regression (`tests/saved-templates.test.mjs` and `tests/smart-rm-server-schema.test.mjs`): **41 passed, 0 failed**. Full offline suite `node --test --test-isolation=none`: **361 passed, 0 failed**; three local-process fixtures required process-spawn permission after the sandbox returned `spawn EPERM`. These tests do not verify firmware calculations or a live Speediance write.

After the user reset the MCP server, the original chat still reports the old loaded process (`pluginVersion=1.0.48+codex.20261001`) while disk has `installedPluginVersion=1.0.52+codex.20261001` and `restartRequired=true`. A separate fresh GM Coach diagnostic chat reports both versions as `1.0.52+codex.20261001`, `restartRequired=false`, and `mcpInstanceId=94def6cd19ed0d762da9e53a`; this confirms the restart/update is active for new chats. The old conversation retains its original MCP instance, so new operations should use a fresh chat. A read-only connection-status check completed there. No workout history was read and no workout write was made. No Speediance password was requested.

## Historical source release — 1.0.51+codex.20261001

This release closes the saved-template Smart RM goal/preset gap: conversion now requires the user's confirmed current primary goal or a previously saved local profile goal. Missing/ambiguous goal and goal/preset conflicts are rejected at the serializer boundary; the old template cannot silently dictate the new training goal.

The mode audit was checked again against first-party Speediance pages, current reference client tool metadata, and the separate public CLI contract. The official original Gym Monster/GM1 page explicitly lists four resistance modes: Standard, Chain, Eccentric, and Constant. Spotter is a separate assistance feature. Thus Constant is a real GM1 device mode; the earlier statement that GM1 availability was unconfirmed was too cautious and is superseded here. Speediance marketing sometimes calls Constant/Fixed Speed “Isokinetic,” but its product wording says constant speed **or** resistance and provides no validation of constant angular velocity. Isometric remains a distinct static contraction type. “ISO” in a GM1 mode discussion can reasonably mean Constant, while the abbreviation alone remains ambiguous outside that context.

The current reference client create/update tool descriptions still expose only `1=Standard`, `2=Chain`, `3=Eccentric` for saved-template Dynamic Weight. GM Coach therefore preserves those three codes and blocks Constant/Fixed Speed, Spotter, Isokinetic, and Isometric from that write field. The conflicting enum in `speediance-cli push` remains a separate contract and is not copied into reference client's field. Having the mode on the device does not mean this MCP can set it in a saved template.

The 1.0.51 source, bundled manifests and package all report `1.0.51+codex.20261001`. `C:\TQ3D\GM-Coach-1.0.51.zip` contains 59 canonical files; packaged `mcp_server.mjs` SHA-256 is `7C7A4F92FE86FA46178556AA77442C29E4C02C8E0EDC21017739FAA16708EFF9`, matching source. Full offline regression command `node --test --test-isolation=none`: **358 passed, 0 failed**. The default sandbox blocked three fixture child processes with `spawn EPERM`; rerunning the same full suite with process-spawn permission passed. Offline tests do not validate firmware behavior or live account writes. The local installer installed 1.0.51 to the plugin root and personal cache. A safe diagnostic reported running MCP `1.0.48`, installed plugin `1.0.51`, and `restartRequired=true`; no live feature test was valid until the exact GM Coach MCP restarted and a new chat loaded it. No Speediance account workout was read or changed.

## Historical source release — 1.0.50+codex.20261001

This release prevents an outcome goal such as fat loss, recomposition, or general weight gain from silently selecting a machine preset. It asks which training stimulus to prioritize (hypertrophy, strength, or endurance), keeps the chosen preset bound to that answer, and rejects a conflicting generated preset. The research gate and the existing plan safety rules remain in place.

Resistance-mode audit: Speediance's original Gym Monster materials call the fourth profile **Constant**; the GM3 page calls its mode **Fixed Speed** and captions an image “Isokinetic mode training with Gym Nano.” This is evidence for the product labels, not evidence that GM1 has identical support, that its output meets a technical isokinetic definition, or that reference client can write the mode. The active reference client template contract accepts only `1=Standard`, `2=Chain`, `3=Eccentric`; GM Coach preserves those values unchanged. The separate public `speediance-cli push` contract uses a conflicting enum (`3=Isokinetic`), so that enum must not be copied into the reference client field. Spotter is assistance; isometric is a contraction style, not a resistance mode. Constant/Fixed Speed, Isokinetic, Spotter, and `ISO` are not accepted as aliases in the reference client saved-template write path. Sources: [official Gym Monster page](https://www.speediance.com/products/speediance-home-gym), [official GM3 page](https://www.speediance.com/collections/functional-trainers/products/speediance-gym-monster-3), [Speediance FAQ](https://www.speediance.co.th/pages/faq), [public CLI mode contract](https://github.com/stozo04/speediance-cli/blob/main/docs/MACHINE_CONTRACT.md).

Release verification: root and bundled manifests and package report `1.0.50+codex.20261001`; the ZIP has 59 canonical files and its `mcp_server.mjs` SHA-256 matches source (`038598B2DEC504A5298905A34744E92F2EFFDA364FA988E9A2F554AA6801F599`). Focused regression command `node --test --test-isolation=none tests\goal-preset-routing.test.mjs tests\smart-rm-server-schema.test.mjs tests\plugin-mcp-config.test.mjs tests\program-payload.test.mjs tests\saved-templates.test.mjs tests\program-serialization.test.mjs`: **89 passed, 0 failed**. Full command `node --test --test-isolation=none`: **357 passed, 0 failed**. The full command needed process-spawn permission for three MCP child-process tests. These are offline contract tests; they do not validate firmware behavior or a live account write.

The latest safe local diagnostic available for this audit reported active MCP and installed plugin `1.0.48+codex.20261001`, `restartRequired=false`. They are older than 1.0.50, so no live feature test was made against that process. No Speediance account data or workout was read or changed.

## Historical source release — 1.0.49+codex.20261001

This release clarifies resistance-mode evidence and prevents the abbreviation ISO from crossing API contracts. Official Speediance pages call the original Gym Monster mode **Constant**, while the GM3 page calls a newer option **Fixed Speed** and captions its image “Isokinetic mode training with Gym Nano.” The product wording confirms those labels exist in Speediance marketing; it does not prove identical support on GM1, a measured isokinetic output, or a writable field in reference client. The active reference client template field exposes only Standard, Chain, and Eccentric. The separate public `speediance-cli push` contract calls numeric mode 3 Isokinetic, so that number must never be copied into the reference client field where 3 means Eccentric. Spotter is an assistance feature; isometric describes a static contraction, not isokinetic mode.

GM Coach references now distinguish device generation, marketing terminology, and integration capability. A regression case rejects `iso`, `isokinetic`, `fixed-speed`, `constant`, `spotter`, and `isometric` as aliases for the reference client mode field. Focused offline test: `node --test --test-isolation=none tests/program-payload.test.mjs` — **27 passed, 0 failed**. Package `C:\TQ3D\GM-Coach-1.0.49.zip` contains **57** canonical entries; root and bundled manifests report 1.0.49, and packaged `mcp_server.mjs` matches source by SHA-256. No Speediance account data or workout was read or changed.

At the time of that release, the live diagnostic reported active MCP `1.0.37+codex.20261001`, installed plugin `1.0.48+codex.20261001`, and `restartRequired=true`. Release 1.0.49 was not live-tested.

## Historical source release — 1.0.47+codex.20261001

The user's definition is explicit: **Smart RM is the named Speediance preset**, such as Gain Muscle or Strength; the goal selects the preset, while `actionLibraryId` independently identifies the exercise variant. The machine-side preset path is the default. Fixed kg and reference client Customize remain opt-in. The matching public reference client payload keeps the preset, repetitions, and RM counter fields separate (`weights=3.5`, `counterweight`/`counterweight2`). This establishes payload shape and visible UI rules; it does not reveal firmware's actual 1RM-to-resistance formula.

This release closes three audit gaps: contradictory saved-set unit signals can no longer be overridden by a user confirmation; an undated 1RM that conflicts with the latest dated candidate now blocks selection; and static-load anchors must match the exact value already stored in the local profile instead of trusting a caller-supplied provenance label. Smart RM descriptions and regression tests assert that the optional preset RM level is independent from reps and RIR and is never derived as `reps + RIR`.

Verification on source **1.0.47+codex.20261001**: full offline suite **354/354 passed**. Four focused files passed **69/69**. `node --test` initially hit Windows `spawn EPERM`; tests were run sequentially in-process, and the two fixture suites that intentionally spawn local MCP processes were rerun with subprocess permission and passed. Fixtures used synthetic data; no account or workout was read or changed. The share ZIP contains **57/57** canonical files, both manifests report 1.0.47, and packaged `mcp_server.mjs` SHA-256 matches source. The installed plugin and active MCP were not updated or live-tested in this pass; the prior diagnostic was stale, so only installation and a fresh-version diagnostic can establish runtime parity.

Historical runtime diagnostic from 2026-10-01 for release 1.0.46: the active server was 1.0.37 with `restartRequired=true`. This record is not a live check for releases 1.0.48 or 1.0.49.

## Historical source release — 1.0.46+codex.20261001

Version `1.0.46` included the earlier reference-client-compatible named Smart RM payload and saved-template edits, goal-to-preset selection, separate exercise-variant resolution, stale-unit/payload approval checks, explicit rep/second interpretation, calendar/reservation safeguards, local coaching profile and equipment confirmation, scientific evidence gates, and cross-platform credential storage. This release also included guarded Vita-level serialization for exercises whose fresh exact catalog metadata says `dataStatType=6`; every Vita level remains separate from its rep/second dose. Completed workout volume is now computed only from completed history with an explicit reps unit, known account unit, per-repetition weights, and a consistent capacity ratio supporting one or two load points. Ambiguous sets suppress the full total. The macOS/Linux required-file list includes both the volume module and its regression test.

Verification for `1.0.46+codex.20261001`: full offline test suite **353/353 passed**. The shareable ZIP at `C:\TQ3D\gm-coach-share-cross-platform.zip` contains **57/57** canonical files; both embedded manifests report `1.0.46+codex.20261001`, it includes `training-volume.mjs` and its tests, and the packaged `mcp_server.mjs` SHA-256 matches source. The Windows updater installed the plugin root and cache at `1.0.46+codex.20261001` and reused the existing Node 24 runtime and Speediance CLI. The active MCP remains `1.0.37` until that exact server process is restarted; Codex Desktop was not stopped or restarted. No live Speediance feature test or write was run through the stale process.

Load policy established in GM Coach 1.0.42 and retained in 1.0.43 (2026-10-01).

## Historical source release — 1.0.43+codex.20261001

This was the source release for the fixes below. Per the user's release-testing rule, test results from 1.0.42 or older are historical only. Live MCP behavior tests were blocked while the installed plugin and running MCP reported older versions or `restartRequired=true`.

- Saved-template action-list edits now validate the public reference client preset rep/RM bounds, require the reference client `weights=3.5` placeholder and matching RM values in both counterweight fields, and reject a mixed static-load/Smart-RM shape. The rule applies even when the preset ID itself did not change.
- Static-load preview and create re-read the account's weight unit. Create recomputes the approved payload; it aborts and asks for a new preview if the unit or payload changed after user approval.
- Workout summaries no longer label Speediance `Capacity` values with kg/lb or report them as tonnage. They expose raw `totalApiCapacity`; `totalLiftedVolume` in `kg·powt.`/`lb·powt.` is calculated only from an explicit set unit, one actual weight value, known account unit, and completed rep count. The aggregate is marked as covering observed weighted sets only.
- Persistent test gate is explicit in `AGENTS.md`: only newest source/plugin/MCP versions are tested, and a stale running MCP is never feature-tested as current.

Verification for 1.0.43+codex.20261001: full offline test suite **333/333 passed**. Root and bundled source manifests plus both manifests in the shareable ZIP report 1.0.43; the ZIP contains 55/55 canonical files and its `mcp_server.mjs` hash matches the source. No Speediance account was read or changed. Live behavior remains unverified: the last recorded diagnostics were installed 1.0.40, active MCP 1.0.37, and `restartRequired=true` before this release existed.

> **Current GM Coach load policy:** New resisted rep-based sets default to machine-side Smart RM by user preference. Public reference client v1.2 UI uses global preset IDs and RM ranges/defaults: Gain Muscle=1, RM 9–13 (default 13); Stamina=3, RM 15–20 (default 17); Strength=5, RM 4–9 (default 7). The matching rep ranges/UI defaults are respectively 8–12/default 12, 13–20/default 15, and 2–8/default 6. GM Coach preserves the user's planned repetitions and applies the selected preset's reference client RM default when `rmLevel` is omitted; an explicit `rmLevel` must fit that preset's RM range. The exercise variant is chosen separately by `actionLibraryId`. The RM field is independent of reps, RIR, and 1RM: do not derive it from them. Serialize with `weights=3.5` plus that per-set RM in `counterweight`/`counterweight2`. These preset ranges/defaults are software UI settings, not scientific findings; training studies do not establish the hidden GM firmware conversion. Never present 3.5 or `rmLevel` as a load or infer kg/%1RM from it. If the goal, work unit, preset, or exercise variant cannot be resolved, stop instead of changing reps or falling back to static weights.
> Static reference client `Customize` / GM Coach `profile-auto` remains available only after an explicit user request. It needs an exact exercise/variant anchor and confirmed account unit; raw workout history is not automatically an anchor. Manual fixed kg also requires an explicit request and a value for every set. Timed work remains in seconds; bodyweight and cardio use separate paths.
> **Parity boundary:** the user-requested GM Coach default deliberately differs from reference client's visible UI default (`Customize` / `templatePresetId=-1`). GM Coach matches the public reference client named-preset serialization, RM bounds, and omitted-level defaults; it does not claim to copy reference client’s full private selection behavior, an undisclosed reps-to-RM formula, or device firmware. The tagged [reference client v1.2 preset rules](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/v1.2/static/workout-logic.js#L10-L35), [preset default handling](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/v1.2/templates/create.html#L848-L854), and [serializer](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/v1.2/api_client.py#L560-L572) support this distinction. They are reverse-engineered community sources, not vendor documentation or evidence for training prescription.

## Global preset selection and conversion validation fix — 1.0.40 (2026-10-01)

The user screenshot showed the old false blocker still appeared: Coach offered Strength but said Gain Muscle had not been confirmed for the particular variants. Version 1.0.39 had added a global menu to the source, but the tool description still required per-variant preset confirmation, its explanatory note explicitly imposed that requirement, and the edit validator still called the removed `hasExactRmPresetPair` function. Also, the global menu disappeared when an exercise had multiple variants and no `actionLibraryId` had yet been selected. Thus 1.0.39 did not solve the reported flow and the active chat was separately observed running 1.0.37.

Version 1.0.40 treats the public reference client menu as global and returns it independently of variant selection. For GM1, names/IDs 1/3/5 are available as Gain Muscle/Stamina/Strength. The exercise `actionLibraryId` remains separately selected and validated against the current catalog. Per-variant `rmCompatiblePresets` now means readback evidence only and cannot suppress the global menu choice. Existing-template edits use the same global-preset check and infer a known public name from a recognized global ID if readback omitted the preset name. User-facing tool descriptions, server note, root README, packaged Skills, and regression tests use the same distinction. The static serializer fixture was corrected from invalid public ID 0 to Gain Muscle ID 1.

Regression coverage checks the global menu when the variant is unspecified, correct and conflicting name/ID pairs, continued independent positive variant validation, the edit validator, tool instructions, and the menu return path. No Speediance account was read or changed by these offline checks. After packaging, the installed MCP process must be restarted to load 1.0.40; the reported 1.0.37 server diagnostics explain why the prior fix was invisible in that chat.

## Prior incomplete attempt — 1.0.39 (2026-10-01)

The screenshot exposed a false blocker: an existing hypertrophy plan showed 12-rep sets, but GM Coach offered only Strength because its catalog-derived options were treated as a per-variant authorization source. The public reference client UI instead presents exercise-level presets with fixed IDs/ranges, while its API serializer takes the chosen preset and exercise variant separately. UI values at commit [`d8869e5`](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/d8869e5aefce960e2ebf3f5de20feb45c6bdb9d5/static/workout-logic.js#L10-L96) are Gain Muscle ID 1 (8–12 reps, RM 9–13), Stamina ID 3 (13–20, RM 15–20), and Strength ID 5 (2–8, RM 4–9). The prompt at [`95ed878`](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/95ed8785c799e321b8b950ce944ce25dbfd91c29/templates/create.html#L662-L677) recommends one repetition in reserve; neither source defines an RM-to-kg formula. The public API serializer stores preset ID, reps, and RM counters separately; it does not explain the app's `22 kg (50%1RM)` display.

GM Coach was intended to return the reference client’s global preset menu separately from raw exercise metadata, and to validate `actionLibraryId` independently. However, its tool description, explanatory note and edit validator still imposed the old per-variant preset requirement, and the menu was omitted until a variant had already been selected. Therefore the 1.0.39 code did not fully fix the reported conversation; these issues are corrected in 1.0.40 below. Its remaining behaviors preserve 8/12 reps and default omitted RIR to the reference client prompt's one-rep-in-reserve recommendation. It refuses to change the goal or reps to fit Strength, refuses static-kg fallback, and blocks unknown units or a missing exact exercise variant before a write.

Regression coverage verifies IDs 1/3/5, variant separation, the old-Strength→Gain-Muscle override, exact 8/12 preservation, 9/13 RM with default 1 RIR, incorrect name/ID pairs, unknown work units, and mode constraints. No live Speediance account was read or changed for these code tests. Public sources are community reverse-engineering, not vendor documentation; this does not verify that firmware renders an RM level as a particular kg/%1RM value on every device.

## User-requested Smart RM default — 1.0.35 (2026-10-01)

The earlier 1.0.33 Customize default matched reference client’s visible UI default but contradicted the user's repeated instruction that ordinary GM Coach plans should use machine-selected resistance and show kg only on request. GM Coach now defaults new resisted, rep-based sets to Smart RM and requires an exact named preset ID for each exercise variant. Its serializer keeps the reference client shape (`weights=3.5`, per-set RM in `counterweight`/`counterweight2`, reps separately). The server rejects silent fallbacks to static `weights`; static reference client Customize and manual kg require explicit request.

This is parity with the public named-preset wire contract, not identical default selection: public reference client starts new sets in Customize. The internal reference client rule for choosing RM and the device's RM-to-load calculation remain unverified. GM Coach requires a direct per-set `rmLevel`; it does not derive the wire value from reps, RIR, or 1RM. No live account mutation is implied by local tests.

## Historical readback regressions fixed in 1.0.30 — 2026-10-01

Some Speediance readbacks omit the preset name even though reference client’s Smart RM
wire fields remain present. Readback now classifies a row as Smart RM only when
it has a non-Custom preset ID, aligned per-set repetitions, the reference client marker
`weights=3.5`, and matching integer RM values in both counterweight fields.
It reports the observed preset ID and RM level without inventing a name. A
non-Custom preset that does not match this complete shape stays unknown and is
never shown as kg/lb. `templatePresetId=-1` remains the reference client Customize path,
whose `weights` can be shown in the account unit. Regression tests cover the
write/read round trip with a name-less reference-client-style row. An explicit Custom
row with zero resistance is displayed as having no external machine load;
zero is not decorated as `0 kg`, which made warm-up and stretching rows look
like loaded exercises.

> **Parity scope:** The private remote reference client implementation is not present in this repository and is not fully inspectable. This audit records its exposed contract and the public `static/workout-logic.js` rules plus user-provided examples. Payload/readback parity does not prove the firmware's internal resistance calculation or behavior on every model.

## Historical saved-plan unit display and endpoint parity — 1.0.31 (2026-10-01)

The user-provided saved-plan read exposed that `countType=2` can appear on both a
timed set and a repetition set. The saved-template resolver now treats the
per-set `completionMethod` as authoritative when recognized: observed saved-plan
reads use `0=seconds` and `1=reps`, while the reference client write serializer uses
`1=reps` and `2=seconds`. `countType` and `selectCompletionMethod` remain
metadata, and catalog `countType` is not used to label saved work units. A
conflicting explicit unit remains unresolved. Workout-history records retain
their own normalizer and are not decoded with the saved-template rule.

The create-readback verifier now compares the semantic dose unit instead of
requiring raw `completionMethod`, `countType`, or `selectCompletionMethod` codes
to match across endpoint formats. It still requires all structural fields and
the reps-versus-seconds interpretation to match; unknown units remain
unverified. Regression coverage reproduces the saved-plan combination of
`countType=2` for both time and reps and confirms that a wrong unit is rejected.

No template was created or changed in Speediance during this repair. The old
plan shown in the chat remains the same saved plan. The full suite passed
**307/307 offline tests**. A fresh chat loaded GM Coach 1.0.31, confirmed the
active `gm_coach_local` connection, and displayed the saved plan with seconds and
repetitions. That check only read the saved plan; no account write was made.

## Historical Smart RM conversion and profile-anchor parity hardening — 1.0.32 (2026-10-01)

Old saved plans converted to Smart RM now explicitly serialize the repetition
completion fields in the reference client write format, even when the source plan used
the separate saved-read format. The write/read verifier checks semantic units,
so endpoint-specific codes cannot silently turn reps into seconds or reject a
valid round trip. Conversion still requires a positively resolved rep unit and
the exact named preset paired with the exact exercise variant; it does not
guess a preset from an ID alone.

Static `profile-auto` 1RM estimates from a user-confirmed working set now include
known RIR (`effective reps = completed reps + RIR`). If RIR was not supplied,
the estimate labels the explicit 0-RIR assumption. A caller-provided
`referenceClientCrossChecked` flag is metadata only and cannot authorize a custom curve
point or override the local runtime table. Existing user-confirmed 1RM/e1RM
anchors remain exact and do not use working-set estimation.

The focused 1RM/unit/preset/conversion tests passed **79/79**; the full offline
suite passed **308/308**. A prior fresh-chat test verified only saved-plan
readback, not conversion or plan creation. No Smart RM conversion or other
write was made to the user's Speediance account.

## Scope

This audit compares the GM Coach workspace source with the reference client tool contracts
available in the current Codex session and the public reverse-engineered Speediance
clients linked in the README. It does not call reference client or verify writes on a
physical machine. One read-only saved-template check was performed in a new GM Coach
1.0.31 chat with the user's authorization; automated tests use local fixtures. Tool
descriptions are treated as stated contracts, not as proof of the remote
implementation.

## Historical v1.0.25 default-preset audit snapshot (superseded) — 2026-09-30

This section records the previous preset-default policy before the Customize auto-fill change. Its dated findings remain history only; the current contract above takes precedence.

- Removed a conflicting final rule in the root `SKILL.md` that told the coach to
  default to static reference client `Customize`, even though the rest of the plugin and
  the user's stated preference select machine-side preset RM by default. The
  root skill now matches the MCP initialization instructions and the dedicated
  Speediance coaching skill. Manual fixed kg remain opt-in; reference client `Customize`
  remains a separate explicit-load path.
- Added a regression assertion to `smart-rm-server-schema.test.mjs` so a future
  edit cannot reintroduce the contradictory root-skill instruction.
- The MCP `serverDiagnostics` contract distinguishes the version loaded by a
  running process from the installed version. `restartRequired=true` means the
  running process must be restarted to load current tool instructions; it is not
  evidence of expired Speediance credentials. Connection status and CLI history
  access are separate checks.
- Public reference client comparison was rechecked against `static/workout-logic.js`,
  `workout_gen.py`, and `api_client.py` in `labatt/speediance-smartgym-workout-manager`.
  Preset payloads use `weights=3.5` and a per-set RM value in both counterweight
  fields. Custom weights are written verbatim in the account unit. reference client’s
  preset `RM` input is not an exposed percent; the public source does not define
  Coach's `reps + target RIR` rule or the machine firmware's conversion.

## Current reference client contract and Coach alignment status

| Area | GM Coach behavior | Parity |
|---|---|---|
| Named preset and per-set RM | Default machine-side load uses goal-bound global Gain Muscle=1, Stamina=3, Strength=5 independently of catalog variant. Public bounds/defaults remain serialization metadata; the model must not prescribe raw rmLevel from reps/RIR/percent. New writes require fresh consented explicit account 1RM presence keyed by groupId. weights=3.5 and both RM counters are wire fields. | Public preset/wire semantics covered by current code/tests; physical load calculation remains unverified. |
| reference client Customize / Coach profile-auto | Explicitly requested static per-set loads use a qualified groupId anchor and confirmed account unit. Explicit variant metadata narrows scope only when the anchor supplies it. Raw history is not an automatic anchor. Observed assessment suggestion selects min(reps+1,20) and rounds whole account units. | Full reported 1–20 table is preserved; private history resolver and physical behavior remain unverified. Do not silently replace Smart RM. |
| Account-unit handling | Default Smart RM needs no kg/lb unit. An explicit static Customize or fixed-kg request needs confirmed unit/anchor as applicable. Never label RM or `weights=3.5` as kg. | Missing or conflicting unit blocks static weights; it does not imply disconnection. |
| RM selection | Named preset choice follows goal. Public preset default is internal serialization metadata, independent of physiological RIR; compatibility parser may accept in-range raw integers, but the coaching workflow does not ask the model/user to choose them. | Public fields/defaults do not establish a physiological reps/RIR-to-RM formula. |
| Exercise-specific anchor | Coach can use an exact exercise-specific 1RM/e1RM from a supported profile/statistics source, or an explicitly user-confirmed current working set with load, reps, and unit; RIR if known. Ambiguous or unsupported data are rejected. A working-set estimate is based on the entered set, not automatic history selection. | Missing or ambiguous anchor stops with `needsAnchor`. This does not claim exact parity with private reference client anchor-selection rules. |
| Exercise history and session detail | History can inform coaching context when the user authorizes its read, but raw workout-history rows do not automatically qualify as a load anchor. Do not infer working-set status or load from an unmarked `topWeight`. | History-to-anchor fallback is not implemented; this audit did not access user data. |
| Rep-max curve coverage | Exact full universal 1–20 table was captured in the earlier authorized reference client strength-profile comparison. Direct lookup and the separate next-step assessment suggestion adapter are distinct. No interpolation/extrapolation beyond20. | Observed software evidence; lb and odd-half tie boundaries are synthetic, and universal table is not exercise-specific VBT or private history resolver proof. |
| Display unit | The strength profile reads `displayUnit` from Speediance `/app/userinfo` on every request and labels its source; it does not need to fetch exercise/workout history for this field. | Matches the reference client display-unit source without mixing account settings and training history. |
| Unknown work-unit confirmation | Saved-template reads normalize each set to `reps`, `seconds`, or `unknown` and render known values as `8 powt.` / `30 s`. An explicit answer is stored only in the selected local GM Coach profile and bound to the exact program/action/set, raw dose, and unit-signal fingerprint. It resolves only unknown values; a known API unit always wins. | A later chat can reuse a matching confirmation without asking again. Edits to the dose or API unit signals invalidate the saved answer. |
| One-plan display-unit confirmation | When an API response says `unit=unknown` and the user directly confirms the display unit, pass the same `confirmedDisplayUnit` to preview and create. Send it only while the API unit is unknown; never persist it to the local profile. | The API unit always wins; the confirmation applies to one plan only. |
| Undated strength statistics | Explicit named 1RM/e1RM candidates with an inherited user-confirmed account unit retain that unit's provenance. One unique candidate may be used after the user approves it, while the output flags that no date was returned; equal-rank conflicting values remain ambiguous. | Does not mistake first-returned for newest and does not repeat a consent question after approval. |
| Exercise equipment | Preview and create compare every planned exercise's catalog accessory IDs with a confirmed Speediance inventory or the same ephemeral/user-confirmed profile answers. The exercise catalog now also enriches `mainMuscleGroupName` from `/app/actionLibraryGroup/list` in chunks of up to 50. | Accessory ownership remains conditional on account fields. Main muscle group is source-backed; secondary groups, cable height, and bench angle remain unavailable/unverified and must not be inferred. |
| Coaching interview | The one-time audit now requires a goal, experience/history, sessions per week, an explicit session duration or unknown/declined answer, a weekday schedule or flexible/unknown/declined answer, equipment, constraints, and recovery/nutrition responses or opt-outs. | Improved; machine data and optional health-feed fields still depend on what the API returns and what the user shares. |
| Per-set effort target | All rep-based resistance sets now require a separate RIR target and matching research decision; timed work and cardio do not. | Runtime and schema are aligned; RIR is the coach's target, not a device measurement. |
| Research gate | Live PubMed provenance, categories, exact abstract excerpts, and per-decision semantic declarations are checked during preview and save. | **Not deterministic proof of scientific support.** The local validator cannot verify the truth of an LLM assessment against the cited study. |
| Athlete/recovery snapshot | Coach can expose local coaching facts and training context. The full reference client snapshot fields for muscle recovery, wearable HRV/sleep, training status, and activities imported from a phone are not reproduced. | Partial. |
| Resistance modes | The GM1 device itself has four resistance modes (Standard, Chain, Eccentric, Constant); Spotter is separate assistance. The reference client saved-template input still exposes only 1=Standard, 2=Chain, 3=Eccentric. Coach passes those codes unchanged and does not translate through the conflicting `speediance-cli push` enum. Speediance marketing uses “Isokinetic” for Constant/Fixed Speed, but does not establish constant angular velocity. | Updated in 1.0.51 after rechecking the official original-GM page and current tool metadata. Offline regression rejects Constant/Fixed Speed, Isokinetic/ISO, Spotter, and Isometric aliases from the reference client template mode field; this is a write-path restriction, not a claim that GM1 lacks Constant. Readback does not verify physical behavior. |
| Credential isolation | OS keyring entries are namespaced by normalized plugin data directory, profile, and secret slot; absolute paths are hashed and not included in keyring labels. No global legacy-key migration is performed. | Prevents two local plugin data roots with the same profile key from sharing credentials. An older install may need credentials saved once more through its local setup form. |
| Supersets | Coach accepts typed blocks with a confirmed shared setup and serializes interleaved single-set rows with transition and between-round rests. Bodyweight mat members can pair with one confirmed machine setup. The API has no separate group ID. | Payload-level behavior matches the reference client contract; no live device display check in this offline audit. |
| Cardio and Pilates | Row/Ski is load-free and records duration and intensity tags in the plan name. reference client's visible input contract accepts Pilates `bands` levels 1–6, but neither the inspected public speediance-cli program contract nor the GM Coach API payload confirms how to serialize them. Coach now rejects Pilates band requests and prevents Pilates-category exercises from falling through to profile-auto, named presets, or fixed kg; unresisted bodyweight Pilates remains supported. | Cardio is partial; Pilates bands are explicitly unsupported pending a confirmed wire contract. |
| Templates and calendar | Current create/edit paths require template readback; calendar scheduling requires fresh calendar readback and exposes calendarReadbackVerified. Reviewed full-cycle execution uses durable checkpoints and preserves uncertain mutations for reconciliation. | Stored fields/date verification covered offline; data=true alone is not success. Not an atomic whole-cycle transaction or physical execution proof. |
| Device models | Program writes are enabled only for Gym Monster 1 (`device_type=1`). Other models can be inspected but writes are blocked. | Intentionally partial; public CLI documentation says GM1 is tested and GM2 is unverified. |

## Current load-path clarification

Nowe ćwiczenia oporowe na powtórzenia domyślnie używają nazwanego presetu Smart RM dobranego do celu i dokładnego wariantu. Reps oraz RIR pozostają osobnymi, widocznymi elementami dawki. Nie wymagaj raw `rmLevel` od modelu ani użytkownika. Gdy narzędzie nie przekazuje poziomu, adapter GM Coach stosuje widoczną w publicznym UI klienta referencyjnego wartość startową presetu: Gain Muscle 13, Stamina 17, Strength 7. Zakresy tych suwaków to odpowiednio 9–13, 15–20 i 4–9. Te wartości i granice są ustawieniami interfejsu, nie zaleceniem naukowym. GM Coach przekazuje techniczny licznik w polach `counterweight`/`counterweight2` razem z `weights=3.5`; nie wyprowadza go z reps, RIR ani 1RM i nie pokazuje jako dawki, kg lub `%1RM`. Publiczny serializer nie dowodzi identyczności z aktywnym MCP klienta referencyjnego ani algorytmu firmware. Jeżeli preset, jednostka serii lub ID wariantu nie są potwierdzone, zatrzymaj zapis. klient referencyjny `Customize`/Coach `profile-auto` jest dostępny na prośbę z dokładną kotwicą i jednostką; stałe kg wymagają również prośby. Serie czasowe pozostają w sekundach, bodyweight i cardio mają osobne ścieżki.

Odczyt zwrotny potwierdza zapisane pola, nie działanie firmware. Ten audit nie odczytywał danych Speediance użytkownika.

## Historical v1.0.26 curve coverage repair and verification — 2026-09-30

- `profile-auto` and `gm_coach_suggest_load` now use exact declared local points for all supported reps 1–20, so common strength, hypertrophy, and endurance ranges no longer stop at 5/8/12. The code does not interpolate or extrapolate.
- Only 5=87%, 8=80%, and 12=67% are independently cross-checked with the visible reference client contract. Other table values remain local fallbacks; the audit does not claim that they exactly match the private reference client implementation. A supplied custom value that differs from the table requires `referenceClientCrossChecked=true`.
- Full offline regression suite: 300 tests passed, 0 failed (`node --test --test-reporter=tap tests/*.test.mjs`). No Speediance account history or reference client user tools were accessed during this change.

## Historical remaining-work status snapshot (v1.0.26) — 2026-09-30

The items below preserve the open-work list as it stood in the v1.0.26 audit. They are not a current task list; consult the current alignment matrix above for present status.

1. History-to-anchor selection remains unimplemented. Do not describe raw workout history as an automatic load source. If adding it later, first establish the private reference client’s top-set selection, warm-up exclusion, tie-breaking, freshness window, exact exercise mapping, unit handling, and rep-max calculation from synthetic/non-user examples; do not read live user data for this audit.

   Required redacted evidence before implementing this fallback: a synthetic/non-user history fixture with dated warm-up and working sets, exact exercise/variant IDs, reps/count type, load/RIR/unit, and a matching reference client output showing selected anchor and static `weights`, plus tie, stale-record, and rounding behavior. Never use live user records to complete this offline audit.
2. Obtain an authoritative Speediance/reference client wire payload for Pilates `bands` and verify a round-trip before implementing serialization. The public [speediance-cli machine contract](https://github.com/stozo04/speediance-cli/blob/main/docs/MACHINE_CONTRACT.md) describes program action fields such as reps, weight, mode, and rest, but does not identify a band-resistance field. GM Coach intentionally fails closed and does not claim band-write parity.
3. Validate every default `Customize` rep-max table point, per-exercise anchor priority, and rounding against public source code and redacted non-user reference client examples. Current direct cross-checks cover only 5/8/12 reps; the rest remain documented local fallbacks, not confirmed reference client parity. The payload must contain static `weights` in the account unit without conversion; curve points do not populate the RM fields. If the exact remote version or point cannot be independently confirmed, document that limitation rather than claiming firmware parity.

4. Verify writes and readbacks for GM2/GM2S before enabling those model types.
5. Refresh the MCP server and start a new chat when an already-open chat has a stale
   tool catalog. An old chat does not acquire newly registered tools retroactively; the
   desktop application itself does not need to be restarted. A fresh local test chat on
   2026-09-30 successfully discovered `gm_coach_search_training_research` and got a
   response without reading an account or workout history.
6. Add reservation-calendar readback when the supported endpoint and response shape are verified; current success means only that the API returned its documented boolean acknowledgement.
7. Verify default Customize auto-fill with synthetic/non-user fixtures for exact exercise-specific 1RM/e1RM or explicitly confirmed working-set anchors. History-based anchor selection is not implemented. Separately verify that all 1–20 table points remain exact, that only 5/8/12 are labelled cross-checked, and that `referenceClientCrossChecked` cannot authorize custom points. Preset RM is transmitted only after explicit request and remains separate from the Customize load path. Readback and device observation do not prove parity across all firmware versions/models.

8. Strengthen research validation: current PubMed batch/source/excerpt checks prove
   provenance and completeness, while per-source `sourceAssessments` remain LLM
   declarations the local validator cannot prove against the cited abstract.
9. Align intake requirements with the requested interview: each profile must record an
   explicit per-session duration (or explicit unknown/declined answer) and training-day
   availability before a first plan. This gate is implemented in workspace source;
   running MCP processes must restart to use the change.
10. Weighted timed sets do not have a verified RM calculation/serialization path.
    Do not derive load from seconds or invent a rep-max conversion; support this only
    after both the payload and evidence model are verified.

## Historical Pilates band payload check (2026-09-30)

The visible reference client tool contract accepts `bands` levels 1–6 as input. The public
[`speediance-cli` machine contract](https://github.com/stozo04/speediance-cli/blob/main/docs/MACHINE_CONTRACT.md)
lists program action fields such as `reps`, `weight`, `mode`, and `rest`, but does not
document a Pilates band-resistance field. This is an absence of a confirmed mapping,
not proof that no private or app-internal field exists. GM Coach accepts a marker only
to return an explicit fail-closed diagnostic; it never writes a guessed `bands` field
and does not map it to profile loads, presets, fixed kg, or bodyweight. Pilates-category
exercises are checked against the actual catalog category before program payload
preparation; only unresisted bodyweight Pilates is allowed. Offline regression tests
cover the rejected paths. No account, credentials, or live device round-trip was used.

## Historical additional safety and evidence updates (2026-09-30)

- Injury limitations now pass through a shared validation gate at both preview and
  save. It combines the saved profile with the current interview answers and checks
  catalog-resolved exercise names plus included warm-up and stretching items. A clear
  movement conflict blocks the plan; ambiguous restrictions require clarification.
  This is a conservative name-based screen, not medical diagnosis or clinical advice.
- Cardio planning now maps exercise choice to aerobic modality evidence, cardio
  intensity to aerobic intensity evidence, and work/recovery duration to aerobic
  work-rest evidence. Mixed plans require both resistance and aerobic evidence where
  a decision applies to both. PubMed source checks validate provenance and category
  coverage; they do not prove that an abstract semantically supports a claim.
- Template creation now stops at the documented 50-template capacity and reports the
  count after readback. It never removes a template automatically.
- Plan preview and save now revalidate each planned exercise against the account's
  selected accessories or the user's identical ephemeral/local confirmation. Unknown
  ownership and incomplete exercise accessory metadata stop the plan for a question or
  a catalog-confirmed alternative. This does not infer equipment ownership from the
  global accessories catalog.
- The local config was inspected without account access: `gm_coach_local` and the
  GM Coach plugin are enabled, and the installed copy is v1.0.11. Its global MCP
  entry points at the installed GM Coach server and has the expected two environment
  variable names. The installer nevertheless reported a name conflict and kept the
  entry unchanged; that warning's cause remains unresolved. GM Coach tools are visible
  in this audit chat. A separate chat reporting no tools indicates a server/catalog
  availability problem for that chat, not proof that the Speediance account is disconnected.
  A newly created local test chat on 2026-09-30 discovered and called
  `gm_coach_search_training_research` successfully; that confirms fresh-chat MCP
  discovery without confirming account or workout-history state.

Source version `1.0.11+codex.20260930011908` includes the equipment gate, Pilates
fail-closed checks, injury gate, cardio-evidence categories, template-capacity handling,
and regression coverage. Offline tests pass 247/247 across 28 files. The MCP process test now checks `initialize`, confirms `tools/list` exposes
connection/history/program tools, then verifies a fresh process identity after a
restart. The direct package smoke check used an empty temporary data directory and
`initialize`/`tools/list`; it did not call account tools.

Installed v1.0.11 is present under the user-level GM Coach folder. The plugin and
`gm_coach_local` are enabled, and the configured command points to the installed
server. The installer kept a recovery copy because old files were still open; it did
not stop or restart Codex Desktop. Restart only `gm_coach_local` from Settings → MCP
servers, then start a new chat to refresh its tool catalog. Keep the recovery copy
until that server has released the files. The separate install-time name-conflict
warning still needs diagnosis if it recurs.

The package is saved as `C:\TQ3D\gm-coach-share-cross-platform.zip`. Superseded
1.0.6 ZIPs were removed; the marketplace source backup was preserved.

The safe superset serializer has been added and unit-tested since the first audit draft.
It expands each round to A/B (or A/B/C) rows and uses a 1-second minimum transition
because the API does not persist zero-second breaks. The API has no separate superset
group ID, so application UI grouping remains unverified.

## Test boundary

The Node test suite uses synthetic/offline fixtures. It does not sign in, query a user's
Speediance history, or create/edit a real workout. A successful test run validates local
logic and fixture behavior only; it is not a live-account or hardware integration test.

## Historical MCP installation incident and verification (2026-09-29)

The v1.0.7 package omitted `unit-interpretation.mjs`, a runtime import of
`workout-data.mjs`. As a result, the installed MCP server failed during startup with
`ERR_MODULE_NOT_FOUND`, and another chat could not discover any GM Coach tools. Version
v1.0.8 adds the module to the canonical package manifest and both platform installers,
and adds a regression test that checks every reachable local `.mjs` import against all
three file lists.

The v1.0.8 package was installed and the installed server was started with an empty,
temporary data directory. Its MCP `initialize` and `tools/list` requests succeeded and
returned 30 tools, including connection, workout-history, and program-creation tools.
This validates package startup and tool discovery only; no credentials, account history,
or workout writes were used. The full offline test suite passed (24 test files). For an
already-open chat with a stale catalog, restart only the `gm_coach_local` MCP server and
open a new chat; do not restart Codex Desktop.

## Historical Smart RM alignment snapshot — 1.0.15 (superseded)

Source package: `1.0.15+codex.20260930034354`.

- reference client's documented default Customize path is represented as `profile-auto`.
  The legacy `smart-rm` input aliases this same path. Each rep-based set requires an
  exact exercise 1RM/e1RM or confirmed working-set anchor; Coach calculates a
  per-set load and writes it to the custom `weights` field. Fixed kilograms stay
  opt-in. This matches the inspected reference client tool contract and payload shape; it is
  not proof of live device behavior or automatic recalculation after future 1RM changes.
- The previous invented `rmLevel` payload field is removed from new program
  planning and saved-template conversion. The current optional preset path may put
  `reps + target RIR` into the documented counterweight RM fields; it does not use
  an `rmLevel` field. RIR remains a coaching target.
  Named tablet presets are distinct from Customize and are not silently selected.
- The locally verified reference client curve values are only 5 reps = 87%, 8 = 80%, and
  12 = 67%. Other rep counts fail closed until independently confirmed. A stored
  template is static; a later profile 1RM change does not update its loads.
- Corrected stale MCP tool text that described Smart RM as preset counterweight
  levels, and updated the related manifest assertion.
- Calendar writes have a durable local pending-operation journal. If a write's
  outcome is uncertain, the same mutation key is blocked after MCP process restart
  to reduce duplicate reservations. Calendar readback remains limited by the
  reverse-engineered response contract.
- Research decisions now require one individual assessment for every cited
  evidence ID. This validates the structure and source linkage; it cannot establish
  that an LLM's interpretation of the abstract is scientifically true.
- Full offline test run: 260/260 pass. The default sandboxed run initially blocked
  the process-restart diagnostic test (`spawn EPERM`); that isolated test then passed
  with permission to start its local child process, and the complete suite passed
  afterward. Direct stdio verification also succeeded: `initialize` reported the
  packaged version and `tools/list` returned 30 tools.
- The MCP smoke check used no account tools and read no credentials, profile,
  workout history, or machine state. It verifies server startup and catalog output,
  not Speediance connection state.
- The installed plugin manifests were both at v1.0.13 at audit time, while the
  process previously reported by the affected chat was v1.0.8. This is consistent
  with a stale running MCP process/tool catalog. Updating plugin files alone does
  not refresh an already running process or an existing chat; restart only
  `gm_coach_local` in Settings → MCP servers, then open a new chat. Codex Desktop
  itself should not be restarted.

## Historical post-install verification — 1.0.14 (2026-09-30)

- The user-level GM Coach plugin and Personal plugin cache now contain
  `1.0.14+codex.20260930032337`. The shareable cross-platform ZIP was rebuilt from the canonical
  manifest, and the packaging script verified every archive entry against its
  source file hash.
- The current `codex mcp list --json` entry for `gm_coach_local` is enabled and
  matches the installed Node runtime, GM Coach server path, Speediance CLI path,
  and the single existing GM Coach data directory. The installer printed a
  name-conflict warning during this update, but the post-install configuration
  check is exact; the warning itself remains unexplained.
- Running the installed server directly reported `1.0.14+codex.20260930032337` and 30 tools,
  including account connection, workout history, session detail, and program
  creation. The connection/account tools were listed only; none were called.
- The installer retained an old-file recovery copy because Windows reported that
  those files were still open. Keep that small backup until `gm_coach_local` has
  been restarted and the new version is confirmed active. No Codex Desktop restart
  was performed.

## Historical final verification — 1.0.15 (2026-09-30)

- Corrected remaining MCP descriptions that had advertised an unverified 1–20
  Customize curve or implied that Pilates band resistance could be saved. Tool
  descriptions now match the enforced behavior: only 5, 8, and 12 reps have
  verified automatic %1RM values; Pilates bands are conversation-only until a
  writable API field is confirmed. Regression assertions cover these descriptions.
- The complete offline suite passes 260/260 tests, including MCP process identity,
  units, Smart RM, saved-template conversion, evidence gates, and calendar recovery.
  All edited JavaScript modules pass `node --check`.
- The final share ZIP was rebuilt and hash-checked from the canonical file list.
  The installed plugin root and Personal cache are both `1.0.15+codex.20260930034354`; direct
  startup of the installed MCP reports this version and lists 30 tools.
- The current global `gm_coach_local` entry is enabled and points to the installed
  runtime, server, CLI, and existing data directory. The installer printed a
  name-conflict warning, but the post-install inspection found this entry's paths
  and environment-key set to be exact.
- Four older installer backups were removed, freeing about 359 MiB. One 1.0.8
  backup could not be removed because Windows denied access to its bundled
  `node.exe`; the 1.0.13 copy is retained as the newest rollback until MCP is
  refreshed. No Speediance account data was in the removed plugin-code backups.
- Three GM Coach Node processes were visible after installation. Their tool
  catalogs are process-local, so already-open chats may still retain a stale
  registry. The Codex CLI has no MCP restart command; use Settings → MCP servers
  to restart only `gm_coach_local`, then start a new chat. Codex Desktop itself
  was not restarted.

## Historical MCP visibility follow-up — 2026-09-30

- The installed source and user-level plugin files both report
  `1.0.15+codex.20260930034354`; SHA-256 checks matched for `plugin.json`,
  `mcp_server.mjs`, and `SKILL.md`. `codex mcp list --json` shows the global
  `gm_coach_local` stdio server enabled and pointing at those installed files.
- `mcp_optional_startup_grace_ms = 5000` is already set. `codex mcp --help`
  exposes list/get/add/remove/login/logout, but no server restart command.
- In the affected older conversation, its own history shows GM Coach tools were
  absent even after another check in that same conversation. That chat had loaded
  the older 1.0.6 skill; adding or refreshing an MCP server does not add a tool
  catalog retroactively to an already-created chat.
- In the current audit conversation, `speediance_list_accounts` and
  `speediance_check_connection(profile="configured")` both succeeded. The server
  reported `1.0.8+codex.20260929205458` and instance ID
  `819c5f2025a693625a81d05e`, while the installed files are 1.0.15. The API
  connection result was `connected: true`, region EU; workout-history access was
  `not_checked`. This confirms an older process is still serving this session and
  the account is not shown as disconnected. It does not verify workout-history
  access or the affected older chat's tool catalog.
- The diagnosis is therefore two separate stale states: an old MCP process and
  an old chat tool catalog. The safe refresh is Settings → MCP servers → Restart
  for only `gm_coach_local`, followed by a **new** chat and `/mcp` verification.
  Do not restart the Codex Desktop application. This report does not claim that
  the MCP restart has been performed.

## Historical exercise-catalog metadata follow-up — 2026-09-30

- The upstream `speediance-cli` implementation batches IDs to
  `/app/actionLibraryGroup/list` and reads the returned `mainMuscleGroupName`.
  GM Coach now enriches its existing catalog from that same field, preserving the
  existing exercise IDs and accessory metadata. Missing, conflicting, unavailable,
  or unrequested enrichment is surfaced as a status; names are never used to infer
  a muscle group. See [upstream library implementation](https://raw.githubusercontent.com/stozo04/speediance-cli/main/internal/template/library.go).
- Regression cases cover successful enrichment, missing/unavailable/conflicting
  fields, and chunking. Secondary muscles, cable height, and bench angle still have
  no verified source contract in the inspected data and remain intentionally absent.

## Historical MCP refresh follow-up — 2026-09-30

- Updated GM Coach 1.0.16 in the local Codex plugin and Personal marketplace.
  The installer reused the existing Node 24 runtime and Speediance CLI; local
  account data remained in its separate data directory.
- The configured `gm_coach_local` entry is enabled and points to the Personal
  GM Coach package cache at 1.0.16. The live process in this chat still reports
  1.0.8 (`819c5f2025a693625a81d05e`), so it has not yet loaded the updated files.
- `speediance_list_accounts` found profile `configured` ready. A fresh authenticated
  API check returned `connected: true` for EU. Workout-history access remains
  `not_checked`; this does not verify CLI history access or the missing tool
  catalog in the screenshot's old chat.
- The screenshot's answer reflects a chat without the GM Coach MCP tool catalog;
  it is not evidence of logout. The existing chat catalog does not update in
  place. Restart only `gm_coach_local` under Codex Settings → MCP servers, then
  open a new chat and verify `/mcp`. The MCP restart has not been performed from
  this shell session, and Codex Desktop was not restarted.
- The installer previously described every unverified existing name as another
  server. Its warning now states only that the entry could not be verified and
  was left unchanged, which is accurate for both an actual conflict and an
  app-managed GM Coach cache entry.

## Historical load-path snapshot: Smart RM, unit inference, and evidence-gate audit — 2026-09-30 (superseded)

The load-path notes in this dated snapshot describe an earlier implementation and
are superseded by the current contract at the top of this file. Keep them as change
history only; do not treat the old static-table behavior as the current reference client target.

- GM Coach `1.0.17` calculates a static per-set load from the exact exercise
  anchor and the declared 1–20 rep-max runtime table without interpolation.
  Goal ranges choose planned repetitions; RIR stays separate. Only 5=87%,
  8=80%, and 12=67% are independently cross-checked against the visible
  reference client contract. Other table entries are runtime inputs, not values
  independently verified against reference client or a goal-specific research curve.
- Rep-based Customize serialization now rejects counts outside 1–20 at the
  boundary. A missing anchor or an unsupported point returns a structured
  question instead of leaking `RangeError` or inventing a percentage.
- Aligned reverse-engineered `completionMethod`/`countType` values 1 and 2 are
  surfaced as `api-code-inference` (1=reps, 2=seconds) with an unofficial-map
  warning. Conflicting values, unsupported codes, and arrays misaligned with
  the set count remain `unknown`. Program writes still require explicit units.
- Raw `recent-history` anchors are rejected during plan normalization, before
  a preview can be created. The history-to-anchor fallback remains unimplemented
  until a redacted reference client/API fixture confirms work-set selection and the exact
  estimate method; no personal workout history was read for this audit.
- Every cited PubMed source now requires its own assessment for `applied` and
  `not_used` decisions. Duplicate PMID rows are rejected so one paper cannot be
  counted as multiple sources. The gate validates provenance, categories,
  excerpts, and assessment structure, not the semantic truth of an assessment.
- Verification: **273/273 tests passed** across the full suite; syntax checks
  passed for 54 JavaScript modules. The portable ZIP was rebuilt at
  `C:\TQ3D\gm-coach-share-cross-platform.zip`; the packager verified all 49
  entries against their source SHA-256 hashes. Cross-platform installer scripts
  were statically inspected; macOS/Linux installation was not executed here.

## Historical v1.0.18 intake, installer, and live-server follow-up — 2026-09-30

- The first-plan interview now requires an explicit priority-muscle answer for
  hypertrophy goals, including `none`, `unsure`, or `decline`. Training age by
  itself no longer passes the training-history section; users can state that
  history is unknown, unavailable, or declined. A claimed Speediance review
  needs a history summary/current-program note.
- Windows and POSIX installer cleanup now attempts each temporary path
  independently and preserves the original error. Setup guidance distinguishes
  the bundled MCP server `gm-coach` from the global server `gm_coach_local`.
  It directs users to restart only the server loaded in that chat, then open a
  new chat; it does not direct them to restart Codex Desktop.
- Verification: **278/278 tests passed**: 275 tests in 28 files in the regular
  run and 3 MCP child-process diagnostics in the elevated run. Changed
  JavaScript files passed `node --check`, and the PowerShell installer passed
  parser validation. No bundled Bash interpreter was available in this Windows
  environment, so macOS/Linux installer execution remains unverified.
- `scripts/package.ps1 -Overwrite` produced the cross-platform ZIP with 52
  files and verified each entry against the source SHA-256. Windows installation
  of `1.0.18+codex.20260930063808` completed; the plugin was added from the
  Personal marketplace. The user-level `gm_coach_local` entry already existed
  but its identity could not be verified by the installer, so it was left
  unchanged. A later read-only `codex mcp list --json` comparison found the
  enabled entry's server, CLI, data, environment, and cwd fields match the
  current installation; that verifies saved configuration, not the running
  process. One old code backup remains because Windows reported that files
  were open; it is a recovery copy, not account data.
- A fresh GM Coach-only metadata/API check returned profile `configured`,
  `credentialStatus=ready`, `connected=true`, and region EU. It reported
  `workoutHistoryAccess=not_checked`; no workouts, calendar, equipment, or
  other training history were read. The running MCP instance still reports
  `1.0.8+codex.20260929205458` and instance ID `819c5f2025a693625a81d05e`,
  while both installed plugin directories report `1.0.18`. This is a stale
  running process, not evidence of account logout. Restart only
  `gm_coach_local` in Codex Settings → MCP servers, then open a new chat. This
  report does not claim the MCP process was restarted.
- Remaining parity limitations: only the 5-, 8-, and 12-repetition Smart RM
  table entries are independently matched to the visible reference client contract;
  other table entries and goal-specific curves are not verified against it.
  No history-to-anchor fallback is enabled without a redacted fixture proving
  work-set selection. Calendar reservation acknowledgments lack a confirmed
  readback shape. Automatic device detection and non-GM1 writes are unsupported.
  Public accessory/unit mappings remain unofficial; resistance-mode readback
  confirms stored codes, not hardware behavior. Warmup/stretch notes are not
  confirmed in Speediance's template storage. The research gate checks source
  provenance and assessment structure but cannot prove semantic correctness.

## Historical v1.0.19 reference-client-style saved-set unit normalization — 2026-09-30

- Saved-template normalization previously gave the exercise-library `countType`
  equal weight with fields attached to the saved action. A timed action could
  therefore become `unknown` when the generic catalog said repetitions.
- GM Coach now resolves consistent per-action/per-set signals first and uses
  catalog `countType` only when the saved action has no unit signal. A mismatch
  stays visible in `unitEvidence`/`unitWarning`; conflicting or malformed fields
  within the action still remain `unknown`. The raw `selectCompletionMethod`
  payload field is preserved as metadata and never treated as the work unit.
- The tool description directs chats to use the normalized `exercises[].sets[]`
  view, matching reference client's behavior of returning normalized per-set reps,
  weights, and the account display unit instead of asking about a resolved unit.
  reference client is a reference for the output contract; account reads/writes still
  use GM Coach.
- Verification: all 278 offline tests passed (275 tests across 28 regular test
  files and 3 MCP child-process tests); changed JavaScript files passed
  `node --check`. The Windows packager produced the cross-platform ZIP with
  52 entries and verified each entry against its source SHA-256. Version
  `1.0.19+codex.20260930080021` is installed in both the local plugin folder
  and the Personal plugin cache. The installer left the existing global
  `gm_coach_local` entry unchanged because it could not verify that entry's
  identity. A read-only `codex mcp list --json` check shows its enabled stdio
  command and server path point into the current `plugins\\gm-coach` folder.
  GM Coach's safe local account-list diagnostics report loaded
  `pluginVersion=1.0.18`, installed `installedPluginVersion=1.0.19`, and
  `restartRequired=true`. Thus the parser fix is installed but the open MCP
  process has not loaded it. The Codex CLI has no `mcp restart` subcommand.
  Restart only `gm_coach_local` in Settings → MCP servers, then open a new
  chat; Codex Desktop was not restarted.
- Cleanup removed four superseded plugin-code/runtime backups (versions 1.0.8,
  1.0.13, 1.0.16, and 1.0.17), freeing about 375 MB. The newest 1.0.18 backup
  remains as a recovery copy because Windows reported open files. No account
  files were found in the removed backups. No personal calendar/session data
  was read through either plugin; a specific live saved-template readback
  remains unverified because the earlier private-data read was blocked by the
  approval reviewer.

## Historical reference client parity hardening — 1.0.20 (2026-09-30)

This pass implements portable behavior from the visible reference client tool contracts
and public Speediance clients. It did not call any other plugin tool or read
Speediance account/history data.

- At v1.0.20, resistance-mode input was incorrectly translated through the
  separate public `speediance-cli push` enum: `Eccentric=3` became code 2 and
  Chain was blocked. This historical behavior was superseded in v1.0.48 after
  rechecking the reference client template contract. Current writes pass through
  1=Standard, 2=Chain, and 3=Eccentric unchanged; do not restore this old map.
- Session detail without an explicit namespace first checks recent summaries
  for one exact training ID and one known `kind`; only then it sends the
  documented `--program` or `--free` flag. Missing, duplicate, or unknown matches
  ask for the type without requesting session detail.
- The strength profile reads the account display unit from `/app/userinfo`
  without pulling workout history.
- Credential labels use a digest of the data directory, profile, and slot; no
  absolute path is stored in the OS keyring label. Old unscoped keys are not
  migrated automatically. On an older installation, credentials may need to be
  re-saved in the local GM Coach setup form after updating.
- The history audit confirmed that a `topWeight` without its reps/RIR must not be
  turned into a 1RM or Smart RM load. The user-consented history tool can inform a
  follow-up question, but exact `topWeight` normalization remains a parity gap;
  session details do not reliably identify working-set role or RIR.
- Verification: **284/284 offline tests pass**. Fixtures and mocks were used;
  the suite did not log in or access personal Speediance/reference client data. The
  focused MCP fixture confirms that strength-profile unit lookup calls only
  `/app/userinfo`, not workout/history endpoints.
- This package version refers to the workspace/shareable archive. No Codex
  Desktop or active MCP process was restarted in this pass.

The public CLI documents its custom-template mode codes and session namespace
flags in its [machine contract](https://github.com/stozo04/speediance-cli/blob/main/docs/MACHINE_CONTRACT.md);
its serializer copies the set mode into the `sportMode` field in
[`template.go`](https://github.com/stozo04/speediance-cli/blob/main/internal/template/template.go).
The reference client implementation itself was not available as public source, so this
audit claims parity only with its exposed tool contracts and observed schemas.

## Historical unit confirmation and undated 1RM repair — 1.0.21 (2026-09-30)

The regression reported in chat came from answers not being routed back into the
right MCP calls: account kg/lb and per-set reps/seconds are different facts.
At that historical version, the docs described `confirmed_display_unit` for a
Smart RM operation; this was misleading and has since been removed. The current
tool contract accepts it only for the strength-profile read and accepts
`unit_confirmations` for exact saved-template rows/sets. These confirmations
resolve API `unknown` only, never override a recognized unit, and are not stored.
For optional machine-side RM conversion, the user confirms only whether the exact
per-set value is repetitions; account kg/lb is not requested. Default static
Customize conversion also needs a compatible exercise 1RM/e1RM and account unit.
A unique explicitly
named 1RM/e1RM without a date can be used after the user's approval, but its
output has `selectedOneRepMaxDateStatus=date-not-returned`; conflicting values
remain blocked. The formatted set output now uses `30 s`, `8 powt.`, or a
specific unknown marker instead of the generic word “wartość”.

Verification: **292/292 offline tests pass**, including 41 focused unit,
template, and strength-statistics tests. The full suite uses synthetic data and
does not access a Speediance account. No live profile was read or changed.

## Historical persistent saved-template unit display repair — 1.0.27 (2026-09-30)

When a user explicitly confirms a saved-template set as repetitions or seconds,
GM Coach stores that fact in the selected local account profile, keyed by the
stable program code, exercise IDs, set number, raw dose, and a fingerprint of
the API unit signals. Any relevant API/template change invalidates the match.
An API-resolved unit always wins. An explicitly confirmed account weight unit is
also stored locally as a fallback; a later Speediance unit value takes priority.
Neither confirmation writes to Speediance.

Saved-template reads now return `displayDose`, `displayLoad`,
`displayWeightUnit`, and `loadType`. Static loads receive kg/lb only when the
account unit is sourced from Speediance or an explicit local confirmation.
Recognized Smart RM displays its RM level, while an ambiguous `weights=3.5`
marker is not labelled as kg/lb.

Verification: **305/305 offline tests pass**. This includes profile unit-memory
matching and invalidation, static kg/lb labels, RM separation, package manifests,
all platform installer allowlists, MCP process diagnostics, and synthetic CLI
fixtures. No Speediance account read or workout write was used for these tests.

## Read-versus-create status hardening — 1.0.34 (2026-10-01)

Calendar and saved-template read results now explicitly carry
`operationStatus=read-only`, `mutationSent=false`,
`programCreatedByThisCall=false`, and `programModifiedByThisCall=false`. Their
tool descriptions and runtime instructions say that an old calendar entry or
saved template does not satisfy a request to create or change a plan; creation,
editing, and scheduling are reported only after their respective confirmed
write/readback fields.

Verification: **310/310 offline tests pass**. A separate GM Coach chat was tested
only against synthetic examples and correctly distinguished an existing plan,
30 seconds, static 74-per-set load, and Smart RM fields. No Speediance account,
history, reference client tool, or write operation was used in that chat.

## Final reference-client-compatible payload coverage — 1.0.36 (2026-10-01)

Moved the final saved-program payload builder into a pure module so tests can
exercise the exact wire object passed to Speediance. Regression cases now cover
named Smart RM with `weights=3.5`, RM in both `counterweight` fields, a valid
preset ID of `0`, separate reps, the reference-client-to-wire Eccentric code, explicit
Customize loads from 1RM, fixed kg only after authorization, timed bodyweight
sets in seconds, and Row intensity tags. Exact action-library variant matching
is covered at the same serialization boundary.

The user's persisted preference remains Smart RM for resisted rep-based work;
reference client Customize and hand-entered kg stay explicit opt-ins. The public reference client
source confirms these payload fields but does not document its internal
reps/RIR-to-RM choice or the machine's RM-to-resistance formula, so this test
proves payload parity only. It does not claim firmware equivalence.

Verification: **318/318 offline tests pass**, including six new end-to-end
serializer cases. `node --check` passes for the server and serialization
modules. Tests use synthetic metadata and do not read or modify a Speediance
account. The shareable ZIP was built and inspected: it contains version
`1.0.36+codex.20261001` and the new serializer module.

Two new Codex chats verified the live boundary. The first used only the global
`gm_coach_local` server to confirm the old October 3 calendar reservation and
saved template already existed; both reads returned `operationStatus=read-only`
and no create/update flags. A second fresh chat, after installation, confirmed
that `gm_coach_local` runs `1.0.36+codex.20261001`, reports
`restartRequired=false`, and can check the connected `configured` profile. No
workout history or writes were used. The separate bundled `gm-coach` server was
not exposed in the projectless smoke-test task; Codex Desktop's global
`gm_coach_local` server is the confirmed cross-chat connection. No reference client
tool was called in either test.

## Release-gate and Smart RM/time-routing snapshot — 1.0.41 (historical)

The release gate is now durable in `AGENTS.md` and protected by
`tests/plugin-version-coherence.test.mjs`: tests must run against the version in
the source and bundled manifests, and any live feature test must first confirm
that the active MCP `pluginVersion` and installed manifest both equal that
release with `restartRequired=false`. A stale MCP must not be used to diagnose
or test behavior.

Before this source update, the safe account-list diagnostic showed the running
global MCP at `1.0.37+codex.20261001` with `1.0.40+codex.20261001` on disk and
`restartRequired=true`. The installed cache manifest was also `1.0.40`. The new
source and bundled plugin are `1.0.41+codex.20261001`; no live feature test was
run against the stale process.

Preview and create now load one current exercise catalog, pass the catalog to
normalization and validation, and preserve the confirmed movement kind through
serialization. This lets seconds-based catalog entries route to their
bodyweight, cardio, or explicitly requested timed-resistance path instead of
falling into the rep-based Smart RM path. The write serializer retains
reference client's time codes (`completionMethod=2`, `countType=2`) and seconds as the
dose. Smart RM keeps planned reps, RIR, and a direct integer RM level separate;
the RM level passes through the reference-client-compatible `counterweight` fields with
`weights=3.5`. No public source found in this audit confirms the reference client model's
internal choice formula or Speediance's exact RM-to-force calculation, so no
firmware parity claim is made.

Verification on source release **1.0.41+codex.20261001**: full offline suite,
`node --test`, **329/329 passed**. A focused integration subset also passed
7/7. The sandbox's default test runner initially returned `spawn EPERM`; the
full suite then passed using the approved local process execution needed by
MCP fixture tests. Test fixtures used synthetic data; no workout history was
read and no Speediance plan was changed. One safe `speediance_list_accounts`
diagnostic identified the stale MCP version only.

The shareable artifact `C:\TQ3D\gm-coach-share-cross-platform.zip` was built
from this release and inspected after packaging: both embedded manifests are
`1.0.41+codex.20261001`; all 55 canonical files are present with no extras, and
the packaged MCP server hash matches the source. The installed cache and active
MCP were not replaced or restarted in this pass.

## Preset-specific Smart RM defaults and validation — 1.0.42 (2026-10-01)

The public reference client v1.2 UI exposes preset-specific RM ranges and defaults, rather than one shared 1–20 range: Gain Muscle ID 1 is RM 9–13/default 13; Stamina ID 3 is RM 15–20/default 17; Strength ID 5 is RM 4–9/default 7. It separately exposes rep ranges/defaults of 8–12/default 12, 13–20/default 15, and 2–8/default 6. These are software UI constraints. They do not demonstrate that an RM value corresponds to `%1RM`, kilograms, RIR, or a scientific intensity prescription.

GM Coach now resolves an omitted per-set `rmLevel` to the selected reference client preset's default before preview and serialization. A caller-supplied value is checked against that preset's RM range; an invalid value fails closed. Reps and RIR remain distinct and are not used to calculate RM. The payload keeps reference client’s named-preset shape (`weights=3.5`, RM in `counterweight`/`counterweight2`, reps in their own fields). This aligns the observed public UI defaults and bounds, while the user's goal, repetitions, RIR, rest, exercise selection, and other training decisions still need their own evidence-based rationale. No available public source establishes reference client’s private choice behavior or the Gym Monster firmware's RM-to-force calculation.

Changes cover `program-payload.mjs`, `mcp_server.mjs`, `saved-templates.mjs`, the Smart RM schemas, training instructions, and regression tests. Focused tests passed **106/106** and the full offline suite passed **331/331** on source **1.0.42+codex.20261001**. The test gate rejects stale package/MCP results as evidence for the current release.

Packaging verification: `C:\TQ3D\gm-coach-share-cross-platform.zip` contains exactly 55/55 canonical files; both embedded manifests report `1.0.42+codex.20261001`; the packaged `mcp_server.mjs` SHA-256 matches the source. The installed cache remains at 1.0.40 and the active `gm_coach_local` process at 1.0.37 with `restartRequired=true`; no live feature test was run through either stale artifact. Do not restart Codex Desktop. A later live test is valid only after the active and installed MCP versions both match this source release and diagnostics report `restartRequired=false`.

## Post-reset release and mode audit — 1.0.55 (2026-10-02)

The user reported restarting the MCP server. The existing conversation still reported a stale running process (`pluginVersion=1.0.48+codex.20261001`, installed `1.0.55+codex.20261002`, `restartRequired=true`), so no feature test was run through it. A fresh test chat then reported the current source/install version `1.0.55+codex.20261002`, `restartRequired=false`, `mcpInstanceId=870e4e870fe4d8c66f920095`. A read-only connection check in that same fresh instance returned connected/API-connected with no error; workout-history access remained `not_checked`.

Release artifacts were verified: root and bundled manifests both say `1.0.55+codex.20261002`; `C:\TQ3D\GM-Coach-1.0.55.zip` contains 60 entries and both packaged manifests carry the same version. Its packaged `mcp_server.mjs` hash matches the source: `C6EADEA9B356A0000F8A3D199342D5931E35C60004B6AB367BD5CB5696701EC1`. Full offline suite on that source release: `node --test`, **369/369 passed**. The sandbox invocation hit `spawn EPERM` before running tests; rerunning the identical suite in the permitted local process context completed successfully. Fixtures were synthetic; no workout history or personal statistics were read and no Speediance program was changed.

Parity evidence: the public reference client UI has named preset IDs 1=Gain Muscle, 3=Stamina, 5=Strength and per-preset RM defaults/ranges (Gain Muscle 13 [9–13], Stamina 17 [15–20], Strength 7 [4–9]). Its public serializer writes a named `templatePresetId`, per-set RM values in `counterweight`/`counterweight2`, and the `weights=3.5` placeholder; Customize uses preset ID -1 and actual static load values. The Coach serializer and regression tests follow that observed wire shape. This does not prove the private reference client MCP or firmware’s exact RM-to-resistance calculation, so Coach must not show 3.5/RM as kg or claim a calculated `%1RM`.

Mode audit: Speediance’s GM FAQ lists Standard, Chains, Eccentric, Constant and describes Spotter separately as assistance. The public reference client template writer exposes only 1=Standard, 2=Chain, 3=Eccentric; Coach keeps those exact writable codes and rejects other labels/codes, including `constant`, `fixed-speed`, `isokinetic`, `isometric`, and `spotter`. Speediance uses “Fixed Speed” on newer product pages and one promotional page labels it “Isokinetic”, while describing constant speed or resistance; neither official source provides a verified reference client template code for that mode. “Isometric” means a static contraction and is not interchangeable with “isokinetic”. Therefore `ISO` is not guessed or serialized as a fourth resistance mode. No direct evidence supports claiming that Constant/Fixed Speed is written into a reference client template or that it is superior for general strength/hypertrophy.

Sources: [Speediance FAQ](https://www.speediance.com/pages/faq), [Speediance GM1 product page](https://www.speediance.com/products/speediance-home-gym?variant=45183645843671), [Speediance Fixed Speed page](https://www.speediance.com/collections/functional-trainers/products/speediance-gym-monster-3), [reference client preset UI](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/main/static/workout-logic.js), [reference client API serializer](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/main/api_client.py).

## Serializer, preset-routing, and post-reset verification — 1.0.58 (2026-10-02)

The final reference-client-compatible serializer now normalizes timed-set aliases itself (`seconds`, `s`, and duration-only records) before constructing `setsAndReps` and `completionMethod`. This closes a boundary bug where callers that bypassed the upstream normalizer could serialize an undefined dose as repetitions. Regression tests cover those aliases and preserve the reference client time code.

Goal-to-preset routing now refuses to pick the first match when a user states multiple primary adaptations (for example, hypertrophy and strength). The coach must clarify which outcome leads before choosing Gain Muscle or Strength. An integration regression also checks that the selected global preset remains independent of the exact `actionLibraryId` exercise variant.

Verification on source release **1.0.58+codex.20261002**: focused serializer, routing, and saved-template tests passed **54/54**; full offline suite `node --test --test-isolation=none` passed **374/374**. The initial sandbox run blocked child processes with `spawn EPERM`; the identical full suite passed in the approved local process context. Tests use synthetic data and did not read exercise history or write to Speediance.

The shareable artifact `C:\TQ3D\GM-Coach-1.0.58.zip` contains exactly **60/60 canonical files**. Root and bundled manifests and both ZIP manifests report `1.0.58+codex.20261002`; the packaged `mcp_server.mjs` SHA-256 equals source (`D493C2341DE432E5DAB8DF4D7214B85A876F0FE26FB9766FBF9E4153CE223A47`). The local plugin/cache was updated to 1.0.58 and the global MCP configuration already matched its server path, CLI, and data directory. The installer retained an old-process recovery copy because files were still open; Codex Desktop was not stopped or restarted.

After the user reported resetting MCP, the current chat still reported `pluginVersion=1.0.48+codex.20261001`, installed version `1.0.57+codex.20261002`, and `restartRequired=true`; no feature test was run through that stale process. A temporary fresh chat after installation reported `1.0.58` for both versions, `restartRequired=false`, and successfully completed a read-only Speediance connection check for profile `configured` (`connected=true`, `apiConnected=true`). Only the connection endpoint was checked; no workout history, statistics, or program writes were requested. The temporary chat was archived.

The remaining parity limitation is still explicit: public reference client/Speediance sources describe named Smart RM fields and preset IDs but do not prove the exact private RM-to-kg algorithm or firmware outcome. The current connection check therefore proves API reachability only, not exact Smart RM load equivalence. The reference client exercise-history fallback also remains under review; Coach must not invent an RIR, date, or working-set classification that the source does not return.

Release .77 final full test command: node --test --test-isolation=none; 574/574 passed on 2026-10-03 after newest installation and synchronization.






Pending .85 continuation edits: saved-side presentation now resolves aligned leftRight codes with explicit unknown fallback and MCP set output includes it; three new regressions added but not yet installed/retested. Prior630/630 count does not cover these edits. Complete integration tests and synchronize release before packaging.


Final .85 continuation verification: after terminal installer success, full latest source node --test --test-isolation=none completed640/640 on2026-10-03. Includes actual MCP normalizer/scientific per-set value/approvalHTML/realserializer/readback for six load/account-unit combinations, bothstaticprotocols, changedside rejection and savedside resolver. Scientific registry/services isolated in fixtures; full live evidence-registry approval and physical firmware parity are not proven. Local100expandedset guard is an implementation size limit, not verified SpeedianceAPI restriction. No personal account data used. Earlier pending630 status superseded by this final result.

## Runtime verification after user MCP reset — 2026-10-03

Safe local speediance_list_accounts reports pluginVersion=installedPluginVersion=1.0.87+codex.20261003, restartRequired=false, mcpInstanceId=a831fded0bbe224e0f97d17e. Profile example-profile credentialStatus=ready. This confirms loaded release and local credential presence only, not authenticated API connectivity or firmware execution. No personal Speediance data request performed.

109 supplemental regression 2026-10-04: exact cycle preset name/ID Gain Muscle1,Strength5,Stamina3 accepted with independent RIR2; conflicting known presetID rejected. Full latest-source suite731 tests:730passed,0failed,1platformskip. Test installed before execution, no runtime changes; this supersedes earlier109 test count, not physical parity proof.

109 follow-up source audit: reference-client-static-load-units.test.mjs integer8..220 expected oracle duplicates JS production formula; this proves internal adapter/create/edit consistency, not independent Python tie rounding or physical account-unit behavior. Fractional half-kg boundary reference capture remains needed before broad1:1 claim. Added permanent AGENTS oracle rule to avoid repeating this evidentiary mistake. Goal unchanged.

Independent upstream inspection2026-10-04: fetched pinned hbui3/UnofficialSpeedianceWorkoutManager@4e12bc6108f43c2705e935aa3d5db563cb8a3c06 static/workout-logic.js lines103-105:lbsToKg computes lbs/2.2 then Math.round(kg*2)/2. Therefore imperial half-kg UI tie behavior is JavaScript, not Python bankers rounding. Earlier follow-up request for Python UI tie oracle was overly broad and is corrected here. Python api_client.py then api_weight=weight_val*2.2 and f-string one decimal; fractional wire-format boundaries remain a distinct server-format audit. Existing Coach half-kg algorithm matches the independently fetched UI source, not merely self-derived test expectations. No personal API calls. Public reference URL:https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/static/workout-logic.js

110 independent oracle sweep2026-10-04: bundled Python generated format(kg*2.2,'.1f') for49,991centi-kg inputs0.10..500.00; latest installed-source exactbinary64 formatter matched all49,991,zero mismatches. Installed package-list source hashes matched both installed roots before run (adapted MCP config excluded). This proves formatting equality on that finite grid, not all floats, capacity rounding, readback account protocol or physical resistance. Temporary oracle deleted after recording evidence.

Pending capacity audit 2026-10-04: static creation currently derives capacity from the formatted weights token; saved replacement validation does the same. Pinned hbui3 api_client.py derives capacity from unrounded api_weight before f-string formatting. Example canonical3.75kg eight reps: unrounded66 versus formatted8.2*8=65.6. Correcting creation alone would break creation/edit parity. Joint intent-aware adapter and regression audit delegated; not yet fixed or tested. Named RM selector capacity remains separate and must be preserved. No account requests performed. This entry is pending work, not new release verification.

Safe runtime diagnostic2026-10-04 current chat: loaded1.0.108+codex.20261003, installed1.0.110+codex.20261004, restartRequired=true, instance2c1a910b986f04b68f2b6a79. Profile example-profile credentialStatus=ready; this is local credential presence, not authenticated API verification. Live feature checks withheld under newest-release rule. No account API requests.

2026-10-04 independent upstream fetch reconfirmed pinned hbui3 api_client.py lines562-564: api_weight=weight_val*2.2; weights_list.append(f-string one decimal); set_capacity += reps*api_weight. NamedRM line572uses reps*weight_val*2.2. This is source-contract evidence, not device execution.
Cycle integration audit: deriveTrainingCyclePrescription bindingValues are not consumed by normalizeEvidenceCoverage. Required complete follow-up: derive from server-normalized validated sessions and final expanded payload digests/dates, bind four cycle decisions exactly, reuse per-source assessments/current registry/citation anchor validation both preview/finalization, bind full context and templates. Current local series totals lack muscle attribution and expansion, changed digest is not progression/deload proof. No tests or account requests by audit agent.

111 installed-before-test verification2026-10-04: version1.0.111+codex.20261004 full source node --test --test-isolation=none:738total737pass0fail1Windows-symlinkskip. Static creation and saved replacement capacity use trusted internally derived unrounded protocol load; incoming action.capacity ignored during replacement. Unchanged GET legacy serialization now uses Python-equivalent decimal formatter. Fractional3.75kg lower-level serialization and preserved GET edit regression:8.2wire66capacity, while new preset still rejects off-step3.75kg under reference client 0.5kg restriction. NamedRM selector capacity unchanged. No personal account API requests.
Cycle normalizeCycleEvidenceCoverage extracted common existing declaration gate: exact four bindingValues from consistent64hexhash, every source assessment/citation/category/status/reviewedValue preserved. Five regressions cover stalehash/wrongreviewedValue/contradiction/incomplete/status/inconsistenthash. This helper is not yet wired to complete server-derived cycle preview/finalization/calendar executor and grants no approval. Initial failures exposed test fixture dependence on function ordering and missing fixedkg permission/offstep fixture; corrected fixtures/order without weakening gate. Fresh suite supersedes earlier failed runs.
Installer retained open-file recovery backup .gm-coach-backup-a86e504ceaf8466bb3ea0fae25113593; preserve while in use. Active chat runtime check remains108/stale; installed111 is not evidence of loaded111.

111 supplemental installed-before-test regression2026-10-04: protocol capacity adapter matrix canonicalkg/kg-lb, Customize imperial halfkg, account-unit-verbatim, namedRM rejection. Latest full suite739tests738pass0fail1platformskip supersedes previous111count. AGENTS preserves capacity-beforeformat/trustedderivation/unchangedGET/stepvalidation and functiontext-extraction lessons. No new runtime implementation after111release, no personal API calls.

111 independent read-only audit2026-10-04 confirmed capacity-beforeformat for creation/replacement, internal map ignores caller action.capacity, static protocols/intents/unchangedGET and RM selectors separated. No tests or account calls by auditor. Firmware physical parity remains unverified. Added official SpeedianceRM article source review distinguishing product claims from unpublished firmware/preset math and scientific evidence; not a new scientific dose approval.

112 installed-before-test2026-10-04:1.0.112+codex.20261004 full node --test --test-isolation=none743total742pass0fail1Windows-symlinkskip. Cycle facts expose exact localexercise/setprescriptions, comparable dose/rest/mode/RIR/staticloadunit deltas, added/removedrows and unknown/changedvariant/type/unit unmatched. Explicit calendarorderpairing; localPrescribedSets separated from expandedExecutionRowsunknown. NamedRM physicalLoadunknown; rmselector is not physiologicalprogression. Deload includes same comparison against explicit baselineweek. Four new comparisonregressions. No fullcyclepreview/review/calendarbatch integration claimed, no accountAPI calls. Counts are prescriptions not completedperformance or musclevolume.

Pending next-release continuation2026-10-04: server cycle prepare/review implementation is in progress in mcp_server.mjs by cycle agent; source working tree after112 differs and is not releasable/tested yet. Two additional localcycle regressions added (namedpreset physicalLoadunknown and unmatched added/removed catalogs), not executed before next installation. ZIP112 remains last verified artifact, full count743/742pass belongs to prior112 snapshot only. No accountAPI requests. Do not package or test partial source as112.

Pending cycle preview/review review2026-10-04: root identified freshness checks before final awaited profile/static reads and malformed dates validated only after accountpreparation. Cycle agent added final research/excerpt rechecks afterawaits, finalaccountunit/staticcontext comparison, upfrontcalendarboundary/count/duplicate validation, bounded8drafts/30minTTL and2MBpublicoutput. Still not installed/tested; source remains pending after112. Additional independent review active. Exact prepared payload digests are server-derived; researchReviewComplete does not grant mutation or prove scientifictruth.

113 installed-before-test verification 2026-10-04: version1.0.113+codex.20261004 full source node --test --test-isolation=none:753total752pass0fail1Windows-symlinkskip. Server-owned cycle preview/review prepares real sessions and payload digests, validates upfront date boundaries, binds profile/intake/static context, rechecks research after final awaits, limits drafts to8/30min. Four exact cycle decisions preserve per-source assessments and citation limits. Serialized rows include sections and side expansion separately from local main sets. Review grants no mutation. Initial3 failures corrected only fixtures: cumulativequote20words, synchronous extraction boundary, valid8repGainMuscle/Strength; gate unchanged. Skill routes new tools with clear no-calendar-mutation limitation. Tests synthetic; no personal API reads/writes, firmware/allgeneration/mac parity unverified. Fullcycle calendar batch executor remains unfinished. Installer preserved open-file recovery backup .gm-coach-backup-bbae980cae2146fcb6e0aa84db2c7fd2; Desktop untouched.

Continuation113 diagnostic2026-10-04: safe local speediance_list_accounts stillloaded108, installed113, restartRequiredtrue, instance2c1a910b986f04b68f2b6a79;example-profilecredentialStatusready. This proves localcredentials only; no account API featurecheck. Reference corrected stale source75 header/GM1-only writer wording: family1GymMonster, notgeneration1; physicallater-generationparity stillunverified. Cyclebatchimplementation next; sourcehasdocumentationchangesafterverified113package, release114requiredbeforetests.

Independent113cycle read-only audit: no confirmed science/unit/stale-preview defect found; session preparation/review rebuild and digest/context checks inspected. Auditor noted bounded8drafts*16MBserializedinput/preparedpayload upperbound128MB before objectoverhead; globalmemorybudget requested for nextrelease. No audit tests/accountreads. Fresh officialmanualdirectory2026-10-04 confirmed model-specific GM1/GM2/GM2S links; directGM2PDF readagainfailed, no APIcapability inference.

## Completion requirements still open after verified113

- NamedSmartRM: public preset IDs/markers/default selectors verified by pinned source and regression; physiological RM-to-resistance algorithm and physical kg outcome remain unpublished/unverified. Do not claim hardware1:1.
- Customize: captured assessedsuggestions kg plus public UI/wire protocol rounding verified within documented scopes; privatehistoryfallback, observed imperial suggestions and account-selected alternate staticprotocol need independent evidence. Never substitute guessed anchors.
- Standalone/currentruntime: installed113 package independent of reference client; activechat108 stale. Newruntime connection/accountbehavior not verified thiscontinuation. Credentials presence is not authenticatedreachability.
- AllGymMonster/mac: family1 serialization is not generationautodetection or physicalallgenerationproof; nativeMacinstallation/Keychain remains untested.
- Scientificcycle: actualsessionpreview/review113 verifiedsynthetically. Complete durablycheckpointed multitemplatecalendarpath nowinprogress, nottested/released. Eachstep must freshvalidate research/context and realremote outcomes, without automatic uncertainreplay.
- Accessoryinference: globalrequiredcatalog is not accountownership; keep provenance and userconfirmedfallback.
- NewPRhistorypresentation: publicpookeysource reviewed; conservative reportedflags implementation inprogress, no universaltruthiness or latest1RM inference.

These items preserve the full requested scope and are not waived by green offline tests. No personalAPIrequests authorized by development activity alone.

### Public history report enrichment (pending 1.0.114 verification)
Read-only public audit pinned pookey/gm-summary `57f42f0e510a2199ceeb135f2ef59f6d7ca019a4` identified API PR flags missing from Coach's normalized exercise view. `workout-data.mjs` now retains strictly parsed API-reported weight/capacity/oneRepMax PR flags and an explicitly non-assessed, non-latest `reportedOneRepMax` metric. Missing or malformed flags remain unknown; unresolved units remain unknown. Original API payload remains untouched. Three source regressions added; not run by this agent. No account access. No claim of firmware parity, independent PR validation, or new write behavior. Public reference: https://github.com/pookey/gm-summary/blob/57f42f0e510a2199ceeb135f2ef59f6d7ca019a4/speediance.py

Pending114audit: independentread-onlyreviewconfirmeddeadownerlockrace betweenmultipleMCPprocesses (bothreaddeadowner thenunlink canremovefreshlock). Exclusiveatomic recoveryguard required before reread/ESRCH/reclaim; orphanrecoveryguard failclosed notagebased. Calendarcheckedbeforeawaitedrevalidate leaveswindow; callbackmustfreshreadafterawaits andsyncsourcechecks beforePOST. Workingexecutor notinstalled/tested; latestverifiedartifact113 remainsonlyshareableverifiedrelease. Do notattribute113green to114changes.

114 final installed-before-test verification2026-10-04:1.0.114+codex.20261004 full source node --test --test-isolation=none766total765pass0fail1Windows-symlinkskip. Supersedes earlier765total114run. Added durable wholecycle executor with exact serverreview/context/payload/date bindings, totalremainingtemplatecapacity preflight, finalfreshlistbeforecreatePOST, freshcalendar/template/research before reservationPOST, verifiedlocalrecords and finalallremote readback. Globaldraftbudget32MB. Recoveryguard prevents dualdeadownerreclaim; OS ESRCH only, orphanrecoveryguard failclosed; PIDtoken diagnostic. Noautomatic uncertainPOST replay or overwrite. Tests realMCPbranches with mockedaccount/network/science fixtures plus realdurableexecutor/syntheticremote callbacks; not realaccount/firmware proof. ThreePRhistoryregressions preserve strictreportedflags/RMunknownunit/noassessedlatestanchor promotion. No personalAPIreads/writes. Fullatomiccycle unsupported byAPI; externaleditlastGET-to-POST race remains. KnownprePOSTvalidationfailure currently retainspending failclosed; distinguishingprovenunsent preparation from uncertaindispatch remains reliabilitywork. Activechat stale108 not tested as114. Latest full counts apply finalinstalledsource only.
114 independent final read-only audit: no new blocking defect in final recoveryguard/finaltemplatepreflight/beforeSendcalendarchecks; single-session route preserved. Orphanrecoveryguard remains explicit failclosed recoverylimitation. No tests/accountreads by auditor.
Pending115 docs fix: cycle nonmutation wording now names preview/review only, allowing dedicated execute tool; corrected actual public cycleResearchReviewComplete field. Latestverified114ZIP unchanged until newinstalled/tested115.
Pending115: publicHEAD hbui3/labatt unchanged frompins confirmedGitHubcompare; no newprivatehistoryresolver evidence. Newpreparingstate reliability implemented but crossprocesscalendaroperation ownership audit remains pending; latestverified114counts do not cover sourcechanges.
115 first installed test run770total767pass2fail1skip: childstdin fixture keptprocessalive, explicitly identifiedandterminatedonlytestchild32604,parenttest15044; parentstdin.end fixed. Newactiveguard brokeexisting sameprocesscoalescing contract; restoringidenticalintentinflightsharing withoutweakeningcrossprocesslock. Failedrun not releaseverification; fullrerun requiredafterreinstall. Codex/MCP notstopped.

115 final installed-before-test verification2026-10-04:1.0.115+codex.20261004 full source node --test --test-isolation=none771total770pass0fail1Windows-symlinkskip. Latestprogram-calendar patch SHA-synced both installedroots before fullrun. Durablepreparing marks provenpre-dispatch stage; callbackmarkspending beforeactualAPI and currentresearchcheckedafterawaitedmarkers. Oldpendingneverdemoted; uncertaintransport noautoreplay. Calendarfilesystemlock spansallpreparation/send/readbackacrossMCPprocesses withexclusiveESRCHrecoveryguard. Crossprocessfixture nowstdin.end plus10sectimeout. Same-processidenticalintent coalesces exactlyonewrite; oppositeintent/changeddispatchcontractrejects; secondresult explicitlymutationSentfalse/duplicateMutationBlockedtrue/coalescedOperationtrue. Firstfailedrun770/767pass2fail1skip (fixturehang+coalescingregression), secondfailedrunonlycoalescedresponseflag, bothsupersededbyfinal771greenwithoutweakening assertions. Exactidentifiedtestchildonly stopped; Codex/MCP untouched. Model-facingcycletoolnonmutation wording andactualreviewfieldcorrected; explicitgroupanchor/variantnarrowing clarified withoutclaimingphysiologicalvariant equivalence. PublicReferenceClientHEADunchanged andprivatehistoryresolver stillunreproduced. No accountAPIreads/writes. Nestedcheckpointwrites notatomic; partialcheckpointfailure conservativepending; orphanrecoveryguardmanualreconciliation. Offlinegreen nothardwareproof/currentactiveMCPproof.

Pending116 audit2026-10-04: pinned public reference client get_user_workouts uses appPage?pageNo=1&pageSize=-1 and returns data without completeness verification. Explicit partial metadata or conflicting arrays must not certify full template capacity/identity reconciliation. Preserve plain data arrays and absent pagination metadata; no invented page traversal. Scientific skill corrected local numerical anchor/unit independence versus required fresh reported account1RM presence for SmartRM writes. Safe local diagnostic running108/installed115/restartRequiredtrue; profile example-profile credentialStatusready, no personalAPI read/write. Latest verified release remains115 until116 installed and fulltested.

116 final installed-before-test verification2026-10-04:1.0.116+codex.20261004 full source node --test --test-isolation=none778total777pass0fail1Windows-symlinkskip. saved-template-list parses complete response envelope and recognized wrappers/aliases, keeps pinned reference client pageNo1/pageSize-1; barearrays/no metadata accepted, explicitpartial flags, inconsistent totals and conflicting arrays rejected before capacity/identity use. pageCount/totalPages alone do not imply partial all-request. Seven synthetic regressions; no captured API completeness corpus or personalaccountAPI reads/writes. SmartRM scientific skill clarifies numericallocalanchor/unit notneeded but freshreportedaccount1RM presence remainsrequired beforewrite. Installer exit0 awaited beforetest; activechatMCP108 remainsstale and notfeaturetested as116. Offlinegreen notphysicalGM/allgeneration/nativeMac proof.

117 final installed-before-test verification2026-10-04:1.0.117+codex.20261004 full source node --test --test-isolation=none779total778pass0fail1Windows-symlinkskip. Corrected Customize assessment suggestion exactbinary64nearest-even tie handling: priorEPSILONtolerance inflated oddfloor51.49999999999999 to52 and lowered evenfloor50.50000000000001 to50. IndependentPython round(anchor*.77) captured oninstalled116 provesexpected51 forboth nearhalfcases; exact50.5=>50 and51.5=>52 retained. Newregressioncovers kg/lb numericalpath. No change tonamedSmartRM, wireformatter, staticaccountprotocol orsciencegate. Installer exit0 beforetests; no personalAPI. Sourceparityboundarytest is notprivatehistoryalgorithm/physicaldeviceproof. Publiclabatt/speediance-mcp coachingEpley fallback is differentproduct, notoriginalReferenceClient evidence; notadopted.

Pending118: independently revalidated alleged storedworkinganchor helperbug: actualMCP materializesoneRM beforeestimateReferenceClientLoads, so stricthelpernotpublicdefect. Confirmedactualinputguard rejects explicitworkingWeight+workingReps+unit due one_rep_max/unit pairconstraint; correcteitherexplicitanchor-unit pairing. Confirmedprofile-auto loadEstimates approximatefalse obscures working-set e1RM approximation whileprofileAnchor marks true. Preserve provenance separately fromdeterministic softwarecurve; no claimprivateReferenceClient workingfallbackreproduced. coachingprofile schemaactionLibraryId description corrected optionalexplicitvariant/groupanchorcontext. Latestverified117 untilnewinstalledfulltest.

118 final installed-before-test verification2026-10-04:1.0.118+codex.20261004 fullsource node --test --test-isolation=none784total783pass0fail1Windowssymlinkskip. Actualgm_coach_suggest_load nowacceptsexplicitworking_weight+working_reps+unit, rejectsunitonly/missingunit/partial/mixedanchors andorphanworking_rir. Working-setloadEstimates preservetrueapproximation, estimationmethodworking-set-estimate andoriginalanchorEvidenceSource separately, effectiveReps/RIR/assumption. FiveactualMCPbranch syntheticregressions comparekg/lb suggestionswithrealserializer. First784run4fail duefixtureexpectation conflatingestimationmethod/evidencesource; clarifiedbothfields. Subsequentpatch newlineescape causedsyntaxerror, correctedandrepeatedentiresuite; finalgreenonlyisreleaseevidence. coachingprofileschemavariantdescription correctedgroupanchorcontract. NoaccountAPI/hardwareproof, privateReferenceClienthistoryfallbackstillunknown.

Pending119 presentationaudit: normalizePlan retainsworking-setapproximation butpublicsingleprogrampreview dropsprovenance andlabelsanchoroneRepMax; approvalHTML %1RM labelnotexplicitestimatede1RM. No demonstratedsciencebypass: actualnormalizedplan/contextdigest remainsrevalidated. Correctpresentationonly, keepstaticloadnumbershiddenwithoutshowCalculatedLoads. Latestverified118 remainsuntil119installedtested.

119 final installed-before-test verification2026-10-04:1.0.119+codex.20261004 fullsource node --test --test-isolation=none785total784pass0fail1Windowssymlinkskip. Publicsingleprogrampreview exposesapproximation/source/RIRassumption fromserver estimates, strengthanchor kindestimated-e1RM vsreported-oneRepMax; approvalHTML labels szacowanego e1RM andexplainsworking-setanchor. Hiddenloadpreview doesnotexposekg/lb numerals. Actualrender+normalizerregression; no scientificdecision/digestchanges, nobypassclaimed. Installerexit0beforetests, noaccountAPI/hardwareverification.

Pending120 independentauditconfirmed metadata dropped inSmartRMvalidator: MCP passesexerciseMetadata butvalidatoroption/resolver omits it; applySmartRmConversions secondvalidation also lacksmetadata. Threadtrustedcatalog samecontextthroughboth validations, retainseconds/conflict nooverride rules. Goal/preset/variantbindingandduplicateaction rejection unchanged. Latestverified119 remainsuntil120installedtested.

120 final installed-before-test verification2026-10-04:1.0.120+codex.20261004 fullsource node --test --test-isolation=none787total786pass0fail1Windowssymlinkskip. SmartRMconversion validatorforwardsexerciseMetadata tosavedunitresolver; applySmartRmConversions secondvalidation receivestrustedmetadataById fromsameMCPcatalog. ConfirmedVitacode5 secondsandconflictingexplicitreps cannotbeoverridden userconfirmation; callerconversionmetadataignored. Twoadditionalregressions includeactualMCPmapforwarding. First787run1failure staleexactsourcepattern expectedoldsignature; updatedassertion requiresmetadataforwarding, fullrerungreen. NoaccountAPI/physicalproof/sciencebypass, presetgoal/variant andtimedpreservation unchanged.

121 final installed-before-test verification 2026-10-04: 1.0.121+codex.20261004, 790 total, 789 pass, 0 fail, 1 Windows symlink skip. Accessory selection now gathers all recognized account declarations, compares normalized sets independently of field order, retains only common IDs on conflict and marks unresolved evidence. Invalid competing declarations or traversal limits prevent complete ownership status. Single explicit empty selection remains complete; no valid declaration remains null. Existing MCP partial-status handling preserved. No personal API reads/writes or hardware verification.

Original live reference client public client inspected 2026-10-04: public reference client main.js (v=fcc8e659a7b9) SHA256 728868776E8661AA9977286713E7BC051954B2DD1F6255D3C85CA655278DB42D. Client sends groupId and first-set reps to /api/strength/suggest-weight and fills all exercise sets with returned weight/source. Progression endpoint returns last/suggestion. one-rm wrapper exposes oneRepMax and workingWeights. Owned accessories wrapper /api/accessories/owned returns ownedIds/catalog; underlying Speediance storage is not established. These are reference client wrapper endpoints, not Speediance paths. Server history selection and working-set conversion algorithm remain unpublished; Coach estimated e1RM must remain explicitly approximate, not claimed exact original parity.

Pending122: Polish substring sił incorrectly matched wysiłkowa/wysiłku, introducing Strength into endurance/hypertrophy goal inference. Require a Unicode word-start boundary for Polish strength stem. Added regression examples; not installed or tested yet. Latest verified remains121.

122 final installed-before-test verification 2026-10-04: installer exit0; 1.0.122+codex.20261004; node --test --test-isolation=none:791 total,790 pass,0 fail,1 Windows symlink skip. Polish strength-stem matching now requires Unicode word start, so wysiłkowa/wysiłku no longer falsely adds Strength to endurance or hypertrophy. Regression preserves trening siłowy. No personal API reads/writes or physical verification. Public-client reference from121 retained. Independent agent audit failed on usage limit and supplied no findings; not counted as completed audit.

Pending123: public gm_coach_suggest_load output now carries explicit approximate/kind on anchor and approximate/e1RM method/assumption on each static suggestion when a working-set anchor was materialized. Regression covers actual dispatch, not isolated helper. Source edits not yet installed or tested; latest verified122 remains.

123 final installed-before-test verification 2026-10-04: installerexit0; full node --test --test-isolation=none792 total791pass0fail1Windowssymlinkskip. Public Customize suggest_load anchor now explicitkind/approximate, suggestions preserve working-set method/RIR assumption. Actual dispatch regression distinguishes working estimate from supplied1RM. Numeric load adapter unchanged, no accountAPI/physical tests. Installer retained in-use recoverybackup4299d5db020f443ab5e574d1a887ea17; do not delete while locked. Latest live MCP prior diagnostic122, separate from installed123.

Pending124: API e1RM kindestimated lost in suggest_load anchor;123 Boolean(estimateMethod) incorrectly markedAPIestimate nonapproximate. PreserveAPIapproximate independently oflocalworkingcurve. No inventedmethod/RIR forAPIestimate. Calculatorregression added; refreshdispatch regression still needed before release. Not installed/tested. Firsteditingcommand PowerShellparseerror beforeanymutation, corrected simplifiedcommand.

124 final installed-before-test verification2026-10-04: installerexit0,794total793pass0fail1Windowssymlinkskip. APIestimatedcandidate preservesapproximate independentlyofestimateMethod throughactualrefreshdispatch andcalculator. No fabricatedworkingRIR orlocalmethod forAPIe1RM. Two regressions; accountnetwork mocked, no personalAPIread/write. Fullphysical/privateReferenceClientparity remainsunproven.

Pending125 provenance audit, read-only production finding 2026-10-04:
- coaching-profile.mjs schema/validator does not accept approximate or anchorKind on saved numerical oneRepMax. findStoredStrengthAnchor returns oneRepMax/unit/source and omits observedAt.
- mcp_server.mjs materializeStrengthAnchor numerical oneRepMax branch returns only value/unit/source; API estimated provenance added124 therefore cannot survive profile round-trip.
- program-payload.mjs numerical oneRepMax profile defaults approximate=false. Thus profile-auto and approval may label saved estimated numerical anchor as reported1RM even though refresh suggestion124 is correct.
Required complete fix: persist explicit numerical anchor kind (reported versus estimated), validate without granting assessed status, forward through stored resolution and materialization, public schema, payload loadEstimates and scientific/approval binding; preserve existing working-set estimate path. No numerical algorithm change or scientific-gate weakening. Regress API-like estimated numerical anchor -> profile normalization -> stored resolver -> actual suggestion and real preview; absent legacy kind remains unclassified rather than inferred assessed. Not implemented or tested;124 stays latest verified.

125 final installed-before-test verification2026-10-04: installerexit0,797total796pass0fail1Windowssymlinkskip. Persisted numericalanchorKind schema/normalization/resolver/materialization/payload/publicpreview/HTML/scientificbindings retained, date preserved. Actualprofile-roundtrip->suggest test plusrealpreview. Legacykindunspecified, no inventedRIR forAPIestimatednumeric. First797run1failure stalefixture scientificvalue lackedapproximate; updatedfixture andassertion, finalfullgreen. Numericadapter unchanged; noaccountAPI/physicalproof.

125 independent read-only serializer audit: no new concrete defect found in reviewedCustomize nextcurve/ties/unitformatter, SmartRMmarker/counter separation, savedconversion dose/mode preservation, duplicatevariant rejection, timedmetadata secondvalidation andemptyCustomizecounters. Notphysicalproof. New optionalLAN researchreference addedtosourceonly; requires separateMonsterRemoteHelper, not implementedcloudfeature. CurrentZIP125 unchanged; referenceawaitsnextrelease.

Pending126: reference client goal muscle retainedbyathletecontext butnotrecognizedbySmartRM goalrouter; explicitEnglish muscle growth/building also missing. Addedexactmuscle andexplicitgrowth/buildphrases, maintenance/mixedgoals remainunresolved. Regressionadded; notinstalled/tested. Nextrelease alsoincludesnewLANresearchreference from125source.

126 finalverification2026-10-04: installerexit0beforefulltests798total797pass0fail1Windowssymlinkskip. ExactReferenceClientgoal muscle andexplicitEnglishmusclebuilding/growth nowselectGainMuscle; maintenance/mixedgoals remainunresolved. IncludesseparateLANresearchreference, notimplementedtransport. NoaccountAPI/physicaltests.

## Release 1.0.127 — 2026-10-04
Installed before tests, installer exit 0. Full source suite: 801 total, 800 pass, 0 fail, 1 Windows symlink skip. Initial restricted run failed on child-process spawn EPERM; authorized unrestricted test run passed. Actual cycle preview now requires organization bound to dated sessions, complete blocks, explicit rest weeks and deload policy; six-week default requires three two-week blocks. Scheduled deload aligns with actual dose comparison. Organization participates in review digest; changed structure invalidates review. Added actual MCP regressions and corrected stale skill instruction requiring per-variant global Smart RM mapping. Organization and textual progression are not scientific approval or proof of executable progression. Private reference client algorithm, device load readback, all generations and native macOS remain unverified. No personal account API reads/writes.


## Release128 verification2026-10-04
Installed128 beforetests installerexit0. Full node --test --test-isolation=none804total803pass0fail1Windows symlinkskip. Defaulttwo-weekblocks everyhorizon withoddresidual; actualcomparabledosechanges bindblocktransitions andfinaldeload, uniquevariantpairing ignoreslocalentryrename. Deload rejectsadded/increasedunknownwork andshorterrests; explicitknownload/level/intensityreductions retained. Science stillseparate, nophysiologicalproof. Initial4fixturefailures corrected invalidentryID, sessionidentity, customreason/override; subsequent fixturechecks corrected isolation ofdeloadfromunchangedblock andLFnewline replacement. Noproductiongateweakened. NoaccountAPI/deviceverification. Pending intakefrequency/daysalignment; privateReferenceClientalgorithm/macOS/allgenerationsstillunproved.


## Release129 verified2026-10-04
Installedbeforetests installerexit0. Full node --test --test-isolation=none806total805pass0fail1Windows symlinkskip. RIRfrom/to retained; presencechange rejectsdefaultdeload, bothmissing remainsunknown. Actualcycle datedfrequency/UTCweekdays boundto normalizedstored+ephemeralintake. Scopedauthorizedexceptions validateboundaries/duplicates; declaredrestweek reasons separatedfromuserauthorization, finalexactcycleapprovalrequired. Review/executiondigestrechecks actualalignment. Syntheticactualbranchesregressions, noaccountAPI/hardware/macOS/privateReferenceClientparityproof.


## Release130 verified2026-10-04
Installed before full tests, installer exit0. Node --test --test-isolation=none:807 total806pass0fail1Windows symlinkskip. Working block progression now requires a comparable positive dose/load/level/intensity change or lower known RIR; rest/mode/preset-only and dose reductions cannot satisfy default progression. Arbitrary unchangedDoseReason no longer bypasses: explicit progressionOverrideUserAuthorized=true plus valid reason is required and output records default requirement unfulfilled. Final residual deload block is separately exempt from increase and retains actual reduction validation. New real-preview regressions cover negative/mode/rest/text-only transitions, authorized override, positive dose and odd-horizon final deload. Exact science review still required; candidate is not physiological proof. Smart RM never silently converted to kg. No account API, hardware or native macOS verification.

## Release131 verified2026-10-04
Installer completed exit0 before full source Node --test --test-isolation=none:811total810pass0fail1Windows symlinkskip. Endpoint-qualified springGroupList per-set {type,num} reader preserves raw/provenance, distinguishes absent/empty/unknown/readonly, rejects sparse/ragged malformed metadata and never invents band1 or measured kg. Nonempty/unknown data blocks SmartRM and mode conversion; empty arrays allow normal cable conversion. Existing band actions preserved exactly for rename/unrelated edits, actualouterMCP display prioritizes spring descriptors over conflicting Vita/level, readback detects descriptor alteration/omission. Source first-pass agent guard inserted in mode branch only; root review added actual SmartRM guard before testing. Root review also corrected empty-field blanketblock and wrapper output loss before installation. Physical band writing remains unverified; no new band write contract or accountAPI/device/macOS tests claimed.

## Release132 verified2026-10-04
Installed before full suite installerexit0. Node --test --test-isolation=none812total811pass0fail1Windows symlinkskip. Exact preserved band actions now bypass static/RM normalization and use explicit finite bounded API capacity as opaque compatibility metadata during unrelated edit totals. Missing capacity blocks recalculation instead of inventedzero; rename keeps originaltotal. Structural comparison ignores object keyorder while retaining arrayorder; no new writableband contract. Regression covers unknownpresetpositiveweights, capacity100, reorderedkeys and absentcapacity renamevsrecalculation. No accountAPI, hardware, nativeMac orprivateReferenceClientparityproof.

Release 1.0.133: full offline suite 818 total, 817 pass, 0 fail, 1 Windows skip. Profile-scoped coaching facts support expiry/deletion and invalidate pending mutations after changes; typed guard errors survive transport diagnostics. Two-week blocks, directional progression and final deload validators retained. Physical device and native macOS execution remain unverified.

Release 1.0.134: mutation memory preflight runs before the transport try/timer. Missing context and unreadable profile memory preserve their real diagnostic and send zero requests; exact expiry regression retained. Installed before full suite:819 total818 pass0 fail1 Windows skip. No personal API calls or physical firmware test.

Release135 verified: cross-process per-profile coaching memory lock encloses the whole read-modify-write. Exclusive wx lock/PID/token recovery requires affirmative ESRCH; unknown/live owners fail closed and age never authorizes deletion. Actual two-process contention+retry preserves both additions, different profile proceeds. Dead process recovery test confirms deleted fact stays deleted after new addition. Installed before tests:822 total821 pass0 fail1 Windows skip. No personal account API or physical/macOS proof.

Release136 verified: statistics pagination declarations scoped to ancestors of selected record array, never individual row fields. Conflicting aliases or explicit/page/total signals return hasMore=null rather than certifying full history. Preserve actual case-sensitive object paths for sanitized record trimming. Installed before tests:824 total823 pass0 fail1 Windows skip. Three synthetic scenarios cover nested row metadata, mixed-case bounded trimming, conflicting pagination. This does not establish private history-to-load algorithm parity.

Source136 documentation audit: removed obsolete current-matrix claims that only three curve points were supported, that every anchor must be variant-specific, and that calendar acknowledgement alone is accepted. Historical numbered release notes remain historical; current table follows current runtime rules. No runtime change or new test result claimed.

Release137: actual athlete snapshot carries active profile-scoped memory/fact digest after awaited history retrieval. Expired facts excluded; structured intake remains separate, no promotion to scientific evidence/loadanchor/ownedinventory. Actual extracted dispatch regression verifies consent rejection before reads, expiry across await, durable dislike, emptyhistory and absenthealth. Installed before full tests:825 total824 pass0 fail1 Windows skip. No personal history fetched. reference client tool metadata memory[] contract used as feature evidence only.

Release138 verified: parse all nonnull presetID aliases; malformed or conflicting IDs resolve unknown irrespective of ordering, equal numeric/string aliases and preset0 retained. Every supplied preset name must match its globalID. Readback explicitly refuses unknown/conflicting presetID aliases instead of comparing only templatePresetId. Three regressions cover aliasrepresentation/conflict, conflicting names and actual created readback safeToReportSuccess=false. Installed before full suite828 total827 pass0 fail1 Windows skip. Independent main serializer audit found no additional confirmed defect; privatefallback and physical RM remain unproven.

## Release 1.0.139 (2026-10-04)
Installed successfully before testing. Full suite: 829 total, 828 pass, 0 fail, 1 Windows symlink skip. Independent saved-template readback now rejects preset name aliases conflicting with the global preset ID. Offline checks only; active MCP and physical execution remain separately unverified.

## Release 1.0.140 (2026-10-04)
Installed before testing; changed runtime files synchronized before full suite. 832 tests: 831 passed, 0 failed, 1 Windows symlink skip. Fixed local deload-decline authorization gap, RIR-only executable progression/deload false positives, and omitted per-set Smart RM selector comparisons. Default selector representation normalized via actual preset validator. Initial synthetic fixture wrongly used default10; current confirmed Gain Muscle default13 corrected without weakening checks. No account API calls. Latest safe local diagnostic: loaded134 / installed139 / restartRequiredtrue, instance85e9cd5c9537b6261a6c696b; credentials ready for example-profile. Physical direction of RM selectors remains unknown.

## Release 1.0.141 (2026-10-04)
Installer exit0 before full suite. 833 total:832 pass,0 fail,1 Windows symlink skip. Reviewed Smart RM conversion now removes obsolete presetId/presetName/templatePreset/preset readback aliases and emits canonical reference client preset name/ID. Regression uses actual conversion and saved update builder: compressed old Strength counters, conflicting old aliases, distinct new Gain Muscle selectors9/13, immutable original. Strict conflict guards retained. Independent source audit found no additional confirmed compressed/distinct per-set preservation issue in this scope; no physical/account proof.
Public search revisited original/community Speediance sources. raingart gm-config.js gist is a generic userscript configuration UI, not a Speediance/reference client load protocol; excluded from implementation evidence. No snippets executed or credentials imported.

## Release 1.0.142 (2026-10-04)
Installed before full suite. 835 total:834 pass,0 fail,1 Windows symlink skip. Explicit static conversions canonicalize unchanged confirmed old RM aliases only under trusted customize/fixed-load authorization, verified account unit, staticLoadChanged=true and matched valid old RM action. Altered aliases, missing authorization/unit, uncleared counters reject. Actual saved builder test preserves distinct40/45 kg wire88/99 and original immutable rows. Model-facing instructions and README corrected: deviceType1 is Gym Monster family, not generationGM1; 2/3 are other products, notGM2/3. No extra generation execution proof claimed.
Physical execution and private reference client engine parity remain unverified; no personal account API calls.

## Release 1.0.143 (2026-10-04)
Installer terminal handle missing after context refresh; completed installer log and matching installed143 manifests confirmed; all137 canonical installed files synchronized/hash-checked before tests. Full suite836total835pass0fail1Windows symlinkskip. Shared canonicalizeAuthorizedStaticPresetConversion now runs before actual MCP changedPositiveStaticLoadActions metadata discovery as well as saved builder. Exact preflight VM regression plus actual builder confirms copied old Strength aliases removed, metadata fetched for group10 and distinctstatic40/45 serialized88/99; fresh science serializers and unchanged baseline paths remain separate.
Safe actual MCP diagnostic after user reset: loaded143 installed143 restartRequiredfalse instancec5c061abb1b385792602e0bc, example-profilecredentialsready. Actual live local organization audit on synthetic2-week data: unsigned user-declined deload rejectsfinal_deload; explicitlyauthorized override passesorganization withscientificApprovalfalse andmutationSentfalse. No personal API calls or workout writes. Physical/privateengineparity stillunverified.

## Release 1.0.144 — preset edit scope
Installed before testing (installer exit 0). Full latest-source Node test suite: 837 total, 836 passed, 0 failed, 1 platform skip. Recognized preset ID/name aliases now belong to load scope; actual Smart RM and authorized Customize builder conversions pass load-only scope while unrelated unknown metadata remains rejected. This does not establish physical firmware parity. Independent new-chat local checks passed on 143 before this installation; they are not live verification of 144.

## 1.0.145 — absent preset aliases
Optional preset aliases null/undefined are accepted by diff scalar validation, consistent with preset recognition. Objects/arrays and null executable weights remain rejected. Real builder baseline and rest-only scope regression covered. Installed before full tests: 838 total, 837 pass, 0 fail, 1 platform skip. Synthetic fixture corrected to include required capacity and completion metadata; no production guard weakened. No account API or physical device test.

## 1.0.146 — actual saved-edit reconciliation
Installed before full tests (installer exit0). 844 total,843 pass,0 fail,1 platform skip. Shared reconciliation preserves opaque capacity and absent default selection in actual wire payload for confirmed unchanged executable work. Raw replacement builder, actual preview and regenerated commit covered. Immutable editWirePayload regenerated equality required; scientific gate unchanged. Mixed changes sum capacities actually sent; missing/invalid metadata rejected. Changed dose/RM/selection/unknown metadata remain visible. Four old expectations corrected for intentional unchanged-capacity preservation; genuine static and RM dose calculation tests retained. Circular ESM imports passed full startup/tests. No personal API reads/writes or physical machine proof.

## 1.0.147 — proven named preset representations
Installed before testing installerexit0. Full suite845total844pass0fail1platformskip. Saved diff compares equivalent aliases/numeric IDs/shared cells only when both full rows independently satisfy sameObservedRmPresetDose, names have valid types and all units prove reps. Conflicts, changed selectors and malformed types remain load differences. Actual reconciler restores opaque capacity; exact preview/commit regression includes fresh canonical Gain Muscle name. Raw wire payload and digest remain bound unchanged by comparison normalization. Canonical serializer representations retained rather than forcing compressed readback form into writer fields. No account API or physical firmware verification.

147 supplemental Customize audit: four installed-before-test regressions cover distinct per-set loads8/12/20, kg/lb and both explicit static protocols. Actual creation→simulated GET→replacement builder→scope→readback preserves three loads and Customize-1, empty RM counters and opaque capacity123 on rest-only change. Unauthorized changed weights still reject. Full suite849total848pass0fail1platformskip supersedes previous147count. Synthetic endpoints only; not physical/account API proof.

## 1.0.148 — shared Customize load representation
Installed before tests installerexit0. Full suite853total852pass0fail1platformskip. Static comparison expands singleton weights only for consistent preset-1, empty RM counters, confirmed aligned dose units and finite nonnegative bounded scalar loads. Different per-set values/malformed lengths remain load changes. Actual fresh fixed-kg serializer versus compressed simulated GET tested across both protocols and kg/lb, real builder/reconciler/scope/readback; distinct per-set Customize matrix retained. Initial fixture used invalidfixed-load label corrected to schemafixed-kg with authorization. No runtimeguard weakened. No account API or physical tests.

## 1.0.149 — CLI command boundary and loaded release
Installer exit0 before full newest-source suite:854 total853 pass0 fail1 platform skip. Actual runCli rejects mutations and extra/invalid arguments before environment/credentials access; allowed explicit login and current read commands preserved. Independent source research distinguishes upstream POST transport no-retry from application code91 resend; installed CLI revision remains unproven. No past duplicate write claimed.
After user MCP reset, safe local diagnostic confirms loaded149 installed149 restartRequiredfalse instance057a36e54ba95a01196d733c, example-profile credentialStatusready. No API connection or personal history verified. Package140files and both installations138nonadaptedfiles hashmatch source. Physical firmware/privateReferenceClient/nativeMac parity and client-slot implementation remain unfinished.

## 1.0.150 — duplicate saved variant occurrences
Installed successfully before full newest-source tests:855 total854 pass0 fail1 platform skip. Raw-action mode preflight and missing preset inheritance now share matchSavedActionOccurrences queues; explicit presets consume their occurrence too. Actual extracted MCP edit preflight regression preserves Strength5 then Gain Muscle1 with different Standard/Eccentric modes, passes a rest-only builder/diff and rejects an unauthorized second-mode change. Original data remains immutable. No personal API or device tests. Loaded149 confirmation does not establish loaded150; exact MCP reset still required for live150 checks.

## 1.0.151 — duplicate Smart RM readiness preflight
Installed exit0 before newest-source full suite:856 total855 pass0 fail1 platform skip. Exported shared occurrence matcher now used by actual validateChangedTemplateExercises. Previously this function compared every occurrence to the first; unchanged second presets could request unnecessary account observation, while a second changed to the first preset/dose could skip this specific readiness preflight. Actual full-function VM regression verifies zero metadata/readiness calls for unchanged distinct presets, and explicit missing-readiness rejection for the changed second occurrence. Science and other mutation gates remain independent. No account requests, physical execution or private reference client engine proof. Latest loaded release evidence remains149 before installations150/151.

## 1.0.152 — independent named preset alias shapes
Installer exit0 before full latest-source suite:858 total857 pass0 fail1 platform skip. Shared hasValidReferenceClientRmPresetNameAliases rejects supplied nonstring aliases in observed RM recognition and independent create/update readback. Null/undefined/blank and matching name normalization remain accepted. Two matrix regressions cover four aliases, bool/numeric/array/object shapes, shared counters and safeToReportSuccess; no claim that current API returns malformed names. Feature parity reference current-version header corrected from121 and occurrence/readback boundaries added. No personal API/device tests. Physical/private engine/nativeMac parity remains unverified.

## 1.0.153 — complete template evidence for slot/code checks
Installer exit0 before newest-source full suite:859 total858 pass0 fail1 platform skip. Recognize pageCount,totalPages,totalPage in known response/pagination wrappers; reject multi-page, malformed/conflicting declarations and nonempty zero-page responses. Preserve bare reference client pageSize=-1 response and complete one-page/empty-zero-page contracts. Corrected prior test that accepted explicit multi-page metadata; real single-create and cycle preflight snippets call the real parser and reject before downstream mutation. Current reference client tool contract50slots and stable code/new numericID rechecked by metadata only. Stable-code update/delete paths show no new defect. No personal API requests or physical execution.
Safe local diagnostic before153 install:loaded149 installed152 restartRequiredtrue instance057a36e54ba95a01196d733c; example-profile credentialStatusready. This is version mismatch, not logout. No live feature test through stale MCP.

## Historical gap implemented in161 — manual account-unit Customize (audit 2026-10-05)
Current source159 public set input supports anchored profile-auto and canonical fixed-kg, but not manually chosen per-set account-unit lb Customize values. Independently reopened public reference client workout-logic.js main: getRules selects integer-lb input rules for imperial accounts, and export retains each set weight/mode/rest. This is a missing public input path, not a demonstrated static preservation defect. Implement explicit manual Customize account-unit prescription through scientific set_load, approval, serializer and readback; keep default Smart RM and existing canonical fixed-kg separate. Source: https://raw.githubusercontent.com/hbui3/UnofficialSpeedianceWorkoutManager/main/static/workout-logic.js (mutable main inspected 2026-10-05; no firmware claim).
2026-10-07 public-source recheck: raw main static/workout-logic.js still defines named preset IDs1/3/5, defaults13/17/7, metric half-kg and imperial integer-lb UI, lbsToKg rounding Math.round((lbs/2.2)*2)/2, independent unilateral import expansion and per-set reps/weight/mode/rest export. Mutable source observation supports the existing public adapter; it does not prove private original reference client history selection or firmware. Primary source: https://raw.githubusercontent.com/hbui3/UnofficialSpeedianceWorkoutManager/main/static/workout-logic.js . Original reference client main.js URL was unavailable via web reader in this recheck; earlier captured evidence remains historical, no new private algorithm claim.
2026-10-07 independent science coverage recheck: suspected hidden RM selector-binding gap withdrawn after tracing actual saved-update reconciliation, immutable final wire, regeneration/scope comparison and v2 historical provenance. Scientific preset-default adapter metadata and preserved saved per-set selectors are distinct deliberate layers bound by the server; do not ask models to cite raw selectors as physiological doses. Per-set dose/load/mode/rest and RIR plus recovery-context binding remain mandatory. Cycle structural progression accepts an actual comparable main increase, not proof all muscle-specific/total dose dimensions improve; semantic review of the full derived prescription remains required. No account/physical verification.

Heart-rate aggregate follow-up audit: reversed reported minHeartRate/maxHeartRate now rejects. Absent/null timeLevelList with summary metrics is partial-schema and remains incomplete in all; explicit [] is reported as present but durationsComplete=false and totalSeconds=null. Real zero-duration rows remain measured. Parser/dispatch/aggregate regressions added; execution pending matching candidate installation. No account or firmware verification.
