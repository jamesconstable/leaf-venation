/**
 * Lighting for a surface given as a height field, seen from straight above:
 * Lambertian diffuse light plus a Blinn–Phong specular highlight, as for a
 * glossy, waxy leaf. Screen coordinates: x to the right, y down, z toward the
 * viewer.
 */

export interface Light {
  /** Unit vector toward the light. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Unit vector halfway between the light and the viewer. */
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
}

/** A light from the given screen direction, raised `elevation` radians above the surface. */
export const lightFrom = (direction: { x: number; y: number }, elevation: number): Light => {
  const flat = Math.hypot(direction.x, direction.y) || 1;
  const [x, y, z] = [
    (Math.cos(elevation) * direction.x) / flat,
    (Math.cos(elevation) * direction.y) / flat,
    Math.sin(elevation),
  ];
  const h = Math.hypot(x, y, z + 1);
  return { x, y, z, hx: x / h, hy: y / h, hz: (z + 1) / h };
};

/**
 * The light reflected by a surface with slopes `dx` and `dy` (height change per
 * unit across and down): diffuse in [0, 1], and specular in [0, 1] with
 * highlights tighter for larger `shininess`.
 */
export const reflect = (
  dx: number,
  dy: number,
  light: Light,
  shininess: number,
): { diffuse: number; specular: number } => {
  const length = Math.hypot(dx, dy, 1);
  const [nx, ny, nz] = [-dx / length, -dy / length, 1 / length];
  const diffuse = Math.max(0, nx * light.x + ny * light.y + nz * light.z);
  const half = Math.max(0, nx * light.hx + ny * light.hy + nz * light.hz);
  return { diffuse, specular: diffuse > 0 ? half ** shininess : 0 };
};
