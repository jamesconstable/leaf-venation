import type { Polygon } from "../../geometry/region";
import { drawGhost, fillShadowOnly, makeTexture, polygonPath } from "../canvas";
import { hash2, tileableNoise } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";
import {
  closedLine,
  curl,
  leafLattice,
  paintBladeTone,
  paintToneImage,
  petioleEdges,
  shifted,
  toneReader,
  wobble,
  type Tone,
  type ToneImage,
} from "./drawing";

/**
 * A pencil study in a sketchbook, lit like the ink drawing. Soft graphite tone
 * is laid in and smudged, catching on the tooth of the paper so it breaks into
 * a fine grain; a light layer of straight, parallel strokes follows over the
 * darker areas; and the veins are lifted out with an eraser.
 */

const GRAPHITE = "#3b3d42";
const PAPER = "#f4efe4";

/** The paper's tooth: graphite catches on its peaks and skips its hollows. */
let tooth: HTMLCanvasElement | undefined;
const toothTexture = () =>
  (tooth ??= makeTexture(256, 256, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const fine = tileableNoise(x, y, width, height, 1.4, 2, 91);
        const coarse = tileableNoise(x, y, width, height, 5, 2, 93);
        const i = 4 * (y * width + x);
        image.data[i + 3] = Math.round(
          255 * Math.min(1, Math.max(0, 2.4 * (0.7 * fine + 0.3 * coarse) - 0.75)),
        );
      }
    }
    context.putImageData(image, 0, 0);
  }));

/** Lays in the smudged graphite tone, broken up by the paper's tooth, at full resolution. */
const drawTone = (context: CanvasRenderingContext2D, image: ToneImage) => {
  const ratio = context.getTransform().a;
  const { canvas, left, top, scale } = image;
  const [width, height] = [canvas.width / scale, canvas.height / scale];
  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.ceil(width * ratio));
  layer.height = Math.max(1, Math.ceil(height * ratio));
  const graphite = layer.getContext("2d");
  if (graphite === null) return;
  graphite.imageSmoothingQuality = "high";
  graphite.drawImage(canvas, 0, 0, layer.width, layer.height);
  graphite.globalCompositeOperation = "source-in";
  graphite.fillStyle = GRAPHITE;
  graphite.fillRect(0, 0, layer.width, layer.height);
  // The tooth belongs to the paper, so it stays put on screen as the leaf grows.
  const pattern = graphite.createPattern(toothTexture(), "repeat");
  if (pattern !== null) {
    pattern.setTransform(new DOMMatrix().translate(-left * ratio, -top * ratio));
    graphite.globalCompositeOperation = "destination-out";
    graphite.fillStyle = pattern;
    graphite.fillRect(0, 0, layer.width, layer.height);
  }
  context.globalAlpha = 0.8;
  context.drawImage(layer, left, top, width, height);
  context.globalAlpha = 1;
};

/** The direction of the hatching: lower left to upper right, as a right hand draws. */
const HATCH = -0.8;

/** Straight, parallel strokes over the darker areas, on the shared lattice. */
const hatch = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, tone: Tone) => {
  const length = leaf.leafLength || 1;
  // Two pressures: most strokes light, some firmer.
  const light = new Path2D();
  const firm = new Path2D();
  leafLattice(leaf, 2.6, 71, (x, y, i, j) => {
    const d = tone(x, y) + curl((x - leaf.base.x) / length, (y - leaf.base.y) / length);
    if (hash2(i, j, 74) > 1.6 * (d - 0.3)) return;
    const half = 1.8 + 3 * d * hash2(i, j, 76) + 1.5 * d;
    const angle = HATCH + 0.18 * (hash2(i, j, 75) - 0.5);
    const [dx, dy] = [Math.cos(angle) * half, Math.sin(angle) * half];
    const path = hash2(i, j, 77) < 0.3 ? firm : light;
    path.moveTo(x - dx, y - dy);
    path.lineTo(x + dx, y + dy);
  });
  context.strokeStyle = GRAPHITE;
  context.lineCap = "round";
  context.lineWidth = 0.5;
  context.globalAlpha = 0.25;
  context.stroke(light);
  context.globalAlpha = 0.45;
  context.stroke(firm);
  context.globalAlpha = 1;
};

/** Veins and petiole share one wobble, so where they overlap their lines coincide. */
const pencilLine = (centre: readonly RibbonPoint[]) =>
  wobble(centre, 0.6, 5).map((p) => ({ ...p, halfWidth: Math.max(0.5, p.halfWidth) }));

/** Veins lifted out of the tone with an eraser: not quite clean, with a faint edge on the wider ones. */
const drawVeins = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  for (const vein of leaf.veins) {
    const path = new Path2D();
    traceRibbon(path, ribbon(pencilLine(vein.centre)));
    if (vein.order <= 2 && vein.halfWidth > 1) {
      context.strokeStyle = GRAPHITE;
      context.globalAlpha = 0.35;
      context.lineWidth = 0.6;
      context.stroke(path);
    }
    context.globalAlpha = 0.85;
    context.fillStyle = PAPER;
    context.fill(path);
    context.globalAlpha = 1;
  }
};

/** A pencil outline, gone over twice. */
const drawMargin = (context: CanvasRenderingContext2D, blade: Polygon) => {
  const first = new Path2D();
  traceRibbon(first, ribbon(wobble(closedLine(blade, 0.55), 1.6, 81)));
  const second = new Path2D();
  traceRibbon(second, ribbon(wobble(closedLine(blade, 0.35), 2.6, 83)));
  context.fillStyle = GRAPHITE;
  context.globalAlpha = 0.8;
  context.fill(first);
  context.globalAlpha = 0.35;
  context.fill(second);
  context.globalAlpha = 1;
};

/** The petiole, drawn over the margin, shaded softly on its side away from the light. */
const drawPetiole = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  const line = pencilLine(leaf.petiole);
  const { left, right } = ribbon(line);
  const shape = new Path2D();
  [...left, ...[...right].reverse()].forEach(({ x, y }, k) => {
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  // Only outside the blade, and across the margin line: inside, the lifted-out
  // midvein already shows the way.
  const outside = new Path2D();
  outside.rect(-1e5, -1e5, 2e5, 2e5);
  outside.addPath(polygonPath(leaf.blade));
  const margin = new Path2D();
  traceRibbon(margin, ribbon(closedLine(leaf.blade, 2)));
  context.save();
  context.clip(margin);
  context.fillStyle = PAPER;
  context.fill(shape);
  context.restore();
  context.save();
  context.clip(outside, "evenodd");
  context.fillStyle = PAPER;
  context.fill(shape);
  const shade = new Path2D();
  traceRibbon(shade, ribbon(shifted(line, -0.6, 0.5)));
  context.clip(shape);
  fillShadowOnly(context, shade, "rgba(59, 61, 66, 0.45)", 1.5);
  context.restore();
  context.strokeStyle = GRAPHITE;
  context.globalAlpha = 0.8;
  context.lineCap = "round";
  context.lineWidth = 1.1;
  context.stroke(petioleEdges(left, right, leaf.blade));
  context.globalAlpha = 1;
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(59, 61, 66, 0.3)", [2, 4]);
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  const image = paintToneImage(leaf.blade, paintBladeTone(leaf, blade));
  const tone = image === undefined ? undefined : toneReader(image);
  if (image !== undefined && tone !== undefined) {
    context.save();
    context.clip(blade, "evenodd");
    drawTone(context, image);
    hatch(context, leaf, tone);
    context.restore();
  }
  drawVeins(context, leaf);
  drawMargin(context, leaf.blade);
  drawPetiole(context, leaf);
};

export const graphiteStudy: Style = {
  id: "graphite-study",
  name: "Graphite study",
  description: "A soft pencil study in a sketchbook, veins lifted out with an eraser",
  theme: {
    accent: "#4a4f57",
    onAccent: "#f5f3ee",
    card: "#f3f1ec",
    cardEdge: "rgba(60, 60, 60, 0.22)",
    text: "#22242a",
    muted: "#6b6d72",
    stage: "#ece8df",
  },
  backdrop: {
    kind: "paper",
    paper: PAPER,
    fibre: "#c8c0b0",
    vignette: "rgba(70, 64, 56, 0.35)",
  },
  overlay: { source: "#c0392b", kill: "rgba(192, 57, 43, 0.3)", node: GRAPHITE },
  drawLeaf,
};
