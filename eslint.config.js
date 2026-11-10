import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .testing/ holds local build output such as the docs site.
  { ignores: ["dist/", "node_modules/", ".testing/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // node:test's describe/it return promises the runner tracks itself.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", package: "node:test", name: ["describe", "it"] },
          ],
        },
      ],
    },
  },
  {
    // The OpenClaw plugin is a separate plain-JS package run by Node directly.
    files: ["eslint.config.js", ".agents/plugins/**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: [".agents/plugins/**/*.js"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
