import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { createLogger } from "../src/logger.ts";
import {
  InstallError,
  TOOLS,
  ensureTool,
  ensureTools,
  formatEnvFile,
  parseInstallList,
  type InstallDeps,
  type ToolSpec,
} from "../src/tools.ts";

const ARCHIVE = Buffer.from("pretend this is a zip");
const ARCHIVE_SHA256 = createHash("sha256").update(ARCHIVE).digest("hex");

describe("parseInstallList", () => {
  it("returns nothing when unset or empty", () => {
    assert.deepEqual(parseInstallList(undefined), []);
    assert.deepEqual(parseInstallList(" "), []);
  });

  it("accepts known tools case-insensitively, once each", () => {
    const specs = parseInstallList(" Ghidra, ghidra ,");
    assert.deepEqual(
      specs.map((spec) => spec.name),
      ["ghidra"],
    );
  });

  it("rejects unknown tools and names the supported ones", () => {
    assert.throws(
      () => parseInstallList("ghidra,ida"),
      /unknown tool "ida"; supported: ghidra/,
    );
  });
});

describe("ghidra spec", () => {
  it("pins a version, digest and the x86-64 decompiler", () => {
    const spec = TOOLS.ghidra;
    assert.ok(spec !== undefined);
    assert.match(spec.sha256, /^[0-9a-f]{64}$/);
    assert.ok(
      spec.url.startsWith(
        "https://github.com/NationalSecurityAgency/ghidra/releases/download/",
      ),
    );
    assert.equal(spec.unsupportedReason("x64"), undefined);
    assert.match(spec.unsupportedReason("arm64") ?? "", /no native decompiler/);
    assert.deepEqual(spec.env("/opt/rea-tools/ghidra-1"), {
      GHIDRA_INSTALL_DIR: "/opt/rea-tools/ghidra-1",
    });
  });
});

describe("ensureTool", () => {
  let server: Server;
  let baseUrl: string;
  let downloads = 0;
  let workDir: string;
  let toolsDir: string;

  const spec = (overrides: Partial<ToolSpec> = {}): ToolSpec => ({
    name: "fake",
    version: "1.0.0",
    url: `${baseUrl}/fake.zip`,
    sha256: ARCHIVE_SHA256,
    archiveRoot: "fake_1.0.0",
    requiredPaths: () => ["bin/tool"],
    unsupportedReason: (arch) => (arch === "x64" ? undefined : "x64 only"),
    env: (dir) => ({ FAKE_HOME: dir }),
    userOverride: "FAKE_HOME",
    ...overrides,
  });

  // Stands in for unzip: lays out what the archive would contain.
  const fakeExtract =
    (files: string[]): InstallDeps["extract"] =>
    async (_archive, destination) => {
      for (const file of files) {
        const path = join(destination, "fake_1.0.0", file);
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, "");
      }
    };

  const deps = (overrides: Partial<InstallDeps> = {}): InstallDeps => ({
    fetch,
    extract: fakeExtract(["bin/tool"]),
    tmpdir: workDir,
    arch: "x64",
    logger: createLogger("error", "test", 2),
    ...overrides,
  });

  before(async () => {
    server = createServer((req, res) => {
      if (req.url === "/fake.zip") {
        downloads++;
        res.writeHead(200).end(ARCHIVE);
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(async () => {
    downloads = 0;
    workDir = await mkdtemp(join(tmpdir(), "rea-tools-test-"));
    toolsDir = join(workDir, "tools");
  });

  it("downloads, verifies, unpacks and records the pinned version", async () => {
    const env = await ensureTool(spec(), toolsDir, deps());
    const installDir = join(toolsDir, "fake-1.0.0");
    assert.deepEqual(env, { FAKE_HOME: installDir });
    const marker = JSON.parse(
      await readFile(join(installDir, ".rea-install.json"), "utf8"),
    ) as Record<string, string>;
    assert.deepEqual(marker, { version: "1.0.0", sha256: ARCHIVE_SHA256 });
    assert.equal(downloads, 1);
    assert.deepEqual(await readdir(toolsDir), ["fake-1.0.0"]);
    assert.deepEqual(
      (await readdir(workDir)).filter((name) => name.endsWith(".download")),
      [],
    );
    await rm(workDir, { recursive: true });
  });

  it("reuses an intact install without downloading again", async () => {
    await ensureTool(spec(), toolsDir, deps());
    await ensureTool(spec(), toolsDir, deps());
    assert.equal(downloads, 1);
    await rm(workDir, { recursive: true });
  });

  it("reinstalls when a required file is missing", async () => {
    await ensureTool(spec(), toolsDir, deps());
    await rm(join(toolsDir, "fake-1.0.0", "bin", "tool"));
    await ensureTool(spec(), toolsDir, deps());
    assert.equal(downloads, 2);
    await rm(workDir, { recursive: true });
  });

  it("replaces an older version", async () => {
    await mkdir(join(toolsDir, "fake-0.9.0"), { recursive: true });
    await ensureTool(spec(), toolsDir, deps());
    assert.deepEqual(await readdir(toolsDir), ["fake-1.0.0"]);
    await rm(workDir, { recursive: true });
  });

  it("refuses a checksum mismatch and leaves nothing behind", async () => {
    await assert.rejects(
      ensureTool(spec({ sha256: "0".repeat(64) }), toolsDir, deps()),
      /checksum mismatch/,
    );
    assert.deepEqual(await readdir(toolsDir), []);
    assert.deepEqual(
      (await readdir(workDir)).filter((name) => name.endsWith(".download")),
      [],
    );
    await rm(workDir, { recursive: true });
  });

  it("refuses an archive without the required files", async () => {
    await assert.rejects(
      ensureTool(spec(), toolsDir, deps({ extract: fakeExtract(["README"]) })),
      /archive is missing bin\/tool/,
    );
    assert.deepEqual(await readdir(toolsDir), []);
    await rm(workDir, { recursive: true });
  });

  it("refuses an HTTP error", async () => {
    await assert.rejects(
      ensureTool(spec({ url: `${baseUrl}/missing.zip` }), toolsDir, deps()),
      /HTTP 404/,
    );
    await rm(workDir, { recursive: true });
  });

  it("refuses an unsupported architecture before downloading", async () => {
    await assert.rejects(
      ensureTool(spec(), toolsDir, deps({ arch: "arm64" })),
      InstallError,
    );
    assert.equal(downloads, 0);
    await rm(workDir, { recursive: true });
  });

  it("explains how to fix an unwritable tools directory", async () => {
    const readOnly = join(workDir, "ro");
    await mkdir(readOnly, { mode: 0o555 });
    await assert.rejects(
      ensureTool(spec(), join(readOnly, "tools"), deps()),
      /not writable; mount a volume/,
    );
    await rm(workDir, { recursive: true, force: true });
  });

  it("skips a tool the user already provides", async () => {
    const env = await ensureTools(
      [spec()],
      toolsDir,
      { FAKE_HOME: "/mine" },
      deps(),
    );
    assert.deepEqual(env, {});
    assert.equal(downloads, 0);
    await rm(workDir, { recursive: true });
  });
});

describe("formatEnvFile", () => {
  it("quotes values for sh", () => {
    assert.equal(
      formatEnvFile({ A: "/opt/x", B: "it's" }),
      "A='/opt/x'\nB='it'\\''s'\n",
    );
  });
});
