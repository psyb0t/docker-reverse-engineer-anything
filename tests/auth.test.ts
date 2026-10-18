import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTokenCheck } from "../src/auth.ts";

describe("createTokenCheck", () => {
  const check = createTokenCheck("a".repeat(40));

  it("accepts the exact bearer token", () => {
    assert.equal(check(`Bearer ${"a".repeat(40)}`), true);
  });

  it("rejects a missing, malformed or wrong header", () => {
    assert.equal(check(undefined), false);
    assert.equal(check(""), false);
    assert.equal(check("a".repeat(40)), false);
    assert.equal(check(`Basic ${"a".repeat(40)}`), false);
    assert.equal(check(`Bearer ${"a".repeat(39)}`), false);
    assert.equal(check(`Bearer ${"b".repeat(40)}`), false);
  });
});
