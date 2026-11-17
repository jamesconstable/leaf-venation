import { polygonContains } from "../../geometry/region";
import { blurField } from "../blur";
import { drawGhost, fillShadowOnly, polygonPath } from "../canvas";
import { valueNoise } from "../noise";
import { ribbon, traceRibbon } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";
import { lightFrom, reflect } from "../surfaceLight";
import {
  closedLine,
  LIGHT,
  paintToneImage,
  shifted,
  toneScale,
  visibleArea,
  type ToneImage,
} from "./drawing";

/**
 * A mature leaf at midsummer, lit from the front: thick, plump and hydrated,
 * with a waxy surface. The blade domes up from its margin and sinks into
 * valleys along its veins, broad along the main veins and narrow along the
 * fine ones, so the tissue between them puffs up and catches the light, each
 * swell with its own soft sheen.
 */

const SUN = lightFrom(LIGHT, 0.75);
/** The most the lighting's resolution follows the zoom; beyond this it's scaled up. */
const MAX_DETAIL = 2;
/** The blade's colour in full light, and in shadow. */
const LIT = [48, 148, 36] as const;
const DEEP = [4, 38, 32] as const;
/** How the colour shifts where the tissue is warmer (yellower), and in full light. */
const WARM = [40, 14, -6] as const;
const GLOW = [60, 40, -10] as const;
const SHEEN = [236, 250, 214] as const;

/** A mask's coverage at each pixel, from its alpha. */
const coverage = (image: ToneImage) => {
  const { canvas } = image;
  const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
  const field = new Float32Array(canvas.width * canvas.height);
  if (pixels !== undefined)
    for (let k = 0; k < field.length; k++) field[k] = (pixels[4 * k + 3] ?? 0) / 255;
  return field;
};

/** The blade's surface as heights, in tone map pixels, over the tone map's area. */
const heights = (leaf: PreparedLeaf, blade: Path2D) => {
  const area = visibleArea(leaf, leaf.blade, 0.1 * leaf.leafLength + 48);
  const mask = (paint: (context: CanvasRenderingContext2D) => void) =>
    paintToneImage(
      area,
      (context) => {
        context.fillStyle = "black";
        paint(context);
      },
      toneScale(leaf, MAX_DETAIL),
    );
  // Each vein creases the blade along its centre line, more deeply for wider
  // veins (by rank, not drawn width, so the vein width exponent matters little).
  const widest = leaf.veins.reduce((max, v) => Math.max(max, v.halfWidth), 0.3);
  const depth = (halfWidth: number) => Math.min(1, 0.3 + 0.7 * Math.sqrt(halfWidth / widest));
  const bladeImage = mask((context) => {
    context.fill(blade, "evenodd");
  });
  const creaseImage = mask((context) => {
    context.lineWidth = 1.5;
    context.lineJoin = "round";
    for (const vein of leaf.veins) {
      context.globalAlpha = depth(vein.halfWidth);
      context.beginPath();
      vein.centre.forEach(({ x, y }, k) => {
        if (k === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  });
  const mainImage = mask((context) => {
    context.lineWidth = 3;
    context.lineJoin = "round";
    for (const vein of leaf.veins) {
      if (vein.halfWidth <= 0.3 * widest) continue;
      context.beginPath();
      vein.centre.forEach(({ x, y }, k) => {
        if (k === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  });
  if (bladeImage === undefined || creaseImage === undefined || mainImage === undefined) return;
  const { canvas, scale, left, top } = bladeImage;
  const [width, height] = [canvas.width, canvas.height];
  const length = leaf.leafLength * scale;
  // Fine details are sized in tone map pixels at normal size; magnified, they grow with it.
  const zoom = Math.min(leaf.magnification, MAX_DETAIL);

  const dome = coverage(bladeImage);
  blurField(dome, width, height, 0.05 * length);
  // A sharp crease, and the tissue folding gently down into it.
  const sharp = coverage(creaseImage);
  const fold = sharp.slice();
  blurField(sharp, width, height, zoom);
  blurField(fold, width, height, 3 * zoom);
  const broad = coverage(mainImage);
  blurField(broad, width, height, 0.02 * length);

  const field = new Float32Array(width * height);
  const pebbles = new Float32Array(width * height);
  /** How close each point is to a vein or the margin, where the tissue is a little yellower. */
  const edges = new Float32Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      const [x, y] = [left + i / scale - leaf.base.x, top + j / scale - leaf.base.y];
      // Across the blade and along it, in leaf lengths from the base.
      const [across, along] = [x / leaf.leafLength, -y / leaf.leafLength];
      const margin = 1 - Math.min(1, 2 * (dome[k] ?? 0));
      // No leaf is perfectly symmetric: one side folds up more than the other
      // about the midvein, the blade twists a little along its length, and the
      // margin undulates gently.
      const shape =
        length *
        (0.22 * across * across * (across > 0 ? 1 : 0.45) +
          0.08 * across * (along - 0.5) +
          0.03 * margin * (valueNoise(across * 7, along * 7, 17) - 0.5));
      field[k] =
        0.06 * length * (dome[k] ?? 0) +
        shape -
        3 * zoom * (sharp[k] ?? 0) -
        9 * zoom * (fold[k] ?? 0) -
        0.05 * length * (broad[k] ?? 0);
      // A gentle, fine pebbling of the surface, fixed to the leaf's base.
      pebbles[k] = 0.2 * zoom * valueNoise(x / 3, y / 3, 7);
      edges[k] = Math.min(1, 2.5 * (fold[k] ?? 0) + margin);
    }
  }
  return { field, pebbles, edges, width, height, image: bladeImage };
};

/** The lit blade, as an image at the tone map's resolution. */
const shadeBlade = (leaf: PreparedLeaf, blade: Path2D) => {
  const surface = heights(leaf, blade);
  if (surface === undefined) return;
  const { field, pebbles, edges, width, height, image } = surface;
  const out = document.createElement("canvas");
  [out.width, out.height] = [width, height];
  const context = out.getContext("2d");
  if (context === null) return;
  const pixels = context.createImageData(width, height);
  const index = (i: number, j: number) =>
    Math.min(height - 1, Math.max(0, j)) * width + Math.min(width - 1, Math.max(0, i));
  const at = (i: number, j: number) => field[index(i, j)] ?? 0;
  const bumpy = (i: number, j: number) => at(i, j) + (pebbles[index(i, j)] ?? 0);
  const { left, top, scale } = image;
  const length = leaf.leafLength || 1;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      // The broad form lights the blade; the fine pebbling shows only in its sheen,
      // as on a real leaf, where it catches the light but barely shades.
      const { diffuse } = reflect(
        (at(i + 1, j) - at(i - 1, j)) / 2,
        (at(i, j + 1) - at(i, j - 1)) / 2,
        SUN,
        20,
      );
      const { specular } = reflect(
        (bumpy(i + 1, j) - bumpy(i - 1, j)) / 2,
        (bumpy(i, j + 1) - bumpy(i, j - 1)) / 2,
        SUN,
        20,
      );
      const [x, y] = [
        (left + i / scale - leaf.base.x) / length,
        (top + j / scale - leaf.base.y) / length,
      ];
      // Broad, soft variation in colour, and yellower tissue by the veins and margin.
      const warm = valueNoise(x * 4, y * 4, 13) - 0.5 + 0.35 * (edges[j * width + i] ?? 0);
      const light = Math.min(1.1, 0.15 + 0.95 * diffuse);
      // Light scattered inside the leaf: shade deepens toward blue-green, full light warms.
      const glow = Math.max(0, light - 0.8);
      const sheen = 0.6 * specular;
      const k = 4 * (j * width + i);
      for (let c = 0; c < 3; c++) {
        const base = (LIT[c] ?? 0) + (WARM[c] ?? 0) * warm + (GLOW[c] ?? 0) * glow;
        const lit = (DEEP[c] ?? 0) + (base - (DEEP[c] ?? 0)) * light;
        pixels.data[k + c] = Math.round(lit + ((SHEEN[c] ?? 0) - lit) * sheen);
      }
      pixels.data[k + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return { canvas: out, left, top, scale };
};

/** The midvein's colour, which the petiole carries on. */
const MIDVEIN = "rgb(206, 232, 140)";

/** Pale veins, down in their creases (the height field does their shading). */
const drawVeins = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  for (const vein of leaf.veins) {
    const path = new Path2D();
    traceRibbon(path, vein.ribbon);
    context.fillStyle =
      vein.order === 1
        ? MIDVEIN
        : vein.order === 2
          ? "rgba(190, 226, 126, 0.8)"
          : "rgba(170, 214, 108, 0.6)";
    context.fill(path);
  }
};

/** Everything but the given shape. */
const outsideOf = (shape: Path2D) => {
  const outside = new Path2D();
  outside.rect(-1e5, -1e5, 2e5, 2e5);
  outside.addPath(shape);
  return outside;
};

/**
 * The petiole, in the midvein's colour. Its rounded shading and its shadow on
 * whatever lies behind belong to the part below the blade: the shading tapers
 * away along the midvein, so the two meet without a seam.
 */
const drawPetiole = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => {
  const line = leaf.petiole;
  const shape = new Path2D();
  traceRibbon(shape, ribbon(line));
  context.save();
  context.clip(outsideOf(blade), "evenodd");
  fillShadowOnly(context, shape, "rgba(4, 16, 2, 0.45)", 3);
  context.restore();
  context.fillStyle = MIDVEIN;
  context.fill(shape);
  const leaves = Math.max(
    1,
    line.findIndex(({ x, y }) => !polygonContains(leaf.blade, x, y)),
  );
  const tapered = line.map((p, k) => ({
    ...p,
    halfWidth: p.halfWidth * Math.min(1, Math.max(0, (2 * k) / leaves - 1)),
  }));
  context.save();
  context.clip(shape);
  const shade = new Path2D();
  traceRibbon(shade, ribbon(shifted(tapered, -0.7, 0.6)));
  fillShadowOnly(context, shade, "rgba(40, 90, 16, 0.55)", 1.5);
  const highlight = new Path2D();
  traceRibbon(highlight, ribbon(shifted(tapered, 0.4, 0.25)));
  context.fillStyle = "rgba(240, 250, 200, 0.6)";
  context.fill(highlight);
  context.restore();
};

/** A fine edge to the blade, pale where its rim catches the light and shaded on the far side. */
const drawEdge = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  const edge = new Path2D();
  traceRibbon(edge, ribbon(closedLine(leaf.blade, 0.6)));
  const half = 0.4 * leaf.leafLength;
  const [cx, cy] = [leaf.base.x, leaf.base.y - 0.5 * leaf.leafLength];
  const gradient = context.createLinearGradient(
    cx - LIGHT.x * half,
    cy - LIGHT.y * half,
    cx + LIGHT.x * half,
    cy + LIGHT.y * half,
  );
  gradient.addColorStop(0, "rgba(14, 48, 14, 0.7)");
  gradient.addColorStop(0.5, "rgba(80, 140, 50, 0.5)");
  gradient.addColorStop(1, "rgba(206, 236, 140, 0.75)");
  context.fillStyle = gradient;
  context.fill(edge);
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(240, 255, 210, 0.5)");
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  const image = shadeBlade(leaf, blade);
  context.save();
  context.clip(blade, "evenodd");
  if (image !== undefined) {
    const { canvas, left, top, scale } = image;
    context.imageSmoothingQuality = "high";
    context.drawImage(canvas, left, top, canvas.width / scale, canvas.height / scale);
  }
  drawVeins(context, leaf);
  context.restore();
  drawEdge(context, leaf);
  drawPetiole(context, leaf, blade);
};

export const deepSummerGreen: Style = {
  id: "deep-summer-green",
  name: "Deep summer",
  description: "A plump, waxy leaf at midsummer, lit from the front",
  theme: {
    accent: "#2f7a22",
    onAccent: "#f4f8ec",
    card: "#eef0e1",
    cardEdge: "rgba(70, 90, 40, 0.22)",
    text: "#17220f",
    muted: "#526146",
    stage: "#1f3a18",
  },
  // The golden canopy that spring green had.
  backdrop: {
    kind: "bokeh",
    deep: "#0d2410",
    mid: "#2f5a22",
    bright: "#e7d77a",
    cool: "#2f7d72",
    foliage: ["#0f2a10", "#1d4318", "#2f6524", "#4f8a33", "#86b347"],
    lights: ["#fff6c8", "#f2f7b8", "#d8f0a0", "#ffffff"],
  },
  overlay: { source: "#f0a830", kill: "rgba(255, 230, 180, 0.5)", node: "#0d220a" },
  drawLeaf,
};
