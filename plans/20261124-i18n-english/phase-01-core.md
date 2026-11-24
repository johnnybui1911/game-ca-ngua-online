# Phase 1: core

## Context
`web/src/room/emote-settings.ts` already shows the repo's pattern for a browser-stored preference (injectable storage, `useSyncExternalStore`).

## Requirements
- `lang.ts`: `Lang = 'vi' | 'en'`, `createLangStore(storage, onChange)`, default `vi`, key `ca_lang`, tolerant of throwing/absent storage, `<html lang>` updated on change and at load.
- `translate.ts`: `defineArea`, `format('{x}')`, `makeT`.
- `index.ts`: merged dictionaries, `TKey`, `useT()`, `translatorFor(lang)`.
- `LangSwitch.tsx` + `lang-switch.css`: capsule with VI / EN, `aria-pressed`, 48 px high, glass style like the sound button.

## Files
`web/src/i18n/{lang,translate,index,error-text}.ts`, `LangSwitch.tsx`, `lang-switch.css`, `dict/*.ts`; `shell/slots.tsx` (switch beside the sound button), `shell/shell.css` (slot gap).

## Done when
Typecheck passes and a missing EN key is a compile error.
