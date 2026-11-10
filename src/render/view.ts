import type { BoundingBox } from "../geometry/region";

/** Maps simulation coordinates (y up) to canvas pixels (y down). */
export interface View {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** The largest view that fits `bounds` in a canvas, centred, leaving `padding` (a fraction) clear. */
export const fitView = (
  bounds: BoundingBox,
  width: number,
  height: number,
  padding = 0.08,
): View => {
  const boundsWidth = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const boundsHeight = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const scale = Math.min(
    (width * (1 - 2 * padding)) / boundsWidth,
    (height * (1 - 2 * padding)) / boundsHeight,
  );
  return {
    scale,
    offsetX: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    offsetY: height / 2 + ((bounds.minY + bounds.maxY) / 2) * scale,
  };
};

export const toScreenX = (view: View, x: number): number => view.offsetX + x * view.scale;
export const toScreenY = (view: View, y: number): number => view.offsetY - y * view.scale;
