/**
 * Lightweight runtime guards and assertions used to replace non-null assertions.
 * Keep minimal, dependency-free, and well-typed for TypeScript narrowing.
 */
export function assertExists<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(message ?? 'Expected value to be defined');
  }
}

export function isArrayOfUnknownParts(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
