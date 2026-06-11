import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  tsconfig: "./src/tsconfig.json",
  dts: true,
  exports: true,
  format: "esm",
  minify: true,
  platform: "neutral",
  deps: {
    neverBundle: [/^cloudflare\:/],
    skipNodeModulesBundle: true,
  },
});
