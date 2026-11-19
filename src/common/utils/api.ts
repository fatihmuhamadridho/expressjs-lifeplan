import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(400, 'invalid_body', 'A JSON object is required.');
  return value as Record<string, unknown>;
}

export function stringField(
  body: Record<string, unknown>,
  field: string,
  options: { required?: boolean; max?: number; nullable?: boolean } = {}
): string | null | undefined {
  const value = body[field];
  if (value === undefined && !options.required) return undefined;
  if (value === null && options.nullable) return null;
  if (typeof value !== 'string' || (options.required && !value.trim()) || value.length > (options.max ?? 500)) {
    fail(
      400,
      'invalid_field',
      `${field} must be a${options.required ? ' non-empty' : ''} string${options.nullable ? ' or null' : ''}.`
    );
  }
  return value.trim();
}

export function numberField(
  body: Record<string, unknown>,
  field: string,
  options: { required?: boolean; min?: number; max?: number } = {}
): number | undefined {
  const value = body[field];
  if (value === undefined && !options.required) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (options.min !== undefined && value < options.min) ||
    (options.max !== undefined && value > options.max)
  ) {
    fail(
      400,
      'invalid_field',
      `${field} must be a valid number${options.min !== undefined ? ` from ${options.min}` : ''}${options.max !== undefined ? ` to ${options.max}` : ''}.`
    );
  }
  return value;
}

export function dateField(value: string | null | undefined, field: string): void {
  if (value === null || value === undefined) return;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    fail(400, 'invalid_field', `${field} must use YYYY-MM-DD format.`);
  }
}

export function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => void handler(req, res).catch(next);
}

export function apiErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(error);
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
    if (
      'keyPattern' in error &&
      error.keyPattern &&
      typeof error.keyPattern === 'object' &&
      'planId' in error.keyPattern
    ) {
      res
        .status(409)
        .json({ error: { code: 'week_exists', message: 'This week number already exists in this plan.' } });
      return;
    }
    res.status(409).json({ error: { code: 'email_exists', message: 'An account with this email already exists.' } });
    return;
  }
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Request body contains invalid JSON.' } });
    return;
  }
  if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
    res.status(413).json({ error: { code: 'payload_too_large', message: 'Request body exceeds the 100 KB limit.' } });
    return;
  }
  res.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred.' } });
}
