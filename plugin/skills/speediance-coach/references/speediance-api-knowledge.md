# Speediance API: evidence and implementation boundaries

Evidence updated: 2026-10-05. GM Coach uses native API login and workout/session reads since 1.0.154. Historical source observations below retain their original scope.
This reference is knowledge for diagnosis and future implementation. It does
not authorize account reads, introduce callable tools, or prove physical device
behavior. Keep the science gate and the active profile's consent rules.

## Evidence levels

Release .65 adds an implemented, bounded completed-session scan behind
`gm_coach_get_exercise_history(include_sessions=true)`. It preserves actual API
session dates separately from weekly statistics. For an empty, positively
identified non-cardio Free Lift, the session reader can request
`GET /api/app/trainingInfo/freeTrainingDetail/{positive int64 trainingId}`.
Malformed, unavailable or empty fallback results remain explicitly partial;
no history-derived 1RM or RIR is invented. This follows the pinned public
[session helper](https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/tools/_common.py)
and [API client](https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/speediance/api.py),
not proof of the active reference client’s private load resolver.

Completed-session dose parsing follows explicit unit labels/durations and
recognized `completionMethod`: 1=reps, 0/2=seconds. `countType` is metadata,
not a competing dose unit. An authorized .65 diagnostic found live rep-based
work with completionMethod=1 and countType=2; treating both as unit codes
caused a false conflict. The public
[parser](https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/speediance/parsing.py)
likewise decides session kind from completionMethod, not countType. Unknown
completion methods and genuine conflicts with explicit labels remain unknown;
do not copy that parser's default-to-reps behavior for unsupported fields.

| Level | Meaning | Allowed conclusion |
|---|---|---|
| Official product explanation | Speediance describes a device feature. | Feature intent; not an undocumented API field or firmware formula. |
| Discovered route name | Community extraction found a string in the Android app. | Research lead only; method, parameters and behavior may be unknown. |
| Repository-observed route | A repository author reports a successful account call and response shape. | Source evidence to guide implementation; not a live verification for this user, region or release. |
| Coach implemented | Current Coach code exposes and validates a path. | Available capability within its stated boundaries; installation, loaded MCP version and actual response still matter. |

Labatt's API notes are unofficial, unaffiliated community observations. Their
README reports 665 extracted route names; `docs/verified.md` separately records
calls the author observed. Do not copy the route inventory into tools or probe
unknown methods/parameters simply because a name exists. [Pinned README](https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/README.md),
[discovered route list](https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/endpoints.md).

## Account unit provenance: GET versus retained config (public review 2026-10-23)

The pinned community client explicitly reads GET `/api/app/userinfo/info` in [api_client.py925-937](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/api_client.py#L925-L937). Its [profile_view.py6-8,29-36](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/profile_view.py#L6-L36) warns that `userinfo.weightUnit` can be0 for an imperial account and labels values from a separately supplied config `unit`. The [caller](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/app.py#L509-L516) passes config explicitly. This is community consumer evidence, not a general rule resolving conflicting GET aliases.

Config unit is stored beside user_id/token, but that alone does not establish current-account provenance: [login358-362](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/api_client.py#L350-L366) replaces the returned user_id/token while preserving the existing config unit; [logout390-395](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/api_client.py#L390-L399) preserves it too. Thus an inherited config value can cross an account transition. It must not be promoted to fresh API-confirmed unit evidence or authorize current-account manual Customize. Retain source/account identity and freshness separately; conflicting populated GET aliases remain unresolved without endpoint-qualified evidence.

The separate [login notes38-41](https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/auth.md#L38-L41) report NANO/BIKE login responses omitting `unit` and returning unreliable `weightUnit=0`. A login-response observation does not establish GET `/app/userinfo/info` field precedence. These sources do not change static protocol selection, named RM selectors, approval/science gates or physical load claims.

## Repository-observed read paths

GM Coach includes the separately consent-gated heart_rate_zones feed: GET /app/userDataStat/heartRateStatIndex without parameters. Pinned reference client [api_client.py](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/api_client.py) implements get_heart_rate_zones; [cardio_page.py](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/cardio_page.py) interprets timeLevelList[].timeLevel as seconds and preserves levelRateMin/Max/Display plus maxHeartRate/minHeartRate. This is repository renderer evidence, not an account response or firmware verification. The aggregation period, physiological classification and watchType interpretation remain unknown; missing/malformed durations are never replaced with zero.

The following shapes are reported in the pinned notes. **GM Coach does not yet
expose these health/telemetry endpoints as dedicated tools.** Successful source
observations do not establish availability on a particular account.

| Route after `/api/` | Reported input / output | Interpretation boundary |
|---|---|---|
| `app/boatingSkiDataGraph/{uuid}` | Session UUID; samples in `pointDataList`. | Row/Ski telemetry: time, stroke rate, resistance, watts and pace. UUID is different from numeric training ID. |
| `app/trainingInfo/courseTrainingInfo/{trainingId}` | Numeric session ID; summary includes `uuid` and `existBoatingSkiDataGraph`. | Request the graph only when existence is reported; session totals come from the summary. |
| `mobile/userHealth/trainingLoad/dateRange` | `startDate`, `endDate`; daily load with `trainingLoadUnit`, recommended bounds. | Reported unit is TRIMP; do not present it as lifted kg, sets, or a complete strength-volume prescription. |
| `app/userDataStat/trainingPartFatigueInfo` | No parameters; `trainingPartId2`, `fatigue`, `muscleLoadStatus`. | Names need a confirmed training-part ID mapping. A device score does not independently establish medical readiness. |
| `app/strengthScore/summary` | No parameters; total, update time and regional scores. | Empty regional values can mean insufficient assessment evidence, not zero strength. |
| `app/userBody/current` | Current body measurements. | Account-specific measurements, not training load anchors. Preserve their confirmed units. |
| `app/userPreference` | Device behavior toggles. | Separate from Coach's local training interview/preferences. |
| `mobile/userHealth/newIndex/healthScore` | Card values and timestamps; some `extData` is a JSON string. | A summary card is not raw physiological measurement. |
| `mobile/userHealth/mockReport/hasRealRecoveryData` / `hasRealSleepData` | Boolean flags. | Establish whether recovery/sleep data is real before interpreting screens that may show samples. |
| `mobile/userHealth/physicalCondition/detailByDate` | `dateStr`; fitness/fatigue/status fields. | Author reports availability without a wearable. Do not claim that for every profile without its own response. |
| `mobile/userHealth/recovery/detailByDate` | `dateStr`; recovery, HRV, resting HR, sleep and muscle-load blocks. | Author observed empty blocks without overnight recording. Missing blocks remain unavailable. |
| `mobile/userHealth/sleep` | `dateStr`; sleep and target duration. | Data availability must be checked. The separate `sleep/rhythm` route is POST, not GET. |

For the Row/Ski graph, `minSpm`/`maxSpm` and
`minResistance`/`maxResistance` are reported **programmed targets**, whereas
`spm`/`resistance` are measurements. Targets changing can identify interval
boundaries. Early pace and individual zero stroke-rate samples need careful
handling; do not invent missing samples or totals. These are read-path findings,
not proof of a writable cardio-resistance field. [Pinned observed routes](https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/verified.md).

## Exercise statistics and dates

GM Coach implements the paginated group-statistics read
`app/actionLibraryGroup/userActionStatPage?id={groupId}`. Group identity, explicit
1RM field names, units and narrower variant identity remain separate evidence.
`maxWeight`, volume, generic RM selector values and velocities are not promoted
to reported 1RM.

For preset Smart RM, Coach confirms the global preset and exact variant. Account
1RM statistics are optional for writing; the device can assess load during
training. No account kg/lb unit, local numerical anchor or estimated e1RM is
required for a named preset. Unit-qualified numerical anchors belong to explicitly
requested static Customize/profile-auto, not the default preset path.

## Mobile client version and API codes 98 and 1004

Speediance reads the request `Versioncode` header (the app version as `major * 10000 + minor * 100 + patch`).
Two answers depend on it:

- API 98 ("Please upgrade the APP version in System Setting"): the declared code is below what the requested
  content needs. The gate is per content (Vita needs `40400`; `41000` exposes 1042 exercises) and an older code
  can also receive less data without any error.
- API 1004 ("Invalid nonce string"): the declared code is rejected as implausibly high or as changing too fast.
  `labatt/speediance-mcp`, another public Speediance MCP and the SmartGym manager stay on `41000` and warn that `42000+`
  and rapid changes are throttled.

GM Coach declares one stable code per region for login and every request (`speediance-app-version.mjs`). It starts
at `41000` and rises only after API 98, one anchor at a time along `41000, 41600, 41900, 42300` (Android releases
4.10, 4.16, 4.19 and 4.23). After API 1004 it returns to the highest code below the rejected one that the API
processed (code 0, or the 98 answer of the version gate), so a login confirmation at the baseline never hides a
higher processed anchor. A 1004 on a code the API already accepted is treated as a short throttle and the code is
kept until it repeats three times, at least 30 seconds apart. A ceiling learned from 1004 expires after 6 hours and
a floor learned from 98 after 7 days. The result is kept per region in `speediance-client-version.json` in the
plugin data directory, so every process (chat or tunnel) that shares that directory declares the same code.
A read is repeated with the next code (at most four times per request) and one request may walk the whole ladder;
a write is never replayed. Only when every anchor answered 98 is the public iOS listing consulted, only for a read
that can still be repeated, once per hour (ten minutes after a failed lookup). An iOS number is never used by itself.
A user can force any code, which is then never negotiated, with `{"override": 41900}` in that state file (read by
every process; MCP hosts often do not pass user environment variables to a server) or with
`GM_COACH_SPEEDIANCE_VERSIONCODE`. `speediance_check_connection` reports the declared code as `clientVersion`.

Why: on 2026-11-05 the iOS-derived `Versioncode 42400` returned `1004` (Android 4.24.00 appeared on APKPure on
2026-11-06), login used a different code than the reads, and a lower fallback alternated with the candidate. That
is the pattern the public clients warn about. A public bisection of the 98 gate (`40304` to `40399` rejected, `40400`
accepted) shows the gate is numeric. API `code: 0` is the only confirmation. The policy cannot update the Speediance
app on a phone or machine, and GM Coach implements no nonce signing; if every anchor answers 98 and higher codes
answer 1004, only the official client contract can resolve it.

Evidence and limits: the only public observation of the 1004 throttle for implausibly high codes is
`labatt/speediance-smartgym-workout-manager` commit `213f7fb` (2026-07-15: "observed at 42000+ and under rapid
change"). One reading is that the ceiling follows the newest released app; iOS 4.24.00 appeared on 2026-11-04 and
Android 4.24.00 on 2026-11-06, which would explain `42400` on 2026-11-05. That is an inference, not a measurement.
No public report was found of `41000` returning 98 for every request, but no captured server response for any code
is public either. Only `speediance_check_connection` with `clientVersion` on the installed plugin shows what the
server accepts for a given account today.

Labatt's source and regression tests identify this feed's `dayStr` as a weekly
aggregate label. Coach preserves it with `datePrecision: "week"` and
`observationDateSource: "dayStr"`. It can order weekly buckets; it does not prove
the exact date or final working set of a session. Do not call aggregate volume
the volume lifted on that Monday. Recover actual workout dates/series from
confirmed session details when that capability and consent are available.
Exact period boundaries remain unstated by Coach; do not derive them from a
label alone. [Pinned MCP history resolver](https://github.com/labatt/speediance-mcp/blob/96efbb3da0fa9d903defecbd2f726ea1885ce12e/src/speediance_mcp/tools/coaching.py),
[pinned weekly/daily regression](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/tests/test_daily_exercise_stats.py).

## Authentication, units and error diagnosis

The author reports session slots per `App_type`: another login in the same slot
can displace a phone or machine session. Code `90` indicates displacement in
these observations; `91` indicates expiry. Do not treat every error as a reason
to log in repeatedly, change client type, or ask again for a password. Other
reported codes distinguish bad parameters (`10`), wrong method (`12`), version
gating (`98`), and invalid client/version/signature (`1002`–`1005`). Respect
Coach's implemented authentication configuration and token handling.

The notes report that `NANO`/`BIKE` login responses can omit `unit` and carry an
unreliable `weightUnit` default. That is a source-specific warning: login fields
alone must not silently select kg for an unconfirmed account.

Endpoint authority remains unverified (public recheck 2026-10-11):
[reference client profile implementation](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/profile_view.py)
uses login/config `unit` and warns that `/app/userinfo/info.weightUnit` is
unreliable; its [synthetic profile fixture](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/tests/test_profile_view.py)
contains `unit:1, weightUnit:0`. This is community implementation and a
constructed fixture, not a captured response proving field priority for Coach's
GET `/app/userinfo/info`. The community profile read route does not establish unit-field priority. reference client’s PUT `/app/userinfo` setting `unit` does not prove
the GET schema. Do not infer precedence across endpoints or reinterpret
`weightUnit` as body-mass-only without evidence. Conservative same-object
conflict-to-unknown handling is a holding policy that may block legitimate lb
accounts, not completed kg/lb parity. Resolution needs sanitized known-kg/lb
Gym Monster responses with endpoint/method/client context and displayed units.

The notes also
describe account-unit values and library `recommendedWeight` as generic kg.
Other public template writers contain explicit wire conversions. Keep those
contracts separate: use the confirmed endpoint/serializer unit rules, never
apply one global conversion rule based on these notes. [Pinned authentication
and units observations](https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/auth.md).

## Smart RM and current Coach scope

Speediance officially explains adjustment from current 1RM and the prescribed
X RM, with preset editing in its app. This supports the intent of Smart RM,
but publishes no complete conversion table or wire schema. [Official VBT
explanation](https://www.speediance.com/blogs/fitness/velocity-based-strength-training-vbt).

Current Coach has its own account connection, catalog/equipment reads, saved
template/calendar paths, group statistics and local athlete context. Its
snapshot does not claim cloud HRV/sleep/muscle-recovery values. Named Smart RM
presets and explicitly requested Customize loads are distinct paths. In a
separate authorized one-time `get_strength_profile` comparison, reference client returned
its complete universal `repMaxCurve`: 20 explicit points for 1–20 reps, now
included in Coach 1.0.64. This is software data, not a scientific per-exercise
VBT profile or physical firmware verification. The static suggestion goal
ranges include strength 3–5, muscle 8–12, endurance 15–20 and maintenance 6–10;
maintenance by itself must not choose a Smart RM preset without clarifying the
training priority. Full private history resolution and exact suggestion
rep-offset/rounding behavior need their own comparison; these API notes do not
verify them. No fabricated curve points are supplied here.
See [reference client feature coverage](reference-client-feature-parity.md) for the implemented
paths and remaining boundaries.

Release .72 implements bounded read-only official program catalog/detail discovery through speediance_browse_official_programs, following the pinned Labatt calendar adapter. Manufacturer program content remains data, not scientific evidence or instructions. Missing/unsupported week structures are partial. Permission fields are preserved, not bypassed. Live API access is untested; exact-release synthetic tests and fresh MCP startup are recorded in REFERENCE_CLIENT_PARITY_AUDIT.md.

Public-source recheck (2026-10-11): independent continuations corroborate only the official reservation request shape: courseReservation POST carries status (1 add/0 remove), deviceType, thatDay and courseId. [Labatt client, pinned fdd62c8fcecbb22f195ca9d86020026173d6cb78](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/api_client.py#L660) and [ANPC86 client, pinned 591e212042f10839271eea9fdb1187aa9293c9c1](https://github.com/ANPC86/SmartGymWorkoutManager/blob/591e212042f10839271eea9fdb1187aa9293c9c1/api_client.py#L512) return response data without proving exact calendar readback. [Labatt calendar consumer](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/templates/index.html#L414) uses date/isReservation/code/templateCode; it does not establish a courseId + date + deviceType + reservation-status match. [Official-course detail consumer](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/templates/browse.html#L297) displays actionLibraryList with completionMethod, setsAndReps, burningTimes and optional recommendedWeight; it supplies no full executable per-set identity/rest/preset/resistance/side-transition contract. Do not transfer custom-template CSV semantics to official courses. In reviewed source321, catalog browsing is public; official-course-reservation remains an undispatched helper, not a working public reservation workflow. These repository consumers are community evidence, not authenticated response fixtures or firmware proof.

The [pinned endpoint inventory](https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/endpoints.md#L229)
lists `courseSnapshot`/`course/customizedInfo` without methods or response schemas;
they are not justified fallback probes. The [completed-session JSON fixture](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/tests/fixtures/sp_detail_1103072.json)
cannot establish future course presets/rests. The [planner's synthetic tests](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/tests/test_schedule_planner.py#L82)
keep official courses separate from own custom-template reservations. Missing
contracts therefore remain exact course/date/family/status readback and planned
per-set variant/side/dose/rest/mode plus Smart RM selector or explicit load/unit.
`recommendedWeight` alone does not distinguish Smart RM from Customize.


Vita completed-history method5 (pinned Labatt API-NOTES section2) has distinct target seconds and achieved repetitions. Coach scopes this interpretation to finished history with explicit dataStatType6; generic code5 remains unknown. This community-observed mapping is not official API documentation, and does not establish saved-template readback normalization on its own.

## Additional public completed-history reference (2026-10-04)

Audited pookey/gm-summary at commit `57f42f0e510a2199ceeb135f2ef59f6d7ca019a4`:
https://github.com/pookey/gm-summary/blob/57f42f0e510a2199ceeb135f2ef59f6d7ca019a4/speediance.py
Its `_parse_exercise` preserves `maxWeightPr`, `totalCapacityPr`, `oneRepMaxPr` and `oneRepMax`. Coach exposes these as API-reported metrics only, never independently verified PRs or current assessed strength anchors. Boolean and numeric 0/1 flags are accepted; missing/malformed/unsupported string flags remain unknown. Resolved session/account unit context is separate from the reported number; unknown stays unknown.

This repository is read-only and supplies no RM/static write parity evidence. Its permissive `round(capacity/sum(weights))`, default kg on unknown login unit, and naming telemetry maximum a working load are not adopted. The author's 445-set observation has no checked-in raw corpus establishing independent firmware validation. Coach retains completeness, one/two-point consistency and ambiguous-side checks for volume. SOFTWARE header and AI-session endpoint corroborate existing public approaches, not an official API contract.

## Separate optional LAN integration research (2026-10-04)

https://github.com/LilaQ/ioBroker.monster-remote documents a separate local Monster Remote adapter. Its README reports live load/unit/mode, rest countdown, rowing metrics, upcoming native calendar and exercise history. This is not a Speediance cloud API or original reference client backend. It requires Monster Remote GM Features installed on the Gym Monster, active access, same LAN and a local Helper secret; README names Helper 2.02.08 for current reliable counters. Public helper liveness alone is not authenticated compatibility evidence.

GM Coach does not implement this transport. Do not claim these capabilities from the existing account MCP, guess cloud routes from local helper paths, auto-discover private LAN devices during development, or treat live peak/selector telemetry as an assessed strength anchor. Source review and any future bounded read-only adapter should precede device controls and preserve scientific prescription gates. LAN availability cannot be assumed for other accounts/generations.

## Official device behavior cross-check — 2026-10-05

The official [Speediance Europe Smart Fitness page](https://eu.speediance.com/en/pages/smart-fitness) describes live assessment that updates 1RM during training and adjusts recommended weights. This supports keeping machine-managed prescriptions separate from fixed Customize loads. It does not disclose preset percentages, RM-counter formulas, API fields, generation-specific firmware behavior, or a private reference client history resolver. Do not derive any missing serialization or physiology rule from this product description.

The same page lists Standard, Chain, Eccentric and Constant Speed for free training. This is device-feature evidence, not evidence that all four are writable through the saved-template sportMode field. Preserve the independently verified reference client template contract and physical-verification limits.

## Template quota evidence — checked 2026-10-06

Actual account quota is unknown. The 50-template value is a historical reference client tool reference, not a verified universal Speediance account maximum. Report used count from a complete list and required new unique session templates; actual limit/left/shortage remain null. Reference-only estimates never block writes.

The official developer response on https://apps.apple.com/de/app/speediance-home-workout/id1612755038 announces a future increase to 500 templates for Wellness+ members. This is an announcement, not proof of current rollout or account entitlement. The adjacent user review reporting 50 is not API evidence.

Pinned public reference client api_client.py at https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/api_client.py reads app/v4/customTrainingTemplate/appPage?pageNo=1&pageSize=-1&deviceTypes=... . No quota endpoint was found in that file or the checked app.py, static/workout-logic.js, templates/library.html and templates/create.html. The discovered route inventory https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/endpoints.md lists template CRUD/list/statistics routes but provides no verified quota response contract. Do not infer quota from total row count, pagination totals, membership marketing or an API error. Keep complete-list and concurrent-change guards and do not replay failed writes or automatically delete templates.

## Account-bound machine detection candidates — checked 2026-10-06

The route inventory pinned at commit `095cb2741bb1472a6ffae7b839c3c9be10f13e62` lists `app/matUserMachine/allMachine`, `app/matUserMachine/hasBindMachine`, `app/userDevice/info`, `app/userDevice/typeDisplay` and `mobile/matUserMachine/page`: https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/endpoints.md . These are research candidates, not verified callable contracts. The checked https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/verified.md does not establish their HTTP method, parameters, response model fields or account binding. Some inventory entries are application module paths rather than proven HTTP routes; do not call candidates or infer generation enums from this list alone.

Public reference client commit `fdd62c8fcecbb22f195ca9d86020026173d6cb78` reads device family from configuration in api_client.py and saves owned devices from a manual settings form in app.py: https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/app.py . This is not evidence of automatic model detection. Current Coach initializes new profiles with Gym Monster family `device_type=1`. When an existing profile contains another family, setup displays a warning and requires explicit confirmation that the account uses Gym Monster before repairing the saved family to 1. This is user-confirmed family repair, not automatic detection or a model selector. A missing confirmation preserves the existing configuration. A confirmed family change resets unsupported-family static-load protocol/reference rather than carrying it over, invalidates the old account session through the existing connection-settings comparison, and existing account/config fingerprints prevent reuse of old approvals. machineModel is reported only from the local training profile. All Gym Monster generations belong to the supported family scope; their individual physical behavior is not thereby verified. Automatic account-bound model detection remains unimplemented pending a verified response contract.

### Implemented body and physical-condition context (2026-10-06)
Pinned verified.md explicitly names userBody/current weight, height, bmi, bodyFatPercentage and says account display units; it does not prove exact kg/lb or height units. Do not expose appUserId. physicalCondition/detailByDate explicitly names physicalConditionResp physicalConditionValue, physicalConditionScore, fitness, fatigue, trainingStatus and physicalConditionParam trainingStatusScore/trainingStatusScoreAvg. Preserve raw reported indicators and selected date, without inventing readiness, timestamp freshness or units. Reference: https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/verified.md . Source observations do not verify the current account.

Public reference client latest revision checked through GitHub commits API on 2026-10-06: fdd62c8fcecbb22f195ca9d86020026173d6cb78 (2026-09-30). Its assessment fix distinguishes alternating unilateral sessions from genuine comparable within-set L/R counts. This is a parsing/reporting lesson, not scientific proof of imbalance or a universal threshold. Health card source: https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/cardio_page.py#L88 . Walking/nutrition values are renderer-labelled steps/logged kcal; timestamp freshness is unconfirmed, no biological-age heuristic.
Pinned history namespace mapping: https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/session_detail.py declares history types 1/6/7=free, 2=course, 3/5=custom, 4/9=AI, 10=manual; calendar codes differ. Coach routes confirmed free/custom only to its existing session reader; course/AI remain explicitly summary-only. Manual type10 returns reported summary metrics with unverified units, no exercise detail and no getById/free-detail probing. This is public source evidence, not a live account or firmware validation.

Period statistics: speediance_get_period_statistics reads /mobile/v2/report/userTrainingDataStat with exact start_date/end_date and explicit consent. Pinned reference client api_client.py643–656 establishes endpoint, not units/response metric meaning or date inclusivity. Output retains bounded reported JSON and unknown field semantics; never derive physiological recovery or assume capacity is tonnage. Source https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/api_client.py#L643

The pinned history renderer labels trainingTime as seconds and calorie as kcal; reportedMetrics preserves that display provenance, while capacity remains unknown unit/not tonnage. completenessScope covers only the bounded returned container, not all records in the period. consent_to_read_speediance=true records existing explicit authorization for this purpose: authorization persists; do not ask the human again merely for another report in that authorized scope. Never set consent=true when authorization is missing or overridden. Existing restrictions on private reads remain authoritative.


### Standalone session summary (public source pinned)
`speediance_get_reported_session_summary(training_id, consent_to_read_speediance=true)` performs authenticated GET `/app/trainingInfo/courseTrainingInfo/{training_id}` (transport base includes `/api`). Source: reference client commit `4e12bc6108f43c2705e935aa3d5db563cb8a3c06`, api_client.py 678–691; templates/history.html 265–274 labels trainingTime as duration and calorie as kcal. Preserve zero without falling back to another record. totalCapacity unit is unknown: never call it kg, tonnage or series weight. No custom/course/AI/calendar automatic join; raw id/trainingId equality is not namespace proof. Requested ID must be a positive safe integer. Endpoint coverage remains unknown. Existing explicit user authorization persists within the authorized purpose; the consent flag reflects authorization, not a requirement to ask again. Unknown text and sensitive fields are omitted. Per-set weights remain the separate completed-workout detail reader's responsibility.


### Completed ordered load sample channels
Public pinned reference client `templates/history.html` lines354–379 groups consecutive returned weights. Coach preserves this order as bounded `reportedLoadSequences`, separate left/right/aggregate channels, exact source paths, unit provenance, and consecutive segment sample counts. Counts are samples, not proven repetitions. Truncation is explicit. Existing cable-side evidence suppresses aggregate samples even when a side is malformed; do not replace this guard with reference client’s channel selection or `capacity/reps` estimate. Tables may display segments with sample counts and channel labels, alongside existing min/max and performed reps. showCalculatedLoads=false never hides returned completed samples. Missing telemetry does not authorize invention from a summary or RM selector.


### Public preset discovery prescription contract
`speediance_get_exercise_presets.referenceClientPresetPrescriptionRules` exposes exact public reference client UI selector/repetition defaults and ranges from existing server constants, separately from `rmCompatiblePresets` and exact catalog variant selection. Selector values are RM selectors, never kg/lb or measured resistance. Rest ranges are reference client UI/import limits only, not firmware/API constraints or optimal scientific prescriptions. This disclosure performs no additional account reads and does not select or mutate a preset or bypass scientific review.


## Overnight recovery collection remains incomplete
Public source inspection on2026-10-10: [verified.md](https://github.com/labatt/speediance-api/blob/095cb2741bb1472a6ffae7b839c3c9be10f13e62/docs/verified.md#L111) confirms GET recovery/detailByDate, dateStr and five blocks only; observed blocks were empty without overnight recording. Recovered app names nightRestHeartRate/sleepScoreAvg lack confirmed returned full parent paths, units and measurement timestamps. The pinned reference client [dashboard renderer](https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/templates/dashboard.html#L184) displays separately derived muscle-fatigue/time estimates, not those overnight scalar blocks. Do not copy its readiness percentages as physiological proof.
Current Coach preserves real-data gating and unsupported-schema disclosure; it does not collect all useful overnight scalar values. Do not imply complete health coverage. Filling this gap requires exact full-path public or authorized source evidence first. Arbitrary nested numeric leaves can be private IDs/timestamps; guessed score/value aliases, HRV units, freshness and readiness thresholds are prohibited. Retain separate report/account bindings and scientific evaluation. No claim of overnight readiness follows from block presence or retrieval time.

### Current upstream unit and calendar caveats (public source review 2026-10-10)

ANPC [writer629–631](https://github.com/ANPC86/SmartGymWorkoutManager/blob/591e212042f10839271eea9fdb1187aa9293c9c1/api_client.py#L629-L631) sends Customize values verbatim despite a comment claiming prior lb→kg conversion. Its actual [saveWorkout1391–1412](https://github.com/ANPC86/SmartGymWorkoutManager/blob/591e212042f10839271eea9fdb1187aa9293c9c1/templates/create.html#L1391-L1412) clones sets without that conversion. Do not use the comment as unit proof or automatic protocol detection. Preserve explicit account-unit-verbatim versus legacy-reference-client-wire-lb-get-kg; RM markers/counters do not enter static-load conversion and source parity does not verify physical kg.

hbui3 [index.html371–410](https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/templates/index.html#L371-L410) uses dates/isReservation for display and code/templateCode for active operations. It does not prove exact courseId/date/device/status reservation readback. Do not infer catalog course identity from completed training_id or display title. Official catalog completeness does not authorize mutation or prove full per-set variant/unit/load/mode/rest/section coverage; retain unknown scienceExecutability and unverified reservation outcomes.

## Session watch summary: pinned consumer evidence

Public pookey/speediance-cli commit c7fbc4e910b9065958406522b9a8f1f169394c02, [client.py](https://github.com/pookey/speediance-cli/blob/c7fbc4e910b9065958406522b9a8f1f169394c02/speediance/client.py) heart_rate_graph/summary uses GET `/app/watchMsg/getHeartRateGraph?uuid=...`, fields minHeartRate/avgHeartRate/maxHeartRate/heartRates. [parsing.py](https://github.com/pookey/speediance-cli/blob/c7fbc4e910b9065958406522b9a8f1f169394c02/speediance/parsing.py) course_uuid locates UUID inside finishedReps[].trainingInfoDetail.uuid; Free Lift at info.uuid. Coach requires unique bounded UUID and exact dated completed identity/account before request. Raw samples/UUID are not added to the summary. This is consumer code, not an official schema or verification of all watches; sample cadence and physiological recovery interpretation are unverified.

Privacy scope: only the new gmCoachSessionHeartRate summary omits UUID and raw graph samples. Existing returned session detail remains unchanged and may contain its source UUID; do not describe the entire tool response as UUID-free. UUID is a session identifier, not an authentication credential.


## Optional session rowing samples
Community consumer labatt/speediance-mcp@96efbb3da0fa9d903defecbd2f726ea1885ce12e calls GET /app/boatingSkiDataGraph/{uuid}. pointDataList fields time/spm/pace/power/resistance and target bands are consumer evidence only. Exact date/namespace/account and boolean flag required. Course/AI current reader has info=null, so unavailable is expected without adding unverified summary endpoints. Units remain unverified; no duration/pace conversion/calorie/readiness inference. Summary excludes rawpoints/UUID/health fields.
