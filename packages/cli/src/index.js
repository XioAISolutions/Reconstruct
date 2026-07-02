#!/usr/bin/env node

import { dirname, join, resolve } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { AppSpecValidationError, APP_SPEC_VERSION, validateAppSpec } from "@reconstruct/appspec";
import { capturePublicPage } from "./capture.js";
import { EXPORT_TARGETS, exportAppSpec } from "./export.js";
import { readJsonFile, UserInputError } from "./fs.js";
import { verifyAppSpecProject } from "./integrity.js";

process.umask(0o077);

function integerOption(min, max) {
  return (value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      throw new InvalidArgumentError(`must be an integer between ${min} and ${max}`);
    }
    return parsed;
  };
}

function printResult(payload, json) {
  if (json) console.log(JSON.stringify(payload));
  else for (const line of payload.lines ?? []) console.log(line);
}

const program = new Command();
program
  .name("reconstruct")
  .description("Capture a web application and generate a hardened, build-ready AppSpec")
  .version(APP_SPEC_VERSION)
  .showSuggestionAfterError()
  .showHelpAfterError();

program
  .command("capture")
  .description("Capture one public web page into a new Reconstruct project directory")
  .argument("<url>", "public URL to capture")
  .option("-o, --out <directory>", "new output directory", ".reconstruct")
  .option("--width <pixels>", "viewport width", integerOption(320, 3840), 1440)
  .option("--height <pixels>", "viewport height", integerOption(320, 2160), 1000)
  .option("--timeout <milliseconds>", "navigation timeout", integerOption(1_000, 120_000), 30_000)
  .option("--max-requests <count>", "maximum browser requests", integerOption(1, 5_000), 300)
  .option("--max-html-bytes <bytes>", "maximum sanitized HTML bytes", integerOption(10_000, 20_000_000), 2_000_000)
  .option("--max-page-height <pixels>", "maximum screenshot height", integerOption(320, 50_000), 12_000)
  .option("--allow-private-network", "allow loopback and private-network targets; unsafe for hosted use", false)
  .option("--no-save-html", "do not save sanitized HTML evidence")
  .option("--json", "emit machine-readable output", false)
  .action(async (url, options) => {
    const outDir = resolve(options.out);
    const spec = await capturePublicPage(url, outDir, {
      viewport: { width: options.width, height: options.height },
      timeoutMs: options.timeout,
      maxRequests: options.maxRequests,
      maxHtmlBytes: options.maxHtmlBytes,
      maxPageHeight: options.maxPageHeight,
      allowPrivateNetwork: options.allowPrivateNetwork,
      saveHtml: options.saveHtml
    });
    printResult({
      ok: true,
      command: "capture",
      app: spec.app.name,
      appSpec: join(outDir, "appspec.json"),
      lines: [`Captured ${spec.app.name}`, `AppSpec: ${join(outDir, "appspec.json")}`]
    }, options.json);
  });

program
  .command("validate")
  .description("Validate an AppSpec JSON file without modifying it")
  .argument("<file>", "AppSpec JSON file")
  .option("--json", "emit machine-readable output", false)
  .action(async (file, options) => {
    const filePath = resolve(file);
    const spec = validateAppSpec(await readJsonFile(filePath));
    printResult({
      ok: true,
      command: "validate",
      version: spec.version,
      app: spec.app.name,
      file: filePath,
      lines: [`Valid AppSpec ${spec.version}: ${spec.app.name}`]
    }, options.json);
  });

program
  .command("verify")
  .description("Verify AppSpec schema, evidence manifest, file sizes, and SHA-256 integrity")
  .argument("<file>", "AppSpec JSON file")
  .option("--json", "emit machine-readable output", false)
  .action(async (file, options) => {
    const result = await verifyAppSpecProject(resolve(file));
    printResult({
      ok: true,
      command: "verify",
      ...result,
      lines: [`Verified ${result.verifiedFiles.length} evidence files (${result.totalBytes} bytes) for ${result.app}`]
    }, options.json);
  });

program
  .command("export")
  .description("Export a validated AppSpec into a new coding-agent package")
  .argument("<file>", "AppSpec JSON file")
  .requiredOption("-t, --target <target>", `one of: ${EXPORT_TARGETS.join(", ")}`)
  .option("-o, --out <directory>", "new export directory")
  .option("--json", "emit machine-readable output", false)
  .action(async (file, options) => {
    if (!EXPORT_TARGETS.includes(options.target)) throw new UserInputError(`Unsupported target: ${options.target}`);
    const filePath = resolve(file);
    const spec = validateAppSpec(await readJsonFile(filePath));
    const outDir = resolve(options.out || join(dirname(filePath), "exports", options.target));
    const written = await exportAppSpec(spec, options.target, outDir);
    printResult({
      ok: true,
      command: "export",
      target: options.target,
      outDir,
      files: written,
      lines: [`Exported ${written.length} files to ${outDir}`]
    }, options.json);
  });

program.parseAsync(process.argv).catch((error) => {
  const payload = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    ...(error instanceof AppSpecValidationError ? { issues: error.issues } : {})
  };
  const jsonRequested = process.argv.includes("--json");
  if (jsonRequested) console.error(JSON.stringify(payload));
  else {
    console.error(`reconstruct: ${payload.error}`);
    if (payload.issues) payload.issues.forEach((issue) => console.error(`  - ${issue}`));
  }
  process.exitCode = error instanceof UserInputError || error instanceof AppSpecValidationError || error instanceof InvalidArgumentError ? 2 : 1;
});
