import { readFile } from "node:fs/promises";

const required = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs/THREAT_MODEL.md",
  "packages/appspec/src/index.js",
  "packages/cli/src/security.js",
  ".github/workflows/ci.yml",
  ".github/dependabot.yml"
];

const failures = [];
for (const path of required) {
  try {
    await readFile(new URL(`../${path}`, import.meta.url));
  } catch {
    failures.push(`missing required file: ${path}`);
  }
}

const packageFiles = ["package.json", "packages/appspec/package.json", "packages/cli/package.json"];
for (const path of packageFiles) {
  try {
    const pkg = JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
    for (const group of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(pkg[group] ?? {})) {
        if (name.startsWith("@reconstruct/") && version === "workspace:*") continue;
        if (/^[~^*]|latest$/i.test(version)) failures.push(`${path}: ${name} must use an exact version, found ${version}`);
      }
    }
  } catch (error) {
    failures.push(`${path}: invalid package JSON (${error.message})`);
  }
}

const sourcePaths = ["packages/cli/src/capture.js", "packages/cli/src/security.js", "packages/cli/src/index.js"];
for (const path of sourcePaths) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  if (path.endsWith("capture.js") && !source.includes("chromiumSandbox: true")) failures.push(`${path}: Chromium sandbox must be explicitly enabled`);
  for (const forbidden of ["--no-sandbox", "chromiumSandbox: false", "ignoreHTTPSErrors: true", "bypassCSP: true", "child_process", "eval("]) {
    if (source.includes(forbidden)) failures.push(`${path}: forbidden hardening regression: ${forbidden}`);
  }
}

if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Repository policy checks passed.");
}
