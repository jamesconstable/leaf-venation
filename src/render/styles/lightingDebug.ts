import { polygonPath } from "../canvas";
import { ribbon, traceRibbon } from "../ribbon";
import { optionFlag, type PreparedLeaf, type Style, type StyleOptionValues } from "../style";
import { INK_CURL } from "./botanicalInk";
import {
  curl,
  LIGHT,
  paintBladeTone,
  paintToneImage,
  toneScale,
  visibleArea,
  type ToneParts,
} from "./drawing";

/**
 * A temporary style for studying the drawing styles' lighting: each part of the
 * blade's tone in its own colour channel on mid grey, brighter where that part
 * lights the blade and darker where it shades it.
 *
 * - Red: each vein's relief, the crisp shade and light beside it.
 * - Green: the broad folds along the veins.
 * - Blue: the form (overall tone and the margin curving away) plus the curl.
 *
 * All share one gain, so their strengths can be compared, and each can be
 * switched off to see the others alone.
 */

const GREY = "#808080";
/** How much a change in darkness is stretched for display. */
const GAIN = 1.5;

/** One part of the tone, painted over a neutral half tone so that light shows as well as shade. */
const partImage = (leaf: PreparedLeaf, blade: Path2D, parts: ToneParts, neutral: number) =>
  paintToneImage(
    visibleArea(leaf, leaf.blade),
    paintBladeTone(leaf, blade, parts, neutral),
    toneScale(leaf),
  );

const alphas = (canvas: HTMLCanvasElement) =>
  canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;

const legend = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  const xs = leaf.blade.map((p) => p.x);
  const [x, y] = [Math.min(...xs) - 150, leaf.base.y - 0.9 * leaf.leafLength];
  context.save();
  context.font = '500 11px "Inter Variable", system-ui, sans-serif';
  context.textBaseline = "middle";
  const rows = [
    ["#ff4040", "Red: vein relief"],
    ["#40e040", "Green: folds"],
    ["#4080ff", "Blue: form + curl"],
    ["#111", `Gain ×${GAIN}, mid grey = no effect`],
  ] as const;
  rows.forEach(([colour, text], k) => {
    context.fillStyle = colour;
    context.fillRect(x, y + 18 * k - 5, 10, 10);
    context.fillStyle = "#111";
    context.fillText(text, x + 16, y + 18 * k);
  });
  // The light's direction.
  const [ax, ay] = [x + 20, y + 96];
  context.strokeStyle = "#111";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(ax, ay);
  context.lineTo(ax + 24 * LIGHT.x, ay + 24 * LIGHT.y);
  context.stroke();
  context.beginPath();
  context.arc(ax + 24 * LIGHT.x, ay + 24 * LIGHT.y, 3, 0, 2 * Math.PI);
  context.fill();
  context.fillText("to the light", ax + 26, ay + 6);
  context.restore();
};

const drawLeaf = (
  context: CanvasRenderingContext2D,
  leaf: PreparedLeaf,
  options: StyleOptionValues,
) => {
  const on = (id: string) => optionFlag(options, id, true);
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  const form = paintToneImage(
    visibleArea(leaf, leaf.blade),
    paintBladeTone(leaf, blade, { form: true, folds: false, relief: false }),
    toneScale(leaf),
  );
  const folds = partImage(leaf, blade, { form: false, folds: true, relief: false }, 0.5);
  const relief = partImage(leaf, blade, { form: false, folds: false, relief: true }, 0.5);
  if (form === undefined || folds === undefined || relief === undefined) return;
  const [f, g, r] = [alphas(form.canvas), alphas(folds.canvas), alphas(relief.canvas)];
  if (f === undefined || g === undefined || r === undefined) return;

  const { canvas, left, top, scale } = form;
  const out = document.createElement("canvas");
  [out.width, out.height] = [canvas.width, canvas.height];
  const outContext = out.getContext("2d");
  if (outContext === null) return;
  const image = outContext.createImageData(canvas.width, canvas.height);
  const length = leaf.leafLength || 1;
  const channel = (value: number) => Math.round(255 * Math.min(1, Math.max(0, value)));
  for (let j = 0; j < canvas.height; j++) {
    for (let i = 0; i < canvas.width; i++) {
      const k = 4 * (j * canvas.width + i);
      const [x, y] = [left + (i + 0.5) / scale, top + (j + 0.5) / scale];
      // The form is centred on the blade's typical tone; each part reads 0 when switched off.
      const darkness =
        (on("form") ? (f[k + 3] ?? 0) / 255 - 0.4 : 0) +
        (on("curl") ? curl((x - leaf.base.x) / length, (y - leaf.base.y) / length, INK_CURL) : 0);
      const shift = (alpha: number | undefined, id: string) =>
        on(id) ? (alpha ?? 0) / 255 - 0.5 : 0;
      image.data[k] = channel(0.5 - GAIN * shift(r[k + 3], "relief"));
      image.data[k + 1] = channel(0.5 - GAIN * shift(g[k + 3], "folds"));
      image.data[k + 2] = channel(0.5 - GAIN * darkness);
      image.data[k + 3] = 255;
    }
  }
  outContext.putImageData(image, 0, 0);

  context.save();
  context.clip(blade, "evenodd");
  context.imageSmoothingQuality = "high";
  context.drawImage(out, left, top, canvas.width / scale, canvas.height / scale);
  context.restore();

  context.strokeStyle = "rgba(0, 0, 0, 0.6)";
  context.lineWidth = 0.8;
  context.stroke(blade);
  const petiole = new Path2D();
  traceRibbon(petiole, ribbon(leaf.petiole));
  context.fillStyle = "rgba(0, 0, 0, 0.35)";
  context.fill(petiole);

  if (leaf.leafLength / leaf.bladeScale > 160) legend(context, leaf);
};

export const lightingDebug: Style = {
  id: "lighting-debug",
  name: "Lighting (debug)",
  description: "The drawing styles' lighting, one part per colour channel: temporary",
  theme: {
    accent: "#505050",
    onAccent: "#ffffff",
    card: "#ececec",
    cardEdge: "rgba(0, 0, 0, 0.2)",
    text: "#1a1a1a",
    muted: "#5a5a5a",
    stage: GREY,
  },
  options: [
    { kind: "toggle", id: "relief", label: "Vein relief (red)", initial: true },
    { kind: "toggle", id: "folds", label: "Folds (green)", initial: true },
    { kind: "toggle", id: "form", label: "Form (blue)", initial: true },
    { kind: "toggle", id: "curl", label: "Curl (blue)", initial: true },
  ],
  backdrop: { kind: "paper", paper: GREY, fibre: GREY, vignette: "rgba(0, 0, 0, 0)" },
  overlay: { source: "#ffff00", kill: "rgba(255, 255, 255, 0.4)", node: "#000000" },
  drawLeaf,
};
