# Portable publication verification — 2026-11-16

This repository contains the standalone JavaScript game, its Node HTTP/SSE
server, self-contained HTML, examples and portable tests. Application-specific
Scala modules, embedding adapters, authentication, navigation, deployment
configuration, session data and local recordings are not part of this update.

## Current publication checks

Using Node **22.23.3** and npm **10.9.9**, `npm run verify` rebuilt the standalone
HTML, passed all JavaScript syntax checks and passed **386 Node tests**, with
zero failures, skips or cancellations. These checks were executed for this
publication against the same runtime files copied into the repository.

The optional browser tests require Python Playwright and Chromium. Production
files contain no test hooks; observation is injected only into test HTML copies.
The focused ranking suite was rerun against the publication copy after replacing
a personal test fixture name with a fictitious controller name. It passed **447 checks** with zero JavaScript errors. Desktop controller labels
and mobile FFA/team captures were inspected. Its result is recorded in
`docs/verification/portable-20261116.json`.

The preceding renderer validation passed **408 construction checks** with zero
JavaScript errors on the unchanged runtime. That earlier run verified eight
catalog models, centered READY banners, six-second worker staggering, exact
72-second repetition, consecutive-job separation, continuous wrap transitions,
reduced motion and hidden-tab behavior. It sampled equivalent phases as far as
8400 cycles (seven days); this was not a seven-day wall-clock test. This suite was
not rerun for packaging. The publication manifest records the runtime hashes.

The construction renderer is shared game code and is covered through in-memory
lobby fixtures. The standalone Node room flow does not activate that renderer,
implement individual READY votes or provide an invitation directory. Those
hosting features require a separate integration and are not claimed by these
portable checks.

An unused test hook for a separate embedded transport was removed from
`test/browser-finale.py`; Python syntax was checked. This does not change runtime
code or the standalone test path. The broader browser suites were not rerun for
this publication; the reports below remain historical.

## Historical baseline verification

The remaining sections and files under `docs/verification/` without the
`portable-20261116` name describe the original 0.5.6 handoff. Their older counts,
paths and runtime hashes are historical evidence, not current test executions.

# Delivery verification — CSPIRE//ARENA 0.5.6

> This file describes the original 0.5.6 delivery. For checks rerun during the Codex handoff, see `docs/CODEX-VERIFICATION.md`; do not treat historic reports as new executions.

## Local density tuning — 2026-11-13

The reduced-density engine and rebuilt offline HTML passed syntax checks and
**254 Node tests**, including the local HTTP/SSE server regressions. Five
Playwright/Chromium suites passed **325 checks** with zero page errors.
Desktop and mobile screenshots were inspected, and the running local browser
confirmed `4 HAZARDS / 4 BONUSES` for the default four-robot preview.

The added regression covers all 12 roster/mode combinations across 40 seeds,
with safe mirrored pairs, exactly two repairs and two tools per supply wave,
and no accumulation at wave boundaries. Logs are in
`artifacts/density-node-tests.txt`, `artifacts/density-ui-run.txt`, and
`artifacts/qa/ui-summary.json`. UI tests use the project's Python environment:
`PYTHON=.venv/bin/python npm run test:ui`.

The sections below retain the original release verification record.

## Engine and server

`node --test` passed **253 tests**, with zero failures, cancellations or skipped tests. The complete output is `test-results.txt`.

New coverage checks all six modes (free-for-all, 2v2, 3v3, 4v4, three teams of two, four teams of two), up to eight participants, safe grouped team starts, authoritative team assignment, friendly-fire protection for all nine tools, unchanged human blueprints, AI-only randomization, collision behavior, exact summed-HP ranking, team victory after an individual elimination, and serialization/replay determinism. Crowded fields still use four hazards for six to eight robots, and all participants retain separate ten-second pickup locks. Full matches run to completion with finite state and complete standings.

The complex Manta / Bastion / Twin Hull contours retain the previous `diamond` / `octagon` / `capsule` IDs and balance. Tests verify their outline data, profile compatibility and the unchanged Cross definition. These are rendered shapes with simplified collision envelopes, not exact concave rigid-body physics.

HTTP/SSE tests launch the real Node server and independent sessions. Coverage includes eight players, refusal of a ninth, host-only mode changes, incomplete-team start refusal, grouped teams, immutable human robots, authoritative identical snapshots and victory after the whole opposing team forfeits. These are local transport tests, not public hosting or a security audit.

Existing regressions cover 250 HP, 200 build points, 120 seconds, 180 wall HP, reduced flipper impulse, longer weaker flame/gun streams, power scaling, damage by component, active-only traps, wall recovery, full-body exit clearance, launched projectiles completing their flight, exactly ten seconds between successful pickups, import compatibility and fixed-seed replay.

## Browser checks

Five Playwright/Chromium suites passed **324 checks**, with no JavaScript page errors:

| Suite | Passed | Report |
|---|---:|---|
| `test/browser-ui.py` | 65 | `browser-results.json` |
| `test/browser-results.py` | 42 | `browser-results-panel.json` |
| `test/browser-focus.py` | 57 | `browser-focus-results.json` |
| `test/browser-editor-six.py` | 61 | `browser-editor-six-results.json` |
| `test/browser-teams-camera.py` | 99 | `browser-teams-camera-results.json` |

The new suite verifies replacement body names/icons, preserved Cross, all team selectors, balanced participant counts, unchanged human designs, eight independent free-for-all colors, shared team colors, individual energy prominence, responsive eight-seat HUDs, complete team/individual result tables, a winning eliminated teammate, online host controls and eight-seat lobby handling. Viewports from 320 to 1560 CSS pixels are covered, alongside existing layout checks up to 1920 pixels.

Camera checks trigger exits through every edge and above a wall. They compare both the view coordinates and the actual Canvas ground transform before, during and after the exit. Even an object moved far outside the visible field cannot trigger zoom or panning. Wall pointer inspection uses the unchanged fixed transform. The normal window/panel layout remains responsive; objects beyond the canvas edge clip naturally.

Browser harnesses add observation hooks only to in-memory copies. No hooks are in the distributed JavaScript or HTML. Online handler tests inject synthetic SSE payloads; real HTTP/SSE is covered separately by Node tests. Chromium file/HTTP navigation is restricted in this execution environment, so browser suites load the self-contained HTML through `set_content`. An additional smoke run loads the final uninstrumented HTML this way, starts a natural 4v4 match, checks the eight HUD cards and panel animation, pauses/stops, and checks the local-file online warning. No other browser engine or live multi-browser Internet session is claimed.

## Previews

- `previews/teams-workshop.png`: actual uninstrumented editor, Manta and eight-player team roster.
- `previews/teams-battle.png`: actual running 4v4 match paused for capture, including robots outside the fixed camera's arena boundary.
- `previews/teams-results.png`: controlled team-ranking fixture, not a claimed natural outcome.
- `previews/eight-mobile.png`: deterministic eight-player simulation fixture on a 390-pixel layout.
- Other previews are generated by the regression suites and remain useful for individual controls.

## Reproduce

```sh
node build.js
node --test
python test/browser-ui.py
python test/browser-results.py
python test/browser-focus.py
python test/browser-editor-six.py
python test/browser-teams-camera.py
```

The game and server have no runtime package dependencies. Optional UI tests require Python Playwright and Chromium; use `CHROMIUM_PATH` to select an executable. The server is a prototype requiring appropriate hosting, HTTPS, authentication and operational review for public deployment. Export/import is the portable migration route when browser storage differs across local files.
