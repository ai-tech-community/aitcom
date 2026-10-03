/**
 * Bundles the sandboxed HTML extraction worker into ONE self-contained file
 * (cheerio and the rest inlined). The worker's own requires are not traced by
 * Next.js, so it must ship as a single pre-bundled file.
 *
 * Usage: node scripts/build-workers.mjs [--outfile <path>]
 */
import { build } from "esbuild";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_OUTFILE = "workers/dist/html-extract.bundle.cjs";

const { values } = parseArgs({
  options: { outfile: { type: "string" } },
});
const outfile = path.resolve(repoRoot, values.outfile ?? DEFAULT_OUTFILE);

try {
  await build({
    absWorkingDir: repoRoot,
    entryPoints: ["workers/html-extract.worker.ts"],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    minify: true,
    tsconfig: "tsconfig.json",
    logLevel: "warning",
  });
  const { size } = await stat(outfile);
  const shown = outfile.startsWith(repoRoot + path.sep)
    ? path.relative(repoRoot, outfile)
    : outfile;
  console.log(`Built ${shown} (${(size / 1024).toFixed(1)} KiB)`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
