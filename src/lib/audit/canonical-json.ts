export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();

  function serialize(current: unknown): string {
    if (current === null || typeof current === "boolean" || typeof current === "string") {
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new TypeError("JSON numbers must be finite.");
      return Object.is(current, -0) ? "-0" : JSON.stringify(current);
    }
    if (typeof current !== "object") {
      throw new TypeError("Value must be JSON-compatible.");
    }
    if (ancestors.has(current)) throw new TypeError("JSON cannot contain cycles.");
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        const keys = Reflect.ownKeys(current);
        if (keys.length !== current.length + 1) {
          throw new TypeError("JSON arrays cannot contain holes or extra properties.");
        }
        const elements: string[] = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
            throw new TypeError("JSON arrays must contain only enumerable values.");
          }
          elements.push(serialize(descriptor.value));
        }
        return `[${elements.join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("JSON objects must be plain objects.");
      }
      const keys = Reflect.ownKeys(current);
      if (keys.some((key) => typeof key !== "string")) {
        throw new TypeError("JSON objects cannot contain symbol keys.");
      }
      // Hash input must use code-unit order, not localeCompare.
      const entries = (keys as string[]).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("JSON objects must contain only enumerable values.");
        }
        return `${JSON.stringify(key)}:${serialize(descriptor.value)}`;
      });
      return `{${entries.join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  }

  return serialize(value);
}
