import type { Style } from "../style";
import { botanicalInk } from "./botanicalInk";
import { deepSummerGreen } from "./deepSummerGreen";
import { springGreen } from "./springGreen";

export const styles: readonly Style[] = [springGreen, deepSummerGreen, botanicalInk];

export const defaultStyle: Style = springGreen;
