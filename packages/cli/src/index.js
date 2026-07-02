#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Command } from "commander";
import { validateAppSpec } from "../../appspec/src/index.js";
import { capturePublicPage } from "./capture.js";
import { exportAppSpec } from "./export.js";

const program = new Command();
program
  .name("reconstruct")
  .description("Capture a public web page and generate a build-ready AppSpec")
  .version("0.1.0");

program
  .command("capture")
  .argument("<url>", "public URL to capture")
  .option("-o, --out <directory>", "output directory", ".reconstruct")
  .option("--width <pixels>", "viewport width", "1440")
  .option("--height <pixels>", "viewport height", "1000")
  .action(async (url, options) => {
    const outDir = resolve(options.out);
    const spec = await capturePublicPage(url, outDir, {
      width: Number(options.width),
      height: Number(options.height)
    });
    console.log(`Captured ${spec.app.name}`);
    console.log(`AppSpec: ${join(outDir, "appspec.json")}`);
  });

program
  .command("validate")
  .argument("<file>", "AppSpec JSON file")
  .action(async (file) => {
    const spec = validateAppSpec(JSON.parse(await readFile(resolve(file), "utf8")));
    console.log(`Valid AppSpec ${spec.version}: ${spec.app.name}`);
  });

program
  .command("export")
  .argument("<file>", "AppSpec JSON file")
  .requiredOption("-t, --target <target>", "cursor, claude, codex, or markdown")
  .option("-o, --out <directory>", "export directory")
  .action(async (file, options) => {
    const filePath = resolve(file);
    const spec = validateAppSpec(JSON.parse(await readFile(filePath, "utf8")));
    const allowed = new Set(["cursor", "claude", "codex", "markdown"]);
    if (!allowed.has(options.target)) throw new Error(`Unsupported target: ${options.target}`);
    const outDir = resolve(options.out || join(dirname(filePath), "exports", options.target));
    const written = await exportAppSpec(spec, options.target, outDir);
    console.log(`Exported ${written.length} files to ${outDir}`);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(`reconstruct: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
