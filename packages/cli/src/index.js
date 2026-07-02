#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Command, InvalidArgumentError, Option } from "commander";
import { validateAppSpec } from "@reconstruct/appspec";
import { capturePublicPage } from "./capture.js";
import { exportAppSpec } from "./export.js";

function boundedInteger(label, min, max) {
  return (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new InvalidArgumentError(`${label} must be an integer between ${min} and ${max}`);
    }
    return parsed;
  };
}

async function readAppSpec(file) {
  const filePath = resolve(file);
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read AppSpec file ${filePath}: ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`AppSpec file ${filePath} is not valid JSON: ${error.message}`);
  }
  return { filePath, spec: validateAppSpec(parsed) };
}

const program = new Command();
program
  .name("reconstruct")
  .description("Capture a public web page and generate a build-ready AppSpec")
  .version("0.1.0");

program
  .command("capture")
  .argument("<url>", "public URL to capture")
  .option("-o, --out <directory>", "output directory", ".reconstruct")
  .option("--width <pixels>", "viewport width", boundedInteger("width", 320, 7680), 1440)
  .option("--height <pixels>", "viewport height", boundedInteger("height", 320, 7680), 1000)
  .option("--timeout <milliseconds>", "navigation timeout", boundedInteger("timeout", 1000, 300000), 30000)
  .action(async (url, options) => {
    const outDir = resolve(options.out);
    const spec = await capturePublicPage(url, outDir, {
      width: options.width,
      height: options.height,
      timeoutMs: options.timeout
    });
    console.log(`Captured ${spec.app.name}`);
    console.log(`AppSpec: ${join(outDir, "appspec.json")}`);
  });

program
  .command("validate")
  .argument("<file>", "AppSpec JSON file")
  .action(async (file) => {
    const { spec } = await readAppSpec(file);
    console.log(`Valid AppSpec ${spec.version}: ${spec.app.name}`);
  });

program
  .command("export")
  .argument("<file>", "AppSpec JSON file")
  .addOption(
    new Option("-t, --target <target>", "export format")
      .choices(["cursor", "claude", "codex", "markdown"])
      .makeOptionMandatory()
  )
  .option("-o, --out <directory>", "export directory")
  .action(async (file, options) => {
    const { filePath, spec } = await readAppSpec(file);
    const outDir = resolve(options.out || join(dirname(filePath), "exports", options.target));
    const written = await exportAppSpec(spec, options.target, outDir);
    console.log(`Exported ${written.length} files to ${outDir}`);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(`reconstruct: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
