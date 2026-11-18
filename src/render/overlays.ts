import type { VenationSnapshot } from "../simulation/snapshot";
import type { Style } from "./style";
import { toScreenX, toScreenY, type View } from "./view";

export interface Overlays {
  readonly auxinSources: boolean;
  readonly veinNodes: boolean;
}

/** Draws the algorithm's internals over the leaf, in the style's overlay colours. */
export const drawOverlays = (
  context: CanvasRenderingContext2D,
  snapshot: VenationSnapshot,
  view: View,
  killDistance: number,
  overlays: Overlays,
  colours: Style["overlay"],
): void => {
  const scale = snapshot.veinScale;
  const sx = (x: number) => toScreenX(view, x * scale);
  const sy = (y: number) => toScreenY(view, y * scale);

  if (overlays.auxinSources) {
    // The kill distance is in vein segment lengths at the current size.
    const killRadius = killDistance * view.scale;
    const circles = new Path2D();
    const dots = new Path2D();
    const sources = snapshot.auxinSources;
    for (let i = 0; i + 1 < sources.length; i += 2) {
      const x = sx(sources[i] ?? 0);
      const y = sy(sources[i + 1] ?? 0);
      circles.moveTo(x + killRadius, y);
      circles.arc(x, y, killRadius, 0, 2 * Math.PI);
      dots.moveTo(x + 2.5, y);
      dots.arc(x, y, 2.5, 0, 2 * Math.PI);
    }
    context.strokeStyle = colours.kill;
    context.lineWidth = 1;
    context.stroke(circles);
    context.fillStyle = colours.source;
    context.fill(dots);
  }

  if (overlays.veinNodes) {
    const { xs, ys } = snapshot;
    // Small squares, so the overlay reads by shape as well as colour.
    const size = Math.max(1.5, Math.min(3, view.scale * scale * 0.35));
    context.fillStyle = colours.node;
    for (let i = 0; i < xs.length; i++) {
      context.fillRect(sx(xs[i] ?? 0) - size / 2, sy(ys[i] ?? 0) - size / 2, size, size);
    }
  }
};
