// @ts-check
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * Module layering (see docs/design.md): each module may only import from the
 * modules listed for it. Everything else is forbidden.
 * @type {Record<string, string[]>}
 */
const allowedImports = {
  geometry: [],
  simulation: ["geometry"],
  outline: ["geometry"],
  catalogue: ["outline", "geometry"],
  render: ["simulation", "outline", "geometry"],
  share: ["simulation", "outline", "geometry"],
  worker: ["simulation", "geometry"],
  ui: ["render", "share", "catalogue", "worker", "simulation", "outline", "geometry"],
};

const modules = Object.keys(allowedImports);

const layeringRules = modules.map((module) => ({
  files: [`src/${module}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: modules
          .filter((other) => other !== module && !(allowedImports[module] ?? []).includes(other))
          .map((other) => ({
            group: [`**/${other}`, `**/${other}/**`],
            message: `The ${module} module may not depend on ${other} (see docs/design.md).`,
          })),
      },
    ],
  },
}));

export default defineConfig(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.js"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  { files: ["eslint.config.js"], extends: [tseslint.configs.disableTypeChecked] },
  {
    // ADR 0002: simulation results must be identical in every browser.
    files: ["src/simulation/**/*.ts", "src/geometry/**/*.ts", "src/outline/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...["random", "hypot", "sin", "cos", "tan", "atan2", "exp", "log"].map((property) => ({
          object: "Math",
          property,
          message:
            "Not deterministic across browsers (ADR 0002); use the seeded PRNG or +-*/ and Math.sqrt.",
        })),
      ],
    },
  },
  ...layeringRules,
  prettier,
);
