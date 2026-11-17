import type { Polygon } from "../geometry/region";
import { boxBlur } from "./blur";
import { makeTexture } from "./canvas";
import { fractalNoise, hash2, scatter, tileableNoise } from "./noise";
import type { Backdrop } from "./style";

type PaperBackdrop = Extract<Backdrop, { kind: "paper" }>;
type BokehBackdrop = Extract<Backdrop, { kind: "bokeh" }>;

const grainCache = new Map<string, HTMLCanvasElement>();

/** A seamless tile of paper grain: soft mottling plus fine tooth. */
const paperGrain = (backdrop: PaperBackdrop) => {
  const strength = backdrop.grain ?? 1;
  const key = `${backdrop.paper}${backdrop.fibre}${strength}`;
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
        image.data[i + 3] = Math.round(
          255 * Math.min(1, Math.max(0, shade - 0.35) * 0.22 * strength),
        );
      }
    }
    context.putImageData(image, 0, 0);
  });
  grainCache.set(key, tile);
  return tile;
};

/**
 * A watercolour wash laid in broad, wet strokes, rising gently to the right.
 * Each stroke carries its own load of pigment, streaked along its length by
 * the brush, with a darker wet edge along its lower side where it dried. The
 * strokes' edges wander. Painted at a third of the screen's resolution; the
 * browser smooths it as it scales up.
 */
const paintWash = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  { light, dark }: NonNullable<PaperBackdrop["wash"]>,
) => {
  const scale = 1 / 3;
  const angle = -0.18;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  /** The width of a stroke, in screen pixels. */
  const stroke = 190;
  const wash = makeTexture(
    Math.max(1, Math.ceil(width * scale)),
    Math.max(1, Math.ceil(height * scale)),
    (washContext, w, h) => {
      const image = washContext.createImageData(w, h);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const [x, y] = [i / scale, j / scale];
          // Along the stroke (u) and across it (v), with the stroke's edges wandering.
          const u = x * cos + y * sin;
          const v =
            -x * sin +
            y * cos +
            160 * (fractalNoise(u / 700, y / 900, 3, 71) - 0.5) +
            40 * (fractalNoise(u / 160, y / 160, 2, 75) - 0.5);
          const band = Math.floor(v / stroke);
          const across = v / stroke - band;
          // Blended over a few pixels where one stroke meets the next, so its edge isn't jagged.
          const meet = Math.min(1, across / 0.03);
          const load =
            0.3 + 0.45 * (hash2(band - 1, 0, 72) * (1 - meet) + hash2(band, 0, 72) * meet);
          // The load thins and thickens along the stroke, and the bristles streak it.
          const along = fractalNoise(u / 500, band * 5.3, 3, 73) - 0.5;
          const streaks = fractalNoise(u / 260, v / 9, 2, 74) - 0.5;
          // The previous stroke's wet edge runs on a little past where this one starts.
          const wetEdge =
            Math.exp(-(((1 - across) / 0.1) ** 2)) + Math.exp(-((across / 0.03) ** 2));
          const pigment = Math.min(
            1,
            Math.max(
              0,
              load +
                0.12 * (meet * across + 1 - meet) +
                0.5 * along +
                0.18 * streaks +
                0.14 * wetEdge,
            ),
          );
          const k = 4 * (j * w + i);
          for (let c = 0; c < 3; c++) {
            image.data[k + c] = Math.round(
              (light[c] ?? 0) + ((dark[c] ?? 0) - (light[c] ?? 0)) * pigment,
            );
          }
          image.data[k + 3] = 255;
        }
      }
      washContext.putImageData(image, 0, 0);
    },
  );
  context.imageSmoothingQuality = "high";
  context.drawImage(wash, 0, 0, wash.width / scale, wash.height / scale);
};

/** Paper: a flat ground (or a wash), grain, scattered fibres, an optional grid and a gentle vignette. */
export const paintPaper = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: PaperBackdrop,
): void => {
  context.fillStyle = backdrop.paper;
  context.fillRect(0, 0, width, height);
  if (backdrop.wash !== undefined) paintWash(context, width, height, backdrop.wash);
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

  if (backdrop.grid !== undefined) {
    const { minor, major, spacing } = backdrop.grid;
    // Lines sit on half pixels, so they stay crisp.
    for (const [colour, every, lineWidth] of [
      [minor, 1, 0.5],
      [major, 5, 0.75],
    ] as const) {
      const lines = new Path2D();
      for (let x = 0; x <= width; x += spacing * every) {
        lines.moveTo(Math.round(x) + 0.5, 0);
        lines.lineTo(Math.round(x) + 0.5, height);
      }
      for (let y = 0; y <= height; y += spacing * every) {
        lines.moveTo(0, Math.round(y) + 0.5);
        lines.lineTo(width, Math.round(y) + 0.5);
      }
      context.strokeStyle = colour;
      context.lineWidth = lineWidth;
      context.stroke(lines);
    }
  }

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.25,
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
 */
export const BOKEH_LAYERS = [
  { resolution: 1 / 10, blur: 6, seed: 1 }, // atmosphere: light, shade and soft masses
  { resolution: 1 / 7, blur: 4, seed: 2 }, // branches of small leaves
  { resolution: 1 / 5, blur: 4, seed: 3 }, // large leaves framing the edges
  { resolution: 1 / 3, blur: 3, seed: 4 }, // highlights, blended with "screen"
] as const;

/** Where the light comes from, as a fraction of the layer's width and height. */
const SOURCE = { x: 0.56, y: 0.1 };

type Next = () => number;

/** A normally distributed number, for clustering marks around a point. */
const gaussian = (next: Next) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-9, next()))) * Math.cos(2 * Math.PI * next());

const fillLeafShape = (
  context: CanvasRenderingContext2D,
  outline: Polygon,
  cx: number,
  cy: number,
  scale: number,
  angle: number,
) => {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  context.beginPath();
  outline.forEach(({ x, y }, i) => {
    // Centre the leaf on its middle rather than its base before rotating.
    const [lx, ly] = [x * scale, (y - 0.5) * scale];
    const [px, py] = [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.fill();
};

const pick = <T>(items: readonly T[], next: Next, fallback: T): T =>
  items[Math.floor(next() * items.length)] ?? fallback;

/** Light from the top centre, cool shade to the lower left, deep shade at the bottom and edges. */
const paintAtmosphere = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: BokehBackdrop,
  outline: Polygon,
  next: Next,
) => {
  const size = Math.max(width, height);
  context.fillStyle = backdrop.mid;
  context.fillRect(0, 0, width, height);
  const radial = (x: number, y: number, radius: number, colour: string, alpha: number) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.globalAlpha = alpha;
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
  };
  radial(0.06 * width, 0.95 * height, 0.7 * size, backdrop.cool, 0.85);
  // Soft masses of distant foliage, mostly toward the bottom and sides.
  for (let n = 0; n < 9; n++) {
    const side = next() < 0.5 ? next() * 0.25 : 0.75 + next() * 0.25;
    context.fillStyle = pick(backdrop.foliage.slice(0, 3), next, backdrop.deep);
    context.globalAlpha = 0.5 + next() * 0.4;
    fillLeafShape(
      context,
      outline,
      side * width,
      (0.35 + next() * 0.75) * height,
      size * (0.35 + next() * 0.4),
      next() * Math.PI * 2,
    );
  }
  context.globalAlpha = 1;
  radial(SOURCE.x * width, SOURCE.y * height, 0.8 * size, backdrop.bright, 0.9);
  // Soft, dim discs of light filtering through, thickest near the source.
  for (let n = 0; n < 40; n++) {
    const x = (SOURCE.x + 0.28 * gaussian(next)) * width;
    const y = (SOURCE.y + 0.3 * Math.abs(gaussian(next))) * height;
    radial(x, y, size * (0.03 + next() * 0.06), pick(backdrop.lights, next, "white"), 0.25);
  }
  const shade = context.createLinearGradient(0, 0.45 * height, 0, height);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, backdrop.deep);
  context.globalAlpha = 0.75;
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);
  // Sky through gaps in the canopy, mostly away from the sun, toward the right.
  if (backdrop.sky !== undefined) {
    for (let n = 0; n < 7; n++) {
      const x = (0.55 + 0.5 * next()) * width;
      const y = (0.15 + 0.8 * next()) * height;
      radial(x, y, size * (0.1 + next() * 0.14), backdrop.sky, 0.75 + 0.25 * next());
    }
  }
  context.globalAlpha = 0.75;
  const vignette = context.createRadialGradient(
    width / 2,
    height * 0.4,
    size * 0.35,
    width / 2,
    height * 0.4,
    size * 0.8,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, backdrop.deep);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 1;
};

/** Curving branches hanging from the top, set with small leaves; brighter where the light falls. */
const paintBranches = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: BokehBackdrop,
  outline: Polygon,
  next: Next,
) => {
  const size = Math.max(width, height);
  for (let branch = 0; branch < 5; branch++) {
    let x = (-0.1 + next() * 1.2) * width;
    let y = -0.05 * height;
    let angle = Math.PI / 2 + (next() - 0.5) * 1.6;
    const steps = 14 + Math.floor(next() * 14);
    for (let step = 0; step < steps; step++) {
      angle += (next() - 0.5) * 0.5;
      x += Math.cos(angle) * size * 0.03;
      y += Math.sin(angle) * size * 0.03;
      for (const sideways of [-1, 1]) {
        if (next() < 0.25) continue;
        const reach = size * (0.015 + next() * 0.02);
        const leafX = x + Math.cos(angle + sideways * 1.1) * reach;
        const leafY = y + Math.sin(angle + sideways * 1.1) * reach;
        const lit = Math.max(
          0,
          1 - Math.hypot(leafX / width - SOURCE.x, (leafY / height - SOURCE.y) * 1.3) / 0.75,
        );
        const shade = Math.min(
          backdrop.foliage.length - 1,
          Math.floor(lit * backdrop.foliage.length + next() * 1.5),
        );
        context.fillStyle = backdrop.foliage[shade] ?? backdrop.mid;
        context.globalAlpha = 0.55 + 0.4 * next();
        fillLeafShape(
          context,
          outline,
          leafX,
          leafY,
          size * (0.03 + next() * 0.035),
          angle + sideways * (0.6 + next() * 0.6),
        );
      }
    }
  }
  context.globalAlpha = 1;
};

/** A few large, dark leaves at the edges, close to the lens. */
const paintFraming = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: BokehBackdrop,
  outline: Polygon,
  next: Next,
) => {
  const size = Math.max(width, height);
  const spots = [
    [1.02, 0.85],
    [-0.04, 0.6],
    [0.85, 1.08],
    [0.12, 1.05],
  ] as const;
  for (const [fx, fy] of spots) {
    context.fillStyle = pick(backdrop.foliage.slice(0, 2), next, backdrop.deep);
    context.globalAlpha = 0.75 + next() * 0.2;
    fillLeafShape(
      context,
      outline,
      (fx + (next() - 0.5) * 0.1) * width,
      (fy + (next() - 0.5) * 0.1) * height,
      size * (0.22 + next() * 0.12),
      next() * Math.PI * 2,
    );
  }
  context.globalAlpha = 1;
};

/** Bright discs of out-of-focus highlights, clustered toward the light. */
const paintHighlights = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: BokehBackdrop,
  next: Next,
) => {
  const size = Math.max(width, height);
  for (let n = 0; n < 70; n++) {
    const clustered = next() < 0.75;
    const fx = clustered ? SOURCE.x + 0.24 * gaussian(next) : next();
    const fy = clustered ? SOURCE.y + 0.28 * Math.abs(gaussian(next)) : next();
    const nearness = Math.max(0, 1 - Math.hypot(fx - SOURCE.x, fy - SOURCE.y) / 0.9);
    const [x, y] = [fx * width, fy * height];
    const r = size * (0.006 + next() * 0.026);
    const colour = pick(backdrop.lights, next, "white");
    // A bokeh disc: a soft plateau of light fading gently at its edge.
    const disc = context.createRadialGradient(x, y, 0, x, y, r);
    disc.addColorStop(0, colour);
    disc.addColorStop(0.55, colour);
    disc.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.globalAlpha = (0.1 + 0.4 * next()) * (0.25 + 0.75 * nearness);
    context.fillStyle = disc;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
};

/**
 * One layer of out-of-focus foliage behind the leaf, with silhouettes like the
 * leaf being grown. The layer is painted small, blurred, and scaled up by the
 * browser, which softens it further.
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
  switch (layer) {
    case 0:
      paintAtmosphere(context, width, height, backdrop, outline, next);
      break;
    case 1:
      paintBranches(context, width, height, backdrop, outline, next);
      break;
    case 2:
      paintFraming(context, width, height, backdrop, outline, next);
      break;
    default:
      paintHighlights(context, width, height, backdrop, next);
  }
  const image = context.getImageData(0, 0, width, height);
  boxBlur(image.data, width, height, settings.blur);
  context.putImageData(image, 0, 0);
};
