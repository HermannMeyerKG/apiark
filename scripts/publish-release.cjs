const updateTargets = [
  ["linux-x86_64", (name) => name.endsWith(".AppImage")],
  ["darwin-aarch64", (name) => name.endsWith("_aarch64.app.tar.gz")],
  ["darwin-x86_64", (name) => name.endsWith("_x64.app.tar.gz")],
  ["windows-x86_64", (name) => name.endsWith("_x64-setup.exe")],
];

module.exports = async function publishRelease({ github, context, releaseId, tag }) {
  const repo = { owner: context.repo.owner, repo: context.repo.repo };
  const assets = await github.paginate(github.rest.repos.listReleaseAssets, {
    ...repo,
    release_id: releaseId,
    per_page: 100,
  });
  const baseUrl = `https://github.com/${repo.owner}/${repo.repo}/releases/download/${tag}`;
  const platforms = {};

  // Validate every platform before changing the manifest or publishing the draft.
  for (const [platform, matches] of updateTargets) {
    const bundles = assets.filter((asset) => matches(asset.name));
    if (bundles.length !== 1) {
      throw new Error(`Expected one update bundle for ${platform}, found ${bundles.length}`);
    }
    const bundle = bundles[0];
    const signatureAsset = assets.find((asset) => asset.name === `${bundle.name}.sig`);
    if (!signatureAsset) {
      throw new Error(`Missing update signature for ${platform}: ${bundle.name}.sig`);
    }
    const { data } = await github.request("GET " + signatureAsset.url, {
      headers: { Accept: "application/octet-stream" },
    });
    const signature = Buffer.from(data).toString("utf8").trim();
    if (!signature) {
      throw new Error(`Empty update signature for ${platform}`);
    }
    platforms[platform] = { signature, url: `${baseUrl}/${bundle.name}` };
  }

  const version = tag.replace(/^v/, "");
  const manifest = {
    version,
    notes: `ApiArk v${version}`,
    pub_date: new Date().toISOString(),
    platforms,
  };
  const existing = assets.find((asset) => asset.name === "latest.json");
  if (existing) {
    await github.rest.repos.deleteReleaseAsset({ ...repo, asset_id: existing.id });
  }
  await github.rest.repos.uploadReleaseAsset({
    ...repo,
    release_id: releaseId,
    name: "latest.json",
    data: JSON.stringify(manifest, null, 2),
  });
  await github.rest.repos.updateRelease({ ...repo, release_id: releaseId, draft: false });
  return manifest;
};
