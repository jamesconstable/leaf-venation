import { polygonContains, type Polygon } from "../../geometry/region";
import { fillShadowOnly } from "../canvas";
import { hash2, valueNoise } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, PreparedVein } from "../style";
import { toScreenX, toScreenY } from "../view";

/**
 * Shared by the drawing styles (pen, pencil): a hand's wobble, and the tones of
 * a blade lit from the upper right, which each style renders in its own marks.
 */

/** The direction toward the light, in screen coordinates (upper right). */
export const LIGHT = { x: 0.6, y: -0.8 };

/** Nudges a line sideways by smooth noise at two scales, as a steady but human hand would. */
export const wobble = (
  points: readonly RibbonPoint[],
  amount: number,
  seed: number,
): RibbonPoint[] =>
  points.map((p) => {
    const nudge = (offset: number) =>
      amount * (valueNoise(p.x / 31, p.y / 31, seed + offset) - 0.5) +
      0.35 * amount * (valueNoise(p.x / 7, p.y / 7, seed + offset + 50) - 0.5);
    return {
      x: p.x + nudge(0),
      y: p.y + nudge(1),
      // Pen pressure varies slowly along the stroke.
      halfWidth: p.halfWidth * (0.75 + 0.5 * valueNoise(p.x / 41, p.y / 41, seed + 2)),
    };
  });

/** A closed polygon as a ribbon centre line (the first point repeated at the end). */
export const closedLine = (polygon: Polygon, halfWidth: number): RibbonPoint[] =>
  [...polygon, ...polygon.slice(0, 1)].map(({ x, y }) => ({ x, y, halfWidth }));

/** A centre line moved toward or away from the light by a multiple of its own half width. */
export const shifted = (centre: readonly RibbonPoint[], by: number, widthFactor: number) =>
  centre.map((p) => ({
    x: p.x + LIGHT.x * by * p.halfWidth,
    y: p.y + LIGHT.y * by * p.halfWidth,
    halfWidth: p.halfWidth * widthFactor,
  }));

/** Darkness in [0, 1] at screen positions, read from a tone map painted at reduced resolution. */
export type Tone = (x: number, y: number) => number;

const TONE_SCALE = 0.5;

/** A tone map's canvas (darkness as alpha), and where its top left corner sits on screen. */
export interface ToneImage {
  readonly canvas: HTMLCanvasElement;
  readonly left: number;
  readonly top: number;
  /** Tone map pixels per screen pixel. */
  readonly scale: number;
}

/** Paints darkness (as alpha) offscreen, at reduced resolution, over the given screen area. */
export const paintToneImage = (
  area: readonly { x: number; y: number }[],
  paint: (context: CanvasRenderingContext2D) => void,
): ToneImage | undefined => {
  const xs = area.map((p) => p.x);
  const ys = area.map((p) => p.y);
  const [left, top] = [Math.min(...xs) - 4, Math.min(...ys) - 4];
  const width = Math.ceil((Math.max(...xs) + 4 - left) * TONE_SCALE);
  const height = Math.ceil((Math.max(...ys) + 4 - top) * TONE_SCALE);
  if (!(width > 0 && height > 0)) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return undefined;
  context.setTransform(TONE_SCALE, 0, 0, TONE_SCALE, -left * TONE_SCALE, -top * TONE_SCALE);
  paint(context);
  return { canvas, left, top, scale: TONE_SCALE };
};

/** Reads darkness from a tone map at screen positions. */
export const toneReader = (image: ToneImage): Tone | undefined => {
  const { canvas, left, top } = image;
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  const [width, height] = [canvas.width, canvas.height];
  const pixels = context.getImageData(0, 0, width, height).data;
  return (x, y) => {
    const i = Math.floor((x - left) * TONE_SCALE);
    const j = Math.floor((y - top) * TONE_SCALE);
    if (i < 0 || j < 0 || i >= width || j >= height) return 0;
    return (pixels[4 * (j * width + i) + 3] ?? 0) / 255;
  };
};

/** Paints darkness (as alpha) offscreen over the given screen area, and returns a reader for it. */
export const paintTone = (
  area: readonly { x: number; y: number }[],
  paint: (context: CanvasRenderingContext2D) => void,
): Tone | undefined => {
  const image = paintToneImage(area, paint);
  return image === undefined ? undefined : toneReader(image);
};

export const groupByWidth = (veins: readonly PreparedVein[], groups: number) => {
  const widest = veins.reduce((max, v) => Math.max(max, v.halfWidth), 0.3);
  const buckets: PreparedVein[][] = Array.from({ length: groups }, () => []);
  for (const vein of veins) {
    const index = Math.min(groups - 1, Math.floor(Math.sqrt(vein.halfWidth / widest) * groups));
    buckets[index]?.push(vein);
  }
  return buckets.map((group, i) => ({ group, halfWidth: widest * ((i + 0.5) / groups) ** 2 }));
};

/** Fills a shape's blurred shadow, moved by an offset in screen units. */
export const fillShadowAt = (
  context: CanvasRenderingContext2D,
  path: Path2D,
  colour: string,
  blur: number,
  dx: number,
  dy: number,
) => {
  context.save();
  context.translate(dx, dy);
  fillShadowOnly(context, path, colour, blur);
  context.restore();
};

/** The blade's tones: the margin curving away, folds along the veins, and each vein's relief. */
export const bladeTone = (leaf: PreparedLeaf, blade: Path2D) =>
  paintTone(leaf.blade, paintBladeTone(leaf, blade));

/** Paints the blade's tones (see `bladeTone`) into a tone map. */
export const paintBladeTone =
  (leaf: PreparedLeaf, blade: Path2D) => (context: CanvasRenderingContext2D) => {
    context.clip(blade, "evenodd");
    const length = leaf.leafLength;
    const { x, y } = leaf.base;
    // A mid tone overall, a little lighter toward the light.
    const light = context.createLinearGradient(x - 0.5 * length, y, x + 0.5 * length, y);
    light.addColorStop(0, "rgba(0, 0, 0, 0.42)");
    light.addColorStop(1, "rgba(0, 0, 0, 0.3)");
    context.fillStyle = light;
    context.fill(blade);

    // Toward the margin the blade curves away from the light.
    const band = new Path2D();
    traceRibbon(band, ribbon(closedLine(leaf.blade, 0.025 * length)));
    fillShadowOnly(context, band, "rgba(0, 0, 0, 0.55)", 0.04 * length);

    const widest = leaf.veins.reduce((max, v) => Math.max(max, v.halfWidth), 0.3);
    for (const { group, halfWidth } of groupByWidth(leaf.veins, 6)) {
      if (group.length === 0) continue;
      const path = new Path2D();
      for (const vein of group) traceRibbon(path, ribbon(vein.centre));
      // The blade folds gently along each vein, more broadly along wider ones: shade
      // spreads from the vein across the side away from the light, fading with
      // distance, and light across the other. Smearing the shadow over several
      // offsets gives a graded fold rather than a displaced copy of the veins.
      const fold = 0.09 * length * (halfWidth / widest);
      if (fold > 3) {
        for (let k = 1; k <= 4; k++) {
          const reach = (fold * k) / 4;
          const blur = 2 + 0.5 * reach;
          fillShadowAt(
            context,
            path,
            "rgba(0, 0, 0, 0.13)",
            blur,
            -LIGHT.x * reach,
            -LIGHT.y * reach,
          );
          context.globalCompositeOperation = "destination-out";
          fillShadowAt(
            context,
            path,
            "rgba(0, 0, 0, 0.15)",
            blur,
            LIGHT.x * reach,
            LIGHT.y * reach,
          );
          context.globalCompositeOperation = "source-over";
        }
      }
      // Veins stand proud: crisp shade beside each on the side away from the light, light on the other.
      const reach = 1.4 + 2 * halfWidth;
      const blur = 1.5 + 2.5 * halfWidth;
      fillShadowAt(context, path, "rgba(0, 0, 0, 1)", blur, -LIGHT.x * reach, -LIGHT.y * reach);
      context.globalCompositeOperation = "destination-out";
      fillShadowAt(context, path, "rgba(0, 0, 0, 0.75)", blur, LIGHT.x * reach, LIGHT.y * reach);
      context.globalCompositeOperation = "source-over";
    }
  };

/** Gentle undulations of the blade, as a height field over the leaf (lengths in leaf lengths). */
export const surface = (x: number, y: number) =>
  valueNoise(x * 2.6, y * 2.6, 29) + 0.5 * valueNoise(x * 5.5, y * 5.5, 31);

/**
 * Shading from the blade's subtle curling and lobing: darker where the surface
 * slopes away from the light, lighter where it faces it. Positions are relative
 * to the base in leaf lengths, so the undulations grow with the leaf.
 */
export const curl = (x: number, y: number) => {
  const step = 0.02;
  const slope =
    (surface(x - LIGHT.x * step, y - LIGHT.y * step) -
      surface(x + LIGHT.x * step, y + LIGHT.y * step)) /
    (2 * step);
  return 0.16 * slope;
};

/**
 * Visits candidate marks on a jittered lattice about `spacing` pixels apart,
 * fixed in the final leaf's coordinates, so marks move with the leaf as it grows
 * rather than shimmering. While the leaf is small, the same lattice would crowd
 * its marks together, so only a fraction (by each mark's rank) is visited,
 * keeping the density on screen, and so the overall tone, the same at every
 * size: as the leaf grows, new marks appear between the old. Each visit gets the
 * screen position and lattice indices (for further per-mark hashes).
 */
export const leafLattice = (
  leaf: PreparedLeaf,
  spacing: number,
  seed: number,
  visit: (x: number, y: number, i: number, j: number) => void,
): void => {
  const { bounds, view, bladeScale } = leaf;
  const step = spacing / view.scale;
  const shown = bladeScale * bladeScale;
  const columns = Math.ceil((bounds.maxX - bounds.minX) / step);
  // Rows reach below the base, to cover the petiole.
  const firstRow = Math.floor(Math.min(bounds.minY, -0.2 * (bounds.maxY - bounds.minY)) / step);
  const lastRow = Math.ceil(bounds.maxY / step);
  for (let j = firstRow; j <= lastRow; j++) {
    for (let i = 0; i < columns; i++) {
      if (hash2(i, j, seed) >= shown) continue;
      const u = bounds.minX + (i + hash2(i, j, seed + 1)) * step;
      const v = (j + hash2(i, j, seed + 2)) * step;
      visit(toScreenX(view, u * bladeScale), toScreenY(view, v * bladeScale), i, j);
    }
  }
};

/**
 * A petiole's two edges as open lines, starting where they leave the blade
 * (inside it, the midvein's own edges carry on), and the line closing its far
 * end, so the margin need not be drawn across it.
 */
export const petioleEdges = (
  left: readonly { x: number; y: number }[],
  right: readonly { x: number; y: number }[],
  blade: Polygon,
): Path2D => {
  const edges = new Path2D();
  for (const side of [left, right]) {
    // Start one point early, tucked under the margin, so the two lines meet.
    const leaves = side.findIndex(({ x, y }) => !polygonContains(blade, x, y));
    if (leaves === -1) continue;
    side.slice(Math.max(0, leaves - 1)).forEach(({ x, y }, k) => {
      if (k === 0) edges.moveTo(x, y);
      else edges.lineTo(x, y);
    });
  }
  const [endLeft, endRight] = [left.at(-1), right.at(-1)];
  if (endLeft !== undefined && endRight !== undefined) {
    edges.moveTo(endLeft.x, endLeft.y);
    edges.lineTo(endRight.x, endRight.y);
  }
  return edges;
};
