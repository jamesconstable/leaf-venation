import { createEffect, createSignal, For, Match, onCleanup, onMount, Switch } from "solid-js";
import type { Polygon } from "../geometry/region";
import { BOKEH_LAYERS, paintBokehLayer, paintPaper } from "../render/backdrops";
import type { Backdrop as BackdropSpec } from "../render/style";

/**
 * What lies behind the leaf: layers of out-of-focus foliage that drift slowly
 * (animated by CSS, so they cost almost nothing), or a sheet of paper.
 */
export const Backdrop = (props: { backdrop: BackdropSpec; outline: Polygon }) => {
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
        paintBokehLayer(context, canvas.width, canvas.height, backdrop, layer, outline);
      }
    });
  };

  const paintSheet = (canvas: HTMLCanvasElement) => {
    createEffect(() => {
      const { backdrop } = props;
      const { width, height, ratio } = size();
      if (backdrop.kind !== "paper" || width === 0) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (context === null) return;
      context.scale(ratio, ratio);
      paintPaper(context, width, height, backdrop);
    });
  };

  return (
    <div ref={(element) => (container = element)} class="backdrop" aria-hidden="true">
      <Switch>
        <Match when={props.backdrop.kind === "bokeh"}>
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
        </Match>
        <Match when={props.backdrop.kind === "paper"}>
          <canvas ref={paintSheet} class="paper" />
        </Match>
      </Switch>
    </div>
  );
};
