// C0/C1 controls plus zero-width and bidirectional override characters, which
// can reorder or hide text in the generated agent documents (trojan-source style).
const UNSAFE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function slug(value, maxLength = 80) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, maxLength)
      .replace(/-$/, "") || "home"
  );
}

export function clean(value, maxLength = 200) {
  if (typeof value !== "string") return value;
  return value.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function inline(value, maxLength = 500) {
  return clean(String(value ?? ""), maxLength);
}

export function fenced(content, info = "") {
  const longestRun = Math.max(3, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  return `${fence}${info}\n${content}\n${fence}`;
}
