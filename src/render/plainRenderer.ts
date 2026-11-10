import { scaleRegion, type Polygon, type Region } from "../geometry/region";
import type { VenationSnapshot } from "../simulation/snapshot";
import { veinWidths } from "../simulation/veinWidth";
import { fitView, toScreenX, toScreenY, type View } from "./view";

export interface Overlays {
  readonly auxinSources: boolean;
  readonly veinNodes: boolean;
}

export interface RenderSettings {
  readonly overlays: Overlays;
  readonly veinWidthExponent: number;
}

export interface Scene {
  /** The blade at its final size, in simulation units. */
  readonly blade: Region;
  readonly killDistance: number;
  readonly snapshot: VenationSnapshot | undefined;
}

/** A plain placeholder style until the full set of styles arrives in milestone 3. */
const palette = {
  background: "#f3efe6",
  blade: "#e3ead3",
  margin: "#93a877",
  ghost: "rgba(147, 168, 119, 0.55)",
  vein: "#36502a",
  auxinSource: "#c2452d",
  killDistance: "rgba(194, 69, 45, 0.25)",
  veinNode: "#1d3313",
};

/** Vein strokes are grouped into this many widths, so a frame needs few draw calls. */
const WIDTH_BUCKETS = 32;

export const renderPlain = (
  context: CanvasRenderingContext2D,
  scene: Scene,
  settings: RenderSettings,
  width: number,
  height: number,
): void => {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  // The view always frames the final leaf, so a growing leaf fills it as it grows.
  const view = fitView(scene.blade.bounds, width, height);
  const { snapshot } = scene;
  const bladeScale = snapshot?.bladeScale ?? 1;
  if (bladeScale < 1) drawGhost(context, scene.blade, view);
  drawBlade(context, bladeScale === 1 ? scene.blade : scaleRegion(scene.blade, bladeScale), view);
  if (snapshot === undefined) return;
  // Vein nodes and auxin sources are scaled from simulation coordinates to the current leaf.
  const veinView = scaledView(view, snapshot.veinScale);
  drawVeins(context, snapshot, veinView, settings.veinWidthExponent, scene.blade, view, bladeScale);
  if (settings.overlays.auxinSources) {
    // The kill distance is in vein segment lengths at the current size: 1 / veinScale in
    // simulation coordinates.
    drawAuxinSources(context, snapshot, veinView, scene.killDistance / snapshot.veinScale);
  }
  if (settings.overlays.veinNodes) drawVeinNodes(context, snapshot, veinView);
};

/** A view that first scales simulation coordinates by `factor` about the base (the origin). */
const scaledView = (view: View, factor: number): View => ({ ...view, scale: view.scale * factor });

/** A faint dashed outline of the final leaf, showing where a growing leaf is heading. */
const drawGhost = (context: CanvasRenderingContext2D, blade: Region, view: View) => {
  context.beginPath();
  tracePolygon(context, blade.outer, view);
  for (const hole of blade.holes) tracePolygon(context, hole, view);
  context.save();
  context.setLineDash([4, 5]);
  context.strokeStyle = palette.ghost;
  context.lineWidth = 1;
  context.stroke();
  context.restore();
};

const tracePolygon = (context: CanvasRenderingContext2D, polygon: Polygon, view: View) => {
  polygon.forEach(({ x, y }, i) => {
    if (i === 0) context.moveTo(toScreenX(view, x), toScreenY(view, y));
    else context.lineTo(toScreenX(view, x), toScreenY(view, y));
  });
  context.closePath();
};

const drawBlade = (context: CanvasRenderingContext2D, blade: Region, view: View) => {
  context.beginPath();
  tracePolygon(context, blade.outer, view);
  for (const hole of blade.holes) tracePolygon(context, hole, view);
  context.fillStyle = palette.blade;
  context.fill("evenodd");
  context.strokeStyle = palette.margin;
  context.lineWidth = 1.5;
  context.stroke();
};

const drawVeins = (
  context: CanvasRenderingContext2D,
  snapshot: VenationSnapshot,
  view: View,
  exponent: number,
  blade: Region,
  leafView: View,
  bladeScale: number,
) => {
  const { xs, ys, parents } = snapshot;
  const widths = veinWidths(parents, exponent);
  const maxWidth = widths.reduce((max, w) => Math.max(max, w), 1);
  // Finest veins are hairlines; the widest is a fixed fraction of the current leaf's size on screen.
  const leafSize = (blade.bounds.maxY - blade.bounds.minY) * leafView.scale * bladeScale;
  const finest = 0.6;
  const widest = Math.max(finest, 0.016 * leafSize);
  const pixels = (w: number) =>
    maxWidth === 1 ? finest : finest + ((widest - finest) * (w - 1)) / (maxWidth - 1);

  const buckets = Array.from({ length: WIDTH_BUCKETS }, () => new Path2D());
  const addSegment = (a: number, b: number, width: number) => {
    const bucket = Math.min(
      WIDTH_BUCKETS - 1,
      Math.floor(((pixels(width) - finest) / (widest - finest || 1)) * WIDTH_BUCKETS),
    );
    const path = buckets[bucket];
    path?.moveTo(toScreenX(view, xs[a] ?? 0), toScreenY(view, ys[a] ?? 0));
    path?.lineTo(toScreenX(view, xs[b] ?? 0), toScreenY(view, ys[b] ?? 0));
  };
  for (let i = 0; i < parents.length; i++) {
    const parent = parents[i] ?? -1;
    if (parent >= 0) addSegment(parent, i, widths[i] ?? 1);
  }
  // An anastomosis is drawn as a continuation of the finer of the two veins it joins.
  const { anastomoses } = snapshot;
  for (let k = 0; k + 1 < anastomoses.length; k += 2) {
    const [a, b] = [anastomoses[k] ?? 0, anastomoses[k + 1] ?? 0];
    addSegment(a, b, Math.min(widths[a] ?? 1, widths[b] ?? 1));
  }
  context.strokeStyle = palette.vein;
  context.lineCap = "round";
  buckets.forEach((path, bucket) => {
    context.lineWidth = finest + ((widest - finest) * (bucket + 0.5)) / WIDTH_BUCKETS;
    context.stroke(path);
  });
};

const drawAuxinSources = (
  context: CanvasRenderingContext2D,
  snapshot: VenationSnapshot,
  view: View,
  killDistance: number,
) => {
  const sources = snapshot.auxinSources;
  const killRadius = killDistance * view.scale;
  const circles = new Path2D();
  const dots = new Path2D();
  for (let i = 0; i + 1 < sources.length; i += 2) {
    const x = toScreenX(view, sources[i] ?? 0);
    const y = toScreenY(view, sources[i + 1] ?? 0);
    circles.moveTo(x + killRadius, y);
    circles.arc(x, y, killRadius, 0, 2 * Math.PI);
    dots.moveTo(x + 2.5, y);
    dots.arc(x, y, 2.5, 0, 2 * Math.PI);
  }
  context.strokeStyle = palette.killDistance;
  context.lineWidth = 1;
  context.stroke(circles);
  context.fillStyle = palette.auxinSource;
  context.fill(dots);
};

const drawVeinNodes = (
  context: CanvasRenderingContext2D,
  snapshot: VenationSnapshot,
  view: View,
) => {
  const { xs, ys } = snapshot;
  context.fillStyle = palette.veinNode;
  // Small squares, so the overlay reads by shape as well as colour.
  const size = Math.max(1.5, Math.min(3, view.scale * 0.35));
  for (let i = 0; i < xs.length; i++) {
    context.fillRect(
      toScreenX(view, xs[i] ?? 0) - size / 2,
      toScreenY(view, ys[i] ?? 0) - size / 2,
      size,
      size,
    );
  }
};
