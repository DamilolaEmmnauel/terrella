import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

/**
 * Flat config. Deliberately close to the recommended sets: a library that a
 * stranger may contribute to is the wrong place for house rules they would
 * have to learn.
 */
export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "error",
      // TypeScript already resolves every identifier against the DOM and Node
      // lib types, and eslint does not read those, so no-undef only produces
      // false positives here on things like `document` and `performance`.
      // This is what typescript-eslint recommends for TypeScript files.
      "no-undef": "off",
    },
  },
  // src/data is generated from data/*.csv by scripts/; lint the generator, not its output.
  { ignores: ["dist/**", "node_modules/**", "demo/**", "data/**", "src/data/**"] },
];
