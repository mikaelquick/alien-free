---
name: Earth biome fading
description: Earth biomes use continuous weighted multi-biome blending — every world x is a mix of all biomes
type: project
---

Earth uses **continuous multi-biome blending** (src/main.js ~line 1000). The old
`earthTransitions` range system is gone.

- `_biomeWeights(wx)` returns normalized weights (sum to 1) for every biome at position `wx`,
  using a Gaussian kernel centered on each biome's range. Kernel sigma is `halfWidth * 1.6` so
  neighbouring biomes overlap heavily — there is no pure-biome region anywhere in the world.
- `getEarthBiome(x)` returns a blended biome object with weighted-rgb `groundColor`, `grassColor`,
  `grassHeight`, `treeDensity`, `treeCanopyColor`, plus the dominant biome's `id`/flags/landmarks.
  Results are cached in `_biomeCache` by a 30-px quantized key.
- `getBiomeIntensity(x, biomeId)` returns that biome's weight at x (0..1). Used by ambient
  particles and weather.
- `_getBiomeGroundGrad(biome)` caches gradients keyed on the actual blended groundColor hex
  triple, so every unique blend gets its own gradient.

Populators (`generateBuilding`, `generatePrehistoricFlora`) stochastically pick a biome at each
slot using the weight array, so unit types mix across overlap regions instead of cutting at the
dominant-biome boundary.

**Why:** User wanted "smooth smooth" biome fading. Discrete transition ranges always produced a
visible edge where transition met pure-biome. Continuous weighted blending guarantees zero hard
edges since every pixel is a weighted combination.

**How to apply:** To make fades even wider, bump the `1.6` halfW multiplier. To add a new biome,
just extend the `earthBiomes` array — blending is automatic. Landmark generation (observatory,
radar base, jungle temple, etc.) uses the dominant biome id so fixed landmarks still appear in
their expected ranges.
