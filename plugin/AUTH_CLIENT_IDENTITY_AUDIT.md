# Authentication client identity audit

2026-10-03. Public source research only; no account requests, login, token inspection, tests or identity changes.

## Pinned evidence

reference client fork: `labatt/speediance-smartgym-workout-manager@fdd62c8fcecbb22f195ca9d86020026173d6cb78`, `api_client.py::LOGIN_CLIENT_TYPES`, `_login_client_type`, `login`, `_request`.

- Community-observed session isolation is per App_type, not simply per account. Default phone uses SOFTWARE/41000; Gym Monster uses HARDWARE/1; Nano uses NANO/1; Bike uses BIKE/1.
- Only POST `/api/app/v2/login/verifyIdentity` and POST `/api/app/v2/login/byPass` use the selected login headers. Ordinary authenticated calls use the SOFTWARE phone identity with the same Versioncode as the phone login. Since 1.0.616 that code is one negotiated value per region (baseline 41000; see speediance-app-version.mjs and the API knowledge reference).
- verifyIdentity payload is `{type:2,userIdentity:email}`; byPass is `{userIdentity:email,password:password,type:2}`. Returned token and appUserId populate the existing cache.
- Code91 means expired token. Code90 means displacement by another login of that type. Fork retries90 only for configured nano/bike, which assumes those slots are unoccupied; it does not prove that every user's inventory is complete.
- Upstream history explicitly reverted automatic HARDWARE login because it signed out the user's Gym Monster. Never choose HARDWARE merely because the user owns GM1.

CLI pinned tree: `stozo04/speediance-cli@f8157ef94171125c252b02e598e7534838fd407b`.

- `internal/api/client.go::setHeaders` hardcodes SOFTWARE/40304 for login and ordinary calls; Config has no login-client-type selector.
- `Client.Login` uses `/app/v2/login/verifyIdentity` then `/app/v2/login/byPass`; base URL accounts for `/api`.
- `request` lazily logs in and retries once on code91. Transport retries only idempotent GET, not POST.
- `internal/cli/login.go` explicitly forces a fresh login. `internal/auth/tokencache.go` token shape is `{token,user_id}`, cache owner-only; migrations preserve valid tokens rather than force login.

## Safe implementation dependencies

1. Preserve phone default. Add explicit optional profile login identity only after explaining which device session slot it occupies. Do not infer free Nano/Bike slots from absent inventory metadata; require affirmative user choice/known inventory. Never automatically choose HARDWARE.
2. Implement identical login identity through BOTH native Coach and CLI paths. Existing stock CLI cannot honor the setting. A maintained CLI patch/fork must extend Config and config loader, limit overrides to the two auth endpoints, and preserve token-cache compatibility; alternatively use a single audited native auth implementation and feed its token to CLI while disabling CLI independent relogin. One-sided UI setting would be misleading.
3. Persist non-secret login identity with account identity and cache provenance. Switching slots deliberately invalidates local cached authorization/approvals; do not delete passwords or switch through background recovery.
4. Code91 may recover once under a per-profile lock. Code90 on phone/HARDWARE must report displacement without repeatedly logging in and evicting devices. For explicitly confirmed unused Nano/Bike, any90 recovery must remain bounded, not a keep-alive loop.
5. No mutation retry on ambiguous transport failure. Auth-related retries must distinguish an explicit rejected authorization response from uncertain write acceptance and preserve existing pending-write/readback safeguards.
6. Tests must be offline fixtures for headers on both login endpoints vs ordinary endpoints,91/90 bounded retry, slot change cache binding, and native/CLI agreement. Upstream history includes a test accidentally reaching live API and signing the app out: never let real credentials/environment/network leak into fixtures.

## Limitations

Community observations and commit rationale establish a promising solution, not an official Speediance multi-session guarantee. No user's current logout cause has been diagnosed by this report. Installed CLI version may differ from the pinned tree; inspect its release/build provenance before changing it. OAuth remains a separate unsupported auth flow.

## Sources

- https://github.com/labatt/speediance-smartgym-workout-manager/blob/fdd62c8fcecbb22f195ca9d86020026173d6cb78/api_client.py
- https://github.com/labatt/speediance-smartgym-workout-manager/commit/950a9d73e286c99a122ce5dc05418947aac3d912
- https://github.com/labatt/speediance-smartgym-workout-manager/commit/bef4e3b7ca0175bdad6c7137eca9ac998f04abfd
- https://github.com/labatt/speediance-smartgym-workout-manager/commit/2a3b791b137b3c46e342ce23a7f4c3c6175458e0
- https://github.com/stozo04/speediance-cli/blob/f8157ef94171125c252b02e598e7534838fd407b/internal/api/client.go
- https://github.com/stozo04/speediance-cli/blob/f8157ef94171125c252b02e598e7534838fd407b/internal/cli/login.go
- https://github.com/stozo04/speediance-cli/blob/f8157ef94171125c252b02e598e7534838fd407b/internal/auth/tokencache.go

## Revalidation 2026-10-04 — release149
Current main internal/api/client.go confirms SOFTWARE/40304 on both authentication endpoints and no client identity selector. request retries application code91 for GET and POST, despite POST transport retries being disabled. These are different retry layers. The pinned raw URL could not be retrieved in this revalidation, so current main is not proof of the installed binary revision. The installer downloads a checksum-verified release, not necessarily the audit commit.
GM Coach149 rejects every CLI command except explicit login and current bounded read forms before environment/account access. Native workout mutation safeguards remain authoritative. This prevents future accidental CLI mutation fallback; it does not establish that old Coach releases sent mutations through CLI or that a user's logout was diagnosed.
Client-slot support remains incomplete: a UI selection alone cannot affect stock CLI authentication. Native/CLI authentication agreement and cache provenance must be implemented and verified before exposing this feature. No account request or credential was inspected.
