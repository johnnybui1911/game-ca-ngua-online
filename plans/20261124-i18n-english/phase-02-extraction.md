# Phase 2: extraction

## Requirements
Replace each literal with `t('area.key')`; add the Vietnamese text unchanged to the dictionary and an English twin. Do not restructure components. Functions outside React (`describeMove`, `paceEstimateText`, `checkDraft`, `sendErrorText`) gain a trailing `t` parameter defaulting to the Vietnamese translator.

## Files
Shell: `HomePage`, `LoadingOverlay`. Auth: `SignIn/SignUp/GuestEntry/SaveAccount/ProviderButtons/NotFound`. Chrome: `FeedbackButton/Modal`, `feedback-form`. Lobby: `LobbyPage`, `LobbyProvider`. Room: `RoomPage`, `WaitingView`, `GameSettings`, `CpuLevelControl`, `MotionLevelControl`, `HorseNamesDialog`, `EmotePicker`, `EmoteBubble`, `RulesSheet`, `QuickIntroCard`, `DieFace`, `MatchView`, `move-text`, `paces`, `cpu-levels`, `colors`; `scene/GameScene`; `audio/SoundControls`.

## Done when
`grep -rP '[À-ỹ]' web/src` outside `i18n/dict`, tests and the exceptions in plan Decisions 7 and 9 finds no UI string.
