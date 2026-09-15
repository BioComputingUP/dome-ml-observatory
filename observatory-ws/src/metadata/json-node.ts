/** A JSON value as the metadata projections build it: plain data, nothing that serialises lossily. */
export type JsonValue = string | number | boolean | JsonNode | JsonValue[];

export interface JsonNode {
  [key: string]: JsonValue;
}

/**
 * The node with every empty property dropped -- undefined, null, the empty string and the empty
 * array. A projection states only what the record actually holds; an empty value would assert
 * "this is known to be empty", which the stored data rarely means.
 */
export function compact(node: Record<string, JsonValue | null | undefined>): JsonNode {
  const out: JsonNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}
