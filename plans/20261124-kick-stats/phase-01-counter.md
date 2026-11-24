# Counter and compatibility

Implement the optional legacy-compatible per-colour counter in `shared/game/types.ts` and initialize it in `createGame`. Increment immutably only when `applyMove` resolves a kick. Test initial state, ordinary moves, single and successive kicks, quick mode, and a state without the field. Run the engine unit tests.
