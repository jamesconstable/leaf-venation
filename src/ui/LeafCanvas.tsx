import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { renderLeaf, type Frame, type RenderSettings, type Scene } from "../render/leafRenderer";
import { leafFrame } from "./layout";
import { panBy, zoomAbout, zoomTransform, type Zoom } from "./zoom";

/**
 * The drawing area. Redraws at most once per animation frame, whenever the
 * scene, settings or zoom change. Zooming magnifies the picture through the
 * canvas's transform, so lines and dots are drawn sharp at the larger size: the
 * wheel or a pinch zooms toward the pointer, dragging pans, and a double click
 * goes back to the whole leaf.
 */
export const LeafCanvas = (props: {
  scene: Scene;
  settings: RenderSettings;
  zoom: Zoom;
  onZoom: (zoom: Zoom) => void;
  /** Told the unzoomed frame whenever it changes, so zoom buttons can zoom about its centre. */
  onFrame: (frame: Frame) => void;
}) => {
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

  createEffect(() => {
    props.onFrame(leafFrame(size().width, size().height));
  });

  let frame = 0;
  createEffect(() => {
    // Reading `props.scene` tracks everything the scene was built from, including the snapshot.
    const { scene, settings, zoom } = props;
    const { width, height, ratio } = size();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (canvas === undefined) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (context === null) return;
      // Magnify the whole picture, marks and all, as if looking closer at a drawing.
      const unzoomedFrame = leafFrame(width, height);
      const { scale, dx, dy } = zoomTransform(unzoomedFrame, zoom);
      context.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * dx, ratio * dy);
      renderLeaf(
        context,
        scene,
        settings,
        unzoomedFrame,
        {
          minX: -dx / scale,
          minY: -dy / scale,
          maxX: (width - dx) / scale,
          maxY: (height - dy) / scale,
        },
        scale,
      );
    });
  });
  onCleanup(() => {
    cancelAnimationFrame(frame);
  });

  const unzoomed = () => leafFrame(size().width, size().height);
  const local = (event: { clientX: number; clientY: number }) => {
    const bounds = canvas?.getBoundingClientRect();
    return { x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) };
  };

  // Pointers currently down, for dragging (one) and pinching (two).
  const pointers = new Map<number, { x: number; y: number }>();
  const pinch = () => {
    const [a, b] = [...pointers.values()];
    if (a === undefined || b === undefined) return undefined;
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  onMount(() => {
    // Not passive, so the page itself doesn't zoom or scroll as well.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Trackpad pinches arrive as wheel events with the control key, in smaller steps.
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      props.onZoom(zoomAbout(unzoomed(), props.zoom, props.zoom.scale * factor, local(event)));
    };
    canvas?.addEventListener("wheel", onWheel, { passive: false });
    onCleanup(() => canvas?.removeEventListener("wheel", onWheel));
  });

  return (
    <canvas
      ref={(element) => (canvas = element)}
      class="leaf-canvas"
      classList={{ zoomed: props.zoom.scale > 1 }}
      aria-label="Leaf venation simulation"
      onPointerDown={(event) => {
        pointers.set(event.pointerId, local(event));
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const previous = pointers.get(event.pointerId);
        if (previous === undefined) return;
        const before = pinch();
        const now = local(event);
        pointers.set(event.pointerId, now);
        const after = pinch();
        if (before !== undefined && after !== undefined && before.distance > 0) {
          const zoomed = zoomAbout(
            unzoomed(),
            props.zoom,
            (props.zoom.scale * after.distance) / before.distance,
            after,
          );
          props.onZoom(panBy(unzoomed(), zoomed, after.x - before.x, after.y - before.y));
        } else if (pointers.size === 1) {
          props.onZoom(panBy(unzoomed(), props.zoom, now.x - previous.x, now.y - previous.y));
        }
      }}
      onPointerUp={(event) => pointers.delete(event.pointerId)}
      onPointerCancel={(event) => pointers.delete(event.pointerId)}
      onDblClick={() => {
        props.onZoom(zoomAbout(unzoomed(), props.zoom, 1, { x: 0, y: 0 }));
      }}
    />
  );
};
