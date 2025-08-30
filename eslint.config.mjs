import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default defineConfig([
    // JS / MJS rules
    {
        files: ["src/**/*.js", "src/**/*.mjs"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            ecmaVersion: 2022,
            sourceType: "module",
        },
        rules: {
            indent: ["warn", 4],
            "no-tabs": "warn",
            "spaced-comment": ["warn", "always"],
            "no-multiple-empty-lines": ["warn", { max: 2 }],
            "eol-last": ["warn", "never"],
            "linebreak-style": ["warn", "windows"],
            "brace-style": ["warn", "1tbs", { allowSingleLine: true }],
            curly: ["warn", "multi-line"],
            "newline-per-chained-call": "off",
            "space-in-parens": ["warn", "never"],
            "array-bracket-spacing": ["warn", "always"],
            "object-curly-spacing": ["warn", "always"],
            "space-infix-ops": "warn",
            "comma-spacing": ["warn", { before: false, after: true }],
            "comma-dangle": ["warn", "never"],
            "keyword-spacing": ["warn", { before: true, after: true }],
            "space-before-blocks": ["warn", "always"],
            "space-before-function-paren": ["warn", "never"],
            "func-call-spacing": ["warn", "never"],
            "key-spacing": ["warn", { beforeColon: false, afterColon: true }],
            camelcase: ["warn", { properties: "never" }],
            "id-match": ["warn", "^[a-zA-Z_$][a-zA-Z0-9_$]*$", { properties: false }],
            "new-cap": ["warn", { newIsCap: true, capIsNew: true }],
            "prefer-const": "warn",
            "prefer-template": "warn",
            "prefer-arrow-callback": "warn",
            "no-var": "warn",
            eqeqeq: ["warn", "always"],
            "no-unneeded-ternary": "warn",
            "no-unused-vars": ["warn", { args: "all", argsIgnorePattern: "^_" }],
            "no-extra-boolean-cast": "warn",
            "wrap-iife": ["warn", "outside"],
            "no-lonely-if": "warn",
            yoda: ["warn", "never"],
            "no-else-return": ["warn", { allowElseIf: false }],
            "operator-linebreak": ["warn", "before"],
            "no-nested-ternary": "warn",
            "arrow-parens": ["warn", "always"],
        },
    },

    // TS rules
    {
        files: ["src/**/*.ts", "src/**/*.tsx"],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: process.cwd(),
            },
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        plugins: {
            "@typescript-eslint": tseslint,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        },
    },
]);
