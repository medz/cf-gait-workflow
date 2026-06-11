import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  dts: true,
  exports: true,
  format: "esm",
  minify: false,
  platform: "neutral",
  deps: {
    neverBundle: [/^cloudflare\:/],
    skipNodeModulesBundle: true,
  },
});
