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
