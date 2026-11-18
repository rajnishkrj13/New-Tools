import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Built copies of the PDF editor and the pdf.js worker (scripts/copy-assets.mjs), not source.
    "public/pdf-editor/**",
    "public/pdfjs/**",
    "public/ocr/**",
    ".data/**",
  ]),
]);

export default eslintConfig;
