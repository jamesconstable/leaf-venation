import type { Style } from "../style";
import { backlitLeaf } from "./backlit";

/**
 * A mature leaf at midsummer: thicker and darker than a spring leaf, so less
 * light passes through it, its veins glow less, and its waxy surface catches a
 * soft sheen, under a deep canopy in golden late-afternoon light.
 */
export const deepSummerGreen: Style = {
  id: "deep-summer-green",
  name: "Deep summer",
  description: "A mature, glossy leaf under a deep canopy in late-afternoon light",
  theme: {
    accent: "#2f6b22",
    onAccent: "#f4f8ec",
    card: "#e8ebdc",
    cardEdge: "rgba(40, 70, 30, 0.25)",
    text: "#17220f",
    muted: "#526146",
    stage: "#0f2a12",
  },
  backdrop: {
    kind: "bokeh",
    deep: "#06180a",
    mid: "#173d1a",
    bright: "#e9c66a",
    cool: "#16514a",
    foliage: ["#061a08", "#0e2e10", "#1a4a1a", "#2d6a26", "#4f8f34"],
    lights: ["#ffe7a8", "#f5f0b0", "#cfe59a", "#fff8e0"],
  },
  overlay: { source: "#f0a830", kill: "rgba(255, 230, 180, 0.5)", node: "#0d220a" },
  drawLeaf: backlitLeaf({
    ghost: "rgba(230, 240, 200, 0.45)",
    blade: "#2f6b22",
    patches: { light: [86, 140, 44], shade: [16, 48, 14], alpha: 0.7 },
    warmth: ["rgba(170, 170, 60, 0.22)", "rgba(170, 170, 60, 0)"],
    cellAlpha: 0.3,
    veinShadow: "rgba(10, 34, 8, 0.5)",
    cores: ["rgb(150, 186, 84)", "rgba(132, 176, 72, 0.9)", "rgba(112, 160, 60, 0.75)"],
    rim: ["rgba(96, 150, 50, 0.55)", "rgba(140, 186, 70, 0.55)", "rgba(196, 220, 120, 0.8)"],
    hairline: "rgba(12, 36, 8, 0.8)",
    petioleHighlight: "rgba(190, 220, 130, 0.5)",
    petioleShadow: "rgba(4, 16, 2, 0.55)",
    // The waxy cuticle catches a broad, soft sheen across the upper blade.
    finish: (context, leaf, blade) => {
      const length = leaf.leafLength;
      const [x, y] = [leaf.base.x - 0.12 * length, leaf.base.y - 0.68 * length];
      const sheen = context.createRadialGradient(x, y, 0, x, y, 0.5 * length);
      sheen.addColorStop(0, "rgba(232, 244, 200, 0.22)");
      sheen.addColorStop(0.6, "rgba(232, 244, 200, 0.06)");
      sheen.addColorStop(1, "rgba(232, 244, 200, 0)");
      context.save();
      context.clip(blade, "evenodd");
      context.globalCompositeOperation = "screen";
      context.fillStyle = sheen;
      context.fill(blade);
      context.restore();
    },
  }),
};
