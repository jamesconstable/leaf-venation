import type { Frame } from "../render/leafRenderer";

/** How far the leaf is magnified, and how far it has been panned (in screen pixels). */
export interface Zoom {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export const noZoom: Zoom = { scale: 1, x: 0, y: 0 };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

/**
 * The magnification as a transform from the unzoomed picture to the screen:
 * screen = scale × point + (dx, dy), magnifying about the frame's centre and
 * then panning.
 */
export const zoomTransform = (frame: Frame, { scale, x, y }: Zoom) => {
  const [cx, cy] = [frame.left + frame.width / 2, frame.top + frame.height / 2];
  return { scale, dx: cx + x - scale * cx, dy: cy + y - scale * cy };
};

/** The frame the leaf would fill when zoomed: the usual frame, magnified about its centre and panned. */
export const zoomedFrame = (frame: Frame, zoom: Zoom): Frame => {
  const { scale, dx, dy } = zoomTransform(frame, zoom);
  return {
    left: scale * frame.left + dx,
    top: scale * frame.top + dy,
    width: frame.width * scale,
    height: frame.height * scale,
  };
};

/** Keeps the pan within reach of the leaf, so it can't be lost off screen. */
const clampPan = (frame: Frame, zoom: Zoom): Zoom => {
  const [reachX, reachY] = [
    (frame.width * (zoom.scale - 1)) / 2 + frame.width * 0.25,
    (frame.height * (zoom.scale - 1)) / 2 + frame.height * 0.25,
  ];
  if (zoom.scale <= MIN_ZOOM) return noZoom;
  return {
    scale: zoom.scale,
    x: Math.min(reachX, Math.max(-reachX, zoom.x)),
    y: Math.min(reachY, Math.max(-reachY, zoom.y)),
  };
};

/** Zooms to `scale`, keeping the point `at` (in screen pixels) where it is on screen. */
export const zoomAbout = (
  frame: Frame,
  zoom: Zoom,
  scale: number,
  at: { x: number; y: number },
): Zoom => {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
  const [cx, cy] = [frame.left + frame.width / 2, frame.top + frame.height / 2];
  const ratio = next / zoom.scale;
  return clampPan(frame, {
    scale: next,
    x: at.x - cx - ratio * (at.x - cx - zoom.x),
    y: at.y - cy - ratio * (at.y - cy - zoom.y),
  });
};

/** Pans by a distance in screen pixels. */
export const panBy = (frame: Frame, zoom: Zoom, dx: number, dy: number): Zoom =>
  clampPan(frame, { ...zoom, x: zoom.x + dx, y: zoom.y + dy });
