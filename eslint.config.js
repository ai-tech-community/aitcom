import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
// @ts-ignore -- no types for this plugin
import drizzle from "eslint-plugin-drizzle";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const COLLECTOR_NO_DB =
  "Collectors get no database access; use input and ctx only (ADR-0040).";
const COLLECTOR_NET_VIA_CTX =
  "Use ctx.fetch: it enforces robots.txt, rate limits and budgets (ADR-0040).";
const COLLECTOR_NO_ENV = "Collectors get no environment access (ADR-0040).";
const COLLECTOR_NO_DYNAMIC_CODE =
  "Collectors cannot load or build code at run time (ADR-0040).";
const COLLECTOR_NO_GLOBALS =
  "Collectors get no global objects; use input and ctx only (ADR-0040).";
const COLLECTOR_NO_WIRING =
  "Collectors cannot reach the runner or its wiring (live, context/live, executor, runs); use input and ctx only (ADR-0040).";

export default tseslint.config(
  {
    ignores: [
      ".next",
      "src/payload-types.ts",
      "src/payload-generated-schema.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      drizzle,
    },
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "drizzle/enforce-delete-with-where": [
        "error",
        { drizzleObjectName: ["db", "ctx.db"] },
      ],
      "drizzle/enforce-update-with-where": [
        "error",
        { drizzleObjectName: ["db", "ctx.db"] },
      ],
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    // Collectors receive only their input and ctx (ADR-0040). Imports are
    // matched by specifier, so each rule names the alias, the relative path
    // and the package that reach the same module. `src/…` is listed
    // because tsconfig sets baseUrl ".".
    files: [
      "src/server/collectors/collectors/**/*.ts",
      "src/server/collectors/helpers/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: [
                "^(@/|src/)(.+/)?db(\\.[jt]s)?(/.*)?$",
                "^(\\.{1,2}/)+(.+/)?db(\\.[jt]s)?(/.*)?$",
                "^drizzle-orm(/.*)?$",
                "^@neondatabase/",
                "^(pg|postgres)$",
                "^payload(/.*)?$",
                "^@payload-config$",
                "^@upstash/",
              ].join("|"),
              message: COLLECTOR_NO_DB,
            },
            {
              regex: [
                "^(@/|src/)(.+/)?net(/.*)?$",
                "^(\\.{1,2}/)+(.+/)?net(/.*)?$",
                "^undici(/.*)?$",
                "^(node:)?(http|https|http2|net|tls|dgram|dns|child_process|worker_threads)(/.*)?$",
              ].join("|"),
              message: COLLECTOR_NET_VIA_CTX,
            },
            {
              regex: [
                "^(@/|src/)env(\\.[jt]s)?$",
                "^(\\.{1,2}/)+(.+/)?env(\\.[jt]s)?$",
                "^(node:)?process$",
              ].join("|"),
              message: COLLECTOR_NO_ENV,
            },
            {
              // The composition roots and the runner hold the database,
              // the real network and the facade.
              regex: [
                "^(@/|src/)server/collectors/(context/)?live(\\.[jt]s)?$",
                "^(@/|src/)server/collectors/(executor|runs)(\\.[jt]s)?$",
                "^(\\.{1,2}/)+(.+/)?(live|executor|runs)(\\.[jt]s)?$",
              ].join("|"),
              message: COLLECTOR_NO_WIRING,
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: COLLECTOR_NET_VIA_CTX },
        { name: "XMLHttpRequest", message: COLLECTOR_NET_VIA_CTX },
        { name: "WebSocket", message: COLLECTOR_NET_VIA_CTX },
        { name: "EventSource", message: COLLECTOR_NET_VIA_CTX },
        { name: "process", message: COLLECTOR_NO_ENV },
        // Code built from strings, or loaded by CommonJS require(), escapes
        // every rule here ((0, eval)("fetch"), require("node:http")).
        ...["eval", "Function", "require"].map((name) => ({
          name,
          message: COLLECTOR_NO_DYNAMIC_CODE,
        })),
        // The global objects are a side door to all of the above
        // (globalThis.fetch, window.fetch, global.process, …).
        ...["globalThis", "window", "self", "global"].map((name) => ({
          name,
          message: COLLECTOR_NO_GLOBALS,
        })),
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message: COLLECTOR_NO_DYNAMIC_CODE,
        },
      ],
    },
  },
);
