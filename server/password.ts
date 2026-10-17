import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { text, fail } from "./errors.ts";
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, parameters, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export function validPassword(value: unknown): string {
  const password = text(value, "密码", 128, false);
  if (password.length < 12)
    fail(400, "weak_password", "密码至少需要 12 个字符。");
  return password;
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, cost, salt, key] = stored.split("$");
  if (
    algorithm !== "scrypt" ||
    cost !== "32768" ||
    !salt ||
    !key ||
    !/^[\da-f]{128}$/.test(key)
  )
    return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(key, "hex"));
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
