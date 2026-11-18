import type { BoundingBox, Region } from "../geometry/region";
import type { VenationSnapshot } from "../simulation/snapshot";
import { drawOverlays, type Overlays } from "./overlays";
import { prepareLeaf, type Frame } from "./prepare";
import { styleOptionValues, type Style, type StyleOptionValues } from "./style";

export type { Overlays } from "./overlays";
export type { Frame } from "./prepare";

export interface RenderSettings {
  readonly style: Style;
  readonly overlays: Overlays;
  readonly veinWidthExponent: number;
  /** The viewer's choices for the style's own options. */
  readonly styleOptions: StyleOptionValues;
}

export interface Scene {
  /** The blade at its final size, in simulation units. */
  readonly blade: Region;
  /** In vein segment lengths. */
  readonly killDistance: number;
  readonly snapshot: VenationSnapshot | undefined;
}

/** Draws the leaf and any overlays onto a transparent canvas, framed within `frame`. */
export const renderLeaf = (
  context: CanvasRenderingContext2D,
  scene: Scene,
  settings: RenderSettings,
  frame: Frame,
  /** The visible part of the canvas, so styles can skip work offscreen when zoomed in. */
  viewport?: BoundingBox,
  /** How far the canvas's transform magnifies the picture. */
  magnification = 1,
): void => {
  const leaf = prepareLeaf(
    scene.blade,
    scene.snapshot,
    frame,
    settings.veinWidthExponent,
    viewport,
    magnification,
  );
  settings.style.drawLeaf(context, leaf, styleOptionValues(settings.style, settings.styleOptions));
  if (scene.snapshot !== undefined) {
    drawOverlays(
      context,
      scene.snapshot,
      leaf.view,
      scene.killDistance,
      settings.overlays,
      settings.style.overlay,
    );
  }
};
