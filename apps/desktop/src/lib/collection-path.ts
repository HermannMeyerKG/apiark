/** Tree paths come from the host OS; compare both separator styles consistently. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isSameOrDescendant(path: string, ancestor: string): boolean {
  const normalized = normalizePath(path);
  const parent = normalizePath(ancestor);
  return normalized === parent || normalized.startsWith(`${parent}/`);
}

export function parentPath(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(0, separator);
}

export function pathName(path: string): string {
  return normalizePath(path).split("/").pop() ?? "";
}

export function replacePathPrefix(path: string, oldPath: string, newPath: string): string {
  if (!isSameOrDescendant(path, oldPath)) return path;
  return newPath + path.slice(normalizePath(oldPath).length);
}
