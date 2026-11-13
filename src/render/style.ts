import type { BoundingBox, Polygon } from "../geometry/region";
import type { Ribbon, RibbonPoint } from "./ribbon";
import type { View } from "./view";

/** Colours a style lends the interface, applied as CSS custom properties. */
export interface StyleTheme {
  /** Selected options, foil-stamped in this colour. */
  readonly accent: string;
  /** Text on an accent background. */
  readonly onAccent: string;
  /** The card stock the options panel is made of. */
  readonly card: string;
  /** The card's edges and embossed rules. */
  readonly cardEdge: string;
  readonly text: string;
  readonly muted: string;
  /** A flat colour behind everything, shown before the backdrop is ready. */
  readonly stage: string;
}

/** What sits behind the leaf. */
export type Backdrop =
  | {
      readonly kind: "bokeh";
      /** Shade toward the bottom and edges. */
      readonly deep: string;
      readonly mid: string;
      /** Warm light falling from the top centre. */
      readonly bright: string;
      /** Cooler shade toward the lower left. */
      readonly cool: string;
      /** Out-of-focus foliage, from shadow to highlight. */
      readonly foliage: readonly string[];
      /** Bokeh highlights. */
      readonly lights: readonly string[];
    }
  | {
      readonly kind: "paper";
      readonly paper: string;
      readonly fibre: string;
      readonly vignette: string;
    };

/** A vein, ready to draw: its smoothed centre line in screen coordinates. */
export interface PreparedVein {
  readonly centre: readonly RibbonPoint[];
  readonly ribbon: Ribbon;
  readonly order: number;
  /** The vein's greatest half width, in pixels. */
  readonly halfWidth: number;
}

/** Screen geometry shared by every style, computed once per frame. */
export interface PreparedLeaf {
  /** Maps final-leaf simulation coordinates to the screen. */
  readonly view: View;
  /** The final blade's bounds, in simulation coordinates. */
  readonly bounds: BoundingBox;
  /** How much the blade is scaled, about its base, from its final size. */
  readonly bladeScale: number;
  /** The current blade's outline, in screen coordinates. */
  readonly blade: Polygon;
  readonly bladeHoles: readonly Polygon[];
  /** The final blade's outline while the leaf is still growing; otherwise undefined. */
  readonly ghost: Polygon | undefined;
  /** Veins, ordered from finest to widest so wider veins draw on top. */
  readonly veins: readonly PreparedVein[];
  /** The current leaf's length, in pixels. */
  readonly leafLength: number;
  /** The leaf stalk's centre line below the base, in screen coordinates. */
  readonly petiole: readonly RibbonPoint[];
  /** The leaf's base, in screen coordinates. */
  readonly base: { readonly x: number; readonly y: number };
}

/** A complete visual treatment of the leaf and what lies behind it. */
export interface Style {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly theme: StyleTheme;
  readonly backdrop: Backdrop;
  /** Overlay colours: auxin sources, kill distance circles and vein nodes. */
  readonly overlay: { readonly source: string; readonly kill: string; readonly node: string };
  /** Draws the leaf onto a transparent canvas above the backdrop. */
  readonly drawLeaf: (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => void;
}
