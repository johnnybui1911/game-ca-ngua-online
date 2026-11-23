# Phase 4: tests, e2e, docs

- `web/src/i18n/dictionary.test.ts`: same keys, same placeholders, no Vietnamese in EN, Vietnamese equals the old shared/constant copy, rules sheet, CPU names, `describeMove`, error translation, worker message coverage.
- `web/src/i18n/lang.test.ts`: default, junk/throwing storage, persistence, subscribers, `isLang`.
- `e2e/i18n.spec.ts`: see plan acceptance 5. Run through `/tmp/ca-ngua-orch/e2e-lock.sh`.
- `README.md`: one paragraph on the language switch and how to add a string.
- Visual check with `npx vite --port 5181 --strictPort`.
