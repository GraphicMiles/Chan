# Chan — Consecutive App Audit (5 passes)

Baseline lint: **32 errors, 36 warnings** (build passes; runtime broken in `VideoPlayer.jsx`).

Each pass targets one audit category, fixes the issues, re-lints + re-builds, then commits locally (no push).

---

## PASS 1 — Hooks rules + ReferenceErrors (`react-hooks/rules-of-hooks`, `no-undef`)
- `VideoPlayer.jsx`: 21× undefined `isHLS` → `isHls` (ReferenceError, crashes every video render).
- `VideoPlayer.jsx`: `isLivePlayback` useCallback read `durationSec`/`videoRef` before declaration → TDZ ReferenceError at render (relocated below the state/refs it closes over).
- `RoomPage.jsx`: `searchVideos` + `fetchEpisodesForChange` useCallbacks were called *after* the `if (!user)` early return → conditional hook violation. Moved above the guard.

## PASS 2 — Use-before-define / function-calling order
## PASS 3 — Stale / unused code & imports
## PASS 4 — Race conditions (stale-closure deps) + media-type errors
## PASS 5 — Naming consistency + final verification
