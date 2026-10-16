// Runs only in the trusted tag workflow after every native build and smoke test passes.
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const files = require("./release-files.cjs");
async function main() {
  const version = require("../package.json").version,
    tag = process.env.GITHUB_REF_NAME,
    repo = process.env.GITHUB_REPOSITORY,
    token = process.env.GITHUB_TOKEN;
  if (tag !== `v${version}` || !repo || !token)
    throw new Error(
      "Release must run on the package version tag with a repository-scoped token.",
    );
  const request = async (endpoint, method = "GET", body, binary = false) => {
    const response = await fetch(
      endpoint.startsWith("https://")
        ? endpoint
        : `https://api.github.com/repos/${repo}${endpoint}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": binary
            ? "application/octet-stream"
            : "application/json",
        },
        body:
          body === undefined ? undefined : binary ? body : JSON.stringify(body),
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub ${method} ${endpoint.split("?")[0]}: ${response.status} ${(await response.text()).slice(0, 400)}`,
      );
    return response.status === 204 ? null : response.json();
  };
  const sums = [];
  for (const name of files) {
    const bytes = await fs.readFile(path.join("release", name));
    if (!bytes.length) throw new Error(`Empty release asset: ${name}`);
    sums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
  }
  await fs.writeFile("release/SHA256SUMS.txt", sums.join("\n") + "\n");
  let release = (await request("/releases")).find(
    (release) => release.tag_name === tag,
  );
  if (release && !release.draft)
    throw new Error(
      "This release is already public; publish a new version rather than replacing distributed binaries.",
    );
  if (!release)
    release = await request("/releases", "POST", {
      tag_name: tag,
      name: `Rovidx Teleprompter ${version}`,
      draft: true,
      prerelease: false,
      body: await fs.readFile("docs/RELEASE_NOTES.md", "utf8"),
    });
  for (const name of [...files, "SHA256SUMS.txt"]) {
    const existing = release.assets.find((asset) => asset.name === name);
    const bytes = await fs.readFile(path.join("release", name));
    const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
    if (existing) {
      if (existing.digest !== digest)
        throw new Error(
          `Draft asset differs: ${name}. Inspect it before retrying.`,
        );
      continue;
    }
    await request(
      release.upload_url.split("{")[0] + "?name=" + encodeURIComponent(name),
      "POST",
      bytes,
      true,
    );
    console.log(`Uploaded ${name}`);
  }
  release = await request(`/releases/${release.id}`);
  for (const name of [...files, "SHA256SUMS.txt"])
    if (
      !release.assets.some(
        (asset) => asset.name === name && asset.state === "uploaded",
      )
    )
      throw new Error(`Missing uploaded asset: ${name}`);
  await request(`/releases/${release.id}`, "PATCH", {
    draft: false,
    make_latest: "true",
  });
  console.log(`Published https://github.com/${repo}/releases/tag/${tag}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
