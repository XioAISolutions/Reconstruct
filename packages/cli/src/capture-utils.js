export function finiteInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

export function cleanText(value, max = 300) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function uniqueByPath(references) {
  const seen = new Set();
  return references.filter((reference) => {
    if (seen.has(reference.path)) return false;
    seen.add(reference.path);
    return true;
  });
}
