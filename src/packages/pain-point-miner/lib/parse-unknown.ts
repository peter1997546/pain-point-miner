/** Narrow unknown JSON payloads without trusting the network shape. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

/** Walk a nested array/object path; missing steps yield undefined. */
export function pathGet(
  value: unknown,
  path: readonly (string | number)[],
): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof key === "number") {
      const list = asArray(current);
      if (!list) {
        return undefined;
      }
      current = list[key];
      continue;
    }
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}
