import type { BoundingBox, Polygon } from "../geometry/region";
import type { Ribbon, RibbonPoint } from "./ribbon";
import type { View } from "./view";

/** Colours a style lends the interface, applied as CSS custom properties. */
export interface StyleTheme {
  /** Selected options, stamped in this colour. */
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
      /** Sky showing through gaps in the canopy, if any. */
      readonly sky?: string;
    }
  | {
      readonly kind: "paper";
      readonly paper: string;
      readonly fibre: string;
      /** How strongly the paper's grain shows, relative to the usual (1). */
      readonly grain?: number;
      readonly vignette: string;
      /** Ruled like graph paper: fine lines `spacing` pixels apart, every fifth one heavier. */
      readonly grid?: { readonly minor: string; readonly major: string; readonly spacing: number };
      /** An uneven watercolour wash over the paper, between its lightest and darkest pigment. */
      readonly wash?: {
        readonly light: readonly [number, number, number];
        readonly dark: readonly [number, number, number];
      };
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

/** A setting a style offers in the options panel: a switch, or a number on a slider. */
export type StyleOption =
  | {
      readonly kind: "toggle";
      readonly id: string;
      readonly label: string;
      readonly initial: boolean;
    }
  | {
      readonly kind: "range";
      readonly id: string;
      readonly label: string;
      readonly initial: number;
      readonly min: number;
      readonly max: number;
      readonly step: number;
    };

/** Each of a style's options as set, by option id. */
export type StyleOptionValues = Readonly<Record<string, number | boolean>>;

/** A style's options as currently set: the viewer's choices, otherwise each option's initial value. */
export const styleOptionValues = (
  style: Style,
  chosen: StyleOptionValues = {},
): StyleOptionValues =>
  Object.fromEntries((style.options ?? []).map(({ id, initial }) => [id, chosen[id] ?? initial]));

/** A switch's setting, or `fallback` if the style has no such switch. */
export const optionFlag = (values: StyleOptionValues, id: string, fallback: boolean): boolean => {
  const value = values[id];
  return typeof value === "boolean" ? value : fallback;
};

/** A slider's setting, or `fallback` if the style has no such slider. */
export const optionNumber = (values: StyleOptionValues, id: string, fallback: number): number => {
  const value = values[id];
  return typeof value === "number" ? value : fallback;
};

/** A complete visual treatment of the leaf and what lies behind it. */
export interface Style {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly theme: StyleTheme;
  readonly backdrop: Backdrop;
  /** Overlay colours: auxin sources, kill distance circles and vein nodes. */
  readonly overlay: { readonly source: string; readonly kill: string; readonly node: string };
  /** Overlays to switch on when this style is chosen (they can still be switched off). */
  readonly suggestedOverlays?: { readonly auxinSources?: boolean; readonly veinNodes?: boolean };
  /** Settings particular to this style. */
  readonly options?: readonly StyleOption[];
  /** Draws the leaf onto a transparent canvas above the backdrop. */
  readonly drawLeaf: (
    context: CanvasRenderingContext2D,
    leaf: PreparedLeaf,
    options: StyleOptionValues,
  ) => void;
}
