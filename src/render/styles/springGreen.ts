import {
  drawGhost,
  fillShadowOnly,
  fillShadowOnlyEvenOdd,
  makeTexture,
  pinnedPattern,
  polygonPath,
} from "../canvas";
import { hash2, tileableNoise } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, PreparedVein, Style } from "../style";

/**
 * A young leaf held up to the light, modelled on photographs of backlit leaves.
 * Light passing through the blade is uneven, so its colour varies in soft
 * patches; veins carry less chlorophyll, so their cores glow paler, but each
 * sits in a wide, soft shadow of denser tissue; and light wraps around the
 * margin as a bright rim.
 */

const TILE = 256;

/** Soft patches of light and shade, several times the size of the areoles. */
let patches: HTMLCanvasElement | undefined;
const patchTexture = () =>
  (patches ??= makeTexture(TILE, TILE, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = tileableNoise(x, y, width, height, 70, 4, 23);
        const i = 4 * (y * width + x);
        // Light patches lean yellow-green, shaded ones toward a deeper green.
        const light = n > 0.5;
        const strength = Math.min(1, Math.abs(n - 0.5) * 4);
        image.data[i] = light ? 196 : 52;
        image.data[i + 1] = light ? 222 : 96;
        image.data[i + 2] = light ? 104 : 30;
        image.data[i + 3] = Math.round(255 * 0.75 * strength);
      }
    }
    context.putImageData(image, 0, 0);
  }));

/**
 * A seamless cellular (Worley) texture, light at each cell's centre and dark
 * along its walls, like mesophyll under a lens.
 */
let cells: HTMLCanvasElement | undefined;
const cellTexture = () =>
  (cells ??= makeTexture(TILE, TILE, (context, width, height) => {
    const size = 8;
    const columns = width / size;
    const rows = height / size;
    const site = (i: number, j: number) => {
      const wi = ((i % columns) + columns) % columns;
      const wj = ((j % rows) + rows) % rows;
      return { x: (i + hash2(wi, wj, 3)) * size, y: (j + hash2(wi, wj, 4)) * size };
    };
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [ci, cj] = [Math.floor(x / size), Math.floor(y / size)];
        let f1 = Infinity;
        let f2 = Infinity;
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            const s = site(ci + di, cj + dj);
            const d = Math.hypot(s.x - x, s.y - y);
            if (d < f1) [f1, f2] = [d, f1];
            else if (d < f2) f2 = d;
          }
        }
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

const drawBlade = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => {
  const length = leaf.leafLength;
  context.fillStyle = "#7fb23e";
  context.fill(blade, "evenodd");
  context.save();
  context.clip(blade, "evenodd");
  // Uneven light through the blade, in soft patches that grow with the leaf.
  const patchPattern = pinnedPattern(context, patchTexture(), leaf.base, length / 300);
  if (patchPattern !== null) {
    context.fillStyle = patchPattern;
    context.fill(blade);
  }
  // Warmer, brighter light toward the top of the leaf.
  const warmth = context.createLinearGradient(0, leaf.base.y - length, 0, leaf.base.y);
  warmth.addColorStop(0, "rgba(206, 214, 96, 0.35)");
  warmth.addColorStop(1, "rgba(206, 214, 96, 0)");
  context.fillStyle = warmth;
  context.fill(blade);
  context.restore();
};

/**
 * The mesophyll's cells, laid over the vein shadows rather than under them, so
 * the walls still show in the shade (overlay keeps contrast in darker tones).
 */
const drawCells = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => {
  const cellPattern = pinnedPattern(context, cellTexture(), leaf.base, 1);
  if (cellPattern === null) return;
  context.save();
  context.clip(blade, "evenodd");
  context.globalCompositeOperation = "overlay";
  context.globalAlpha = 0.35;
  context.fillStyle = cellPattern;
  context.fill(blade);
  context.restore();
};

/** Each vein sits in a soft shadow of denser tissue, a few times its width. */
const drawVeinShadows = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => {
  context.save();
  context.clip(blade, "evenodd");
  for (const { group, halfWidth } of byWidth(leaf.veins, 6)) {
    if (group.length === 0) continue;
    const path = new Path2D();
    for (const vein of group) traceRibbon(path, widened(vein.centre, 3));
    fillShadowOnly(context, path, "rgba(44, 84, 14, 0.5)", 1.5 + halfWidth * 3);
  }
  context.restore();
};

const drawVeins = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => {
  context.save();
  context.clip(blade, "evenodd");
  // Paler cores: wider veins glow most.
  for (const vein of leaf.veins) {
    const path = new Path2D();
    traceRibbon(path, vein.ribbon);
    context.fillStyle =
      vein.order <= 1
        ? "rgb(220, 237, 148)"
        : vein.order === 2
          ? "rgba(214, 234, 140, 0.9)"
          : "rgba(204, 228, 128, 0.8)";
    context.fill(path);
  }
  context.restore();
};

/**
 * Light glowing in from the margin, where the blade thins and light wraps around
 * its edge: the blurred shadow of everything outside the blade, cast inward.
 */
const drawRim = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => {
  const length = leaf.leafLength;
  const outside = new Path2D();
  outside.rect(-1e5, -1e5, 2e5, 2e5);
  outside.addPath(blade);
  context.save();
  context.clip(blade, "evenodd");
  // A broad, soft glow, then a narrow bright one right at the edge.
  fillShadowOnlyEvenOdd(context, outside, "rgba(214, 236, 112, 0.75)", 0.07 * length);
  fillShadowOnlyEvenOdd(context, outside, "rgba(232, 246, 150, 0.85)", 0.02 * length);
  fillShadowOnlyEvenOdd(context, outside, "rgba(246, 252, 196, 1)", 0.005 * length);
  context.restore();
  context.strokeStyle = "rgba(58, 96, 24, 0.7)";
  context.lineWidth = 0.8;
  context.stroke(blade);
};

const drawPetiole = (context: CanvasRenderingContext2D, petiole: readonly RibbonPoint[]) => {
  const shape = new Path2D();
  traceRibbon(shape, ribbon(petiole));
  // Pale like the midvein it continues, which it overlaps inside the blade.
  context.fillStyle = "rgb(220, 237, 148)";
  context.fill(shape);
  // A pale highlight along the stalk.
  const highlight = new Path2D();
  traceRibbon(
    highlight,
    ribbon(
      petiole.map((p) => ({ ...p, x: p.x - p.halfWidth * 0.35, halfWidth: p.halfWidth * 0.3 })),
    ),
  );
  context.fillStyle = "rgba(236, 248, 190, 0.6)";
  context.fill(highlight);
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(240, 255, 210, 0.55)");
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  const petiole = new Path2D();
  traceRibbon(petiole, ribbon(leaf.petiole));
  fillShadowOnly(context, petiole, "rgba(20, 44, 8, 0.45)", 3);
  drawBlade(context, leaf, blade);
  drawVeinShadows(context, leaf, blade);
  drawCells(context, leaf, blade);
  drawVeins(context, leaf, blade);
  drawRim(context, leaf, blade);
  // Drawn last, so the margin doesn't cut it off from the blade.
  drawPetiole(context, leaf.petiole);
};

export const springGreen: Style = {
  id: "spring-green",
  name: "Spring green",
  description: "A young leaf held up to the light, among out-of-focus foliage",
  theme: {
    accent: "#6f9a2a",
    onAccent: "#fbfdf2",
    card: "#eef0e1",
    cardEdge: "rgba(70, 90, 40, 0.22)",
    text: "#1f2a15",
    muted: "#5d6b4b",
    stage: "#1f3a18",
  },
  backdrop: {
    kind: "bokeh",
    deep: "#0d2410",
    mid: "#2f5a22",
    bright: "#e7d77a",
    cool: "#2f7d72",
    foliage: ["#0f2a10", "#1d4318", "#2f6524", "#4f8a33", "#86b347"],
    lights: ["#fff6c8", "#f2f7b8", "#d8f0a0", "#ffffff"],
  },
  overlay: { source: "#e2563b", kill: "rgba(255, 210, 190, 0.6)", node: "#20360f" },
  drawLeaf,
};
