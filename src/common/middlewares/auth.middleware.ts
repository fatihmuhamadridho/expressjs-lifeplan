import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api';

export type AuthenticatedRequest = Request & { userId: string };

function verifyToken(token: string, secret: string): string | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: unknown; exp?: unknown };
    return typeof claims.sub === 'string' && typeof claims.exp === 'number' && claims.exp > Date.now() / 1000
      ? claims.sub
      : null;
  } catch {
    return null;
  }
}

export function createAuthMiddleware(secret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const match = req.header('authorization')?.match(/^Bearer\s+(.+)$/i);
    const userId = match ? verifyToken(match[1], secret) : null;
    if (!userId) {
      next(new ApiError(401, 'unauthorized', 'A valid bearer token is required.'));
      return;
    }
    (req as AuthenticatedRequest).userId = userId;
    next();
  };
}

export function createAccessToken(userId: string, secret: string, expiresIn = 60 * 60 * 24 * 7): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + expiresIn })).toString(
    'base64url'
  );
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
