import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { renderLeaf, type Frame, type RenderSettings, type Scene } from "../render/leafRenderer";

/** On wide screens the options panel floats over the left of the stage; frame the leaf beside it. */
const PANEL_CLEARANCE = 352;
const WIDE = 900;

const leafFrame = (width: number, height: number): Frame =>
  width >= WIDE
    ? { left: PANEL_CLEARANCE, top: 0, width: width - PANEL_CLEARANCE, height }
    : { left: 0, top: 0, width, height };

/** The drawing area. Redraws at most once per animation frame, whenever the scene or settings change. */
export const LeafCanvas = (props: { scene: Scene; settings: RenderSettings }) => {
  let canvas: HTMLCanvasElement | undefined;
  const [size, setSize] = createSignal({ width: 0, height: 0, ratio: 1 });

  onMount(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height, ratio: window.devicePixelRatio });
    });
    if (canvas !== undefined) observer.observe(canvas);
    onCleanup(() => {
      observer.disconnect();
    });
  });

  let frame = 0;
  createEffect(() => {
    // Reading `props.scene` tracks everything the scene was built from, including the snapshot.
    const { scene, settings } = props;
    const { width, height, ratio } = size();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (canvas === undefined) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (context === null) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderLeaf(context, scene, settings, leafFrame(width, height));
    });
  });
  onCleanup(() => {
    cancelAnimationFrame(frame);
  });

  return (
    <canvas
      ref={(element) => (canvas = element)}
      class="leaf-canvas"
      aria-label="Leaf venation simulation"
    />
  );
};
