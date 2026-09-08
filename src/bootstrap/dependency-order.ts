export function dependencyOrder<T extends { name: string }>(items: T[]): T[] { return [...items]; }
