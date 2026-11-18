export type Account = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  motto: string;
  createdAt: Date;
  updatedAt: Date;
};

export abstract class AuthRepository {
  abstract create(input: Pick<Account, 'name' | 'email' | 'passwordHash'>): Promise<Account>;
  abstract findByEmail(email: string): Promise<Account | null>;
  abstract findById(id: string): Promise<Account | null>;
  abstract updateProfile(
    id: string,
    changes: Partial<Pick<Account, 'name' | 'email' | 'motto'>>
  ): Promise<Account | null>;
  abstract updatePassword(id: string, passwordHash: string): Promise<void>;
}
