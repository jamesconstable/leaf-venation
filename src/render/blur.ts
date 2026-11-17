/**
 * Blurs RGBA pixels in place with three passes of a separable box blur, which
 * closely approximates a Gaussian blur. Cheap at the low resolutions the bokeh
 * layers are painted at.
 */
export const boxBlur = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void => {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return;
  const scratch = new Uint8ClampedArray(pixels.length);
  for (let pass = 0; pass < 3; pass++) {
    blurLines(pixels, scratch, width, height, r, 4, 4 * width, 4);
    blurLines(scratch, pixels, height, width, r, 4 * width, 4, 4);
  }
};

/** As `boxBlur`, for a field of one value per pixel, kept at full precision. */
export const blurField = (
  values: Float32Array,
  width: number,
  height: number,
  radius: number,
): void => {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return;
  const scratch = new Float32Array(values.length);
  for (let pass = 0; pass < 3; pass++) {
    blurLines(values, scratch, width, height, r, 1, width, 1);
    blurLines(scratch, values, height, width, r, width, 1, 1);
  }
};

/**
 * Box-blurs `lines` lines of `length` pixels from `source` into `target`, where
 * consecutive pixels in a line are `step` elements apart, lines are `stride`
 * elements apart, and each pixel has `channels` values. Pixels beyond the ends
 * repeat the edge pixel.
 */
const blurLines = <T extends Uint8ClampedArray | Float32Array>(
  source: T,
  target: T,
  length: number,
  lines: number,
  r: number,
  step: number,
  stride: number,
  channels: number,
) => {
  const span = 2 * r + 1;
  const at = (line: number, i: number, channel: number) =>
    source[line * stride + Math.min(length - 1, Math.max(0, i)) * step + channel] ?? 0;
  for (let line = 0; line < lines; line++) {
    for (let channel = 0; channel < channels; channel++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += at(line, i, channel);
      for (let i = 0; i < length; i++) {
        target[line * stride + i * step + channel] = sum / span;
        sum += at(line, i + r + 1, channel) - at(line, i - r, channel);
      }
    }
  }
};
