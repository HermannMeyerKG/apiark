import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm version:desktop <version>");
  console.error("Example: pnpm version:desktop 0.4.8");
  process.exit(1);
}

const files = [
  "package.json",
  "apps/desktop/package.json",
  "apps/desktop/src-tauri/tauri.conf.json",
  "apps/desktop/src-tauri/Cargo.toml",
  "packaging/scoop/apiark.json",
];

for (const file of files) {
  const contents = readFileSync(file, "utf8");
  const jsonVersionPattern = /^(\s*"version"\s*:\s*)".*"(,?)$/m;
  const tomlVersionPattern = /^(\s*version\s*=\s*)".*"$/m;
  const versionPattern = file.endsWith(".json") ? jsonVersionPattern : tomlVersionPattern;

  if (!versionPattern.test(contents)) {
    console.error(`Could not find version in ${file}`);
    process.exit(1);
  }

  const updated = file.endsWith(".json")
    ? contents.replace(jsonVersionPattern, `$1"${version}"$2`)
    : contents.replace(tomlVersionPattern, `$1"${version}"`);
  writeFileSync(file, updated);
}

const cargoLockPath = "apps/desktop/src-tauri/Cargo.lock";
const cargoLock = readFileSync(cargoLockPath, "utf8");
const cargoLockPattern = /(name = "apiark"\r?\nversion = )".*"/;

if (!cargoLockPattern.test(cargoLock)) {
  console.error(`Could not find apiark package version in ${cargoLockPath}`);
  process.exit(1);
}

writeFileSync(cargoLockPath, cargoLock.replace(cargoLockPattern, `$1"${version}"`));

const scoopManifestPath = "packaging/scoop/apiark.json";
const versionLiteralPattern = "\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?";
const scoopManifest = readFileSync(scoopManifestPath, "utf8")
  .replace(new RegExp(`ApiArk_${versionLiteralPattern}_x64-setup\\.exe`, "g"), `ApiArk_${version}_x64-setup.exe`)
  .replace(new RegExp(`download/v${versionLiteralPattern}/ApiArk_`, "g"), `download/v${version}/ApiArk_`);
writeFileSync(scoopManifestPath, scoopManifest);

const homebrewCaskPath = "packaging/homebrew/apiark.rb";
const homebrewCask = readFileSync(homebrewCaskPath, "utf8");
const homebrewVersionPattern = /^(\s*version\s+)".*"$/m;

if (!homebrewVersionPattern.test(homebrewCask)) {
  console.error(`Could not find version in ${homebrewCaskPath}`);
  process.exit(1);
}

writeFileSync(
  homebrewCaskPath,
  homebrewCask.replace(homebrewVersionPattern, `$1"${version}"`),
);

console.log(`Desktop version updated to ${version}`);
