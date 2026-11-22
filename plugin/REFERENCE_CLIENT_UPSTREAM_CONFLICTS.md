## Public evidence checked 2026-10-10 against Coach 1.0.298

ANPC commit `591e212042f10839271eea9fdb1187aa9293c9c1` writes Customize weight verbatim at [api_client.py629–631](https://github.com/ANPC86/SmartGymWorkoutManager/blob/591e212042f10839271eea9fdb1187aa9293c9c1/api_client.py#L629-L631). Its comment says JavaScript already converted lb to kg, but the actual [saveWorkout1391–1412](https://github.com/ANPC86/SmartGymWorkoutManager/blob/591e212042f10839271eea9fdb1187aa9293c9c1/templates/create.html#L1391-L1412) copies each set unchanged. The comment therefore does not establish a conversion at that boundary or the unit of every manual input. Keep Coach's explicit `legacy-reference-client-wire-lb-get-kg` versus `account-unit-verbatim` contracts; do not add an implicit conversion or infer account protocol from this comment. hbui3 multiplies by2.2; Labatt/ANPC writers do not. Source payload parity is not measured resistance.

The hbui3 [calendar renderer371–410](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/templates/index.html#L371-L410) displays entries using date and `isReservation`, and uses `code || templateCode` for active drag/delete. It does not match or verify a course reservation by `courseId`, date, device and returned status. Future official-program styling is not exact course-reservation readback. CourseReservation POST existence and catalog-detail rendering do not establish full executable prescription or scientific approval. Public course mutation remains unwired; do not report a submitted unverified request as scheduled.

These are public source observations only. Source commits were checked through public GitHub APIs; no account API, physical device verification, changed tests or native-platform checks were performed for this knowledge correction. Research files and SHA-256 values are retained in `C:/TQ3D/gm-coach-297-writer-research/FINDINGS.md` and `C:/TQ3D/gm-coach-297-official-contract-research/FINDINGS.md`.

# Speediance upstream protocol conflicts

Research 2026-10-03. No account reads or writes. Runtime release remains 1.0.79; this report is source research, not a tested protocol change.

## Static units: confirmed source contradiction

Original public reference client hbui3/UnofficialSpeedianceWorkoutManager@4e12bc6108f43c2705e935aa3d5db563cb8a3c06 save_workout converts static supplied kg to wire by x2.2. GM Coach currently implements this pinned contract and normalizes GET static kg accordingly.

New labatt/speediance-smartgym-workout-manager@fdd62c8fcecbb22f195ca9d86020026173d6cb78:
- docs/API-NOTES.md section 8 asserts both write/read weights use account units, no conversion, library recommendedWeight alone kg.
- api_client.py save_workout lines 782-786 assigns api_weight=weight_val, formats one decimal, capacity=reps*api_weight.
- named RM remains weights=3.5 and integer counterweight/counterweight2 (lines 788-791,822-824).

This is a real incompatible implementation, not proof the user's API/account switched protocol. Existing synthetic old-wire tests cannot establish correct actual account semantics. Must compare exact app/device API contract and source history, then obtain explicitly authorized narrow account readback or reference payload evidence before any live static write. Never silently send either format based only on a fork's README. A future protocol adapter must bind write/read unit semantics together; no one-sided serializer change.

Sources:
https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/docs/API-NOTES.md
https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/api_client.py
https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/api_client.py

Other candidates from new notes: Versioncode>=40400 content gating (library can silently omit content), unilateral explicit different-side prescriptions, preset0 preservation, Vita unrestricted device levels. Audit existing exact implementations before importing; observations in another account are not device validation for every model.
## Follow-up source history audit

2026-10-03 inspected GitHub commit diffs, not merely README claims:
- c8f54e2adc7ce6123f2d4afa808adce809013eb6 api_client.py diff only clarifies account-unit comment; api_weight=weight_val already existed. This does not introduce a new transport conversion.
- 325b6e1e18eab82779eddb1ebd74119baa71be3f source already has api_weight=weight_val and capacity=reps*api_weight. Thus distinct fork lineage, not evidence of a recently changed API protocol on the user's account.
- c017f5c649c9dd895be04a3f069a3ec374af8a38 changed Versioncode40304->40400 and removed Vita10 clamp. Later213f7fb6f28ebf3722f12da10a8980b6f9056014 raises40400->41000. Current Coach mcp_server.mjs uses41000 already; no header change required.

Potential implementation next: explicit protocol adapter must encode canonical manualkg and account-unit Customize consistently, plus exact matching readback contract. Evidence selection cannot be based on preset names, exercise names, old plan numbers or user kg preference alone. Do not silently relabel old stored values. A verified protocol selection/migration and regression coverage is required before exposure. Live comparison is not performed because personal data restriction remains in force.

https://github.com/labatt/speediance-smartgym-workout-manager/commit/c8f54e2adc7ce6123f2d4afa808adce809013eb6
https://github.com/labatt/speediance-smartgym-workout-manager/blob/325b6e1e18eab82779eddb1ebd74119baa71be3f/api_client.py
https://github.com/labatt/speediance-smartgym-workout-manager/commit/c017f5c649c9dd895be04a3f069a3ec374af8a38
## Current integration status — 2026-10-04, source 1.0.109

The earlier runtime .79 and proposed-adapter statements above are historical. Current source has static-protocol-context.mjs and propagates selected context through MCP serializers, saved reads, identity and scientific previews. Alternative account-unit-verbatim remains reference-bound; it is not selected from a user kg answer or a fork README. Invalid reference marks static display unit unknown and prevents reconciled notes from certifying identity. Current source tests include actual saved-program dispatch preservation of diagnostics. No personal account protocol observation has been performed; software regression evidence does not settle which fork transport matches every account/firmware. Current installed source/cache file comparison:129 matching files, adapted MCP configuration files excluded. Latest109 full suite729 passed,0failed,1platformskip; active MCP remains separately unverified.

## Additional public Go CLI lead — 2026-10-04
https://github.com/stozo04/speediance-cli README inspected. Claims single-binary Go CLI compatibility with Python CLI and GM1-only testing. Its suggestion that GM2 may have a different device_type is not evidence and conflicts with confirmed public reference client product-family mapping; never infer family2 from GM2. Reader, token-cache and single-binary architecture are research leads, not adopted code or SmartRM parity proof. Source transport/serializer and exact commit must be inspected before any implementation. No dependency changed and no account read.


## 2026-10-04 public upstream status and Pilates audit
hbui3/UnofficialSpeedianceWorkoutManager main still resolves to 4e12bc6108f43c2705e935aa3d5db563cb8a3c06 (public GitHub commits API, read-only). Commit message: Update README to reflect project discontinuation; committed 2026-03-06. README states discontinuation due to Speediance API security upgrades and official alternatives under development. This is the author's notice, not an official Speediance compatibility contract, not evidence that GM Coach presently fails, and not a reason to change credentials/authentication without observed failures.
Primary source: https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/README.md
Pinned api_client.py public fetch succeeded through authorized public read. save_workout lines483–608 confirm static weights and RM marker/counters; no band or Pilates write field was found in this file. reference client release notes/UI accessory filters are not serialization evidence. Pilates bands1–6 therefore remain unverified (not proven unsupported), and must not be encoded as kg/Vita level/RM without a confirmed contract. Original live reference client frontend and private backend remain a different evidence source.
Local safe diagnostic after130: running122, installed130, restartRequiredtrue, instanceec2f8e891ff2d0a03c620a21. No feature tests through stale MCP; no personal API reads/writes. Current130ZIP unchanged and verified.

## 2026-10-04 original live reference client Pilates read contract
Public main.js?v=fcc8e659a7b9 functions Sa (custom-template import/export) and vS (official-course import) read action.springGroupList as per-set arrays of {type,num}. Client repeats type num times to form bands; uses singleton fallback and defaultBand1 when absent. These defaults are UI behavior, not proof of actual bands. UI table:1Yellow4.5kg/10lb;2Pink6.5kg/14lb;3Blue10kg/22lb;4Orange11kg/25lb;5Green13kg/28lb;6Purple15kg/34lb. These nominal display values must not be treated as measured cable load/1RM/tonnage or universal machine limits. Public frontend did not expose Speediance writer: bands input is forwarded to reference client wrapper; private serialization remains unverified. Next audit must preserve/report springGroupList metadata in saved reads/edits without inventing a writable contract or permitting non-GymMonster hardware.

## 2026-10-04 current132 SmartRM/Customize saved-edit audit and next parity gap
Independent read-only source audit found no new confirmed fault in main per-set SmartRM/Customize saved edit paths. SmartRM conversion intentionally preserves reps/setcount; full dose/rest modification uses science-reviewed saved-program preview with allowed_changes/base_digest and fresh readiness/re-preparation. Per-set serialization preserved; no accountAPI/test rerun or physical equivalence claimed.
Enabled reference client tool metadata confirms individual fact lifecycle: remember_fact category goal/schedule/injury/preference/dislike/equipment/body/note, expiry_days null durable or1..3650 transient; get_preferences returns memory{id,text,category,source,created_at,expires_at}; forget_fact deletes exactid. No reference client tools called. CurrentCoach feature matrix explicitly marks individual expiring remember/forget semantics unimplemented. Nextintegration audit: profile scope, effective planning context and expiry-bound approval invalidation; do not store assessed/account-owned mutable metrics as freeform loadanchors.
reference client descriptions conflict on deletion history: delete_workout says per-session logs removed; get_session_detail says session record retained after template deletion (includingautoGoalFocused). These descriptions are unversioned metadata, not proof of both guarantees. Preserve conservative delete-risk communication and endpoint/type qualified session lookup; do not claim permanent preservation or destruction for everytype without API/source evidence.

## 2026-10-04 additional pinned fork audit (source136, documentation only)
ANPC86/SmartGymWorkoutManager main resolved through GitHub API to 591e212042f10839271eea9fdb1187aa9293c9c1. Commit fixes llm_prompt mode enum that previously claimed2=Eccentric/3=Isokinetic/4=Constant/5=Spotter. Corrected prompt lines471,481–485 and templates/create.html964–965,1133–1135 agree1Standard2Chains3Eccentric, matching Coach. Author claims independent device/runtime corroboration, but this remains third-party source evidence, not our physical test. No need to change Coach mode enum.
api_client.py624–637 retains cable preset dummyweights3.5 and RMcounterint(weight_val), separate Vitaweights0/level1–10clamp607–609. Customize629 assigns api_weight=weight_val with comment JS alreadyconverted LBS→KG; this comment is not enough to determine actual account transport units, and differs from pinned original x2.2 writer and Labatt account-unit adapter. Do not copy another fork's10clamp or unit assumption into all generations. Completion617–621 uses2seconds1reps consistent with existing writer. No new published private reference client suggestion/history algorithm found here. No personal API call or change to runtime code/tests.
Sources:
https://github.com/ANPC86/SmartGymWorkoutManager/commit/591e212042f10839271eea9fdb1187aa9293c9c1
https://github.com/ANPC86/SmartGymWorkoutManager/blob/591e212042f10839271eea9fdb1187aa9293c9c1/api_client.py
https://github.com/ANPC86/SmartGymWorkoutManager/blob/591e212042f10839271eea9fdb1187aa9293c9c1/llm_prompt.txt

## 2026-10-04 Pilates writer audit — source153, documentation only
Read-only agent inspected current public main writers in Labatt, ANPC86 and original hbui3. Labatt save_workout uses an explicit action-field list and contains no bands/springGroupList contract; ANPC86 fixed-field writer likewise lacks it. ANPC86 save_workout_payload echoes an already assembled payload to customTrainingTemplate, supporting field-preserving edits rather than defining new spring type/count serialization. Vita dataStatType6 level cannot substitute for Pilates bands. Existing Coach spring readback preservation remains appropriate; newly authored band resistance is still incomplete. No runtime change, tests or account requests in this research. These current-main observations are dated research, not a pinned firmware/API contract.
Sources:
https://raw.githubusercontent.com/labatt/speediance-smartgym-workout-manager/main/api_client.py
https://raw.githubusercontent.com/ANPC86/SmartGymWorkoutManager/main/api_client.py
https://raw.githubusercontent.com/hbui3/UnofficialSpeedianceWorkoutManager/main/api_client.py
https://raw.githubusercontent.com/labatt/speediance-smartgym-workout-manager/main/docs/API-NOTES.md
