import type { Collection, Db, Document } from 'mongodb';
import { ApiError } from '@common/utils/api';
import { TaskRepository, type Task, type TaskInput, type TaskList } from '../application/task.repository';

type TaskDocument = Document & Omit<Task, 'id'> & { _id: string; userId: string };

function mapTask(task: TaskDocument): Task {
  const { _id, userId: _owner, ...data } = task;
  return { ...data, id: _id };
}

export class TaskRepositoryImpl extends TaskRepository {
  private readonly tasks: Collection<TaskDocument>;

  constructor(database: Db) {
    super();
    this.tasks = database.collection<TaskDocument>('tasks');
  }

  async list(
    userId: string,
    page: number,
    limit: number,
    filters: { plan?: string; week?: string } = {}
  ): Promise<TaskList> {
    const query = { userId, ...filters };
    const [items, totalItems] = await Promise.all([
      this.tasks
        .find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.tasks.countDocuments(query),
    ]);
    return {
      data: items.map(mapTask),
      meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) },
    };
  }

  async findById(userId: string, id: string): Promise<Task | null> {
    const task = await this.tasks.findOne({ userId, _id: id });
    return task ? mapTask(task) : null;
  }

  async create(userId: string, input: TaskInput): Promise<Task> {
    const now = new Date();
    const ratio = input.target > 0 ? (input.current / input.target) * 100 : 0;
    const task: TaskDocument = {
      _id: crypto.randomUUID(),
      userId,
      ...input,
      reachedAt: ratio >= input.successThreshold ? now.toISOString() : null,
      createdAt: now,
      updatedAt: now,
    };
    await this.tasks.insertOne(task);
    return mapTask(task);
  }

  async update(userId: string, id: string, input: Partial<TaskInput>): Promise<Task | null> {
    const existing = await this.tasks.findOne({ userId, _id: id });
    if (!existing) return null;
    const next = { ...existing, ...input };
    const wasReached = existing.target > 0 && (existing.current / existing.target) * 100 >= existing.successThreshold;
    const isReached = next.target > 0 && (next.current / next.target) * 100 >= next.successThreshold;
    const reachedAt = isReached
      ? wasReached && existing.target === next.target && existing.successThreshold === next.successThreshold
        ? (existing.reachedAt ?? new Date().toISOString())
        : new Date().toISOString()
      : null;
    const updatedAt = new Date();
    const result = await this.tasks.findOneAndUpdate(
      { userId, _id: id, updatedAt: existing.updatedAt },
      { $set: { ...input, reachedAt, updatedAt } },
      { returnDocument: 'after' }
    );
    if (!result) {
      const current = await this.tasks.findOne({ userId, _id: id });
      if (current)
        throw new ApiError(
          409,
          'concurrent_update',
          'Task changed while this update was being saved. Reload and retry.'
        );
      return null;
    }
    return mapTask(result);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.tasks.deleteOne({ userId, _id: id });
    return result.deletedCount > 0;
  }
}
