import { polygonContains, type Polygon } from "../../geometry/region";
import { fillShadowOnly } from "../canvas";
import { hash2, valueNoise } from "../noise";
import { toScreenX, toScreenY } from "../view";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, PreparedVein } from "../style";

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
  /** Tone map pixels per screen pixel. */
  scale = TONE_SCALE,
): ToneImage | undefined => {
  const xs = area.map((p) => p.x);
  const ys = area.map((p) => p.y);
  const [left, top] = [Math.min(...xs) - 4, Math.min(...ys) - 4];
  const width = Math.ceil((Math.max(...xs) + 4 - left) * scale);
  const height = Math.ceil((Math.max(...ys) + 4 - top) * scale);
  if (!(width > 0 && height > 0)) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  context.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
  paint(context);
  return { canvas, left, top, scale: scale };
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
export const bladeTone = (leaf: PreparedLeaf, blade: Path2D, settings = defaultTone) =>
  paintTone(leaf.blade, paintBladeTone(leaf, blade, allParts, 0, settings));

/** How the blade's tones are made up, for styles (and viewers) to adjust. */
export interface ToneSettings {
  /** The blade's darkness overall, before folds and relief. */
  readonly overall: number;
  /** How much darker the side away from the light is than the side toward it. */
  readonly falloff: number;
  /** The darkness of the margin, where the blade curves away from the light. */
  readonly margin: number;
  /** The strength of the folds along the veins, and how far they reach (in leaf lengths, for the widest veins). */
  readonly folds: number;
  readonly foldReach: number;
  /** The strength of each vein's relief, and how far it reaches (relative to the usual). */
  readonly relief: number;
  readonly reliefReach: number;
}

export const defaultTone: ToneSettings = {
  overall: 0.36,
  falloff: 0.12,
  margin: 0.55,
  folds: 1,
  foldReach: 0.09,
  relief: 1,
  reliefReach: 1,
};

const black = (alpha: number) => `rgba(0, 0, 0, ${Math.min(1, Math.max(0, alpha))})`;

/** The separate contributions to the blade's tones, for looking at one at a time. */
export interface ToneParts {
  /** The overall tone, and the margin curving away from the light. */
  readonly form: boolean;
  /** Broad, gentle folds along the veins. */
  readonly folds: boolean;
  /** Crisp shade and light beside each vein, which stands proud of the blade. */
  readonly relief: boolean;
}

const allParts: ToneParts = { form: true, folds: true, relief: true };

/**
 * Paints the blade's tones (see `bladeTone`), or only some parts of them, into
 * a tone map, starting from a `neutral` darkness. The broad parts (the form and
 * the folds) are soft enough to paint at half the tone map's resolution, which
 * saves most of the work; each vein's crisp relief goes on top at full
 * resolution.
 */
export const paintBladeTone =
  (
    leaf: PreparedLeaf,
    blade: Path2D,
    parts: ToneParts = allParts,
    neutral = 0,
    settings: ToneSettings = defaultTone,
  ) =>
  (context: CanvasRenderingContext2D) => {
    context.clip(blade, "evenodd");
    const length = leaf.leafLength;
    const widest = leaf.veins.reduce((max, v) => Math.max(max, v.halfWidth), 0.3);
    const groups = groupByWidth(leaf.veins, 6).flatMap(({ group, halfWidth }) => {
      if (group.length === 0) return [];
      const path = new Path2D();
      for (const vein of group) traceRibbon(path, ribbon(vein.centre));
      return [{ path, halfWidth }];
    });
    const fill = (target: CanvasRenderingContext2D, alpha: number) => {
      target.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      target.fill(blade);
    };

    if (parts.form || parts.folds) {
      const broad = paintToneImage(
        leaf.blade,
        (coarse) => {
          coarse.clip(blade, "evenodd");
          if (neutral > 0) fill(coarse, neutral);
          if (parts.form) paintForm(coarse, leaf, blade, settings);
          if (parts.folds) {
            for (const { path, halfWidth } of groups)
              paintFold(coarse, path, length, halfWidth / widest, settings);
          }
        },
        TONE_SCALE / 2,
      );
      if (broad !== undefined) {
        const { canvas, left, top, scale } = broad;
        context.drawImage(canvas, left, top, canvas.width / scale, canvas.height / scale);
      }
    } else if (neutral > 0) {
      fill(context, neutral);
    }

    if (!parts.relief) return;
    for (const { path, halfWidth } of groups) {
      // Veins stand proud: crisp shade beside each on the side away from the light, light on the other.
      const reach = (1.4 + 2 * halfWidth) * settings.reliefReach;
      const blur = 1.5 + 2.5 * halfWidth;
      fillShadowAt(context, path, black(settings.relief), blur, -LIGHT.x * reach, -LIGHT.y * reach);
      context.globalCompositeOperation = "destination-out";
      fillShadowAt(
        context,
        path,
        black(0.75 * settings.relief),
        blur,
        LIGHT.x * reach,
        LIGHT.y * reach,
      );
      context.globalCompositeOperation = "source-over";
    }
  };

/** A mid tone overall, a little lighter toward the light, and the margin curving away from it. */
const paintForm = (
  context: CanvasRenderingContext2D,
  leaf: PreparedLeaf,
  blade: Path2D,
  { overall, falloff, margin }: ToneSettings,
) => {
  const length = leaf.leafLength;
  const { x, y } = leaf.base;
  const light = context.createLinearGradient(x - 0.5 * length, y, x + 0.5 * length, y);
  light.addColorStop(0, black(overall + falloff / 2));
  light.addColorStop(1, black(overall - falloff / 2));
  context.fillStyle = light;
  context.fill(blade);
  const band = new Path2D();
  traceRibbon(band, ribbon(closedLine(leaf.blade, 0.025 * length)));
  fillShadowOnly(context, band, black(margin), 0.04 * length);
};

/**
 * The blade folds gently along each vein, more broadly along wider ones
 * (`relativeWidth` is the veins' width as a fraction of the widest): shade
 * spreads from the vein across the side away from the light, fading with
 * distance, and light across the other. Smearing the shadow over several
 * offsets gives a graded fold rather than a displaced copy of the veins.
 */
const paintFold = (
  context: CanvasRenderingContext2D,
  veins: Path2D,
  length: number,
  relativeWidth: number,
  { folds, foldReach }: ToneSettings,
) => {
  const fold = foldReach * length * relativeWidth;
  if (fold <= 3) return;
  // Two offsets, each blurred widely, give much the same graded fold as four
  // narrower ones at half the cost (each blurred fill has a high fixed cost).
  for (const step of [0.4, 0.85]) {
    const reach = fold * step;
    const blur = 2 + 0.7 * reach;
    fillShadowAt(context, veins, black(0.245 * folds), blur, -LIGHT.x * reach, -LIGHT.y * reach);
    context.globalCompositeOperation = "destination-out";
    fillShadowAt(context, veins, black(0.28 * folds), blur, LIGHT.x * reach, LIGHT.y * reach);
    context.globalCompositeOperation = "source-over";
  }
};

/** Gentle undulations of the blade, as a height field over the leaf (lengths in leaf lengths). */
export const surface = (x: number, y: number, noise: CurlNoise = defaultCurlNoise) =>
  valueNoise(x * noise.scale, y * noise.scale, 29) +
  noise.detail * valueNoise(x * noise.detailScale, y * noise.detailScale, 31);

/** The noise surface behind the curl: its main frequency, and a finer one added at `detail` strength (per leaf length). */
export interface CurlNoise {
  readonly scale: number;
  readonly detail: number;
  readonly detailScale: number;
}

export const defaultCurlNoise: CurlNoise = { scale: 2.6, detail: 0.5, detailScale: 5.5 };

/**
 * Shading from the blade's subtle curling and lobing: darker where the surface
 * slopes away from the light, lighter where it faces it. Positions are relative
 * to the base in leaf lengths, so the undulations grow with the leaf.
 */
export const curl = (
  x: number,
  y: number,
  strength: number,
  noise: CurlNoise = defaultCurlNoise,
) => {
  const step = 0.02;
  const slope =
    (surface(x - LIGHT.x * step, y - LIGHT.y * step, noise) -
      surface(x + LIGHT.x * step, y + LIGHT.y * step, noise)) /
    (2 * step);
  return strength * slope;
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
  visit: (x: number, y: number, i: number, j: number, index: number) => void,
  /** If given, only marks within this screen area (roughly) are visited. */
  area?: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  },
): void => {
  const { view, bladeScale } = leaf;
  const { step, columns, firstRow, rows, minX } = latticeGrid(leaf, spacing);
  const shown = bladeScale * bladeScale;
  // The area in lattice cells, with a cell to spare for the jitter.
  const toU = (x: number) => (x - view.offsetX) / view.scale / bladeScale;
  const toV = (y: number) => (view.offsetY - y) / view.scale / bladeScale;
  const [i0, i1] =
    area === undefined
      ? [0, columns - 1]
      : [
          Math.max(0, Math.floor((toU(area.minX) - minX) / step) - 1),
          Math.min(columns - 1, Math.ceil((toU(area.maxX) - minX) / step) + 1),
        ];
  const [j0, j1] =
    area === undefined
      ? [firstRow, firstRow + rows - 1]
      : [
          Math.max(firstRow, Math.floor(toV(area.maxY) / step) - 1),
          Math.min(firstRow + rows - 1, Math.ceil(toV(area.minY) / step) + 1),
        ];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (hash2(i, j, seed) >= shown) continue;
      const u = minX + (i + hash2(i, j, seed + 1)) * step;
      const v = (j + hash2(i, j, seed + 2)) * step;
      visit(
        toScreenX(view, u * bladeScale),
        toScreenY(view, v * bladeScale),
        i,
        j,
        (j - firstRow) * columns + i,
      );
    }
  }
};

/**
 * The lattice behind `leafLattice`, fixed in the final leaf's coordinates.
 * Its size, `columns × rows`, bounds the dense `index` given to each visit,
 * which stays with the same mark for as long as the view is unchanged.
 */
export const latticeGrid = ({ bounds, view }: PreparedLeaf, spacing: number) => {
  const step = spacing / view.scale;
  const columns = Math.ceil((bounds.maxX - bounds.minX) / step);
  // Rows reach below the base, to cover the petiole.
  const firstRow = Math.floor(Math.min(bounds.minY, -0.2 * (bounds.maxY - bounds.minY)) / step);
  const rows = Math.ceil(bounds.maxY / step) - firstRow + 1;
  return { step, columns, firstRow, rows, minX: bounds.minX };
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
