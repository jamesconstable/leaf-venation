import {
  drawGhost,
  fillShadowOnly,
  fillShadowOnlyEvenOdd,
  makeTexture,
  pinnedPattern,
  polygonPath,
} from "../canvas";
import { tileableCells, tileableNoise } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, PreparedVein, Style } from "../style";
import { livingCells } from "./livingCells";

/**
 * A leaf in light, modelled on photographs of backlit leaves, shared by the
 * coloured styles. Light passing through the blade is uneven, so its colour
 * varies in soft patches; veins carry less chlorophyll, so their cores glow
 * paler, each in a soft shadow of denser tissue; the mesophyll's cells show
 * faintly; and light wraps around the margin as a bright rim.
 */

type Rgb = readonly [number, number, number];

/** The colours (and optional extra touches) of one leaf in light. */
export interface LeafLook {
  /** The dashed outline of the final leaf while it grows. */
  readonly ghost: string;
  /** The blade's base colour. */
  readonly blade: string;
  /** Soft patches of lighter and darker colour, with the patches' greatest opacity. */
  readonly patches: { readonly light: Rgb; readonly shade: Rgb; readonly alpha: number };
  /** A gradient from the tip to the base, for warmer light toward the top. */
  readonly warmth: readonly [string, string];
  /** How strongly the cell texture shows. */
  readonly cellAlpha: number;
  /** Whether the cells are computed afresh around the veins each frame, rather than a fixed texture. */
  readonly livingCells?: boolean;
  /** The soft shadow of denser tissue beside each vein. */
  readonly veinShadow: string;
  /** Vein cores by order: the first order (also the petiole), the second, and the rest. */
  readonly cores: readonly [string, string, string];
  /** The glow in from the margin: broad, narrow and at the very edge. */
  readonly rim: readonly [string, string, string];
  /** The fine line along the margin. */
  readonly hairline: string;
  readonly petioleHighlight: string;
  /** The petiole's soft shadow on whatever lies behind. */
  readonly petioleShadow: string;
  /** Extra colouring over the blade, before the veins' shadows (clipped to the blade). */
  readonly tint?: (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => void;
  /** Extra touches after the veins, before the rim. */
  readonly finish?: (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => void;
}

const TILE = 256;

/** Soft patches of light and shade, several times the size of the areoles. */
const patchCache = new Map<string, HTMLCanvasElement>();
const patchTexture = ({ light: lit, shade, alpha }: LeafLook["patches"]) => {
  const key = [...lit, ...shade, alpha].join();
  const cached = patchCache.get(key);
  if (cached !== undefined) return cached;
  const texture = makeTexture(TILE, TILE, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = tileableNoise(x, y, width, height, 70, 4, 23);
        const i = 4 * (y * width + x);
        const [r, g, b] = n > 0.5 ? lit : shade;
        const strength = Math.min(1, Math.abs(n - 0.5) * 4);
        image.data[i] = r;
        image.data[i + 1] = g;
        image.data[i + 2] = b;
        image.data[i + 3] = Math.round(255 * alpha * strength);
      }
    }
    context.putImageData(image, 0, 0);
  });
  patchCache.set(key, texture);
  return texture;
};

/**
 * A seamless cellular (Worley) texture, light at each cell's centre and dark
 * along its walls, like mesophyll under a lens.
 */
let cells: HTMLCanvasElement | undefined;
const cellTexture = () =>
  (cells ??= makeTexture(TILE, TILE, (context, width, height) => {
    const size = 8;
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const { f1, f2 } = tileableCells(x, y, width, height, size, 3);
        // Cell walls glow pale, like the veins; the cells themselves are denser and darker.
        const wall = 1 - Math.min(1, (f2 - f1) / 2.2);
        const centre = Math.max(0, 1 - f1 / size);
        const value = Math.round(255 * (0.5 + 0.28 * wall + 0.08 * (1 - centre)));
        const i = 4 * (y * width + x);
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }));

const widened = (centre: readonly RibbonPoint[], factor: number) =>
  ribbon(centre.map((p) => ({ ...p, halfWidth: p.halfWidth * factor })));

/** Groups veins by width, so each group's soft shadow needs only one blur. */
const byWidth = (veins: readonly PreparedVein[], groups: number) => {
  const widest = veins.reduce((max, v) => Math.max(max, v.halfWidth), 0.3);
  const buckets: PreparedVein[][] = Array.from({ length: groups }, () => []);
  for (const vein of veins) {
    const index = Math.min(groups - 1, Math.floor(Math.sqrt(vein.halfWidth / widest) * groups));
    buckets[index]?.push(vein);
  }
  return buckets.map((group, index) => ({
    group,
    halfWidth: widest * ((index + 0.5) / groups) ** 2,
  }));
};

const drawBlade = (
  context: CanvasRenderingContext2D,
  leaf: PreparedLeaf,
  blade: Path2D,
  look: LeafLook,
) => {
  const length = leaf.leafLength;
  context.fillStyle = look.blade;
  context.fill(blade, "evenodd");
  context.save();
  context.clip(blade, "evenodd");
  // Uneven light through the blade, in soft patches that grow with the leaf.
  const patchPattern = pinnedPattern(context, patchTexture(look.patches), leaf.base, length / 300);
  if (patchPattern !== null) {
    context.fillStyle = patchPattern;
    context.fill(blade);
  }
  // Warmer, brighter light toward the top of the leaf.
  const warmth = context.createLinearGradient(0, leaf.base.y - length, 0, leaf.base.y);
  warmth.addColorStop(0, look.warmth[0]);
  warmth.addColorStop(1, look.warmth[1]);
  context.fillStyle = warmth;
  context.fill(blade);
  look.tint?.(context, leaf, blade);
  context.restore();
};

/**
 * The mesophyll's cells, laid over the vein shadows rather than under them, so
 * the walls still show in the shade (overlay keeps contrast in darker tones).
 */
const drawCells = (
  context: CanvasRenderingContext2D,
  leaf: PreparedLeaf,
  blade: Path2D,
  look: LeafLook,
) => {
  context.save();
  context.clip(blade, "evenodd");
  context.globalCompositeOperation = "overlay";
  context.globalAlpha = look.cellAlpha;
  if (look.livingCells === true) {
    const cells = livingCells(leaf);
    if (cells !== undefined) {
      const { canvas, left, top, scale } = cells;
      context.imageSmoothingQuality = "high";
      context.drawImage(canvas, left, top, canvas.width / scale, canvas.height / scale);
    }
  } else {
    const cellPattern = pinnedPattern(context, cellTexture(), leaf.base, 1);
    if (cellPattern !== null) {
      context.fillStyle = cellPattern;
      context.fill(blade);
    }
  }
  context.restore();
};

/** Each vein sits in a soft shadow of denser tissue, a few times its width. */
const drawVeinShadows = (
  context: CanvasRenderingContext2D,
  leaf: PreparedLeaf,
  blade: Path2D,
  look: LeafLook,
) => {
  context.save();
  context.clip(blade, "evenodd");
  for (const { group, halfWidth } of byWidth(leaf.veins, 6)) {
    if (group.length === 0) continue;
    const path = new Path2D();
    for (const vein of group) traceRibbon(path, widened(vein.centre, 3));
    fillShadowOnly(context, path, look.veinShadow, 1.5 + halfWidth * 3);
  }
  context.restore();
};

const drawVeins = (
  context: CanvasRenderingContext2D,
  leaf: PreparedLeaf,
  blade: Path2D,
  look: LeafLook,
) => {
  context.save();
  context.clip(blade, "evenodd");
  // Paler cores: wider veins glow most.
  for (const vein of leaf.veins) {
    const path = new Path2D();
    traceRibbon(path, vein.ribbon);
    context.fillStyle = look.cores[Math.min(vein.order, 3) - 1] ?? look.cores[2];
    context.fill(path);
  }
  context.restore();
};

/**
 * Light glowing in from the margin, where the blade thins and light wraps around
 * its edge: the blurred shadow of everything outside the blade, cast inward.
 */
const drawRim = (
  context: CanvasRenderingContext2D,
  leaf: PreparedLeaf,
  blade: Path2D,
  look: LeafLook,
) => {
  const length = leaf.leafLength;
  const outside = new Path2D();
  outside.rect(-1e5, -1e5, 2e5, 2e5);
  outside.addPath(blade);
  context.save();
  context.clip(blade, "evenodd");
  // A broad, soft glow, then a narrow bright one right at the edge.
  fillShadowOnlyEvenOdd(context, outside, look.rim[0], 0.07 * length);
  fillShadowOnlyEvenOdd(context, outside, look.rim[1], 0.02 * length);
  fillShadowOnlyEvenOdd(context, outside, look.rim[2], 0.005 * length);
  context.restore();
  context.strokeStyle = look.hairline;
  context.lineWidth = 0.8;
  context.stroke(blade);
};

const drawPetiole = (
  context: CanvasRenderingContext2D,
  petiole: readonly RibbonPoint[],
  look: LeafLook,
) => {
  const shape = new Path2D();
  traceRibbon(shape, ribbon(petiole));
  // Pale like the midvein it continues, which it overlaps inside the blade.
  context.fillStyle = look.cores[0];
  context.fill(shape);
  // A pale highlight along the stalk.
  const highlight = new Path2D();
  traceRibbon(
    highlight,
    ribbon(
      petiole.map((p) => ({ ...p, x: p.x - p.halfWidth * 0.35, halfWidth: p.halfWidth * 0.3 })),
    ),
  );
  context.fillStyle = look.petioleHighlight;
  context.fill(highlight);
};

/** Draws a leaf in light, in the given colours. */
export const backlitLeaf =
  (look: LeafLook): Style["drawLeaf"] =>
  (context, leaf) => {
    drawGhost(context, leaf.ghost, look.ghost);
    const blade = polygonPath(leaf.blade, leaf.bladeHoles);
    const petiole = new Path2D();
    traceRibbon(petiole, ribbon(leaf.petiole));
    fillShadowOnly(context, petiole, look.petioleShadow, 3);
    drawBlade(context, leaf, blade, look);
    drawVeinShadows(context, leaf, blade, look);
    drawCells(context, leaf, blade, look);
    drawVeins(context, leaf, blade, look);
    look.finish?.(context, leaf, blade);
    drawRim(context, leaf, blade, look);
    // Drawn last, so the margin doesn't cut it off from the blade.
    drawPetiole(context, leaf.petiole, look);
  };
