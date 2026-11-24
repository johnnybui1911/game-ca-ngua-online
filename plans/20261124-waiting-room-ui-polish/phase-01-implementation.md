# Phase 1: implementation and verification

## Context

`WaitingView` and `room.css` own the room UI; the shell scrolls `.room-page` at all widths. `LobbyPage` owns room creation; `worker/rooms/routes.ts` validates its request and passes the option to the room object.

## Steps

1. Replace the old start-row sticky layout with one sticky header; make empty seats independently actionable and remove the picker.
2. Simplify the creation form, default omitted takeover to true, and adjust settings spacing and mode copy.
3. Update relevant tests and README, then run focused and full checks. Update E2E specs but do not run them.
4. Measure the requested layouts and interactions on port 5191 using a throwaway Playwright script, stop the server, review the diff and open the PR.

## Risks and rollback

Sticky positioning depends on the shell scroller and sound control; verify at each requested viewport. Existing rooms must not gain takeover implicitly. Revert the focused commits to roll back.
