import type { Style } from "../style";
import { backlitLeaf } from "./backlit";

/** A young leaf held up to the light, its colours modelled on photographs of backlit leaves. */
export const springGreen: Style = {
  id: "spring-green",
  name: "Spring green",
  description: "A young leaf held up to the light, among out-of-focus foliage",
  theme: {
    accent: "#6f9a2a",
    onAccent: "#fbfdf2",
    card: "#eef0e1",
    cardEdge: "rgba(70, 90, 40, 0.22)",
    text: "#1f2a15",
    muted: "#5d6b4b",
    stage: "#183a2a",
  },
  // Cool, fresh morning light through new growth.
  backdrop: {
    kind: "bokeh",
    deep: "#08221c",
    mid: "#245a3e",
    bright: "#cdeec0",
    cool: "#2a8a8c",
    foliage: ["#0a2a1e", "#16472e", "#26683e", "#46944c", "#8cc866"],
    lights: ["#f2fff0", "#e0f8d6", "#d2f2ec", "#ffffff"],
  },
  overlay: { source: "#e2563b", kill: "rgba(255, 210, 190, 0.6)", node: "#20360f" },
  drawLeaf: backlitLeaf({
    ghost: "rgba(240, 255, 210, 0.55)",
    blade: "#7fb23e",
    // Light patches lean yellow-green, shaded ones toward a deeper green.
    patches: { light: [196, 222, 104], shade: [52, 96, 30], alpha: 0.75 },
    warmth: ["rgba(206, 214, 96, 0.35)", "rgba(206, 214, 96, 0)"],
    cellAlpha: 0.35,
    veinShadow: "rgba(44, 84, 14, 0.5)",
    cores: ["rgb(220, 237, 148)", "rgba(214, 234, 140, 0.9)", "rgba(204, 228, 128, 0.8)"],
    rim: ["rgba(214, 236, 112, 0.75)", "rgba(232, 246, 150, 0.85)", "rgba(246, 252, 196, 1)"],
    hairline: "rgba(58, 96, 24, 0.7)",
    petioleHighlight: "rgba(236, 248, 190, 0.6)",
    petioleShadow: "rgba(20, 44, 8, 0.45)",
  }),
};
