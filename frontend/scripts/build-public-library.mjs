import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const output = new URL("out-status/", root);
await rm(output, { recursive: true, force: true });
await mkdir(output);
await cp(new URL("status-site/", root), output, { recursive: true,
  filter: path => !path.endsWith("runtime-config.example.js") });
await cp(new URL("public/songs/", root), new URL("songs/", output), { recursive: true });
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ["src/features/studio/PublicLibrary.tsx"],
  outfile: "out-status/library.js",
  bundle: true,
  minify: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
