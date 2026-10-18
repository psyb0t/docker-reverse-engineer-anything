// Opt-in tools that are free to redistribute but too large to bake into every
// image. REA_INSTALL names them; the entrypoint installs each missing one into
// REA_TOOLS_DIR (a volume) before REA starts, so later starts reuse it.
//
// Every tool is pinned to one version and SHA-256, chosen when the image is
// released and old enough to clear the seven-day release-age gate. Nothing is
// installed that is not listed here.
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Logger } from "pino";

const MARKER_FILE = ".rea-install.json";
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export interface ToolSpec {
  name: string;
  version: string;
  url: string;
  sha256: string;
  // Directory the archive unpacks to.
  archiveRoot: string;
  // Paths, relative to the install directory, that must exist for this
  // process architecture once unpacked.
  requiredPaths: (arch: string) => string[];
  // Why an architecture cannot use the pinned release, if it cannot.
  unsupportedReason: (arch: string) => string | undefined;
  // Environment REA needs to find the tool.
  env: (installDir: string) => Record<string, string>;
  // A variable that, when already set, means the user brought their own.
  userOverride: string;
}

export const TOOLS: Record<string, ToolSpec> = {
  ghidra: {
    name: "ghidra",
    version: "12.1.4",
    url: "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip",
    sha256: "ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db",
    archiveRoot: "ghidra_12.1.4_PUBLIC",
    requiredPaths: () => [
      "support/analyzeHeadless",
      "Ghidra/Features/Decompiler/os/linux_x86_64/decompile",
    ],
    // The official release ships the native decompiler for x86-64 only.
    unsupportedReason: (arch) =>
      arch === "x64"
        ? undefined
        : `the official Ghidra release has no native decompiler for linux ${arch}; use the amd64 image or mount your own build and set GHIDRA_INSTALL_DIR`,
    env: (installDir) => ({ GHIDRA_INSTALL_DIR: installDir }),
    userOverride: "GHIDRA_INSTALL_DIR",
  },
};

export class InstallError extends Error {
  override name = "InstallError";
}

export function parseInstallList(raw: string | undefined): ToolSpec[] {
  if (raw === undefined || raw.trim() === "") return [];
  const names = [
    ...new Set(
      raw
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter((name) => name !== ""),
    ),
  ];
  return names.map((name) => {
    const spec = TOOLS[name];
    if (spec === undefined) {
      throw new InstallError(
        `REA_INSTALL lists unknown tool "${name}"; supported: ${Object.keys(TOOLS).join(", ")}`,
      );
    }
    return spec;
  });
}

export interface InstallDeps {
  fetch: typeof fetch;
  // Unpacks archivePath into the empty directory destination.
  extract: (archivePath: string, destination: string) => Promise<void>;
  tmpdir: string;
  arch: string;
  logger: Logger;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function installDirFor(toolsDir: string, spec: ToolSpec): string {
  return join(toolsDir, `${spec.name}-${spec.version}`);
}

async function isInstalled(
  installDir: string,
  spec: ToolSpec,
  arch: string,
): Promise<boolean> {
  try {
    const marker = JSON.parse(
      await readFile(join(installDir, MARKER_FILE), "utf8"),
    ) as {
      version?: string;
      sha256?: string;
    };
    if (marker.version !== spec.version || marker.sha256 !== spec.sha256)
      return false;
  } catch {
    return false;
  }
  for (const path of spec.requiredPaths(arch)) {
    if (!(await exists(join(installDir, path)))) return false;
  }
  return true;
}

async function download(
  spec: ToolSpec,
  target: string,
  deps: InstallDeps,
): Promise<void> {
  const response = await deps.fetch(spec.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || response.body === null) {
    throw new InstallError(
      `downloading ${spec.name} failed: HTTP ${String(response.status)}`,
    );
  }
  const hash = createHash("sha256");
  let size = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_DOWNLOAD_BYTES) {
        callback(
          new InstallError(
            `${spec.name} download exceeds ${String(MAX_DOWNLOAD_BYTES)} bytes`,
          ),
        );
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body),
    meter,
    createWriteStream(target),
  );
  const actual = hash.digest("hex");
  if (actual !== spec.sha256) {
    throw new InstallError(
      `${spec.name} checksum mismatch: expected ${spec.sha256}, got ${actual}`,
    );
  }
}

// Removes older versions of the same tool once the pinned one is in place.
async function pruneOldVersions(
  toolsDir: string,
  spec: ToolSpec,
  keep: string,
): Promise<void> {
  for (const entry of await readdir(toolsDir)) {
    const path = join(toolsDir, entry);
    if (entry.startsWith(`${spec.name}-`) && path !== keep) {
      await rm(path, { recursive: true, force: true });
    }
  }
}

// Installs spec into toolsDir unless an intact copy of the pinned version is
// already there, and returns the environment REA needs for it.
export async function ensureTool(
  spec: ToolSpec,
  toolsDir: string,
  deps: InstallDeps,
): Promise<Record<string, string>> {
  const log = deps.logger.child({ tool: spec.name, version: spec.version });
  const reason = spec.unsupportedReason(deps.arch);
  if (reason !== undefined)
    throw new InstallError(`cannot install ${spec.name}: ${reason}`);

  const installDir = installDirFor(toolsDir, spec);
  if (await isInstalled(installDir, spec, deps.arch)) {
    log.info({ path: installDir }, "tool already installed");
    return spec.env(installDir);
  }

  try {
    await mkdir(toolsDir, { recursive: true });
    await access(toolsDir, 2 /* W_OK */);
  } catch {
    throw new InstallError(
      `${toolsDir} is not writable; mount a volume there, e.g. -v rea-tools:${toolsDir}`,
    );
  }

  const id = randomUUID();
  const archive = join(deps.tmpdir, `${spec.name}-${id}.download`);
  const staging = join(toolsDir, `.staging-${spec.name}-${id}`);
  try {
    log.info({ url: spec.url }, "downloading tool");
    await download(spec, archive, deps);
    log.info("checksum verified, unpacking");
    await mkdir(staging);
    await deps.extract(archive, staging);
    const unpacked = join(staging, spec.archiveRoot);
    for (const path of spec.requiredPaths(deps.arch)) {
      if (!(await exists(join(unpacked, path)))) {
        throw new InstallError(`${spec.name} archive is missing ${path}`);
      }
    }
    await writeFile(
      join(unpacked, MARKER_FILE),
      `${JSON.stringify({ version: spec.version, sha256: spec.sha256 })}\n`,
    );
    // A concurrent container may have finished first; replace a partial copy.
    await rm(installDir, { recursive: true, force: true });
    await rename(unpacked, installDir);
    await pruneOldVersions(toolsDir, spec, installDir);
    log.info({ path: installDir }, "tool installed");
    return spec.env(installDir);
  } finally {
    await rm(archive, { force: true });
    await rm(staging, { recursive: true, force: true });
  }
}

// Installs every requested tool and returns the combined environment. A tool
// whose override variable is already set is left to the user's own install.
export async function ensureTools(
  specs: ToolSpec[],
  toolsDir: string,
  env: Record<string, string | undefined>,
  deps: InstallDeps,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const spec of specs) {
    const preset = env[spec.userOverride];
    if (preset !== undefined && preset !== "") {
      deps.logger.info(
        { tool: spec.name, [spec.userOverride]: preset },
        "using the installation you provided",
      );
      continue;
    }
    Object.assign(result, await ensureTool(spec, toolsDir, deps));
  }
  return result;
}

// Shell-safe KEY='value' lines for the entrypoint to source.
export function formatEnvFile(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}='${value.replaceAll("'", "'\\''")}'\n`)
    .join("");
}
