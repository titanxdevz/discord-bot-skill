const MAX_CUSTOM_ID = 100;
const PART = /^[a-z0-9][a-z0-9_-]*$/i;
const SNOWFLAKE = /^\d{17,20}$/;

export interface ParsedCustomId {
  readonly feature: string;
  readonly action: string;
  readonly args: readonly string[];
}

/**
 * Build `feature:action:arg1:arg2`, rejecting anything that would make routing
 * ambiguous later (empty parts, colons inside parts, oversized IDs).
 */
export function buildCustomId(
  feature: string,
  action: string,
  ...args: readonly string[]
): string {
  for (const part of [feature, action, ...args]) {
    if (!PART.test(part)) {
      throw new Error(`Invalid custom_id part "${part}" (allowed: a-z 0-9 _ -)`);
    }
  }
  const id = [feature, action, ...args].join(':');
  if (id.length > MAX_CUSTOM_ID) {
    throw new Error(`custom_id exceeds ${MAX_CUSTOM_ID} characters (${id.length})`);
  }
  return id;
}

/** Parse a custom_id, returning null instead of throwing on malformed input. */
export function parseCustomId(raw: string): ParsedCustomId | null {
  if (raw.length === 0 || raw.length > MAX_CUSTOM_ID) return null;
  const [feature, action, ...args] = raw.split(':');
  if (!feature || !action) return null;
  if (!PART.test(feature) || !PART.test(action)) return null;
  if (args.some((arg) => arg.length === 0 || !PART.test(arg))) return null;
  return { feature, action, args };
}

export function isSnowflake(value: string): boolean {
  return SNOWFLAKE.test(value);
}
