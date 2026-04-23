---
name: Spaceflight feel
description: Ship rendering + flight feel polish — direction-aware flip, spring turning, back-exhaust, straight flight for asymmetric ships
type: project
---

Session 2026-04-23 added a dedicated "flight feel" layer for the player ship in src/main.js (around drawShip ~line 20234 and drawShipBody ~line 19422).

**Ship type classification.** A hard-coded set lists asymmetric (nose-to-tail directional) ship types: xwing, falcon, wedge, rocket, shuttle, scout, bomber, arrowhead, cargo, viper, needle, warbird, manta, dagger, dropship. Everything else (saucer, sphere, domepod, tie, eggufo, jellybell, wheelship, beetlepod, organic, crystal, swarm, etc.) is treated as symmetric.

**Direction-aware flip.** `ship.facing` (±1) updates from ship.vx with ±0.6 hysteresis. Asymmetric ships flip horizontally so the nose leads travel. Symmetric ships are never flipped.

**Spring-based turn animation.** `ship.facingTheta` (0 → π) sweeps between facings using a critically-damped spring (k=0.22, boost k=0.28, d=0.65). Visuals at angle θ:
- `xScale = sign(cos θ) * max(0.22, |cos θ|)` — ship rolls through a thin pose, never collapses.
- `yScale = 1 + 0.08*|sin θ|` — subtle vertical lift at crossover.
- `bank = 0.18*|sin θ| * facing` — mid-turn lean adds 3D feel.

**Straighter flight for asymmetric ships.** The normal steering bank `ship.tilt` is applied at only 30% for asymmetric ships (`_tiltFactor = _isAsym ? 0.3 : 1`) so the nose locks to the travel direction instead of swaying. Symmetric ships keep full tilt.

**Back-exhaust.** Main exhaust (world-space, after ctx.restore) offsets by `ship.facing * -26` on asymmetric ships so the trail comes from the tail regardless of direction; symmetric ships keep the belly jet at y+12. Boost flames (inside the local transform, before restore) likewise emit at local x ∈ [-36,-22] on asymmetric ships, or the original belly position on symmetric.

**Why:** User wanted asymmetric ships (like the scout dart) to read correctly when flying left — before, nose-to-tail ships looked like they were flying backward and engines fired from the wrong end. They also asked for the flip to feel fast and for boosted flight to feel "straight" rather than wobbly.

**How to apply:** When adding a new directional ship type, list it in `_asymShips` inside drawShip. When adding a new round/symmetric type, do nothing — the default handles it. To tune feel, adjust spring k/d in the facingTheta update and the 0.3 tilt factor.
