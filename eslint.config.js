// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// Why this file exists: ESLint 9 dropped the old .eslintrc format in favor of
// a plain JS config module. `tseslint.config(...)` just gives us type-checked
// autocomplete while building the array ESLint actually consumes.
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  {
    rules: {
      // Agent state objects intentionally flow through generic `unknown`
      // boundaries (see src/types.ts) — disallowing explicit `any` keeps
      // every escape hatch visible and reviewable instead of silent.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
