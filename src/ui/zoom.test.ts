import { describe, expect, it } from "vitest";
import { noZoom, panBy, zoomAbout, zoomedFrame, MAX_ZOOM } from "./zoom";

const frame = { left: 100, top: 0, width: 400, height: 300 };
/** Where a point of the unzoomed frame lands on screen. */
const onScreen = (zoom: ReturnType<typeof zoomAbout>, p: { x: number; y: number }) => {
  const zoomed = zoomedFrame(frame, zoom);
  return {
    x: zoomed.left + ((p.x - frame.left) / frame.width) * zoomed.width,
    y: zoomed.top + ((p.y - frame.top) / frame.height) * zoomed.height,
  };
};

describe("zoomedFrame", () => {
  it("leaves the frame alone without zoom", () => {
    expect(zoomedFrame(frame, noZoom)).toEqual(frame);
  });
});

describe("zoomAbout", () => {
  it("keeps the point under the pointer in place", () => {
    const at = { x: 180, y: 90 };
    const zoom = zoomAbout(frame, noZoom, 3, at);
    const p = onScreen(zoom, at);
    expect(p.x).toBeCloseTo(at.x);
    expect(p.y).toBeCloseTo(at.y);
    // And again from an already zoomed and panned view.
    const before = { x: 250, y: 200 };
    const where = onScreen(zoom, before);
    const again = zoomAbout(frame, zoom, 5, where);
    expect(onScreen(again, before).x).toBeCloseTo(where.x);
    expect(onScreen(again, before).y).toBeCloseTo(where.y);
  });

  it("stays within its limits, and resets the pan at 1×", () => {
    expect(zoomAbout(frame, noZoom, 100, { x: 0, y: 0 }).scale).toBe(MAX_ZOOM);
    const panned = panBy(frame, zoomAbout(frame, noZoom, 2, { x: 300, y: 150 }), 50, 0);
    expect(zoomAbout(frame, panned, 0.5, { x: 300, y: 150 })).toEqual(noZoom);
  });
});

describe("panBy", () => {
  it("can't pan the leaf out of reach", () => {
    const zoom = panBy(frame, zoomAbout(frame, noZoom, 2, { x: 300, y: 150 }), 1e6, -1e6);
    expect(zoom.x).toBeLessThan(frame.width);
    expect(zoom.y).toBeGreaterThan(-frame.height);
  });

  it("does nothing unzoomed", () => {
    expect(panBy(frame, noZoom, 40, 40)).toEqual(noZoom);
  });
});
