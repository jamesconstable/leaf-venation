import {
  drawGhost,
  fillShadowOnly,
  fillShadowOnlyEvenOdd,
  makeTexture,
  pinnedPattern,
  polygonPath,
} from "../canvas";
import { tileableCells, tileableNoise } from "../noise";
import { ribbon, traceRibbon } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";

/**
 * A cyanotype photogram: the leaf laid on sensitised paper and printed in
 * sunlight. Where the leaf shaded the paper it stays pale; the thin blade lets
 * some light through, so it prints a mottled pale blue, while the denser veins
 * print nearly white, slightly soft where light crept around them.
 */

const PAPER = "#1d4479";
const MESOPHYLL = 512;

/** Uneven exposure through the blade: soft patches where more light came through. */
let exposure: HTMLCanvasElement | undefined;
const exposureTexture = () =>
  (exposure ??= makeTexture(256, 256, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const broad = tileableNoise(x, y, width, height, 64, 4, 51);
        const fine = tileableNoise(x, y, width, height, 3, 2, 53);
        const i = 4 * (y * width + x);
        image.data[i] = 46;
        image.data[i + 1] = 90;
        image.data[i + 2] = 158;
        image.data[i + 3] = Math.round(
          255 * Math.min(1, Math.max(0, 0.3 + 0.6 * broad + 0.25 * fine - 0.3)),
        );
      }
    }
    context.putImageData(image, 0, 0);
  }));

/**
 * The ghost of the mesophyll: cell walls printed faintly pale, more clearly in
 * some places than others, as the blade's thickness varied.
 */
let mesophyll: HTMLCanvasElement | undefined;
const mesophyllTexture = () =>
  (mesophyll ??= makeTexture(MESOPHYLL, MESOPHYLL, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const { f1, f2 } = tileableCells(x, y, width, height, 7, 57);
        const wall = Math.max(0, 1 - (f2 - f1) / 1.8) ** 1.5;
        const patch = tileableNoise(x, y, width, height, 70, 4, 58);
        const speckle = tileableNoise(x, y, width, height, 2, 2, 59);
        const shown = Math.min(1, Math.max(0, 2.2 * (patch - 0.42))) * (0.6 + 0.8 * speckle);
        const i = 4 * (y * width + x);
        image.data[i] = 236;
        image.data[i + 1] = 244;
        image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(255 * Math.min(1, 0.5 * wall * shown));
      }
    }
    context.putImageData(image, 0, 0);
  }));

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(230, 240, 255, 0.4)");
  const length = leaf.leafLength;
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  const petiole = new Path2D();
  traceRibbon(petiole, ribbon(leaf.petiole));

  // The shaded paper, slightly soft at the edge where light crept under the leaf.
  context.save();
  context.shadowColor = "rgba(214, 228, 246, 0.6)";
  context.shadowBlur = 3 * context.getTransform().a;
  context.fillStyle = "rgb(214, 228, 246)";
  context.fill(blade, "evenodd");
  context.fill(petiole);
  context.restore();

  context.save();
  context.clip(blade, "evenodd");
  const pattern = pinnedPattern(context, exposureTexture(), leaf.base, length / 280);
  if (pattern !== null) {
    context.fillStyle = pattern;
    context.fill(blade);
  }
  // The blade is thinnest toward the margin, so a little more light came through there.
  const outside = new Path2D();
  outside.rect(-1e5, -1e5, 2e5, 2e5);
  outside.addPath(blade);
  fillShadowOnlyEvenOdd(context, outside, "rgba(60, 104, 170, 0.45)", 0.04 * length);
  const cells = pinnedPattern(context, mesophyllTexture(), leaf.base, length / 600);
  if (cells !== null) {
    context.fillStyle = cells;
    context.fill(blade);
  }
  // Just inside the edge, a narrow halo where light crept under the margin.
  fillShadowOnlyEvenOdd(context, outside, "rgba(236, 244, 255, 0.6)", 0.006 * length + 1.5);

  // Veins blocked the most light: soft white halos, then nearly white cores.
  const halos = new Path2D();
  const cores = new Path2D();
  for (const vein of leaf.veins) {
    traceRibbon(halos, ribbon(vein.centre.map((p) => ({ ...p, halfWidth: p.halfWidth * 2.2 }))));
    traceRibbon(cores, vein.ribbon);
  }
  fillShadowOnly(context, halos, "rgba(236, 244, 255, 0.55)", 2.5);
  context.fillStyle = "rgba(250, 252, 255, 0.95)";
  context.fill(cores);
  context.restore();

  // The edge, where the leaf pressed flat against the paper, prints crisp and white.
  context.strokeStyle = "rgba(246, 250, 255, 0.85)";
  context.lineWidth = 1.2;
  context.stroke(blade);
  context.fillStyle = "rgba(250, 252, 255, 0.95)";
  context.fill(petiole);
};

export const cyanotype: Style = {
  id: "cyanotype",
  name: "Cyanotype",
  description: "A sun print: the leaf's shadow in white on Prussian blue paper",
  theme: {
    accent: "#1f4f8f",
    onAccent: "#f2f6fb",
    card: "#eef2f6",
    cardEdge: "rgba(30, 60, 110, 0.25)",
    text: "#13243d",
    muted: "#55657d",
    stage: "#1a3f73",
  },
  backdrop: {
    kind: "paper",
    paper: PAPER,
    fibre: "#6f93c4",
    vignette: "rgba(6, 20, 48, 0.65)",
    wash: { light: [44, 92, 156], dark: [16, 46, 98] },
  },
  overlay: { source: "#ffd166", kill: "rgba(255, 255, 255, 0.45)", node: "#ffffff" },
  drawLeaf,
};
