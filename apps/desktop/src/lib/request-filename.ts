/** Turn a request name into a single filename stem on every supported OS. */
export function requestFilename(name: string): string {
  const filename = name
    .trim()
    .toLowerCase()
    .replace(/[<>:"/\\|?*\p{Cc}\s]+/gu, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  if (!filename) return "request";
  // Windows reserves these names even when followed by an extension.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)) {
    return `request-${filename}`;
  }
  return filename;
}
