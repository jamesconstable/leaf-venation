import type { Style } from "../style";
import { autumn } from "./autumn";
import { botanicalInk } from "./botanicalInk";
import { cyanotype } from "./cyanotype";
import { deepSummerGreen } from "./deepSummerGreen";
import { graphiteStudy } from "./graphiteStudy";
import { lightingDebug } from "./lightingDebug";
import { skeletonLeaf } from "./skeletonLeaf";
import { springGreen } from "./springGreen";
import { technicalStudy } from "./technicalStudy";

export const styles: readonly Style[] = [
  springGreen,
  deepSummerGreen,
  autumn,
  cyanotype,
  botanicalInk,
  graphiteStudy,
  technicalStudy,
  skeletonLeaf,
  // Temporary, for studying the drawing styles' lighting.
  lightingDebug,
];

export const defaultStyle: Style = springGreen;
