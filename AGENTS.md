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
- 300 chassis HP, 200 construction points, 120-second battles, up to 8 robots.
- 6 initial tools plus 2 battle-only bonus slots; 12 prioritized IF → DO rules.
  A VOID condition skips a slot while preserving its action. All VOID means Brake.
- Five-second pre-battle countdown; physics and the 120-second clock wait until it ends.
- Square arena: 48 destructible wall segments, 150 HP each; fixed camera.
- Eliminate at boundary crossing, then show full-body coast-out. Never zoom or
  pan to follow an eliminated robot or projectile.
- At zero chassis HP, shatter the body into deterministic visual fragments that
  preserve recognizable chassis sections and wheels, with the rocket-style
  explosion and a three-second fade. Surviving tools scatter for 0.9 seconds, then
  remain recoverable with their exact remaining HP in the two bonus slots,
  using the existing ten-second shared pickup cooldown. Broken tools stay broken.
- Human blueprints and programming stay unchanged across Another battle unless
  the player edits them. Only AI practice bots randomize each battle. Standalone
  online rooms use a new room for another match; they have no individual READY
  voting or same-room rematch flow.
- Automatic names use the twelve original prefixes with uppercase base-36 code
  and two-digit number, such as RAVEN-6UBO-01. Keep practice RNG and designs intact.
  Migrate the legacy VECTOR-01 default, short catalog names and one-digit catalog
  suffixes once without changing the design; preserve other custom names. At match entry,
  preserve first owners and unique custom names, resolving later duplicates
  deterministically and saving only the own assigned name. Controller subtitles
  use existing room display names, retaining YOU and BOT #. Reuse existing
  room metadata rather than adding another identity field per robot snapshot.
- Optional construction rendering is reusable by a hosting interface, but is
  not activated by the shipped local-practice or Node/SSE flows. The standalone
  lobby exposes submitted blueprints; do not claim hidden designs or individual
  READY voting. For an opting-in host, use UI-only state.lobbyConstruction and
  robot.construction={ready,phase}; show the robot name with controller beneath.
  Keep private tools/body/drawing/programming out of decorative previews.
  Show an independent decorative construction shell in each occupied real spawn
  position, selected from eight distinct, simple buildable catalog examples by
  seat. Use real chassis outlines and one or two real tool silhouettes, retaining
  an open deck and missing panels/drives. Never derive these models from private
  builds. Use eyeless twin-fan hoists, triangular carriers and fixed tracked
  cranes. Two workers share six catalog tools, treaded drives, armor strips and
  larger chassis sections in a closed 72-second loop. Each piece is installed
  and removed by different workers, with other jobs interleaved between visits.
  Offset the second assistant by six seconds without changing the four-second
  approach, transport and joint-work phases. Neither the merged job sequence
  nor each worker's sequence may repeat a part consecutively, including the
  wrap. A job spanning the 72-second seam must continue from its previous-period
  event; use bounded analytic clocks and job-local effects, never a rack reset
  or accumulated per-frame state. Start with zero, one or two fitted drives by
  model; initially fitted drives are removed then refitted. Render each piece
  exactly once at its rack/in transit/on its mount and omit handled sections
  from the fixed frame. Individual READY changes only its label: all crews
  keep working until every occupied seat is READY, then park in the initial
  arrangement, including any initially fitted wheels. Show READY centered over
  the robot's body in a translucent 92-by-24 gradient banner with 14-pixel medium
  sans-serif lettering, matching the result banner's faded sides. Keep
  ASSEMBLING understated above the crew.
  Hide empty-seat shells. Keep animation local, analytic and out
  of simulation/network state, static under reduced motion and idle when hidden.
- Hazard sensing and avoidance ignore inactive traps, including warning-only
  phases. Grinders pulse for 2 seconds, then cool down for 3 seconds. Trap damage
  is gradual during active contact only. Duels have 4–6 traps; 3–8-player fields have 4. Each 30-second supply
  wave has 2 repair kits and 2 extra tools in mirrored pairs, at most 4 at once.
- One shared 10-second pickup cooldown per robot after a successful repair or
  extra-tool pickup. An unusable item is not consumed and starts no cooldown.
- Extra tools are yellow; at <=25% HP they turn red. Broken parts stay broken.
- Light/Standard/Heavy scale damage, reach and cooldown. Cards show nominal
  damage but not hidden target-specific matchup modifiers.
- Tool activation energy uses a 0.855 multiplier after power scaling, rounded
  to two decimals: 10% less than the preceding 0.95 multiplier before rounding.
  The shared 100-energy cap, 12-per-second regeneration and 36-energy Charge
  remain unchanged. A per-robot activation cursor rotates priority only after
  a real activation. Skip broken, cooling, disabled and non-contacting tools;
  save energy for the next ready, contacting tool instead of spending it on
  cheaper later slots. Explicit single-tool rules still select only that slot.
  Keep the cursor in exact simulation state, including replay and server snapshots.
- Twelve-round machine-gun streams; 1.6/1.8/2.0-second flame streams. Follow
  active programming rules; already-launched projectiles complete their flight
  to first impact, even after a rule change or shooter elimination. Weapon range
  controls acquisition; misses retire only outside the visible world plus trail
  margin (−32 to 832 per axis). Saw/drill per-use damage and push budgets are
  distributed over their cooldown while in actual contact; lost contact time
  is not repaid. Other melee tools retain discrete impact damage.
- Melee uses the visible working heads and receiving tool/chassis silhouettes,
  including side contact and distal tool tips. `toolGeometry` and `toolScale`
  keep drawing, selection and contact aligned across rotation. Light, Standard
  and Heavy share the same visible size and contact shape; power does not
  enlarge the tool, builder zoom, selection zone or ring-out footprint.
  Broken components do not intercept; intact armor still protects its sector
  and valid component hits always transmit some damage to the chassis.
- Preserve the shot-settling phase before confirming results. No new firing,
  healing or AI driving after the end signal.
- At timeout, rank surviving FFA robots by exact HP, teams by summed surviving
  HP. Only equal top values tie. Within an FFA ranking or each team group,
  eliminated entries rank below survivors; team rank takes precedence.
- Team modes: 2v2, 3v3, 4v4, 2v2v2 and 2v2v2v2, plus 2–8-player FFA.
  Do not target/damage allies with weapons. Keep solid allied bodies and
  independent resources. Team online rooms require complete balanced rosters.
- At countdown, move the existing player cards from the top into a vertical
  live ranking to the right of the field, or below on narrow layouts. Dock the
  clock in the arena heading and the existing battle controls above the
  ranking. Keep these same nodes through the final result and replay;
  stop/leave or returning to the lobby restores their workshop locations.
  Preserve focus without scrolling when moving controls. Use `E.buildStandings`
  for exact HP, elimination and team ordering; never reorder the robot array.
- Use compact ranking cards in a 320–420 px desktop column with a 16 px gutter
  from the field: robot identity on the left, health/energy and thin bars on
  the right. Keep battle controls above the independently scrolling cards,
  with the whole sidebar bounded by the field's height. Animate rank changes over 260 ms
  from their current visual position; interrupt safely when ranks change again and disable this
  motion for reduced-motion preferences.
- Keep the CSPIRE//ARENA topbar visible during battle and do not automatically
  scroll on battle/replay start. During countdown, battle, results and replay,
  dock mode, field/supply counts and team totals in the dark apron above the
  walls, and the full hazard/item legend in the apron below them. These overlays
  consume no extra layout height and never cover the playable square. Restore
  their original workshop nodes on stop/leave/lobby. Narrow layouts keep the
  sidebar after the canvas, with full mode/team details available accessibly.
- Keep winner text over the board and final places in those player cards;
  there is no separate Battle decided panel. After final shots settle, allow
  three real seconds for animations before revealing winner styling and final
  labels. Combat stays frozen and result reveal never resizes or moves the field.
  Side panels auto-hide at countdown and remain manually toggleable without
  unlocking editing or moving the ranking back to the top.
- Arena names come from the fixed English name list using the battle seed.
  Fresh battles receive fresh seeds; replay and all online clients retain the
  same name for the same seed. Different seeds may select the same name.
- Builder: click the visible tool to move it; wheel rotates hovered/selected
  tool by 15 degrees (Shift: 5); double-click deletes and refunds its cost.

## Compatibility and limits

Keep `line-arena.robot.v1`, legacy `LineArena` API alias, and both
`line-arena-robot` / `cspire-arena-robot` export formats compatible.
Manta, Bastion and Twin Hull keep IDs `diamond`, `octagon`, `capsule`.
Cross and the first four bodies are unchanged. Do not silently migrate IDs.
Movement, projectile and hazard collision envelopes remain simplified; melee
uses the drawn chassis outline and compact tool-head shapes. Decorative lines
do not affect physics, and chassis debris is visual; detached surviving tools are pickups, not solid
obstacles. Do not describe this as full concave rigid-body physics.
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
or virtual environments. Publishing, external uploads and Git pushes require
explicit user authorization. Do not create accounts, change global agent
configuration or disable safety prompts as an incidental project task.
The default server binds to localhost; changing exposure requires a request.
Do not claim the project was added to Codex or installed on the user's computer
unless that action was actually performed and verified.

Summarize changes, actual checks, and remaining limitations. No invented claims
about tests, deployment, personal machine access or future background work.
