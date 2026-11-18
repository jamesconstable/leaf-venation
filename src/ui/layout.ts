import type { Frame } from "../render/leafRenderer";

/** On wide screens the options panel floats over the left of the stage. */
const PANEL_CLEARANCE = 352;
const WIDE = 900;

/** Where the leaf is framed: beside the panel on wide screens, otherwise the whole stage. */
export const leafFrame = (width: number, height: number): Frame =>
  width >= WIDE
    ? { left: PANEL_CLEARANCE, top: 0, width: width - PANEL_CLEARANCE, height }
    : { left: 0, top: 0, width, height };

/** The middle of the stage left visible beside the panel, as a fraction of the stage's width. */
export const stageCentre = (width: number): number => {
  const { left, width: visible } = leafFrame(width, 0);
  return width > 0 ? (left + visible / 2) / width : 0.5;
};
