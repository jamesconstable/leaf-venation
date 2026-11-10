import { drawGhost, makeTexture, polygonPath } from "../canvas";
import { tileableNoise } from "../noise";
import { traceRibbon } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";

/** Fine mottling like the mesophyll cells of a leaf held up to the light. */
let mesophyll: HTMLCanvasElement | undefined;
const mesophyllTexture = () =>
  (mesophyll ??= makeTexture(256, 256, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = tileableNoise(x, y, width, height, 3.5, 3, 11);
        const value = Math.round(255 * n);
        const i = 4 * (y * width + x);
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }));

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  const length = leaf.leafLength;
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  drawGhost(context, leaf.ghost, "rgba(240, 255, 210, 0.55)");

  // A soft shadow lifts the leaf off the out-of-focus foliage behind it.
  context.save();
  context.shadowColor = "rgba(8, 24, 4, 0.45)";
  context.shadowBlur = 0.08 * length;
  context.shadowOffsetX = 0.015 * length;
  context.shadowOffsetY = 0.03 * length;
  context.fillStyle = "#86b93f";
  context.fill(blade, "evenodd");
  context.restore();

  // Light through the blade: luminous along the midrib, deepening toward the margin.
  const centre = { x: leaf.base.x, y: leaf.base.y - 0.45 * length };
  const glow = context.createRadialGradient(
    centre.x - 0.08 * length,
    centre.y - 0.1 * length,
    0.02 * length,
    centre.x,
    centre.y,
    0.65 * length,
  );
  glow.addColorStop(0, "#e4f59a");
  glow.addColorStop(0.45, "#b5da5c");
  glow.addColorStop(1, "#6fa632");
  context.fillStyle = glow;
  context.fill(blade, "evenodd");

  context.save();
  context.clip(blade, "evenodd");
  const pattern = context.createPattern(mesophyllTexture(), "repeat");
  if (pattern !== null) {
    context.globalCompositeOperation = "soft-light";
    context.globalAlpha = 0.35;
    context.fillStyle = pattern;
    context.fill(blade, "evenodd");
  }
  context.restore();

  // Veins carry less chlorophyll, so they glow paler than the blade; wider veins more so.
  context.save();
  context.clip(blade, "evenodd");
  for (const vein of leaf.veins) {
    const path = new Path2D();
    traceRibbon(path, vein.ribbon);
    context.fillStyle =
      vein.order <= 1
        ? "#f4f9cf"
        : vein.order === 2
          ? "rgba(240, 248, 196, 0.92)"
          : "rgba(232, 244, 180, 0.75)";
    context.fill(path);
  }
  context.restore();

  context.strokeStyle = "rgba(70, 110, 30, 0.85)";
  context.lineWidth = 1.2;
  context.stroke(blade);
};

export const springGreen: Style = {
  id: "spring-green",
  name: "Spring green",
  description: "A young leaf held up to the light, among out-of-focus foliage",
  theme: {
    accent: "#8fc23a",
    accentGlow: "rgba(190, 240, 90, 0.6)",
    onAccent: "#13210a",
    panelTint: "rgba(244, 251, 230, 0.74)",
    panelBorder: "rgba(255, 255, 255, 0.55)",
    text: "#1c2812",
    muted: "#55663f",
    stage: "#2c4a1c",
  },
  backdrop: {
    kind: "bokeh",
    foliage: ["#16300d", "#24461a", "#3b6a24", "#5e8f33"],
    light: "#f4ffc4",
    sky: "#9cc65a",
  },
  overlay: { source: "#e2563b", kill: "rgba(255, 210, 190, 0.6)", node: "#20360f" },
  drawLeaf,
};
