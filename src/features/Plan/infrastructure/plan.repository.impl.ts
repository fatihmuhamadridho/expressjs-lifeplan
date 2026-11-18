import type { Collection, Db, Document } from 'mongodb';
import { ApiError } from '@common/utils/api';
import {
  PlanRepository,
  type Plan,
  type PlanInput,
  type ResourceList,
  type Week,
  type WeekInput,
} from '../application/plan.repository';

type PlanDocument = Document & Omit<Plan, 'id'> & { _id: string; userId: string };
type WeekDocument = Document & Omit<Week, 'id'> & { _id: string; userId: string };
type GoalReference = Document & { _id: string; userId: string; title: string; archived?: boolean };
type MilestoneReference = Document & { _id: string; userId: string; goalId: string; title: string };
type TaskReference = Document & { userId: string; plan: string };

function mapPlan(item: PlanDocument): Plan {
  const { _id, userId: _owner, ...data } = item;
  return { ...data, id: _id };
}

function mapWeek(item: WeekDocument): Week {
  const { _id, userId: _owner, ...data } = item;
  return { ...data, id: _id };
}

function pageResult<T, D extends Document>(
  items: D[],
  totalItems: number,
  page: number,
  limit: number,
  map: (item: D) => T
): ResourceList<T> {
  return {
    data: items.map(map),
    meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) },
  };
}

export class PlanRepositoryImpl extends PlanRepository {
  private readonly plans: Collection<PlanDocument>;
  private readonly weeks: Collection<WeekDocument>;
  private readonly tasks: Collection<TaskReference>;
  private readonly goals: Collection<GoalReference>;
  private readonly milestones: Collection<MilestoneReference>;

  constructor(database: Db) {
    super();
    this.plans = database.collection<PlanDocument>('plans');
    this.weeks = database.collection<WeekDocument>('weeks');
    this.tasks = database.collection<TaskReference>('tasks');
    this.goals = database.collection<GoalReference>('goals');
    this.milestones = database.collection<MilestoneReference>('milestones');
  }

  async listPlans(userId: string, page: number, limit: number): Promise<ResourceList<Plan>> {
    const [items, total] = await Promise.all([
      this.plans
        .find({ userId })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.plans.countDocuments({ userId }),
    ]);
    return pageResult(items, total, page, limit, mapPlan);
  }

  async findPlan(userId: string, id: string): Promise<Plan | null> {
    const item = await this.plans.findOne({ userId, _id: id });
    return item ? mapPlan(item) : null;
  }

  async createPlan(userId: string, input: PlanInput): Promise<Plan> {
    const goal = await this.goals.findOne({ userId, title: input.goal, archived: { $ne: true } });
    if (!goal) throw new ApiError(404, 'goal_not_found', 'An active goal with that title was not found.');
    const now = new Date();
    const item: PlanDocument = { _id: crypto.randomUUID(), userId, ...input, createdAt: now, updatedAt: now };
    await this.plans.insertOne(item);
    const [startDate, endDate] = input.timeline.split('–').map((part) => part.trim());
    await this.milestones.insertOne({
      _id: crypto.randomUUID(),
      userId,
      goalId: goal._id,
      title: input.name,
      timeline: input.timeline,
      progress: input.progress,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      createdAt: now,
      updatedAt: now,
    });
    return mapPlan(item);
  }

  async updatePlan(userId: string, id: string, input: Partial<PlanInput>): Promise<Plan | null> {
    const existing = await this.plans.findOne({ userId, _id: id });
    if (!existing) return null;
    const next = { ...existing, ...input };
    let oldGoal: GoalReference | null = null;
    let nextGoal: GoalReference | null = null;
    if (input.goal !== undefined && input.goal !== existing.goal) {
      oldGoal = await this.goals.findOne({ userId, title: existing.goal });
      nextGoal = await this.goals.findOne({ userId, title: input.goal, archived: { $ne: true } });
      if (!nextGoal) throw new ApiError(404, 'goal_not_found', 'An active goal with that title was not found.');
    }
    oldGoal ??= await this.goals.findOne({ userId, title: existing.goal });
    const item = await this.plans.findOneAndUpdate(
      { userId, _id: id, updatedAt: existing.updatedAt },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (
      item &&
      (existing.name !== next.name ||
        existing.timeline !== next.timeline ||
        existing.progress !== next.progress ||
        nextGoal)
    ) {
      const [startDate, endDate] = next.timeline.split('–').map((part) => part.trim());
      if (oldGoal) {
        await this.milestones.updateMany(
          { userId, goalId: oldGoal._id, title: existing.name },
          {
            $set: {
              ...(nextGoal ? { goalId: nextGoal._id } : {}),
              title: next.name,
              timeline: next.timeline,
              progress: next.progress,
              ...(startDate ? { startDate } : {}),
              ...(endDate ? { endDate } : {}),
              updatedAt: new Date(),
            },
          }
        );
      }
    }
    if (item && existing.name !== next.name)
      await this.tasks.updateMany(
        { userId, plan: existing.name },
        { $set: { plan: next.name, updatedAt: new Date() } }
      );
    return item ? mapPlan(item) : null;
  }

  async deletePlan(userId: string, id: string): Promise<'deleted' | 'not_found'> {
    const plan = await this.plans.findOne({ userId, _id: id });
    if (!plan) return 'not_found';
    const goal = await this.goals.findOne({ userId, title: plan.goal });
    await this.tasks.updateMany({ userId, plan: plan.name }, { $set: { plan: '', updatedAt: new Date() } });
    if (goal) await this.milestones.deleteMany({ userId, goalId: goal._id, title: plan.name });
    const result = await this.plans.deleteOne({ userId, _id: id, updatedAt: plan.updatedAt });
    return result.deletedCount > 0 ? 'deleted' : 'not_found';
  }

  async listWeeks(userId: string, page: number, limit: number): Promise<ResourceList<Week>> {
    const [items, total] = await Promise.all([
      this.weeks
        .find({ userId })
        .sort({ start: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.weeks.countDocuments({ userId }),
    ]);
    return pageResult(items, total, page, limit, mapWeek);
  }

  async findWeek(userId: string, id: string): Promise<Week | null> {
    const item = await this.weeks.findOne({ userId, _id: id });
    return item ? mapWeek(item) : null;
  }

  async createWeek(userId: string, input: WeekInput): Promise<Week> {
    const now = new Date();
    const item: WeekDocument = { _id: crypto.randomUUID(), userId, ...input, createdAt: now, updatedAt: now };
    await this.weeks.insertOne(item);
    return mapWeek(item);
  }

  async updateWeek(userId: string, id: string, input: Partial<WeekInput>): Promise<Week | null> {
    const existing = await this.weeks.findOne({ userId, _id: id });
    if (!existing) return null;
    const item = await this.weeks.findOneAndUpdate(
      { userId, _id: id, updatedAt: existing.updatedAt },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (item && existing.week !== item.week)
      await this.tasks.updateMany(
        { userId, week: existing.week },
        { $set: { week: item.week, updatedAt: new Date() } }
      );
    return item ? mapWeek(item) : null;
  }

  async deleteWeek(userId: string, id: string): Promise<boolean> {
    const week = await this.weeks.findOne({ userId, _id: id });
    if (!week) return false;
    await this.tasks.updateMany(
      { userId, week: { $in: [week._id, week.week] } },
      { $set: { week: null, updatedAt: new Date() } }
    );
    const result = await this.weeks.deleteOne({ userId, _id: id, updatedAt: week.updatedAt });
    return result.deletedCount > 0;
  }
}
