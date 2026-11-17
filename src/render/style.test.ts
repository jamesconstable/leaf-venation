import { describe, expect, it } from "vitest";
import { styleOptionValues } from "./style";
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
