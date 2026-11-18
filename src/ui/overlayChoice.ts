import type { Overlays } from "../render/leafRenderer";
import type { Style } from "../render/style";

/** Overlays shown before anyone chooses otherwise. */
export const defaultOverlays: Overlays = { auxinSources: true, veinNodes: false };

/** The overlays the viewer has explicitly switched on or off; the rest are left to the style. */
export type ChosenOverlays = Partial<Overlays>;

/**
 * Which overlays to show: the viewer's explicit choices win, then the style's
 * suggestions, then the defaults. Suggestions aren't stored, so they lapse as
 * soon as another style is chosen.
 */
export const resolveOverlays = (style: Style, chosen: ChosenOverlays): Overlays => ({
  ...defaultOverlays,
  ...style.suggestedOverlays,
  ...chosen,
});

/** Whether the style, rather than the viewer or the defaults, decided this overlay. */
export const setByStyle = (style: Style, chosen: ChosenOverlays, key: keyof Overlays): boolean => {
  const suggested = style.suggestedOverlays?.[key];
  return chosen[key] === undefined && suggested !== undefined && suggested !== defaultOverlays[key];
};
