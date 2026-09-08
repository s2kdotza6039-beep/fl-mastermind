import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off", // Fast-refresh DX hint only — context/ui files intentionally co-locate exports.
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Vendored shadcn/ui primitives (incl. the Recharts tooltip/legend wrappers)
    // use loose callback-payload types upstream; keep the explicit-any ban for our own code.
    files: ["src/components/ui/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
