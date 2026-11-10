import type { Polygon } from "../geometry/region";
import { boxBlur } from "./blur";
import { makeTexture } from "./canvas";
import { scatter, tileableNoise } from "./noise";
import type { Backdrop } from "./style";

type PaperBackdrop = Extract<Backdrop, { kind: "paper" }>;
type BokehBackdrop = Extract<Backdrop, { kind: "bokeh" }>;

const grainCache = new Map<string, HTMLCanvasElement>();

/** A seamless tile of paper grain: soft mottling plus fine tooth. */
const paperGrain = (backdrop: PaperBackdrop) => {
  const key = backdrop.paper + backdrop.fibre;
  const cached = grainCache.get(key);
  if (cached !== undefined) return cached;
  const tile = makeTexture(384, 384, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const mottle = tileableNoise(x, y, width, height, 60, 4, 3);
        const tooth = tileableNoise(x, y, width, height, 1.6, 2, 9);
        const shade = 0.55 * mottle + 0.45 * tooth;
        const i = 4 * (y * width + x);
        image.data[i] = 0;
        image.data[i + 1] = 0;
        image.data[i + 2] = 0;
        image.data[i + 3] = Math.round(255 * Math.max(0, shade - 0.35) * 0.22);
      }
    }
    context.putImageData(image, 0, 0);
  });
  grainCache.set(key, tile);
  return tile;
};

/** Paper: a flat ground, grain, scattered fibres and a gentle vignette. */
export const paintPaper = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: PaperBackdrop,
): void => {
  context.fillStyle = backdrop.paper;
  context.fillRect(0, 0, width, height);
  const grain = context.createPattern(paperGrain(backdrop), "repeat");
  if (grain !== null) {
    context.fillStyle = grain;
    context.fillRect(0, 0, width, height);
  }

  // Fibres: short, faint, gently curving strokes.
  const next = scatter(17);
  context.strokeStyle = backdrop.fibre;
  context.lineWidth = 0.6;
  const fibres = Math.round((width * height) / 9000);
  for (let n = 0; n < fibres; n++) {
    const x = next() * width;
    const y = next() * height;
    const angle = next() * Math.PI * 2;
    const length = 6 + next() * 18;
    const bend = (next() - 0.5) * length * 0.6;
    context.globalAlpha = 0.12 + next() * 0.18;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(
      x + Math.cos(angle) * length * 0.5 - Math.sin(angle) * bend,
      y + Math.sin(angle) * length * 0.5 + Math.cos(angle) * bend,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
    );
    context.stroke();
  }
  context.globalAlpha = 1;

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.35,
    width / 2,
    height / 2,
    Math.hypot(width, height) * 0.6,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, backdrop.vignette);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
};

/**
 * Bokeh layers from far to near. Each is painted at a fraction of the screen's
 * resolution and blurred there (by `blur` pixels at that resolution); the
 * browser then scales it up, softening it further. Farther layers are blurrier.
 * The last layer holds only the bright discs of out-of-focus highlights, sharper
 * than the foliage, and is blended onto the others with "screen".
 */
export const BOKEH_LAYERS = [
  { resolution: 1 / 10, blur: 5, leaves: 7, lights: 6, seed: 1 },
  { resolution: 1 / 7, blur: 4, leaves: 9, lights: 4, seed: 2 },
  { resolution: 1 / 5, blur: 3, leaves: 6, lights: 0, seed: 3 },
  { resolution: 1 / 3, blur: 1, leaves: 0, lights: 26, seed: 4 },
] as const;

/**
 * One layer of out-of-focus foliage: leaf silhouettes like the one being grown,
 * with light breaking through between them. The layer is painted small and
 * scaled up by the browser, which blurs it softly.
 */
export const paintBokehLayer = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: BokehBackdrop,
  layer: number,
  outline: Polygon,
): void => {
  const settings = BOKEH_LAYERS[layer];
  if (settings === undefined) return;
  const next = scatter(settings.seed * 31);
  context.clearRect(0, 0, width, height);
  if (layer === 0) {
    const sky = context.createLinearGradient(0, 0, width, height);
    sky.addColorStop(0, backdrop.sky);
    sky.addColorStop(0.55, backdrop.foliage[2] ?? backdrop.sky);
    sky.addColorStop(1, backdrop.foliage[0] ?? backdrop.sky);
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
  }

  const size = Math.max(width, height);
  const lights = () => {
    for (let n = 0; n < settings.lights; n++) {
      const x = next() * width;
      const y = next() * height;
      const r = size * (0.012 + next() * 0.035);
      // A bokeh disc: an even plateau of light with a slightly brighter rim and a soft edge.
      const glow = context.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, backdrop.light);
      glow.addColorStop(0.8, backdrop.light);
      glow.addColorStop(0.9, "white");
      glow.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.globalAlpha = 0.18 + next() * 0.4;
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  };

  if (layer === 0) lights();
  for (let n = 0; n < settings.leaves; n++) {
    const scale = size * (0.25 + next() * 0.35);
    const angle = next() * Math.PI * 2;
    const cx = next() * width;
    const cy = next() * height;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    context.fillStyle =
      backdrop.foliage[Math.floor(next() * backdrop.foliage.length)] ?? backdrop.sky;
    context.globalAlpha = 0.55 + next() * 0.4;
    context.beginPath();
    outline.forEach(({ x, y }, i) => {
      // Centre the leaf on its middle rather than its base before rotating.
      const [lx, ly] = [x * scale, (y - 0.5) * scale];
      const [px, py] = [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.fill();
  }
  context.globalAlpha = 1;
  if (layer > 0) lights();

  const image = context.getImageData(0, 0, width, height);
  boxBlur(image.data, width, height, settings.blur);
  context.putImageData(image, 0, 0);
};
