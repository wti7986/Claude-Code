import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Requires `Authorization: Bearer <APP_SHARED_TOKEN>`. This is a shared
 * secret between our own extension and our own backend - not the TypeSafe
 * key. Its purpose is to keep the deployed URL from being usable by anyone
 * who finds it, not to authenticate individual employees.
 */
export function requireSharedToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.APP_SHARED_TOKEN;
  if (!expected) {
    // Fail closed: an unset token on a public deployment would otherwise
    // accept every request.
    res.status(500).json({ error: "server misconfigured: APP_SHARED_TOKEN not set" });
    return;
  }

  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token || !safeEqual(token, expected)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  next();
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
