import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const nextTypescript = require("eslint-config-next/typescript");

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Explicit React version avoids eslint-plugin-react calling the
    // removed ESLint 10 context.getFilename() API during version detection.
    settings: {
      react: {
        version: "19.0.0",
      },
    },
  },
  {
    ignores: [
      ".next/**/*",
      "node_modules/**/*",
      "dist/**/*",
      "build/**/*",
      "scripts/**/*",
      "python_backend/**/*",
      "public/sw.js",
      "webpack-optimizations.js",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
      "src/tests/**/*",
      "**/*.test.ts",
      "**/*.test.tsx",
      "__tests__/**/*",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;

