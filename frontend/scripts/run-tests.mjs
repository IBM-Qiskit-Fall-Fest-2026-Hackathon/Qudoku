import esbuild from "esbuild";
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const outFile = ".tmp-qudoku-tests.cjs";

await esbuild.build({
  entryPoints: ["tests/sudoku.test.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: outFile,
});

const result = spawnSync(process.execPath, ["--test", outFile], {
  stdio: "inherit",
});

rmSync(outFile, { force: true });
process.exit(result.status ?? 1);
