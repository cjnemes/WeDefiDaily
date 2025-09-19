import js from "@eslint/js";
import pluginTs from "@typescript-eslint/eslint-plugin";
import parserTs from "@typescript-eslint/parser";
import globals from "globals";

const typeCheckedRules = pluginTs.configs["recommended-type-checked"].rules ?? {};
const recommendedRules = pluginTs.configs.recommended.rules ?? {};

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: parserTs,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": pluginTs,
    },
    rules: {
      ...recommendedRules,
      ...typeCheckedRules,
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
];
