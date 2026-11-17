import { createEffect, createMemo, For, on } from "solid-js";
import type { Region } from "../geometry/region";
import { paintBokehLayer, paintPaper, BOKEH_LAYERS } from "../render/backdrops";
import { prepareLeaf } from "../render/prepare";
import { styleOptionValues, type Style } from "../render/style";
import type { VenationSnapshot } from "../simulation/snapshot";

const WIDTH = 88;
const HEIGHT = 64;

/** Paints a miniature of the current leaf in one style, backdrop included. */
const paintSwatch = (
  canvas: HTMLCanvasElement,
  style: Style,
  blade: Region,
  snapshot: VenationSnapshot | undefined,
  veinWidthExponent: number,
) => {
  const ratio = window.devicePixelRatio;
  canvas.width = Math.round(WIDTH * ratio);
  canvas.height = Math.round(HEIGHT * ratio);
  const context = canvas.getContext("2d");
  if (context === null) return;
  const { backdrop } = style;
  if (backdrop.kind === "paper") {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintPaper(context, WIDTH, HEIGHT, backdrop);
  } else {
    // Bokeh silhouettes expect the outline at leaf length 1.
    const length = blade.bounds.maxY - blade.bounds.minY || 1;
    const outline = blade.outer.map(({ x, y }) => ({ x: x / length, y: y / length }));
    // Paint each bokeh layer small and composite them, as the stage does at full size.
    for (const [layer] of BOKEH_LAYERS.entries()) {
      const scratch = document.createElement("canvas");
      scratch.width = Math.max(1, Math.round(canvas.width / 3));
      scratch.height = Math.max(1, Math.round(canvas.height / 3));
      const scratchContext = scratch.getContext("2d");
      if (scratchContext === null) continue;
      paintBokehLayer(scratchContext, scratch.width, scratch.height, backdrop, layer, outline);
      context.globalCompositeOperation =
        layer === BOKEH_LAYERS.length - 1 ? "screen" : "source-over";
      context.drawImage(scratch, 0, 0, canvas.width, canvas.height);
    }
    context.globalCompositeOperation = "source-over";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  const frame = { left: 0, top: 4, width: WIDTH, height: HEIGHT - 8 };
  style.drawLeaf(
    context,
    prepareLeaf(blade, snapshot, frame, veinWidthExponent),
    styleOptionValues(style),
  );
};

/**
 * The style picker: each option is a small picture of the current leaf in that
 * style. Swatches repaint when the simulation finishes or restarts, not on every
 * frame, since each one draws a whole leaf.
 */
export const StyleSwatches = (props: {
  styles: readonly Style[];
  selected: Style;
  /** The blade at its final size, in simulation units (as the vein nodes are). */
  blade: Region | undefined;
  snapshot: VenationSnapshot | undefined;
  veinWidthExponent: number;
  onSelect: (style: Style) => void;
}) => {
  // Changes only when the status does, not on every new snapshot.
  const status = createMemo(() => props.snapshot?.status);
  return (
    <div class="swatches" role="radiogroup" aria-label="Style">
      <For each={props.styles}>
        {(style) => (
          <button
            type="button"
            role="radio"
            class="swatch"
            aria-checked={props.selected.id === style.id}
            title={style.description}
            onClick={() => {
              props.onSelect(style);
            }}
          >
            <canvas
              class="swatch-picture"
              style={{ width: `${WIDTH}px`, height: `${HEIGHT}px` }}
              ref={(canvas) => {
                createEffect(
                  on(
                    () => [props.blade, status(), props.veinWidthExponent] as const,
                    ([blade]) => {
                      if (blade !== undefined) {
                        paintSwatch(canvas, style, blade, props.snapshot, props.veinWidthExponent);
                      }
                    },
                  ),
                );
              }}
            />
            <span class="swatch-name">{style.name}</span>
          </button>
        )}
      </For>
    </div>
  );
};
