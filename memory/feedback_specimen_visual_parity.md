---
name: Specimen capture must preserve every visual flag
description: Any property that affects how a human/alien is rendered in-world must be copied into mothership.specimens.push(), or zoo rendering will look different from the field
type: feedback
---

When capturing a unit into `mothership.specimens`, copy **every** property that `renderHuman()` (or related renderers) reads during drawing. Missing flags cause the zoo specimen to look different from the creature the player actually abducted — a recurring bug.

Current known-required fields at the capture site (`mothership.specimens.push({...})` around main.js:9573): `label, planet, planetId, color, skinColor, hat, extra, isAlien, alienHeadShape, alienExtra, scale, bodyWidth, headR, costume, float, alienRace, type, isAstronaut, isDino, dinoKind, biped`.

**Why:** We have hit this twice — Father Marcus (cross/collar scale) and the Moon astronaut (spacesuit overlay). The symptom is always the same: "X looks different in the zoo than when I grabbed him." In-world renderers often branch on a flag (`h.isAstronaut`, `h.costume==='president'`, `h.isDino`, etc.) — if that flag isn't in the specimen payload, the zoo spread `{...c}` has nothing to key off.
**How to apply:** Whenever you add a new visual branch to `renderHuman` (or spawn code that mutates a human after `generateInhabitant`), also add the flag to the specimen capture payload. When debugging a zoo/world-mismatch complaint, check the capture payload first — don't chase the renderer.
