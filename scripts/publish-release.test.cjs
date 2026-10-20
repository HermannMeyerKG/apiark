const assert = require("node:assert/strict");
const { test } = require("node:test");
const publishRelease = require("./publish-release.cjs");

const bundles = [
  "ApiArk_0.4.11_amd64.AppImage",
  "ApiArk_aarch64.app.tar.gz",
  "ApiArk_x64.app.tar.gz",
  "ApiArk_0.4.11_x64-setup.exe",
];

function fixture() {
  const names = [
    ...bundles.flatMap((name) => [name, `${name}.sig`]),
    "ApiArk_0.4.11_aarch64.dmg",
    "ApiArk_0.4.11_x64.dmg",
    "ApiArk_0.4.11_amd64.deb",
    "apiark-cli-windows-x86_64.exe",
    "latest.json",
  ];
  const assets = names.map((name, id) => ({ name, id, url: `https://api.github.com/assets/${id}` }));
  const calls = [];
  const signatureData = new Map(assets.map((asset) => [asset.url, Buffer.from(`signature:${asset.name}\n`)]));
  const github = {
    paginate: async () => assets,
    request: async (route) => ({ data: signatureData.get(route.slice(4)) }),
    rest: { repos: {
      listReleaseAssets: () => {},
      deleteReleaseAsset: async (args) => calls.push(["delete", args]),
      uploadReleaseAsset: async (args) => calls.push(["upload", args]),
      updateRelease: async (args) => calls.push(["publish", args]),
    } },
  };
  return {
    assets, calls, signatureData,
    args: { github, context: { repo: { owner: "HermannMeyerKG", repo: "apiark" } }, releaseId: 42, tag: "v0.4.11" },
  };
}

test("publishes all four native Tauri v2 update targets with matching signatures and tag URLs", async () => {
  const { args, calls } = fixture();
  const manifest = await publishRelease(args);
  assert.equal(manifest.version, "0.4.11");
  assert.deepEqual(Object.keys(manifest.platforms), ["linux-x86_64", "darwin-aarch64", "darwin-x86_64", "windows-x86_64"]);
  for (const [index, entry] of Object.values(manifest.platforms).entries()) {
    assert.equal(entry.url, `https://github.com/HermannMeyerKG/apiark/releases/download/v0.4.11/${bundles[index]}`);
    assert.equal(entry.signature, `signature:${bundles[index]}.sig`);
  }
  assert.deepEqual(calls.map(([name]) => name), ["delete", "upload", "publish"]);
  assert.deepEqual(JSON.parse(calls[1][1].data), manifest);
  assert.equal(calls[2][1].draft, false);
});

test("uploads a manifest for a fresh release without deleting an asset", async () => {
  const { args, assets, calls } = fixture();
  assets.splice(assets.findIndex((asset) => asset.name === "latest.json"), 1);
  await publishRelease(args);
  assert.deepEqual(calls.map(([name]) => name), ["upload", "publish"]);
});

for (const bundle of bundles) {
  for (const missing of [bundle, `${bundle}.sig`]) {
    test(`leaves the draft and manifest untouched when ${missing} is missing`, async () => {
      const { args, assets, calls } = fixture();
      assets.splice(assets.findIndex((asset) => asset.name === missing), 1);
      await assert.rejects(publishRelease(args), /Expected one update bundle|Missing update signature/);
      assert.deepEqual(calls, []);
    });
  }
}

test("rejects empty signatures before changing the release", async () => {
  const { args, assets, calls, signatureData } = fixture();
  const signature = assets.find((asset) => asset.name === `${bundles[3]}.sig`);
  signatureData.set(signature.url, Buffer.from("\n"));
  await assert.rejects(publishRelease(args), /Empty update signature/);
  assert.deepEqual(calls, []);
});

test("rejects ambiguous update bundles before changing the release", async () => {
  const { args, assets, calls } = fixture();
  assets.push({ name: "ApiArk_0.4.10_amd64.AppImage", id: 99 });
  await assert.rejects(publishRelease(args), /Expected one update bundle for linux-x86_64, found 2/);
  assert.deepEqual(calls, []);
});

test("does not publish if uploading the update manifest fails", async () => {
  const { args, calls } = fixture();
  args.github.rest.repos.uploadReleaseAsset = async () => { throw new Error("Upload failed"); };
  await assert.rejects(publishRelease(args), /Upload failed/);
  assert.ok(!calls.some(([name]) => name === "publish"));
});
