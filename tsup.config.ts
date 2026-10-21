import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  target: "node24",
  dts: false,
  removeNodeProtocol: false,
  clean: true,
  sourcemap: true,
  splitting: false,
});
