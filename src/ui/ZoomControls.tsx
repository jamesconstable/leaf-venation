import { MAX_ZOOM, MIN_ZOOM, type Zoom } from "./zoom";

/** Zoom steps through these magnifications. */
const STEP = Math.SQRT2;

/** Buttons to magnify the leaf (not the page), with the current magnification. */
export const ZoomControls = (props: {
  zoom: Zoom;
  onZoom: (scale: number) => void;
  onReset: () => void;
}) => (
  <div class="zoom" role="group" aria-label="Leaf zoom">
    <button
      type="button"
      aria-label="Zoom out"
      title="Zoom out"
      disabled={props.zoom.scale <= MIN_ZOOM}
      onClick={() => {
        props.onZoom(props.zoom.scale / STEP);
      }}
    >
      −
    </button>
    <output aria-live="polite" title="Leaf magnification">
      {Math.round(props.zoom.scale * 100)}%
    </output>
    <button
      type="button"
      aria-label="Zoom in"
      title="Zoom in (or scroll or pinch over the leaf)"
      disabled={props.zoom.scale >= MAX_ZOOM}
      onClick={() => {
        props.onZoom(props.zoom.scale * STEP);
      }}
    >
      +
    </button>
    <button
      type="button"
      aria-label="Show the whole leaf"
      title="Show the whole leaf (or double-click it)"
      disabled={props.zoom.scale <= MIN_ZOOM}
      onClick={() => {
        props.onReset();
      }}
    >
      Fit
    </button>
  </div>
);
