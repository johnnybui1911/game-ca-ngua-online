---
title: English language support with a VI / EN switch
status: accepted
---

# English language support

## Outcome

Every user-facing string of the React app (`web/src`) exists in Vietnamese (today's text, byte for byte) and English. A VI / EN switch is reachable from every screen (home, lobby, sign-in pages, waiting room, match menu). The choice is stored in this browser (`localStorage`), applies at once without a reload or a new game connection, and sets `<html lang>`. Players who never chose get Vietnamese, whatever their browser locale says.

## Today (grounded in code)

- All copy is inline string literals in ~35 `web/src` files. No i18n code exists. `index.html` is `lang="vi"`.
- Copy shared with the worker lives in `shared/`: rules text (`rules-text.ts`, checked against the static `gioi-thieu.html` by `rules-text.test.ts`), emotes (`emotes.ts`), feedback categories (`feedback.ts`), and `SIGNED_OUT_MESSAGE` (`protocol.ts`).
- The server sends Vietnamese text in three places: error messages (`HttpError`, `RoomError`, lobby/room `error` frames, each with a stable `code`), the stored CPU seat name (`Máy n`, `nextCpuName` in `worker/rooms/room-state.ts`), and the guest fallback name. Rooms persist the CPU name.
- Scene dev pages (`scene/dev`, `ui/preview`) and the 3D set's decorative Tết lettering (`set-textures.ts`) are not product UI.

## Constraints

- No new runtime dependency. Server stays authoritative; no wire-protocol or storage change; stored rooms keep working untouched.
- Vietnamese output must stay byte-identical (existing unit tests and e2e match VI copy under `vi-VN`).
- Extraction is mechanical (`literal` -> `t('key')`) so rebases against PRs touching `WaitingView`, `GameSettings`, lobby files stay easy.
- Out of scope: `gioi-thieu.html`, `design-preview.html`, `scene-dev.html`, `assets/`, translating persisted user content (room names, player names, horse names).

## Decisions (taken autonomously, recorded for review)

1. **Small typed in-repo dictionary, no library.** Why: two languages, ~450 strings, no plurals beyond a few `{n}` counts, no runtime locale loading. A library (i18next, react-intl, lingui) adds bundle weight and an ICU/parser layer for a problem a typed object already solves, and the requirement "a missing EN key must be a type error" is a one-line type here. Shape: `defineArea(vi, en)` in `web/src/i18n/translate.ts` takes the Vietnamese object as the source of truth and types the English one as `{ [K in keyof V]: string }`, so a missing or extra English key fails `tsc`. Areas (`dict/shell|auth|chrome|lobby|room|match|errors.ts`) are merged in `i18n/index.ts` into `TKey`, so `t('typo')` is a type error too. Placeholders are `{name}`; a unit test checks both languages use the same ones.
2. **No React context.** The language lives in a tiny external store (`i18n/lang.ts`, `useSyncExternalStore`), the same pattern as `emote-settings.ts` and `motion-setting.ts`. `useT()` re-renders a component when the language changes; plain functions take a `t` argument defaulting to the Vietnamese translator, so their existing tests are unchanged.
3. **Default is Vietnamese always** (storage empty, unreadable or holding junk). `navigator.language` is never read. `<html lang>` follows the store.
4. **Shared Vietnamese copy is referenced, not copied.** `dict/room.ts` builds its Vietnamese rules/emote entries from the `shared/` constants, so they cannot drift from the landing page check. `shared/` is not edited. English copy for the rules sheet lives in the dictionary.
5. **Server-made text is translated on the client by message, not by sending localized text.** Errors already carry stable `code`s, but several codes (`bad_state`, `invalid_message`, `rate_limited`) carry different messages, so the client recognises the exact Vietnamese message (with `{n}` patterns for the few that embed limits) and shows the English twin (`i18n/error-text.ts`); an unrecognised message is shown as sent. This needs no server or protocol change and keeps the Vietnamese wire text as the fallback for old clients and API consumers. A test scans `worker/**` and `shared/protocol.ts` for Vietnamese message literals and fails when one has no dictionary entry, so adding a server message without its EN twin breaks the build. Error text is kept raw in component state and translated when rendered where it persists (room failure page, action errors, lobby toasts), so a language switch updates it.
6. **Generated CPU names** (`Máy n`, stored in the room) are translated for display (`room/names.ts`: exact `^Máy (\d+)$` -> `CPU n`). A name a person typed that is not exactly that pattern is never touched. Default room name (`Phòng của X`) is built on the client, so it is translated when the form first renders; once typed it is user content.
7. **Brand name "Cờ Cá Ngựa 3D" stays in both languages**, as does "cờ cá ngựa" inside English sentences (the game's name). English game terms: ván = game/match, Ván nhanh = Quick Match, nhịp ván = game pace, máy = CPU/computer.
8. **Switch placement:** a VI / EN capsule (`i18n/LangSwitch.tsx`) in the app shell's top-right slot next to the sound button (home, lobby, auth pages, waiting room) and inside the match menu (the shell chrome steps aside during a match). Two buttons with `aria-pressed`.
9. **Out of the dictionary on purpose:** scene dev pages, design preview, set lettering, console/dev strings, analytics event names.

10. **Language from the link.** `?lang=en|vi` is applied when `lang.ts` loads (before React renders), saved as the person's choice, and removed from the address bar with `history.replaceState` (route, other params and hash kept; failure to rewrite is ignored). Unknown values are ignored; no parameter keeps the stored choice, else Vietnamese. In-app invite links stay plain (they carry no sender language): a receiver's own choice should decide.

## Acceptance criteria

1. `npm run typecheck`, `npm test`, `npm run build` green; deleting an EN key makes `tsc` fail.
2. No Vietnamese literal remains in rendered `web/src` UI code outside `dict/` (checked by grep, exceptions listed in Decisions 7 and 9).
3. A new browser shows Vietnamese with `<html lang="vi">` even with an `en-US` locale; choosing English persists across reloads; the switch works on home, lobby, waiting room and the match menu without reloading or dropping the room socket.
4. Unit tests: dictionary completeness and placeholders, Vietnamese byte-identity with the previous copy, language store persistence, CPU name and error translation, worker message coverage.
5. E2E `e2e/i18n.spec.ts`: default Vietnamese under an English browser locale; lobby and room in English, then back to Vietnamese inside the room; the match HUD and menu.

## Phases

| # | Phase | Brief |
|---|---|---|
| 1 | Language store, translator, dictionary scaffolding, switch component | [phase-01-core.md](phase-01-core.md) |
| 2 | Mechanical extraction area by area (shell, auth, chrome, lobby, room, match) | [phase-02-extraction.md](phase-02-extraction.md) |
| 3 | Server-made text: errors, CPU names, rules, emotes | [phase-03-server-text.md](phase-03-server-text.md) |
| 4 | Tests, e2e, README, visual check | [phase-04-tests-and-docs.md](phase-04-tests-and-docs.md) |

## Risks

- Parallel PRs editing `WaitingView.tsx`, `GameSettings.tsx`, lobby files will conflict on the lines this PR rewrites; the rewrites are one-line substitutions and new strings in those PRs need a key in the matching dictionary area.
- A new server message without a dictionary entry shows in Vietnamese in English mode until added; the coverage test catches it for literals in `worker/`.
