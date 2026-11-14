# Codex handoff verification — CSPIRE//ARENA 0.5.6

> Historical handoff record. Later local density tuning is documented in
> `../CHANGELOG.md` and `../TESTING.md`; `runtime-integrity.json` contains the
> original handoff hashes, not the modified engine and rebuilt offline HTML.

This report records checks rerun for this handoff. Historic `TESTING.md`,
`test-results.txt`, root `browser-*.json` files and original previews are retained
as release evidence, not presented as new runs. Fresh records are in
`docs/verification/`.

## Changes in this package

- Added `AGENTS.md`: language preferences, architecture, gameplay constraints,
  compatibility requirements, commands and honest verification requirements.
- Added `PROJECT_CONTEXT.md`: the current decisions from this conversation,
  with obsolete values explicitly marked superseded. This is a decision summary,
  not a complete conversation export.
- Added `INICIO-CODEX.md`: short Spanish guide for selecting this folder in Codex.
- Added a read-only environment check (`npm run doctor`), syntax checks,
  `npm run verify` and a portable optional `npm run test:ui` entry point.
- Updated two existing browser suites so they can fall back to Playwright's
  managed browser rather than require `/usr/bin/chromium` on every platform.
- Expanded `.gitignore` for local state, secrets, virtual environments and logs.
- Added this report and runtime SHA-256 comparisons.

## Runtime preservation

All seven runtime/build deliverables below match the source archive byte for byte:
`public/engine.js`, `public/app.js`, `public/index.html`, `public/style.css`,
`server.js`, `build.js`, and the generated `cspire-arena.html`.

See `docs/runtime-integrity.json` for checksums and the original ZIP hash.
Game version remains 0.5.6; balance, visuals, modes and mechanics are unchanged.
No runtime dependencies were introduced.

## Fresh results

| Check | Result |
| --- | --- |
| `npm run doctor` | Passed: runtime requirement, files and simulation load |
| `npm run verify` | Passed: offline build, six JS syntax checks and 253 Node tests |
| Engine/server tests | 253 passed; 0 failed, cancelled or skipped |
| Five existing Python/Chromium suites via the new runner | 324 checks passed; 0 page errors |
| Local HTTP smoke test | 8 checks passed; server stopped and temporary pilot data removed |
| Missing optional Python handling | Clear error and exit code 1; nothing installed |
| Source/offline HTML identity | Seven files unchanged against the original ZIP |

UI detail: base UI 65; results 42; focus/panels 57; editor/pickups 61;
teams/eight-seat/fixed-camera 99. The optional runner was exercised before
its final filename was changed from `scripts/test-ui.js` to
`scripts/run-ui-checks.js` to avoid Node's automatic test-discovery patterns;
its implementation was unchanged. The final package's syntax/build/Node checks
were rerun after that rename.

The HTTP smoke test requested the game HTML, engine, app and stylesheet,
checked `/api/health`, and confirmed that project instructions, context and
pilot data are not served through the static file routes. This is not a
security audit or a production-deployment claim.

## Environment and limitations

Executed on this session's Linux environment: v22.16.0, Python 3.13.5, Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie).
Browser tests used headless Chromium with their existing in-memory observation
hooks, not production changes. Offline HTML is loaded via Playwright
`set_content`; the separate HTTP smoke checks used a real local Node process.
Screenshots/report fixtures are not claims of public multiplayer matches.

macOS, Windows, Safari, Firefox and the user's desktop Codex app were **not**
executed here. The browser-path portability change is implemented, but not a
claim of testing on those operating systems. No files were installed on the
user's computer; no local desktop project was registered; no GitHub repository,
cloud deployment, account connection or global Codex configuration was created.
The extracted folder must still be selected in the desktop application.
