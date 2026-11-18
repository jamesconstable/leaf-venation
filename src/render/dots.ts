/**
 * Round, antialiased dots written straight into pixels. Tracing tens of
 * thousands of tiny arcs into a path costs far more than the pixels they
 * cover, so stippling styles splat their dots here instead.
 */

/** Dots as flat triples: x, y and radius, in pixels. */
export type Dots = number[];

/**
 * How much of each pixel the dots cover, in [0, 1]. Where dots overlap, their
 * coverage combines as if each covered a random part of the pixel, which is
 * close to how a single filled path of scattered dots rasterises. A pixel's
 * coverage falls off over half a pixel either side of a dot's edge, keeping
 * small dots crisp.
 */
export const dotCoverage = (dots: Dots, width: number, height: number): Float32Array => {
  const coverage = new Float32Array(width * height);
  for (let n = 0; n + 2 < dots.length; n += 3) {
    const [x, y, r] = [dots[n] ?? 0, dots[n + 1] ?? 0, dots[n + 2] ?? 0];
    const left = Math.max(0, Math.floor(x - r));
    const right = Math.min(width - 1, Math.floor(x + r));
    const top = Math.max(0, Math.floor(y - r));
    const bottom = Math.min(height - 1, Math.floor(y + r));
    for (let j = top; j <= bottom; j++) {
      for (let i = left; i <= right; i++) {
        const [dx, dy] = [i + 0.5 - x, j + 0.5 - y];
        const c = Math.min(1, r + 0.4 - Math.sqrt(dx * dx + dy * dy));
        if (c <= 0) continue;
        const index = j * width + i;
        const a = coverage[index] ?? 0;
        coverage[index] = a + c - a * c;
      }
    }
  }
  return coverage;
};

/**
 * Draws dots (positions and radii in the context's units) in one colour and
 * opacity, as one image at the canvas's full resolution.
 */
export const drawDots = (
  context: CanvasRenderingContext2D,
  dots: Dots,
  rgb: readonly [number, number, number],
  alpha: number,
): void => {
  if (dots.length < 3) return;
  const ratio = context.getTransform().a;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let n = 0; n + 2 < dots.length; n += 3) {
    const [x, y, r] = [dots[n] ?? 0, dots[n + 1] ?? 0, dots[n + 2] ?? 0];
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  }
  const [left, top] = [Math.floor(minX) - 1, Math.floor(minY) - 1];
  const width = Math.ceil((maxX + 1 - left) * ratio);
  const height = Math.ceil((maxY + 1 - top) * ratio);
  const local: Dots = new Array<number>(dots.length);
  for (let n = 0; n + 2 < dots.length; n += 3) {
    local[n] = ((dots[n] ?? 0) - left) * ratio;
    local[n + 1] = ((dots[n + 1] ?? 0) - top) * ratio;
    local[n + 2] = (dots[n + 2] ?? 0) * ratio;
  }
  const coverage = dotCoverage(local, width, height);
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [width, height];
  const layer = canvas.getContext("2d");
  if (layer === null) return;
  const image = layer.createImageData(width, height);
  for (let k = 0; k < coverage.length; k++) {
    const c = coverage[k] ?? 0;
    if (c === 0) continue;
    image.data[4 * k] = rgb[0];
    image.data[4 * k + 1] = rgb[1];
    image.data[4 * k + 2] = rgb[2];
    image.data[4 * k + 3] = Math.round(255 * c * alpha);
  }
  layer.putImageData(image, 0, 0);
  context.drawImage(canvas, left, top, width / ratio, height / ratio);
};
