import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";

export class UserInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserInputError";
  }
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function assertSafeOutputPath(input) {
  const target = resolve(input);
  const prohibited = new Set([resolve("/"), resolve(process.cwd()), resolve(homedir())]);
  if (prohibited.has(target)) throw new UserInputError(`Refusing to use protected output directory: ${target}`);
  return target;
}

export function safeJoin(base, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.includes("\0") || isAbsolute(relativePath)) {
    throw new UserInputError(`Unsafe relative path: ${String(relativePath)}`);
  }
  const target = resolve(base, relativePath);
  const rel = relative(resolve(base), target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new UserInputError(`Path escapes output directory: ${relativePath}`);
  return target;
}

export async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function assertPathDoesNotExist(path) {
  if (await pathExists(path)) throw new UserInputError(`Output already exists: ${path}`);
}

export async function createStagingDirectory(finalDirectory) {
  const finalPath = assertSafeOutputPath(finalDirectory);
  await assertPathDoesNotExist(finalPath);
  const parent = dirname(finalPath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(parent, `.${basename(finalPath)}.tmp-`));
  await mkdir(staging, { recursive: true, mode: 0o700 });
  return {
    finalPath,
    staging,
    async commit() {
      await assertPathDoesNotExist(finalPath);
      await rename(staging, finalPath);
      return finalPath;
    },
    async rollback() {
      await rm(staging, { recursive: true, force: true });
    }
  };
}

export async function atomicWriteFile(path, data, { mode = 0o600 } = {}) {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temp = join(parent, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, data, { mode });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

export async function readJsonFile(path, { maxBytes = 10 * 1024 * 1024 } = {}) {
  const file = resolve(path);
  const info = await lstat(file);
  if (!info.isFile()) throw new UserInputError(`Not a regular file: ${file}`);
  if (info.isSymbolicLink()) throw new UserInputError(`Symbolic links are not accepted: ${file}`);
  if (info.size > maxBytes) throw new UserInputError(`JSON file exceeds ${maxBytes} bytes: ${file}`);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new UserInputError(`Invalid JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parsed;
}

export async function evidenceRecord(path, relativePath, { type, mediaType } = {}) {
  const data = await readFile(path);
  const info = await stat(path);
  return {
    type,
    path: relativePath,
    sha256: sha256(data),
    bytes: info.size,
    ...(mediaType ? { mediaType } : {})
  };
}
