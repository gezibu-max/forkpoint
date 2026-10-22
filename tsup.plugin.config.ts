import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli/index.ts" },
  outDir: "plugin/lib",
  format: ["esm"],
  target: "node24",
  platform: "node",
  dts: false,
  clean: true,
  sourcemap: false,
  splitting: false,
  noExternal: [/.*/],
  removeNodeProtocol: false,
  banner: {
    js: 'import { createRequire as __forkpointCreateRequire } from "node:module";\nconst require = __forkpointCreateRequire(import.meta.url);',
  },
  outExtension: () => ({ js: ".mjs" }),
});
