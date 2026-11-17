import { describe, expect, it } from "vitest";
import { optionFlag, optionNumber, styleOptionValues } from "./style";
import { lightingDebug } from "./styles/lightingDebug";
import { springGreen } from "./styles/springGreen";

describe("styleOptionValues", () => {
  it("starts from each option's initial value", () => {
    expect(styleOptionValues(lightingDebug)).toEqual({
      relief: true,
      folds: true,
      form: true,
      curl: true,
    });
  });

  it("applies the viewer's choices, ignoring options the style lacks", () => {
    expect(styleOptionValues(lightingDebug, { curl: false, other: true })).toMatchObject({
      curl: false,
      relief: true,
    });
    expect(styleOptionValues(springGreen, { curl: false })).toEqual({});
  });
});

describe("optionFlag and optionNumber", () => {
  it("read a setting of the right kind, or fall back", () => {
    const values = { on: true, size: 3 };
    expect(optionFlag(values, "on", false)).toBe(true);
    expect(optionFlag(values, "size", false)).toBe(false);
    expect(optionNumber(values, "size", 1)).toBe(3);
    expect(optionNumber(values, "missing", 1)).toBe(1);
  });
});
