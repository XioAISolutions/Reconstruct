import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { lstat } from "node:fs/promises";
import { isSafeRelativePath, validateAppSpec } from "@reconstruct/appspec";
import { readJsonFile, safeJoin, UserInputError } from "./fs.js";

const SHA256_RE = /^[a-f0-9]{64}$/;

async function hashFile(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

function collectEvidence(spec) {
  const refs = [];
  for (const collection of [spec.screens, spec.components, spec.flows]) {
    for (const item of collection) refs.push(...item.evidence);
  }
  return refs;
}

function validateManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new UserInputError("Evidence manifest must be an object");
  if (input.version !== 1) throw new UserInputError("Unsupported evidence manifest version");
  if (input.algorithm !== "sha256") throw new UserInputError("Unsupported evidence manifest algorithm");
  if (!Array.isArray(input.entries) || input.entries.length > 5_000) throw new UserInputError("Evidence manifest entries must be a bounded array");

  const entries = new Map();
  for (const [index, entry] of input.entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new UserInputError(`Manifest entry ${index} must be an object`);
    if (!isSafeRelativePath(entry.path)) throw new UserInputError(`Manifest entry ${index} has an unsafe path`);
    if (entries.has(entry.path)) throw new UserInputError(`Duplicate manifest path: ${entry.path}`);
    if (typeof entry.sha256 !== "string" || !SHA256_RE.test(entry.sha256)) throw new UserInputError(`Manifest entry ${entry.path} has an invalid SHA-256 digest`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw new UserInputError(`Manifest entry ${entry.path} has an invalid byte size`);
    entries.set(entry.path, entry);
  }
  return entries;
}

export async function verifyAppSpecProject(appSpecFile, { maxArtifactBytes = 100 * 1024 * 1024 } = {}) {
  const appSpecPath = resolve(appSpecFile);
  const root = dirname(appSpecPath);
  const spec = validateAppSpec(await readJsonFile(appSpecPath));
  const manifestPath = safeJoin(root, spec.integrity.manifest);
  const manifest = await readJsonFile(manifestPath, { maxBytes: 5 * 1024 * 1024 });
  const entries = validateManifest(manifest);
  const evidenceRefs = collectEvidence(spec);
  const verified = new Map();

  for (const ref of evidenceRefs) {
    const manifestEntry = entries.get(ref.path);
    if (!manifestEntry) throw new UserInputError(`Evidence is missing from manifest: ${ref.path}`);
    if (manifestEntry.sha256 !== ref.sha256 || manifestEntry.bytes !== ref.bytes) {
      throw new UserInputError(`AppSpec and manifest disagree for evidence: ${ref.path}`);
    }
    if (verified.has(ref.path)) continue;

    const filePath = safeJoin(root, ref.path);
    const info = await lstat(filePath);
    if (info.isSymbolicLink() || !info.isFile()) throw new UserInputError(`Evidence must be a regular non-symlink file: ${ref.path}`);
    if (info.size > maxArtifactBytes) throw new UserInputError(`Evidence exceeds verification size limit: ${ref.path}`);
    if (info.size !== ref.bytes) throw new UserInputError(`Evidence byte size mismatch: ${ref.path}`);
    const digest = await hashFile(filePath);
    if (digest !== ref.sha256) throw new UserInputError(`Evidence SHA-256 mismatch: ${ref.path}`);
    verified.set(ref.path, { path: ref.path, bytes: info.size, sha256: digest });
  }

  for (const path of entries.keys()) {
    if (!verified.has(path)) throw new UserInputError(`Manifest contains unreferenced evidence: ${path}`);
  }

  return {
    app: spec.app.name,
    appSpecVersion: spec.version,
    verifiedFiles: [...verified.values()].sort((a, b) => a.path.localeCompare(b.path)),
    totalBytes: [...verified.values()].reduce((sum, entry) => sum + entry.bytes, 0)
  };
}
