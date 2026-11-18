import { createEffect, createSignal, For, Match, onCleanup, onMount, Switch } from "solid-js";
import type { Polygon } from "../geometry/region";
import { BOKEH_LAYERS, paintBokehLayer, paintPaper } from "../render/backdrops";
import type { Backdrop as BackdropSpec } from "../render/style";
import { stageCentre } from "./layout";

/**
 * What lies behind the leaf: layers of out-of-focus foliage that drift slowly
 * (animated by CSS, so they cost almost nothing), or a sheet of paper.
 */
/** A magnification applied to the backdrop: screen = scale × point + (dx, dy). */
export interface Magnify {
  readonly scale: number;
  readonly dx: number;
  readonly dy: number;
}

export const Backdrop = (props: {
  backdrop: BackdropSpec;
  outline: Polygon;
  /** If given, the backdrop is magnified with the leaf. */
  magnify?: Magnify | undefined;
}) => {
  let container: HTMLDivElement | undefined;
  const [size, setSize] = createSignal({ width: 0, height: 0, ratio: 1 });
  onMount(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height, ratio: window.devicePixelRatio });
    });
    if (container !== undefined) observer.observe(container);
    onCleanup(() => {
      observer.disconnect();
    });
  });

  const paintLayer = (canvas: HTMLCanvasElement, layer: number) => {
    createEffect(() => {
      const { backdrop, outline } = props;
      const { width, height } = size();
      const settings = BOKEH_LAYERS[layer];
      if (backdrop.kind !== "bokeh" || settings === undefined || width === 0) return;
      // Layers overscan the screen a little, so drifting never reveals an edge.
      canvas.width = Math.max(1, Math.round(width * 1.15 * settings.resolution));
      canvas.height = Math.max(1, Math.round(height * 1.15 * settings.resolution));
      const context = canvas.getContext("2d");
      if (context !== null) {
        // The layer overscans by 7.5% each side, so the stage's centre sits a little nearer its middle.
        const centre = (stageCentre(width) + 0.075) / 1.15;
        paintBokehLayer(context, canvas.width, canvas.height, backdrop, layer, outline, centre);
      }
    });
  };

  const paintSheet = (canvas: HTMLCanvasElement) => {
    createEffect(() => {
      const { backdrop, magnify } = props;
      const { width, height, ratio } = size();
      if (backdrop.kind !== "paper" || width === 0) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (context === null) return;
      // Magnified, the sheet is painted larger (so its grain stays crisp); plain
      // paper colour fills anywhere panning reveals beyond its edge.
      context.fillStyle = backdrop.paper;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const { scale, dx, dy } = magnify ?? { scale: 1, dx: 0, dy: 0 };
      context.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * dx, ratio * dy);
      paintPaper(context, width, height, backdrop, stageCentre(width));
    });
  };

  return (
    <div ref={(element) => (container = element)} class="backdrop" aria-hidden="true">
      <Switch>
        <Match when={props.backdrop.kind === "bokeh"}>
          {/* Out-of-focus layers are soft anyway, so magnifying them as they are is enough. */}
          <div
            class="bokeh"
            style={
              props.magnify === undefined
                ? {}
                : {
                    transform: `translate(${props.magnify.dx}px, ${props.magnify.dy}px) scale(${props.magnify.scale})`,
                  }
            }
          >
            <For each={BOKEH_LAYERS.map((_, layer) => layer)}>
              {(layer) => (
                <canvas
                  ref={(canvas) => {
                    paintLayer(canvas, layer);
                  }}
                  class={`bokeh-layer bokeh-layer-${layer}`}
                />
              )}
            </For>
          </div>
        </Match>
        <Match when={props.backdrop.kind === "paper"}>
          <canvas ref={paintSheet} class="paper" />
        </Match>
      </Switch>
    </div>
  );
};
