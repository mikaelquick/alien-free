// --- CONSTANTS ---
export const GRAVITY = 0.35;
export const BEAM_WIDTH = 120;
export const GROUND_LEVEL = 2000;
export const LEAVE_THRESHOLD = GROUND_LEVEL - 1800; // auto leave planet when above this
export const LAND_DISTANCE = 80; // how close to planet center to auto-land

export const WATER_DEPTH = 2500; // how deep the ocean goes below GROUND_LEVEL
export const WATER_SURFACE = 2000; // same as GROUND_LEVEL
export const SEABED_Y = GROUND_LEVEL + WATER_DEPTH;

export const EARTH_WORLD_WIDTH = 52000;
