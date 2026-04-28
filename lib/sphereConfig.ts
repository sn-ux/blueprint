/**
 * Shared initial sphere orientation — Electronic / Ambient centered at front.
 *
 * Values computed by running the weighted Voronoi (fiboPoles + lloydRelax × 8)
 * over the canonical 9-genre set and inverting the Electronic pole position
 * so it maps exactly to [0, 0, 1] in view space.
 *
 * Both the homepage sphere and the Midvale / WorldSphere component read from
 * this constant so the two views always start from the same orientation.
 */
export const SPHERE_INIT_RX = -0.3074; // tilt (X-axis rotation, radians)
export const SPHERE_INIT_RY = -1.9603; // yaw  (Y-axis rotation, radians)
