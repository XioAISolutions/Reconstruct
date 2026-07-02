import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { assertSafeOutputPath, safeJoin } from "../src/fs.js";

test("safeJoin prevents path traversal", () => {
  assert.match(safeJoin("/tmp/base", "nested/file.txt"), /nested\/file\.txt$/);
  assert.throws(() => safeJoin("/tmp/base", "../secret"), /escapes/);
  assert.throws(() => safeJoin("/tmp/base", "/etc/passwd"), /Unsafe/);
});

test("protected output directories are rejected", () => {
  assert.throws(() => assertSafeOutputPath("/"), /protected/);
  assert.throws(() => assertSafeOutputPath(process.cwd()), /protected/);
  assert.throws(() => assertSafeOutputPath(homedir()), /protected/);
});
