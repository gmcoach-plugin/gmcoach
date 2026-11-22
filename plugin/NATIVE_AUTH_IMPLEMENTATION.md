# Native authentication integration — source 153 audit

Status: implementation pending. This document records inspected integration requirements, not a delivered feature or a physical coexistence guarantee.

## Authoritative public behavior

Inspected 2026-10-04: https://raw.githubusercontent.com/labatt/speediance-smartgym-workout-manager/main/api_client.py lines279–348. Mutable main snapshot, not a pinned commit.

Explicit login client identities: phone SOFTWARE/41000 (default), gym-monster HARDWARE/1, nano NANO/1, bike BIKE/1. Both verifyIdentity and byPass receive that identity. Ordinary authenticated requests remain SOFTWARE/41000. Client identity is independent of machine family/generation. Never infer a free slot from ownership or automatically select HARDWARE. Do not copy upstream code90 relogin or mutation replay.

## Required implementation boundaries

1. Native login: two bounded POSTs, no auth retry; validate HTTP, API code, identity flags and nonempty token/appUserId. Return internal token/user_id only. No public evidence supports invented expiry/refresh fields.
2. Session storage: upgrade profile-secret-storage.mjs envelope v1 (email only) to email+region+client identity binding. Thread context through migration, read, store and temporary CLI cache. Legacy v1 can migrate only to the known default phone with authoritative region; never adopt it into another slot.
3. Configuration: validate explicit client identity separately from deviceType; include it in accountConnectionSettingsDiffer, profileConfigFingerprint, setup-save and readProfileConfig. Existing rollback must restore old session binding along with config.
4. Actual login: replace connect-account regional probe and explicit login callsites, plus createSessionRecovery login. Keep current no-displacement-relogin and no-write-replay semantics.
5. Actual reads: stock CLI can implicitly log in using SOFTWARE even without an explicit login command. Nonphone reads must use an audited patched CLI with selected identity/no-auto-login or native history/session implementations. A dropdown or native explicit login alone is insufficient.
6. Ordinary API: read exact bound session, retain SOFTWARE/41000 requests, recheck identity after awaited preparation before dispatch.

## Required release evidence

- Default phone compatibility; invalid selection rejected; both login requests use the same explicit headers; malformed/API/transport responses never persist credentials or expose response secrets.
- Account/email/region/client changes invalidate reuse; legacy migration cannot retag a session; rollback and exact vault readback preserve previous state.
- Actual connect and expiry recovery dispatch use native login, not a mocked helper-only path.
- Actual history/session paths cannot claim another client slot on absent, expired or code91 sessions.
- Code90 never triggers login; mutations are never replayed; bounded read recovery remains single-flight.
- Install matching newest release before offline tests; verify package/source/installed hashes. Live checks only loaded=installed=source and restartRequired=false. Physical coexistence needs separately authorized live verification.

## Current inspected code

mcp_server.mjs runCli around1644, session recovery around2438, speedianceApiRequest around2461, connect-account around4521; profile-secret-storage.mjs sessionEnvelope/unpackSession, readProfileSession/storeProfileSession/runWithProfileSessionCache. Line numbers refer to source153 and may shift during implementation.

No personal account API reads, login attempts or test runs were performed during this audit.

## Pinned CLI source verification (2026-10-04)

Fetched public source at commit f8157ef94171125c252b02e598e7534838fd407b:

- https://github.com/stozo04/speediance-cli/blob/f8157ef94171125c252b02e598e7534838fd407b/internal/auth/tokencache.go explicitly freezes the cache as token/user_id strings. No expiry field exists in this source contract.
- https://github.com/stozo04/speediance-cli/blob/f8157ef94171125c252b02e598e7534838fd407b/internal/api/client.go confirms lazy login when token is missing and another Login on code91. Its headers are SOFTWARE/40304. Token cache compatibility does not prevent claiming the phone slot on refresh.
- byPass user ID is converted from a JSON number to string by the Go client; native validation must support a valid positive numeric ID while rejecting malformed/nonfinite/fractional values.

These are source observations, not proof that the installed CLI executable was built from that commit. A native login helper is being implemented separately; actual integration and release testing remain pending.
