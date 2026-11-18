import type { Collection, Db } from 'mongodb';
import { AuthRepository, type Account } from '../application/auth.repository';

type AccountDocument = Omit<Account, 'id'> & { _id: string };

function mapAccount(account: AccountDocument): Account {
  const { _id, ...data } = account;
  return { id: _id, ...data };
}

export class AuthRepositoryImpl extends AuthRepository {
  private readonly users: Collection<AccountDocument>;

  constructor(database: Db) {
    super();
    this.users = database.collection<AccountDocument>('users');
  }

  async create(input: Pick<Account, 'name' | 'email' | 'passwordHash'>): Promise<Account> {
    const now = new Date();
    const account: AccountDocument = {
      _id: crypto.randomUUID(),
      ...input,
      motto: '',
      createdAt: now,
      updatedAt: now,
    };
    await this.users.insertOne(account);
    return mapAccount(account);
  }

  async findByEmail(email: string): Promise<Account | null> {
    const account = await this.users.findOne({ email });
    return account ? mapAccount(account) : null;
  }

  async findById(id: string): Promise<Account | null> {
    const account = await this.users.findOne({ _id: id });
    return account ? mapAccount(account) : null;
  }

  async updateProfile(
    id: string,
    changes: Partial<Pick<Account, 'name' | 'email' | 'motto'>>
  ): Promise<Account | null> {
    const account = await this.users.findOneAndUpdate(
      { _id: id },
      { $set: { ...changes, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return account ? mapAccount(account) : null;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.users.updateOne({ _id: id }, { $set: { passwordHash, updatedAt: new Date() } });
  }
}
