# CSPIRE//ARENA — current decisions and handoff

## What this folder is

This is the complete source of Antonio's browser robot-combat game, continued
from `cspire-arena-v5.6-en.zip` supplied in the conversation. The current request
was originally to prepare that project for Codex. The latest local change reduces
hazard and supply density at Antonio's request. Game version remains **0.5.6**;
the local tuning is recorded under Unreleased in `CHANGELOG.md`.

The source, offline HTML and screenshots come from the existing project. This
handoff adds instructions, a compact decision record, portable QA entry points
and a new verification report. It is **not** a copy of the full ChatGPT chat,
an import of ChatGPT memories, or a registration in the desktop app. No remote
repository or deployment has been created.

## Product intent

A lightweight pure-JavaScript browser game combining a minimal vector robot
builder with no-code visual programming. Each human has one editable robot and
chooses up to twelve prioritized IF → DO rules. Robots fight autonomously;
there are no manual combat controls. Winning is about destroying or pushing
opponents out of a fixed square arena with breakable borders and active hazards.

User-facing conversation stays in Spanish; the game interface stays in English.
Keep the established thin-line look rather than replacing it with bricks, 3D
models, a new rendering library or generated artwork.

## Current source-backed balance

| Setting | Current value |
| --- | --- |
| Chassis HP | 250 for every robot; armor strengthens panels, not chassis HP |
| Construction budget | 200 shared points for chassis, motor, armor and tools |
| Battle clock | 120 seconds; final launched shots/exit animation may settle after the clock stops |
| Participants | 2–8 in free-for-all; exact required counts in teams |
| Mounted tools | Up to 6 built tools + 2 temporary field tools |
| Visual rules | Up to 12; first matching rule wins |
| Arena | Fixed 632 × 632 square, bounds 84–716 in an 800 × 800 world view |
| Walls | 12 segments per side (48 total), 180 HP each |
| Wall impact damage cap | 72 per body collision; weapon wall damage is independent |
| Wall height | 42 units; valid aerial ring-outs |
| Pickup lock | 10 simulated seconds per robot, shared between repair and tool pickups |
| Repair | Up to 30% chassis HP and 25% of each surviving component; no resurrection |
| Supply waves | At 0, 30, 60 and 90 seconds; unclaimed previous items expire |

Earlier conversation values (100/160 points, 300/438 HP, 60/90 seconds,
220/240 wall HP, four/six-player caps) are superseded. Do not restore them just
because they occur in old tests, screenshots, exports or historical context.

## Chassis, tools and builder

Eight bodies: Wedge, Rectangle, Hexagon, Circle, Manta, Bastion, Twin Hull,
Cross. The last three renamed shapes use the old IDs `diamond`, `octagon` and
`capsule`; Cross remains unchanged. Geometry is visually more elaborate but
still uses simplified collision envelopes. User-drawn lines are decorative.

Nine tools: Ram, Flipper, Plow, Hammer, Saw, Drill, Flamethrower, Machine gun,
Rocket launcher. Tools mount anywhere within the allowed grid and rotate.
Each has independent HP, cooldown, mass and power, with shared robot energy.
Damage can break tools, armor panels and drives. Hidden matchup modifiers affect
specific targets; do not expose those modifiers on the cards. Do show nominal
base damage, power damage, reach and cooldown.

Light/Standard/Heavy scaling: nominal damage ×1/1.5/2, reach ×1/1.25/1.5,
cooldown ×1/1.4/1.8. Machine guns emit 12 point-like bullets across 1.1 seconds;
Light nominal total damage is 15. Flame streams emit yellow moving line
particles for 1.6/1.8/2.0 seconds with nominal total damage 22/33/44. Damage
is distributed across the stream, not multiplied by decorative particle count.
The reduced flipper lift multiplier is 0.85.

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
rule reevaluation. Continuous acid/grinder hazards remain active.

Each robot has its own 10-second shared pickup lock after successfully taking
health or an extra tool. Ineligible or unnecessary items remain for others.
Loot adds mass and consumes energy but no build points; it lasts this battle
only and never changes the saved blueprint. Bonus tools are yellow above 25%
HP, red with a warning at/below 25%, dimmed when destroyed. Repair cannot
rebuild broken components; another weapon pickup can replace a broken bonus slot.

Launched bullets/rockets travel to impact or their configured range, even after
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

Last surviving robot/team wins. At timeout, FFA compares exact surviving chassis
HP; teams compare summed surviving member HP. Eliminated members contribute
zero. Only exact top equality is a draw (do not compare rounded UI numbers).
All members of the winning team share victory, including eliminated teammates.
Eliminated entries rank below survivors, using survival time where applicable.

## Presentation requirements

Prominent health numbers use the robot/team body color. Energy is clearly
secondary and smaller. Show each robot's pickup cooldown independently.
The builder and logic panels slide away during battle countdown to enlarge the
arena, and have manual collapse/restore controls. Keep the arena square.

At completion, announce the winner over the battlefield. Put the full standings
at its right on wide screens, below on narrow screens. Keep the board visible:
no full-screen results dialog or dimming backdrop. Camera remains fixed through
ring-outs; manual panel controls and window resizing may still resize the layout.

## Persistence and deployment boundaries

`public/engine.js` is shared with the authoritative Node HTTP/SSE server, at a
60 Hz simulation step. `public/app.js` handles local state and transport.
`build.js` bundles the four public source files into `cspire-arena.html`.
No game runtime dependencies are required. Node 20+ is the project's existing
minimum; the handoff environment uses the version recorded in QA results.

Keep old imports, browser storage key `line-arena.robot.v1`, and the `LineArena`
API alias working. Exports use `cspire-arena-robot`, version 2; old
`line-arena-robot` imports are accepted. Export/import is the portable way to
move player blueprints between browser origins; browser data is not in this ZIP.

No verified accounts, public matchmaking, persistent global leaderboards,
persistent online replay service or production hosting is implemented.
Server sessions and pilots are local data, never distributable project files.
Do not claim the app is deployed, secure for public hosting or attached to
someone's Codex installation based only on the downloadable project.

## Next session

Read `AGENTS.md`, run `npm run doctor`, and inspect the current working tree.
The latest request is the reduced field density described above. Preserve that
tuning instead of restoring the original handoff counts. Use the current source
and fresh tests over old success counts.
