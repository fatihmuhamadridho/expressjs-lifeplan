import { MongoClient } from 'mongodb';
import type { Db } from 'mongodb';

let client: MongoClient | undefined;

export async function connectMongoDB(): Promise<Db> {
  const uri = process.env.MONGODB_URL;
  const databaseName = process.env.MONGODB_DATABASE;

  if (!uri || !databaseName) {
    throw new Error('MONGODB_URL and MONGODB_DATABASE must be configured');
  }

  client ??= new MongoClient(uri);
  await client.connect();

  const database = client.db(databaseName);
  return database;
}

export async function ensureDatabaseIndexes(database: Db): Promise<void> {
  await Promise.all([
    database.collection('users').createIndex({ email: 1 }, { unique: true }),
    ...(['tasks', 'goals', 'plans', 'weeks', 'milestones'] as const).map((name) =>
      database.collection(name).createIndex({ userId: 1, createdAt: -1 })
    ),
    database.collection('visions').createIndex({ userId: 1 }, { unique: true }),
  ]);
}

export async function closeMongoDB(): Promise<void> {
  const currentClient = client;
  client = undefined;
  await currentClient?.close();
}
