import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response } from 'express';
import {
  createAccessToken,
  ACCESS_TOKEN_TTL_SECONDS,
  type AuthenticatedRequest,
} from '../../../common/middlewares/auth.middleware.js';
import { fail, objectBody, stringField } from '../../../common/utils/api.js';
import type { Account, AuthRepository } from '../application/auth.repository';

const scrypt = promisify(scryptCallback);

async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || password.length > 256)
    fail(400, 'invalid_password', 'Password must contain 8 to 256 characters.');
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicAccount(account: Account) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    motto: account.motto,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export class AuthController {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtSecret: string
  ) {}

  async handleRegister(req: Request, res: Response): Promise<void> {
    const body = objectBody(req.body);
    const name = stringField(body, 'name', { required: true, max: 120 }) as string;
    const email = (stringField(body, 'email', { required: true, max: 254 }) as string).toLowerCase();
    const password = stringField(body, 'password', { required: true, max: 256 }) as string;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'invalid_email', 'email must be a valid email address.');
    const account = await this.authRepository.create({ name, email, passwordHash: await hashPassword(password) });
    res.status(201).json({
      data: publicAccount(account),
      token: createAccessToken(account.id, this.jwtSecret),
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  async handleLogin(req: Request, res: Response): Promise<void> {
    const body = objectBody(req.body);
    const email = (stringField(body, 'email', { required: true, max: 254 }) as string).toLowerCase();
    const password = stringField(body, 'password', { required: true, max: 256 }) as string;
    const account = await this.authRepository.findByEmail(email);
    if (!account || !(await verifyPassword(password, account.passwordHash)))
      fail(401, 'invalid_credentials', 'Email or password is incorrect.');
    res.json({
      data: publicAccount(account),
      token: createAccessToken(account.id, this.jwtSecret),
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  async handleGetProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    const account = await this.authRepository.findById(req.userId);
    if (!account) fail(401, 'unauthorized', 'The account for this token no longer exists.');
    res.json({ data: publicAccount(account) });
  }

  async handleUpdateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    const body = objectBody(req.body);
    const changes: { name?: string; email?: string; motto?: string } = {};
    if (body.name !== undefined) changes.name = stringField(body, 'name', { required: true, max: 120 }) as string;
    if (body.email !== undefined) {
      const email = (stringField(body, 'email', { required: true, max: 254 }) as string).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'invalid_email', 'email must be a valid email address.');
      changes.email = email;
    }
    if (body.motto !== undefined) changes.motto = stringField(body, 'motto', { max: 1000 }) as string;
    if (Object.keys(changes).length === 0) fail(400, 'empty_patch', 'Provide at least one profile field to update.');
    const account = await this.authRepository.updateProfile(req.userId, changes);
    if (!account) fail(404, 'not_found', 'User was not found.');
    res.json({ data: publicAccount(account) });
  }

  async handleChangePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    const body = objectBody(req.body);
    const currentPassword = stringField(body, 'currentPassword', { required: true, max: 256 }) as string;
    const newPassword = stringField(body, 'newPassword', { required: true, max: 256 }) as string;
    const account = await this.authRepository.findById(req.userId);
    if (!account || !(await verifyPassword(currentPassword, account.passwordHash)))
      fail(400, 'current_password_invalid', 'Current password is incorrect.');
    if (newPassword === currentPassword) fail(400, 'password_unchanged', 'Choose a different password.');
    await this.authRepository.updatePassword(req.userId, await hashPassword(newPassword));
    res.status(204).end();
  }
}
