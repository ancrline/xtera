import crypto from "crypto";

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, Buffer.from(salt, "hex"), ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("hex");
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [algo, iterations, saltHex, hashHex] = String(storedHash).split("$");
  if (algo !== "pbkdf2" || !iterations || !saltHex || !hashHex) {
    return false;
  }
  const derived = crypto
    .pbkdf2Sync(
      password,
      Buffer.from(saltHex, "hex"),
      Number(iterations),
      Buffer.from(hashHex, "hex").length,
      DIGEST
    )
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hashHex, "hex"));
}
