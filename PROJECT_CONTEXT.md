# CSPIRE//ARENA — current decisions and handoff

## What this folder is

This repository contains the portable browser robot-combat game and its Node
HTTP/SSE server, continued from the original 0.5.6 handoff. The existing remote
is [anthonyuclvcfg/arena](https://github.com/anthonyuclvcfg/arena). Game version remains **0.5.6**; current
changes are recorded under Unreleased in `CHANGELOG.md`.

The source and generated offline HTML share the same engine and interface.
Repository publication does not deploy a service or register a desktop app.
Application-specific authentication, routing and embedding adapters are outside
this portable repository.

## Product intent

A lightweight pure-JavaScript browser game combining a minimal vector robot
builder with no-code visual programming. Each human has one editable robot and
chooses up to twelve prioritized IF → DO rules. Robots fight autonomously;
there are no manual combat controls. Winning is about destroying or pushing
opponents out of a fixed square arena with breakable borders and active hazards.

User-facing conversation stays in Spanish; the game interface stays in English.
Keep the established thin-line look rather than replacing it with bricks, 3D
models, a new rendering library or generated artwork.

Automatic robot names retain the original NAME-CODE-NN format (RAVEN-6UBO-01),
with an uppercase base-36 code and two-digit suffix. Keep all twelve original
prefixes and the practice generator's RNG sequence: only its final number gains
a leading zero. New pilots receive random full identifiers. Loading the legacy
VECTOR-01 default migrates its name once; short catalog names from the preceding
version retain their prefix and gain a code and 01. Existing catalog identifiers
with a one-digit suffix gain only the zero. Already formatted and other custom
names remain exact, and all migrations preserve the rest of the saved design.
At real match entry, `uniqueRobotConfigs` reserves every normalized original name,
keeps its first owner and renames later case-insensitive duplicates from the
unused catalog. Selection depends on the original name and seat, not the battle
seed or simulation RNG, so reconnects and unchanged rematches agree. The own
assigned name is saved without changing the rest of the blueprint. Raw
`createBattle` remains available for previews and placeholders. Local practice
and the standalone server apply name resolution at match entry.
Human controller labels come from existing room member metadata and appear
beneath robot names; YOU, BOT #, team prefixes and OUT retain their meanings.
The UI retains a copy of the battle's original controller roster until leaving
or opening a new lobby, so removing a person after the result cannot relabel
another robot. This metadata is not stored in simulation checkpoints.
Controller labels reuse room metadata rather than adding another field to each
robot snapshot. In the standalone server, `publicRoom` includes the submitted
blueprints; its lobby is not a hidden-design protocol.

## Optional construction scene

The portable renderer includes an opt-in scene; normal local practice and
Node/SSE rooms do not activate it. A hosting interface may set UI-only
`state.lobbyConstruction` and `robot.construction={ready,phase}` for occupied
seats. Vacancies have no construction metadata. Supply normal spawn positions,
team assignments and display names; do not put private opponent designs into
these previews. Individual READY controls, public-name registration and private
blueprint exchange are responsibilities of the host, not shipped server features.

The public seat selects one of eight cached, buildable catalog models, independent
of private body, tools, drawings, rules and stats. Two eyeless workers—fan hoists,
triangular carriers or tracked cranes—share six real catalog components. Each
piece appears once, at its rack, in transit or mounted; handled chassis edges
are omitted from the fixed frame. Initial fitted wheel counts are 0, 1, 2, 1, 0,
2, 1 and 2 across the models.

Each worker performs six 12-second jobs in a closed 72-second sequence, with
four-second approach, transport/cut and weld/return phases. The second worker
starts six seconds later. Partners install and remove each other's pieces, with
at least 18 seconds between job starts for the same piece. Neither the merged
sequence nor either worker repeats a piece in consecutive jobs, including wrap.
Circular events preserve jobs that cross zero; a bounded microsecond-quantized
clock prevents drift, and effects use job-local elapsed time. No particles,
mutable assembly state or simulation entities are added.

An individual READY flag changes only its centered 92-by-24 gradient label.
Crews continue until every occupied seat is ready, then park in the initial
arrangement; undoing readiness resumes. Reduced motion is static and hidden
lobbies are not painted. The scene uses the caller's existing render loop; it
does not establish a separate frame cap or send network messages. Damage and
telemetry panels identify the preview as decorative rather than showing it as
the player's actual equipment.

## Current source-backed balance

| Setting | Current value |
| --- | --- |
| Chassis HP | 300 for every robot; armor strengthens panels, not chassis HP |
| Construction budget | 200 shared points for chassis, motor, armor and tools |
| Battle clock | Five-second countdown before 120 seconds; final launched shots/exit animation may settle after the clock stops |
| Participants | 2–8 in free-for-all; exact required counts in teams |
| Mounted tools | Up to 6 built tools + 2 temporary field tools |
| Visual rules | Up to 12; VOID skips a slot, first matching enabled rule wins |
| Arena | Fixed 632 × 632 square, bounds 84–716 in an 800 × 800 world view |
| Walls | 12 segments per side (48 total), 150 HP each |
| Wall impact damage cap | 72 per body collision; weapon wall damage is independent |
| Wall height | 42 units; valid aerial ring-outs |
| Pickup lock | 10 simulated seconds per robot, shared between repair and tool pickups |
| Repair | Up to 30% chassis HP and 25% of each surviving component; no resurrection |
| Supply waves | At 0, 30, 60 and 90 seconds; unclaimed previous items expire |

Earlier conversation values (100/160 points, 250/438 HP, 60/90 seconds,
220/240 wall HP, four/six-player caps) are superseded. Do not restore them just
because they occur in old tests, screenshots, exports or historical context.

## Chassis, tools and builder

Eight bodies: Wedge, Rectangle, Hexagon, Circle, Manta, Bastion, Twin Hull,
Cross. The last three renamed shapes use the old IDs `diamond`, `octagon` and
`capsule`; Cross remains unchanged. Movement, projectile and hazard collision
envelopes stay simplified. Melee contact follows the visible chassis outline,
including its concave gaps. User-drawn lines are decorative.

Nine tools: Ram, Flipper, Plow, Hammer, Saw, Drill, Flamethrower, Machine gun,
Rocket launcher. Tools mount anywhere within the allowed grid and rotate.
Each has independent HP, cooldown, mass and power, with shared robot energy.
All nine tool types consume another 10% less energy at every power level before
final rounding: `toolStats` multiplies the scaled cost by 0.855 (formerly 0.95)
and rounds to two decimals. Built and bonus tools use the same cost. Streams
pay once per activation, not per emitted round or contact tick. The 100-energy
pool, 12-per-second regeneration and 36-energy Charge cost remain unchanged.
Shared activations rotate through tool slots using one integer `energyCursor`
per robot. It advances only when a tool actually starts, so low energy cannot
continually favor the first machine gun. Broken, cooling, disabled and
non-contacting tools are skipped. When the next ready tool has a valid target
but lacks energy, later cheap tools wait so regeneration can fund it. A tool
that becomes ready ahead of it may fire once, then the cursor moves beyond
that slot; it cannot monopolize repeated turns. Explicit single-tool and
bonus-only actions keep their existing eligibility. The cursor is part of each
robot's exact simulation state, including local replay and Node/SSE snapshots,
and defaults to zero in older states.
Damage can break tools, armor panels and drives. Hidden matchup modifiers affect
specific targets; do not expose those modifiers on the cards. Do show nominal
base damage, power damage, reach and cooldown.

Melee checks overlapping working heads against the receiving tool, drive,
armor or body silhouette. Saw teeth use a rotating disk envelope; mounted tools
are no longer a single circle near their anchor. This fixes missed lateral
saw contact and strikes against distal tool heads. All tools retain the same
visible size at Light, Standard and Heavy through shared `toolScale`/`toolGeometry`;
power never enlarges the contact shape or the builder's selection area/zoom.
Their active extension is included in contact and drawing. Static shapes are
cached, and transformed receiving shapes are shared only within each attack
phase. Nothing is added to snapshots or the network protocol. Ranged tracing
and body movement collisions are unchanged. The visual ring-out footprint
uses the same fixed-size tools so every power level clears the boundary fully.

Broken components stop intercepting. An intact armor sector still reduces a
body hit even when the body outline is reached before its inset armor strip.
Armor transmits 22% plus half the attack's penetration fraction to chassis;
tools transmit 30%, and drives 35%. The rest is not queued for later. A valid
saw/drill contact therefore lowers exact chassis HP every tick, although a
small tick loss may not immediately change the integer HUD number.

Light/Standard/Heavy scaling: nominal damage ×1/1.5/2, reach ×1/1.25/1.5,
cooldown ×1/1.4/1.8. Machine guns emit 12 point-like bullets across 1.1 seconds;
Light nominal total damage is 15. Flame streams emit yellow moving line
particles for 1.6/1.8/2.0 seconds with nominal total damage 22/33/44. Damage
is applied every simulation tick of actual contact, including hull overlap at the cone edge, not multiplied by decorative particle count. Saw/drill damage and impulse budgets are spread over their existing cooldown, only while their real hit zone touches an enemy or wall. Lost contact time is not recovered. Other melee tools keep discrete impact damage.
Launched bullets/rockets continue until the first swept robot/wall hit regardless of owner, tool or rule changes. Range is acquisition-only. Misses retire beyond the fixed visible world plus trail margin (−32 to 832 per axis); maximum flight is less than 4.6 seconds. Queued rounds still cancel when firing stops.
Flipper lift multiplier is 0.6375 (previously 0.85), and base horizontal kick
is 123.75 (previously 165): both impulses are 25% lower. Damage, cooldown,
build cost and power-tier scaling remain unchanged.

Clicking any visible tool part selects that exact tool for dragging. Empty
space does not move a previously selected tool. Mouse-wheel rotation prefers
the hovered tool, else selected tool; 15-degree steps, 5 with Shift.
Double-click removes that tool and refunds construction points. Editing is
locked while in a room/battle; viewing a panel does not bypass the lock.

## Arena, effects and pickups

Hazards are fire, grinders, spikes, Tesla pads and acid. Every match changes the
seeded layout; spawn zones stay clear. Duels use 4–6 hazards; all 3–8-player
fields use 4. Density depends on the initial roster, not on the number of
survivors. Hazard symmetry varies with battle mode. Every supply wave has two
repair kits and two extra tools in opposite mirrored pairs, including in
quarter-turn hazard layouts. At most four supplies are available at once;
unclaimed items expire before the next wave. The old 6–8/8/6 hazard counts and
eight-item supply waves are superseded.

All hazard sensing/avoidance considers active hazards only. Warning lights do
not make an inactive trap detectable. Activation changes trigger immediate
rule reevaluation. Grinders run for 2 seconds and cool down for 3 seconds, with a seeded phase.
Acid stays active. Every trap applies damage gradually during active contact;
off periods and lost contact never build up damage for a later hit.

Each robot has its own 10-second shared pickup lock after successfully taking
health or an extra tool. Ineligible or unnecessary items remain for others.
Loot adds mass and consumes energy but no build points; it lasts this battle
only and never changes the saved blueprint. Bonus tools are yellow above 25%
HP, red with a warning at/below 25%, dimmed when destroyed. Repair cannot
rebuild broken components; another weapon pickup can replace a broken bonus slot.

At zero chassis HP the body explodes into recognizable chassis sections and
wheels, retaining the bot's original outline and details. It uses the same
explosion effect as rockets, and fragments disappear with a three-second fade.
Surviving tools scatter for 0.9 seconds and stay on the
field until recovered, keeping their exact remaining HP and maximum HP. They
use the same two bonus slots and ten-second pickup lock as supplied tools; broken
tools cannot be salvaged. A recovered tool can be dropped again when its new
owner is destroyed. Fragment motion is cosmetic and generated from the frozen
death pose, without physics bodies or per-particle network traffic. After final
shots settle, winner styling and final labels wait three real seconds while
explosions and debris finish animating; the live cards remain visible. Combat,
HP and ranking remain frozen. Repeated
online final frames do not restart the delay; reset/leave/replay clear the pending presentation.
Ring-outs retain the existing whole-body coast-out.

Launched bullets/rockets travel to impact or outside the visible world, even after
the shooter changes action or is eliminated. Unlaunched rounds and flames stop
when the active rule stops authorizing them. Existing shots settle before
final scoring; no new shots/AI driving/repair/hazard ticks happen in that phase.

Crossing the boundary commits elimination immediately. A 0.65-second visual
coast carries the entire robot outside with eight units of clearance. No return,
attack or pickup is possible after elimination. Fixed camera: no zoom/pan to
follow exits, bullets or debris. Off-canvas objects simply clip. Recovery near
solid walls reverses/turns naturally; it must not teleport robots, erase
knockback or override deliberate Brake/Attack-nearest-wall actions.

## Modes, AI and scoring

FFA allows 2–8 participants. Team modes are 2v2, 3v3, 4v4, 2v2v2 and
2v2v2v2. Teams are assigned by alternating seat/join order and spawn grouped.
Allies share a color, remain physically solid and have separate resources.
They are excluded from allied weapon targeting and weapon damage, including
rocket splash. Terrain and ring-outs still affect every robot.

Only AI practice opponents get fresh random names, shape, motor/armor, tools,
placement and logic each match, under the same budget. The human's saved robot
is never randomized. Replays keep the original generated roster and seed.
Online seats are real players; missing humans are not silently replaced by AI.
The host controls mode; team rooms require a complete balanced roster.
The standalone `ready` room status means the participant count is sufficient;
there are no per-player READY votes. Submitted blueprints are visible to room
members and lock on joining. The server owns simulation, so a disconnected host
browser does not pause it. A finished online room has no same-room rematch;
leave and create or join a new room. Local Another battle preserves the player's
blueprint and rules while generating new practice opponents and a new field.

Last surviving robot/team wins. At timeout, FFA compares exact surviving chassis
HP; teams compare summed surviving member HP. Eliminated members contribute
zero. Only exact top equality is a draw (do not compare rounded UI numbers).
All members of the winning team share victory, including eliminated teammates.
Eliminated entries rank below survivors within an FFA ranking or each team
group, using survival time where applicable. Team rank takes precedence.

## Presentation requirements

Prominent health numbers use the robot/team body color. Energy is clearly
secondary and smaller. Show each robot's pickup cooldown independently.
At countdown, move the same player-card DOM nodes from the top HUD into a
vertical live ranking to the right of the arena and move the clock into the
arena heading. Move the existing battle-control row into the same sidebar,
above the ranking, without duplicating buttons or their handlers. Keep controls
outside the roster's independent scroll area, and bound the whole sidebar by
the field's height. On desktop, the sidebar uses a 320–420 px column with a
16 px gutter beside the field. Compact cards place the name and seat on the
left, health/energy numbers and thin bars on the right, and pickup/status labels
in a shared footer row. On mobile, or when the central panel is narrower than
740 px, place the sidebar below the field and its legend instead of squeezing
the canvas beside the wider cards.
Keep cards and controls in these locations through completion and replay;
stop/leave or returning to the lobby restores the original workshop locations
and HUD/clock order. Preserve a focused control when reparenting it, without
requesting a page scroll.

Rank with `E.buildStandings`, preserving robot IDs, seat labels and colors.
FFA survivors sort by exact HP, followed by eliminated robots using survival
time and exact HP. Team battles group cards by the engine's team rank and use
its individual ordering inside each team. The live team strip keeps summed
surviving HP visible. Only move card nodes when the rank order changes; the
robot array and simulation are not reordered.

Rank changes animate for 260 ms using each existing card's current painted
position. A new rank change cancels and replaces an in-progress animation,
without resetting its visible starting position. Keep at most one animation
per card and release it when finished/cancelled. Reduced-motion preferences,
new previews and leaving battle cancel animations; hidden documents do not
start them.

The builder and logic panels slide away during battle countdown to enlarge the
arena, and have manual collapse/restore controls. Reopening a dock does not
return the ranking to the top. Keep the arena square.
The CSPIRE//ARENA topbar remains sticky during battle. Starting local/online
battles and replays does not request automatic page scrolling. Field sizing
reserves the topbar and arena heading. During countdown, battle, results and
replay, move mode, field/supply counts and team totals into the canvas's dark
exterior apron above the walls, and the full eight-entry legend into the apron
below the walls. These pointer-transparent overlays consume no extra layout
height and stay outside the playable square. Compact team labels retain full
accessible names and counts. World size, simulation rate and wall height
markings move to the side apron. Stopping, leaving or returning to the lobby
restores the same information nodes to their workshop positions. On a narrow
layout the sidebar follows the canvas with controls above the players.
Ready/countdown and winner banners share the same centered, compact gradient
strip (88% of the field, capped at 480 CSS pixels).

At completion, the existing cards keep their final places and add winner,
survivor/elimination and exact-HP labels after the three-second animation
delay. Announce the winner over the battlefield. No separate Battle decided
panel, results table, shortcut or modal is visible. Result reveal changes no
canvas dimensions or position. Camera remains fixed through ring-outs; manual
panel controls and window resizing may still resize the layout.

The arena heading and canvas use an English name selected from a fixed list
by the battle seed, for example Eagle's Nest, Burning Pit or Acid Bath. New
battles get fresh seeds, while replay and online viewers share the original
seed/name. Name selection does not consume simulation randomness; different
seeds can select the same name.

## Persistence and deployment boundaries

`public/engine.js` is shared with the authoritative Node HTTP/SSE server, at a
60 Hz simulation step. `public/app.js` handles local state and transport.
`build.js` bundles the four public source files into `cspire-arena.html`.
No game runtime dependencies are required. Node 20+ is the project's existing
minimum; the handoff environment uses the version recorded in QA results.

Keep old imports, browser storage key `line-arena.robot.v1`, and the `LineArena`
API alias working. Exports use `cspire-arena-robot`, version 2; old
`line-arena-robot` imports are accepted. Export/import is the portable way to
move player blueprints between browser origins; browser data is not in the repository.

No verified accounts, public matchmaking, persistent global leaderboards,
persistent online replay service or production hosting is implemented.
Server sessions and pilots are local data, never distributable project files.
Do not claim the app is deployed, secure for public hosting or attached to
someone's Codex installation based only on the downloadable project.

## Next session

Read `AGENTS.md`, run `npm run doctor`, and inspect the working tree. Preserve
current combat, identity and layout behavior. Optional construction rendering
must remain separate from live battle state and must not imply unavailable
standalone lobby features. Use current source and fresh checks rather than old
success counts; `TESTING.md` describes the available regression suites.
