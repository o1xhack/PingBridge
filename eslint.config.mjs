import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "node_modules/**",
      "packages/*/dist/**",
      "coverage/**",
      "data/**",
      "*.tsbuildinfo",
      "**/*.yaml",
      "**/*.yml",
      "package-lock.json"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parserOptions: {}
    },
    rules: {
      "no-console": "off",
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    files: ["scripts/**/*.mjs", "*.config.*"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "no-console": "off",
      "no-undef": "off"
    }
  }
];
