import { blurField } from "../blur";
import { drawGhost, fillShadowOnly, polygonPath } from "../canvas";
import { valueNoise } from "../noise";
import { ribbon, traceRibbon } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";
import { lightFrom, reflect } from "../surfaceLight";
import { closedLine, LIGHT, paintToneImage, shifted, type ToneImage } from "./drawing";

/**
 * A mature leaf at midsummer, lit from the front: thick, plump and hydrated,
 * with a waxy surface. The blade domes up from its margin and sinks into
 * valleys along its veins, broad along the main veins and narrow along the
 * fine ones, so the tissue between them puffs up and catches the light, each
 * swell with its own soft sheen.
 */

const SUN = lightFrom(LIGHT, 0.75);
/** The blade's colour in full light, and in shadow. */
const LIT = [48, 148, 36] as const;
const DEEP = [10, 46, 14] as const;
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
  const area = leaf.blade;
  const mask = (paint: (context: CanvasRenderingContext2D) => void) =>
    paintToneImage(area, (context) => {
      context.fillStyle = "black";
      paint(context);
    });
  const widest = leaf.veins.reduce((max, v) => Math.max(max, v.halfWidth), 0.3);
  const all = new Path2D();
  const main = new Path2D();
  for (const vein of leaf.veins) {
    traceRibbon(all, vein.ribbon);
    if (vein.halfWidth > 0.3 * widest) traceRibbon(main, vein.ribbon);
  }
  const bladeImage = mask((context) => {
    context.fill(blade, "evenodd");
  });
  const veinImage = mask((context) => {
    context.fill(all);
  });
  const mainImage = mask((context) => {
    context.fill(main);
  });
  if (bladeImage === undefined || veinImage === undefined || mainImage === undefined) return;
  const { canvas, scale, left, top } = bladeImage;
  const [width, height] = [canvas.width, canvas.height];
  const length = leaf.leafLength * scale;

  const dome = coverage(bladeImage);
  blurField(dome, width, height, 0.05 * length);
  const narrow = coverage(veinImage);
  const plump = narrow.slice();
  blurField(narrow, width, height, 1);
  blurField(plump, width, height, 3);
  const broad = coverage(mainImage);
  blurField(broad, width, height, 0.02 * length);

  const field = new Float32Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      // A gentle, fine pebbling of the surface, fixed to the leaf's base.
      const [x, y] = [left + i / scale - leaf.base.x, top + j / scale - leaf.base.y];
      const pebble = valueNoise(x / 3, y / 3, 7);
      field[k] =
        0.12 * length * (dome[k] ?? 0) -
        1.6 * (narrow[k] ?? 0) -
        3 * (plump[k] ?? 0) -
        0.03 * length * (broad[k] ?? 0) +
        0.2 * pebble;
    }
  }
  return { field, width, height, image: bladeImage };
};

/** The lit blade, as an image at the tone map's resolution. */
const shadeBlade = (leaf: PreparedLeaf, blade: Path2D) => {
  const surface = heights(leaf, blade);
  if (surface === undefined) return;
  const { field, width, height, image } = surface;
  const out = document.createElement("canvas");
  [out.width, out.height] = [width, height];
  const context = out.getContext("2d");
  if (context === null) return;
  const pixels = context.createImageData(width, height);
  const at = (i: number, j: number) =>
    field[Math.min(height - 1, Math.max(0, j)) * width + Math.min(width - 1, Math.max(0, i))] ?? 0;
  const { left, top, scale } = image;
  const length = leaf.leafLength || 1;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) / 2;
      const dy = (at(i, j + 1) - at(i, j - 1)) / 2;
      const { diffuse, specular } = reflect(dx, dy, SUN, 20);
      // Broad, soft variation in colour, yellower in places.
      const [x, y] = [
        (left + i / scale - leaf.base.x) / length,
        (top + j / scale - leaf.base.y) / length,
      ];
      const warm = valueNoise(x * 4, y * 4, 13) - 0.5;
      const light = Math.min(1.1, 0.15 + 0.95 * diffuse);
      const sheen = 0.6 * specular;
      const k = 4 * (j * width + i);
      for (let c = 0; c < 3; c++) {
        const base = (LIT[c] ?? 0) + (c === 0 ? 40 : c === 1 ? 14 : -6) * warm;
        const lit = (DEEP[c] ?? 0) + (base - (DEEP[c] ?? 0)) * light;
        pixels.data[k + c] = Math.round(lit + ((SHEEN[c] ?? 0) - lit) * sheen);
      }
      pixels.data[k + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return { canvas: out, left, top, scale };
};

/** Pale veins, down in their valleys: wider ones have a little shade along the side facing the light. */
const drawVeins = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  const shade = new Path2D();
  for (const vein of leaf.veins) {
    if (vein.halfWidth > 1) traceRibbon(shade, ribbon(shifted(vein.centre, 0.9, 1.2)));
  }
  fillShadowOnly(context, shade, "rgba(8, 40, 10, 0.45)", 1.5);
  for (const vein of leaf.veins) {
    const path = new Path2D();
    traceRibbon(path, vein.ribbon);
    context.fillStyle =
      vein.order === 1
        ? "rgba(206, 232, 140, 0.95)"
        : vein.order === 2
          ? "rgba(190, 226, 126, 0.8)"
          : "rgba(170, 214, 108, 0.6)";
    context.fill(path);
  }
};

const drawPetiole = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  const shape = new Path2D();
  traceRibbon(shape, ribbon(leaf.petiole));
  fillShadowOnly(context, shape, "rgba(4, 16, 2, 0.45)", 3);
  context.fillStyle = "rgb(150, 196, 82)";
  context.fill(shape);
  context.save();
  context.clip(shape);
  const shade = new Path2D();
  traceRibbon(shade, ribbon(shifted(leaf.petiole, -0.7, 0.6)));
  fillShadowOnly(context, shade, "rgba(30, 70, 14, 0.6)", 1.5);
  const highlight = new Path2D();
  traceRibbon(highlight, ribbon(shifted(leaf.petiole, 0.4, 0.25)));
  context.fillStyle = "rgba(230, 246, 180, 0.6)";
  context.fill(highlight);
  context.restore();
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
  // A fine, pale edge, where the blade's rim catches the light.
  const edge = new Path2D();
  traceRibbon(edge, ribbon(closedLine(leaf.blade, 0.6)));
  context.fillStyle = "rgba(196, 230, 130, 0.7)";
  context.fill(edge);
  drawPetiole(context, leaf);
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
