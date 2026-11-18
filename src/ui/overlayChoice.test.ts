import { describe, expect, it } from "vitest";
import { springGreen } from "../render/styles/springGreen";
import { technicalStudy } from "../render/styles/technicalStudy";
import { defaultOverlays, resolveOverlays, setByStyle } from "./overlayChoice";

describe("resolveOverlays", () => {
  it("uses the defaults for a style without suggestions", () => {
    expect(resolveOverlays(springGreen, {})).toEqual(defaultOverlays);
  });

  it("applies a style's suggestions until another style is chosen", () => {
    expect(resolveOverlays(technicalStudy, {}).veinNodes).toBe(true);
    expect(resolveOverlays(springGreen, {}).veinNodes).toBe(false);
  });

  it("keeps the viewer's explicit choices across styles", () => {
    expect(resolveOverlays(technicalStudy, { veinNodes: false }).veinNodes).toBe(false);
    expect(resolveOverlays(springGreen, { veinNodes: true }).veinNodes).toBe(true);
  });
});

describe("setByStyle", () => {
  it("is true only when the style's suggestion changed the overlay", () => {
    expect(setByStyle(technicalStudy, {}, "veinNodes")).toBe(true);
    // Auxin sources are on by default anyway.
    expect(setByStyle(technicalStudy, {}, "auxinSources")).toBe(false);
    expect(setByStyle(springGreen, {}, "veinNodes")).toBe(false);
  });

  it("is false once the viewer has chosen", () => {
    expect(setByStyle(technicalStudy, { veinNodes: true }, "veinNodes")).toBe(false);
  });
});
