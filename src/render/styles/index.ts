import type { Style } from "../style";
import { autumn } from "./autumn";
import { botanicalInk } from "./botanicalInk";
import { cyanotype } from "./cyanotype";
import { deepSummerGreen } from "./deepSummerGreen";
import { springGreen } from "./springGreen";

export const styles: readonly Style[] = [
  springGreen,
  deepSummerGreen,
  autumn,
  cyanotype,
  botanicalInk,
];

export const defaultStyle: Style = springGreen;
