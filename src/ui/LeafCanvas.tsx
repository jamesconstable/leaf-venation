import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { renderLeaf, type RenderSettings, type Scene } from "../render/leafRenderer";
import { leafFrame } from "./layout";

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
