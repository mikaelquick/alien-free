---
name: Feedback - Visual polish preferences
description: User wants visuals to be cooler/more specialised, not generic; reuse real render code for captured units
type: feedback
---

- Zoo captured units must render using the **actual** `renderHuman()` (or same code that drew them when captured), with their stored attributes (color, skinColor, hat, extra, alienHeadShape, bodyWidth, scale, label). Simplified "fake" drawings that don't match captured appearance are wrong.
- Don't add decorative occluders (like iron bars across the foreground of the zoo) — they cover the interesting content.
- Mothership doors must be **specialised** to what they contain, not generic coloured panels. Each door gets a unique viewport/window showing a peek of what's inside (bridge = starfield+pilot silhouette, starmap = galaxy swirl + orbits, comms = pulsing radio waves, lab = bubbling test tube, arena = crossed swords + sparks, zoo = cage bars + pacing silhouette, upgrades = rotating gear + wrench, stats = bar chart + pie).
- General rule: "everything should just be visually better and cooler" — prefer richer custom art per-element over reused generic primitives.
- Cave/environment art should look like classic 2D games (Terraria/Hollow Knight): organic irregular rock mouths, chunky tiled stone texture, stalactite/stalagmite teeth framing openings, moss and kelp, deep inner shadow. Avoid decorative gamey signage, hanging lanterns, or symmetric perfect arches — they break the natural feel.
- Skin/variant selectors should be grouped by type using a two-step browser (type picker → variant picker), same pattern as alien races. Applies to alien skins and ship skins alike.

**Why:** User cares deeply about the world feeling alive and polished; generic visuals break that feeling.
**How to apply:** When rendering something representative of gameplay content (a captured unit, a door to a room, a preview card), reuse the game's actual renderer or build a specialised per-type look. Don't ship a placeholder simplified version.
