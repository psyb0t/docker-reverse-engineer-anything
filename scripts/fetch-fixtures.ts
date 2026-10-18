// Downloads the integration-test APK into tests/.fixtures and checks it against
// the pinned SHA-256. This is the Appium ApiDemos build REA uses for its own
// Android verification (Apache-2.0).
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FIXTURE_DIRECTORY = "tests/.fixtures";
const FIXTURES = [
  {
    filename: "ApiDemos-debug.apk",
    url: "https://github.com/appium/android-apidemos/releases/download/v6.0.18/ApiDemos-debug.apk",
    sha256: "a9eecf37b26cd084855c530db81c2bb1b91f4c1b095a04f47aa7c20e2791f686",
  },
];

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function existingMatches(
  path: string,
  expected: string,
): Promise<boolean> {
  try {
    return sha256(await readFile(path)) === expected;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  await mkdir(FIXTURE_DIRECTORY, { recursive: true });
  for (const fixture of FIXTURES) {
    const path = join(FIXTURE_DIRECTORY, fixture.filename);
    if (await existingMatches(path, fixture.sha256)) continue;

    const response = await fetch(fixture.url, { redirect: "follow" });
    if (!response.ok)
      throw new Error(
        `download failed: ${fixture.url} returned ${String(response.status)}`,
      );
    const data = Buffer.from(await response.arrayBuffer());
    const actual = sha256(data);
    if (actual !== fixture.sha256) {
      throw new Error(
        `SHA-256 mismatch for ${fixture.filename}: expected ${fixture.sha256}, got ${actual}`,
      );
    }
    await writeFile(`${path}.partial`, data);
    await rename(`${path}.partial`, path);
  }
}

await main();
