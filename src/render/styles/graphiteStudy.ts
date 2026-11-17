import { polygonContains, type Polygon } from "../../geometry/region";
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
  toneScale,
  visibleArea,
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
const hatching = (leaf: PreparedLeaf, tone: Tone) => {
  const length = leaf.leafLength || 1;
  // Two pressures: most strokes light, some firmer.
  const light = new Path2D();
  const firm = new Path2D();
  leafLattice(leaf, 2.6, 71, (x, y, i, j) => {
    const d = tone(x, y) + curl((x - leaf.base.x) / length, (y - leaf.base.y) / length, 0.16);
    if (hash2(i, j, 74) > 1.6 * (d - 0.3)) return;
    const half = 1.8 + 3 * d * hash2(i, j, 76) + 1.5 * d;
    const angle = HATCH + 0.18 * (hash2(i, j, 75) - 0.5);
    const [dx, dy] = [Math.cos(angle) * half, Math.sin(angle) * half];
    const path = hash2(i, j, 77) < 0.3 ? firm : light;
    path.moveTo(x - dx, y - dy);
    path.lineTo(x + dx, y + dy);
  });
  return { light, firm };
};

const strokeHatching = (
  context: CanvasRenderingContext2D,
  { light, firm }: ReturnType<typeof hatching>,
) => {
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

/** Everything but the given shape. */
const outsideOf = (shape: Path2D) => {
  const outside = new Path2D();
  outside.rect(-1e5, -1e5, 2e5, 2e5);
  outside.addPath(shape);
  return outside;
};

/** The petiole's tone below the blade, for the tone and hatching beneath its lifted paper. */
const paintPetioleTone = (context: CanvasRenderingContext2D, shape: Path2D, blade: Path2D) => {
  context.save();
  context.clip(outsideOf(blade), "evenodd");
  context.clip(shape);
  context.fillStyle = "rgba(0, 0, 0, 0.36)";
  context.fill(shape);
  context.restore();
};

/**
 * Soft shade along the petiole's side away from the light, tapering to nothing
 * where it runs on into the blade, so the stalk reads as round without a seam
 * where it meets the midvein.
 */
const shadePetiole = (
  context: CanvasRenderingContext2D,
  line: readonly RibbonPoint[],
  shape: Path2D,
  blade: Polygon,
) => {
  const leaves = Math.max(
    1,
    line.findIndex(({ x, y }) => !polygonContains(blade, x, y)),
  );
  const tapered = line.map((p, k) => ({ ...p, halfWidth: p.halfWidth * Math.min(1, k / leaves) }));
  const shade = new Path2D();
  traceRibbon(shade, ribbon(shifted(tapered, -0.7, 0.55)));
  context.save();
  context.clip(shape);
  fillShadowOnly(context, shade, "rgba(59, 61, 66, 0.4)", 2);
  context.restore();
};

/**
 * Veins and petiole lifted out of the tone with an eraser, all in one pass so
 * that where they overlap the paper isn't lifted twice: not quite clean, with a
 * faint edge on the wider veins.
 */
const drawVeins = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, petiole: Path2D) => {
  const lifted = new Path2D();
  const edged = new Path2D();
  for (const vein of leaf.veins) {
    const path = new Path2D();
    traceRibbon(path, ribbon(pencilLine(vein.centre)));
    lifted.addPath(path);
    if (vein.order <= 2 && vein.halfWidth > 1) edged.addPath(path);
  }
  lifted.addPath(petiole);
  context.strokeStyle = GRAPHITE;
  context.globalAlpha = 0.35;
  context.lineWidth = 0.6;
  context.stroke(edged);
  context.globalAlpha = 0.85;
  context.fillStyle = PAPER;
  context.fill(lifted);
  context.globalAlpha = 1;
};

/** A pencil outline, gone over twice, stopping either side of the petiole. */
const drawMargin = (context: CanvasRenderingContext2D, blade: Polygon, petiole: Path2D) => {
  const first = new Path2D();
  traceRibbon(first, ribbon(wobble(closedLine(blade, 0.55), 1.6, 81)));
  const second = new Path2D();
  traceRibbon(second, ribbon(wobble(closedLine(blade, 0.35), 2.6, 83)));
  context.save();
  context.clip(outsideOf(petiole), "evenodd");
  context.fillStyle = GRAPHITE;
  context.globalAlpha = 0.8;
  context.fill(first);
  context.globalAlpha = 0.35;
  context.fill(second);
  context.restore();
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(59, 61, 66, 0.3)", [2, 4]);
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  const line = pencilLine(leaf.petiole);
  const { left, right } = ribbon(line);
  const petiole = new Path2D();
  traceRibbon(petiole, { left, right });
  // The petiole is shaded and hatched like the blade, so it carries on from the midvein.
  const image = paintToneImage(
    visibleArea(leaf, [...leaf.blade, ...left, ...right]),
    (tone) => {
      tone.save();
      paintBladeTone(leaf, blade)(tone);
      tone.restore();
      paintPetioleTone(tone, petiole, blade);
    },
    toneScale(leaf),
  );
  const tone = image === undefined ? undefined : toneReader(image);
  if (image !== undefined && tone !== undefined) {
    const marks = hatching(leaf, tone);
    // The blade, then the petiole where it lies outside the blade.
    for (const clip of [[blade], [outsideOf(blade), petiole]] as const) {
      context.save();
      clip.forEach((path) => {
        context.clip(path, "evenodd");
      });
      drawTone(context, image);
      strokeHatching(context, marks);
      context.restore();
    }
  }
  drawVeins(context, leaf, petiole);
  shadePetiole(context, line, petiole, leaf.blade);
  drawMargin(context, leaf.blade, petiole);
  context.strokeStyle = GRAPHITE;
  context.globalAlpha = 0.8;
  context.lineCap = "round";
  context.lineWidth = 1.1;
  context.stroke(petioleEdges(left, right, leaf.blade));
  context.globalAlpha = 1;
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
