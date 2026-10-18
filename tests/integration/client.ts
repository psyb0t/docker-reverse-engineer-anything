// Drives the bridge in the image under test like a real MCP client: lists
// REA's tools and runs the Android analysis tools against the pinned ApiDemos
// APK. Run by tests/integration/run.sh on the bridge container's network.
import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const URL_MCP = new URL("http://localhost:8080/mcp");
const APK = "/work/ApiDemos-debug.apk";
const APK_PACKAGE = "io.appium.android.apis";
const APK_CLASS = "io.appium.android.apis.ApiDemos";
// JADX starts a JVM and decompiles on first use; allow for slow CI runners.
const TOOL_TIMEOUT_MS = 300_000;
const ANDROID_TOOLS = [
  "inspect_android_package",
  "search_android_classes",
  "inspect_android_class",
  "inspect_android_method",
  "trace_android_references",
  "decode_android_resources",
  "inspect_apktool_client",
  "list_adb_devices",
];

function log(msg: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(
    `${JSON.stringify({ level: "INFO", msg, ...fields })}\n`,
  );
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const started = Date.now();
  const result = await client.callTool(
    { name, arguments: args },
    { timeout: TOOL_TIMEOUT_MS },
  );
  const text = JSON.stringify(result);
  assert.notEqual(
    result.isError,
    true,
    `${name} returned an error: ${text.slice(0, 2000)}`,
  );
  log("tool call passed", { tool: name, ms: Date.now() - started });
  return text;
}

async function main(): Promise<void> {
  const token = process.env.REA_BRIDGE_TOKEN ?? "";
  assert.ok(token.length >= 32, "REA_BRIDGE_TOKEN is not set");

  const transport = new StreamableHTTPClientTransport(URL_MCP, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "rea-integration-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((tool) => tool.name));
    log("tools listed", { count: names.size });
    assert.ok(
      names.size > 100,
      `expected REA's full catalog, got ${String(names.size)} tools`,
    );
    for (const tool of ANDROID_TOOLS)
      assert.ok(names.has(tool), `missing tool ${tool}`);

    const apktool = await call(client, "inspect_apktool_client", {});
    assert.match(apktool, /3\.0\.3/, "Apktool 3.0.3 not detected");

    const pkg = await call(client, "inspect_android_package", { path: APK });
    assert.ok(
      pkg.includes(APK_PACKAGE),
      "package name missing from inspect_android_package",
    );

    const classes = await call(client, "search_android_classes", {
      path: APK,
      query: "ApiDemos",
    });
    assert.ok(
      classes.includes(APK_CLASS),
      "ApiDemos class missing from search_android_classes",
    );

    const method = await call(client, "inspect_android_method", {
      path: APK,
      class_name: APK_CLASS,
      method_name: "onCreate",
    });
    assert.ok(method.includes("onCreate"), "decompiled onCreate missing");

    const resources = await call(client, "decode_android_resources", {
      path: APK,
    });
    assert.ok(
      resources.includes(APK_PACKAGE),
      "package name missing from decoded resources",
    );
  } finally {
    await transport.terminateSession();
    await client.close();
  }
}

await main();
