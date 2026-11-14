# CSPIRE//ARENA — project instructions

## Scope and continuity

Continue the existing game; do not recreate it or replace its architecture.
The original handoff preserved game version **0.5.6**; subsequent local tuning
is recorded in `CHANGELOG.md`. Read `PROJECT_CONTEXT.md`,
`README.md`, `CHANGELOG.md`, and `TESTING.md` before making changes.

Respond to Antonio in **Spanish**. Keep game UI, source comments, and technical
README content in **English**. User-created robot names must not be translated.
The latest explicit user request overrides these baseline preferences; when
changing a documented rule, update the code, tests and relevant documentation.
If code and prose disagree, inspect the implementation and report the conflict
instead of blindly restoring an old rule or changing unrelated behavior.

## Architecture and source of truth

- `public/engine.js`: deterministic simulation, bot generation, validation,
  balance, teams, weapons, hazards, pickups and standings. Shared by browser
  and Node without separate client/server implementations.
- `public/app.js`: builder interactions, Canvas drawing, HUD, rule editor,
  responsive panels, local practice/replay and the online client.
- `public/index.html`, `public/style.css`: English interface and thin-line theme.
- `server.js`: authoritative HTTP/SSE server; validates blueprints and room modes.
- `build.js`: generates the self-contained `cspire-arena.html` from `public/`.
- `test/`: Node regressions and optional Python Playwright browser checks.

Edit `public/` rather than editing only generated HTML. Rebuild after runtime
changes. Keep the offline HTML and server version equivalent. Use vanilla JS,
HTML and CSS; do not add a framework or runtime dependency unless requested.
Never execute player-supplied code, use `eval`, or trust client-supplied stats.
Keep gameplay randomness seeded and deterministic, including server/replay state.
Decorative particles must not add damage or alter random simulation outcomes.

## Baseline to preserve unless explicitly changed

- Name: **CSPIRE//ARENA**; English interface, thin-line vector aesthetic.
- 250 chassis HP, 200 construction points, 120-second battles, up to 8 robots.
- 6 initial tools plus 2 battle-only bonus slots; 12 prioritized IF → DO rules.
- Square arena: 48 destructible wall segments, 180 HP each; fixed camera.
- Eliminate at boundary crossing, then show full-body coast-out. Never zoom or
  pan to follow an eliminated robot or projectile.
- Human blueprints stay unchanged. Only AI practice bots randomize each battle.
- Hazard sensing and avoidance ignore inactive traps, including warning-only
  phases. Duels have 4–6 traps; 3–8-player fields have 4. Each 30-second supply
  wave has 2 repair kits and 2 extra tools in mirrored pairs, at most 4 at once.
- One shared 10-second pickup cooldown per robot after a successful repair or
  extra-tool pickup. An unusable item is not consumed and starts no cooldown.
- Extra tools are yellow; at <=25% HP they turn red. Broken parts stay broken.
- Light/Standard/Heavy scale damage, reach and cooldown. Cards show nominal
  damage but not hidden target-specific matchup modifiers.
- Twelve-round machine-gun streams; 1.6/1.8/2.0-second flame streams. Follow
  active programming rules; already-launched projectiles complete their flight
  or hit first, even after a rule change or shooter elimination.
- Preserve the shot-settling phase before confirming results. No new firing,
  healing or AI driving after the end signal.
- At timeout, rank surviving FFA robots by exact HP, teams by summed surviving
  HP. Only equal top values tie. Eliminated entries rank below survivors.
- Team modes: 2v2, 3v3, 4v4, 2v2v2 and 2v2v2v2, plus 2–8-player FFA.
  Do not target/damage allies with weapons. Keep solid allied bodies and
  independent resources. Team online rooms require complete balanced rosters.
- Keep winner text over the board; full standings at right (below on mobile),
  no modal dimming. Side panels auto-hide at countdown and remain manually
  toggleable without unlocking editing during battle.
- Builder: click the visible tool to move it; wheel rotates hovered/selected
  tool by 15 degrees (Shift: 5); double-click deletes and refunds its cost.

## Compatibility and limits

Keep `line-arena.robot.v1`, legacy `LineArena` API alias, and both
`line-arena-robot` / `cspire-arena-robot` export formats compatible.
Manta, Bastion and Twin Hull keep IDs `diamond`, `octagon`, `capsule`.
Cross and the first four bodies are unchanged. Do not silently migrate IDs.
Collision envelopes are simplified, decorative lines do not affect physics,
and debris is visual. Do not describe this as full concave rigid-body physics.
This is a prototype, not a verified-account or production-hosting system.

## Commands and verification

Run from the directory containing this file and `package.json`:

```sh
npm run doctor   # Check local prerequisites and project files
npm run check    # JavaScript syntax checks
npm test         # Engine/server regressions; no packages to install
npm run build    # Regenerate offline HTML
npm start        # Local server; Ctrl+C stops it
npm run test:ui  # Optional: Python Playwright + Chromium needed
```

For any behavior change, add or adjust a focused regression. Rebuild before
running tests that compare generated HTML. Run UI checks for builder, rendering,
HUD or layout changes; inspect desktop and mobile screenshots when relevant.
Never infer fresh success from old `test-results.txt` or `browser-*.json` files.
Report exactly what was executed, passed, failed or not available. Keep generated
logs under ignored `artifacts/` where practical. Do not add production test hooks.

## Safety and delivery

Do not overwrite the user's existing working tree or reset unrelated changes.
Do not commit `.env`, credentials, sessions, `data/pilots.json`, browser profiles,
or virtual environments. No automatic publishing, external uploads, Git pushes,
account creation, global Codex config changes, or disabling safety prompts.
The default server binds to localhost; changing exposure requires a request.
Do not claim the project was added to Codex or installed on the user's computer
unless that action was actually performed and verified.

Summarize changes, actual checks, and remaining limitations. No invented claims
about tests, deployment, personal machine access or future background work.
