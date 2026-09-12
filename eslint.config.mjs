import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      // The codebase already uses a leading underscore to mark a parameter kept
      // for signature shape only (see isPreviewBypassAllowed).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  {
    // PM2 loads ecosystem.config.cjs with require(), so CommonJS is the required
    // format here, not a style choice.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  {
    /**
     * react-three-fiber drives the scene graph by mutating Three.js objects in
     * useFrame/useLayoutEffect -- that is the library's programming model, not a
     * bug. react-hooks/immutability is written for plain React state and flags
     * every camera, material and texture write in these files. Scoped off here
     * rather than globally, so the rule still guards ordinary components.
     */
    files: [
      "components/game/race-scene.tsx",
      "components/game/car-preview-scene.tsx",
      "components/game/car-lighting.tsx",
      "components/game/mini-car.tsx",
    ],
    rules: { "react-hooks/immutability": "off" },
  },

  globalIgnores([
    // Defaults from eslint-config-next, restated because setting any ignores replaces them.
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
