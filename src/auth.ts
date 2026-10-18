import { createHash, timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = "Bearer ";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

// Compares SHA-256 digests so the comparison takes the same time whatever the
// length or content of the presented token.
export function createTokenCheck(
  token: string,
): (authorization: string | undefined) => boolean {
  const expected = digest(token);
  return (authorization) => {
    if (authorization?.startsWith(BEARER_PREFIX) !== true) return false;
    return timingSafeEqual(
      digest(authorization.slice(BEARER_PREFIX.length)),
      expected,
    );
  };
}
