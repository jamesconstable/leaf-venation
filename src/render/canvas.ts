import type { Polygon } from "../geometry/region";

/** Helpers shared by styles for drawing onto a 2D canvas. */

export const polygonPath = (outer: Polygon, holes: readonly Polygon[] = []): Path2D => {
  const path = new Path2D();
  for (const polygon of [outer, ...holes]) {
    polygon.forEach(({ x, y }, i) => {
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.closePath();
  }
  return path;
};

/** Strokes a dashed outline of the final leaf, showing where a growing leaf is heading. */
export const drawGhost = (
  context: CanvasRenderingContext2D,
  ghost: Polygon | undefined,
  colour: string,
  dash: readonly number[] = [4, 5],
): void => {
  if (ghost === undefined) return;
  context.save();
  context.setLineDash(dash);
  context.strokeStyle = colour;
  context.lineWidth = 1;
  context.stroke(polygonPath(ghost));
  context.restore();
};

/** A small canvas, generated once, for patterns and textures. */
export const makeTexture = (
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context !== null) paint(context, width, height);
  return canvas;
};

/** A repeating pattern pinned to a point (e.g. the leaf's base), so it doesn't slide as the leaf changes. */
export const pinnedPattern = (
  context: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  anchor: { readonly x: number; readonly y: number },
  scale: number,
): CanvasPattern | null => {
  const pattern = context.createPattern(texture, "repeat");
  pattern?.setTransform(new DOMMatrix().translate(anchor.x, anchor.y).scale(scale));
  return pattern;
};

/**
 * Fills only the blurred shadow of a path, not the path itself: the path is
 * drawn far off the canvas, and its shadow offset back into place. Shadow
 * offsets and blur ignore the canvas transform, so they are scaled by hand.
 */
export const fillShadowOnly = (
  context: CanvasRenderingContext2D,
  path: Path2D,
  colour: string,
  blur: number,
  rule: CanvasFillRule = "nonzero",
): void => {
  const away = 100_000;
  const scale = context.getTransform().a;
  context.save();
  context.shadowColor = colour;
  context.shadowBlur = blur * scale;
  context.shadowOffsetX = away * scale;
  context.translate(-away, 0);
  context.fillStyle = "black";
  context.fill(path, rule);
  context.restore();
};

/** As `fillShadowOnly`, filling by the even-odd rule, e.g. for a shape with a hole. */
export const fillShadowOnlyEvenOdd = (
  context: CanvasRenderingContext2D,
  path: Path2D,
  colour: string,
  blur: number,
): void => {
  fillShadowOnly(context, path, colour, blur, "evenodd");
};
