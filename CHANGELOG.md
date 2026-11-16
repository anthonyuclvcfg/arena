# Unreleased — combat, live standings and reusable construction rendering

- Raise chassis health to 300 HP and reduce Flipper launch impulses by 25%, preserving its damage, cooldown and cost. Reduce wall durability to 150 HP.
- Add a five-second pre-battle countdown and VOID programming slots. Preserve the player's design and rules for local Another battle; only practice bots and the field regenerate.
- Apply flame, saw, drill and active-trap damage progressively during actual contact. Grinders run for two seconds and cool down for three. Improve lateral melee contact against visible tool heads and chassis outlines.
- Keep tool size unchanged across Light, Standard and Heavy. Reduce activation energy to a 0.855 multiplier and rotate shared activation priority so low energy does not permanently favor one tool slot.
- Keep launched bullets and rockets flying until impact or departure from the visible world, including after shooter elimination. Resolve outstanding shots before final scoring.
- Explode destroyed chassis into recognizable, fading body sections and wheels. Scatter surviving tools for 0.9 seconds, then allow recovery with their remaining HP and the shared ten-second pickup cooldown.
- Use 4–6 hazards in duels and four in larger fields. Each mirrored supply wave contains two repairs and two extra tools.
- Move the existing player cards into an animated live ranking beside the field, with compact health/energy columns and controls above it. Preserve DOM identity and focus, keep the topbar visible, and avoid automatic scrolling at start.
- Put field information and the complete legend in the exterior canvas margins. Keep final places in the existing player cards, wait three seconds for final animations, and show the winner without resizing the field or opening a separate result panel.
- Choose English arena names deterministically from the field seed; replay retains the same name and layout.
- Display controller aliases beneath robot names while preserving YOU and BOT #. Keep the original battle controller roster stable through result presentation and truncate long labels accessibly.
- Generate and migrate automatic robot identifiers to NAME-CODE-NN using the original twelve prefixes. Preserve custom names and all designs/programs. Resolve later duplicate names deterministically at match entry while reserving every original name, and persist the human player's assigned name.
- Include an optional construction painter for a hosting interface. Eight cached public models use two eyeless industrial workers sharing six components; each worker performs six jobs in a closed 72-second sequence, offset by six seconds. Preserve cargo continuity across the loop, render every part once, and use bounded analytic clocks with no combat or network state. A supplied individual READY flag changes the centered label; all crews park only when every occupied seat is ready. Respect reduced motion and skip hidden-tab painting. **The shipped local-practice and Node/SSE flows do not activate this scene or implement individual READY voting or hidden-design lobbies.**

# 0.5.6

- Fixed arena camera: no zoom or pan after ring-outs, while exit animation and elimination remain unchanged.
- Maximum eight local/online participants. Six-to-eight-player fields retain four hazards.
- Team modes: 2v2, 3v3, 4v4, 2v2v2 and 2v2v2v2; free-for-all is still available.
- Allied targeting/weapon damage disabled. Solid allies, terrain damage and individual resources preserved.
- Team-grouped starts, shared colors, A/B/C/D labels and surviving-team HP totals.
- Last surviving team wins; time-limit ranking uses exact summed surviving HP, and tied leaders share victory.
- Full balanced online team rosters; host controls mode, with alternating join-order assignment. No silent AI replacements for missing humans.
- Manta, Bastion and Twin Hull replace Diamond, Octagon and Capsule. Cross and the first four bodies are unchanged. Old IDs/imports/stats remain compatible.
- Preserved 250 HP, 200-point budget, 180-HP walls, two-minute duration, and ten-second individual pickup lock.
