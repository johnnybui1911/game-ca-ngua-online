---
title: Guest-first play with a sign-up prompt after the match
status: completed
---

# Guest-first play with a sign-up prompt after the match

## Outcome

A new visitor types a name and plays. When a match ends, a guest is offered to save an account, and doing so keeps their seat, name and room.

## Constraints

- Cloudflare free tier; the existing session cookie mechanism; no secrets in the repo.
- Two existing accounts are never merged.
- Guest creation is limited per client address.

## Non-goals

Ranking, match history, friends list, push notifications, removing the OAuth code, unique guest names, a host option to block guests.

## Acceptance criteria

1. On production, a fresh browser opening a room link enters a seat after typing a name once and never sees an email form.
2. A guest who finishes a match sees the save-account prompt; a registered player does not.
3. A guest who registers by email from the prompt keeps the same seat and name, stays signed in after reload, and signing in with that email in another browser yields the same user.
4. With the mock provider in e2e, a guest signing in with a provider for the first time keeps the same user; a guest signing in with a provider that already has an account switches to that account.
5. Provider buttons without credentials are not rendered.
6. Email sign-in still works and the whole e2e suite is green.

## Decisions taken as defaults

- A guest who signs in to an account that already exists (email, or a provider already linked, or a Google-verified email owned by another account) is switched to that account; the guest user is deleted. A seat the guest held is treated like any abandoned seat.
- The prompt appears in the end-of-match dialog, plus a permanent "Lưu tài khoản" entry in the lobby for guests.
- Guest names may repeat, as registered names already may.
- Guests whose sessions have all expired are deleted.

## Phases

| # | Phase | Brief |
|---|---|---|
| 1 | Guest identity, upgrade paths, entry screen, prompt, tests | [phase-01-guest-play.md](phase-01-guest-play.md) |
| 2 | Review in isolation, deploy, production smoke, merge | orchestrator |
