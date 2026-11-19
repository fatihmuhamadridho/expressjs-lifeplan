import type { Collection, Db, Document } from 'mongodb';
import { ApiError } from '@common/utils/api';
import { loadPlanProgress } from './plan-progress';
import type { TaskInput } from '@features/Task/application/task.repository';
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
type TaskReference = Document & TaskInput & { _id: string; userId: string };

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

  constructor(private readonly database: Db) {
    super();
    this.plans = database.collection<PlanDocument>('plans');
    this.weeks = database.collection<WeekDocument>('weeks');
    this.tasks = database.collection<TaskReference>('tasks');
    this.goals = database.collection<GoalReference>('goals');
    this.milestones = database.collection<MilestoneReference>('milestones');
  }

  private async mapPlans(items: PlanDocument[]): Promise<Plan[]> {
    if (!items.length) return [];
    const progress = new Map((await loadPlanProgress(this.database, items[0].userId)).map((plan) => [plan.id, plan]));
    return items.map((item) => progress.get(item._id) ?? mapPlan(item));
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
    return {
      data: await this.mapPlans(items),
      meta: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findPlan(userId: string, id: string): Promise<Plan | null> {
    const item = await this.plans.findOne({ userId, _id: id });
    return item ? (await this.mapPlans([item]))[0] : null;
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
    return (await this.mapPlans([item]))[0];
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
    return item ? (await this.mapPlans([item]))[0] : null;
  }

  async deletePlan(userId: string, id: string): Promise<'deleted' | 'not_found'> {
    const plan = await this.plans.findOne({ userId, _id: id });
    if (!plan) return 'not_found';
    const goal = await this.goals.findOne({ userId, title: plan.goal });
    await this.tasks.updateMany({ userId, plan: plan.name }, { $set: { plan: '', week: null, updatedAt: new Date() } });
    await this.weeks.deleteMany({ userId, planId: id });
    if (goal) await this.milestones.deleteMany({ userId, goalId: goal._id, title: plan.name });
    const result = await this.plans.deleteOne({ userId, _id: id, updatedAt: plan.updatedAt });
    return result.deletedCount > 0 ? 'deleted' : 'not_found';
  }

  async listWeeks(userId: string, page: number, limit: number, planId?: string): Promise<ResourceList<Week>> {
    const query = { userId, ...(planId ? { planId } : {}) };
    const [items, total] = await Promise.all([
      this.weeks
        .find(query)
        .sort({ start: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.weeks.countDocuments(query),
    ]);
    return pageResult(items, total, page, limit, mapWeek);
  }

  async findWeek(userId: string, id: string): Promise<Week | null> {
    const item = await this.weeks.findOne({ userId, _id: id });
    return item ? mapWeek(item) : null;
  }

  async createWeek(userId: string, input: WeekInput): Promise<Week> {
    if (!(await this.plans.findOne({ userId, _id: input.planId })))
      throw new ApiError(404, 'plan_not_found', 'The selected plan was not found.');
    if (await this.weeks.findOne({ userId, planId: input.planId, week: input.week }))
      throw new ApiError(409, 'week_exists', 'This week number already exists in this plan.');
    const now = new Date();
    const item: WeekDocument = { _id: crypto.randomUUID(), userId, ...input, createdAt: now, updatedAt: now };
    await this.weeks.insertOne(item);
    return mapWeek(item);
  }

  async updateWeek(userId: string, id: string, input: Partial<WeekInput>): Promise<Week | null> {
    const existing = await this.weeks.findOne({ userId, _id: id });
    if (!existing) return null;
    if (input.planId !== undefined && input.planId !== existing.planId)
      throw new ApiError(400, 'invalid_plan', 'A week cannot be moved to a different plan.');
    if (
      input.week &&
      input.week !== existing.week &&
      (await this.weeks.findOne({ userId, planId: existing.planId, week: input.week }))
    )
      throw new ApiError(409, 'week_exists', 'This week number already exists in this plan.');
    const plan = await this.plans.findOne({ userId, _id: existing.planId });
    const item = await this.weeks.findOneAndUpdate(
      { userId, _id: id, updatedAt: existing.updatedAt },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (item && plan && existing.week !== item.week)
      await this.tasks.updateMany(
        { userId, plan: plan.name, week: existing.week },
        { $set: { week: item.week, updatedAt: new Date() } }
      );
    return item ? mapWeek(item) : null;
  }

  async duplicateWeek(userId: string, id: string, input: WeekInput): Promise<Week | null> {
    return this.database.client.withSession((session) =>
      session.withTransaction(async () => {
        const source = await this.weeks.findOne({ userId, _id: id }, { session });
        if (!source) return null;
        if (input.planId !== source.planId)
          throw new ApiError(400, 'invalid_plan', 'A duplicate week must belong to the same plan.');
        const plan = await this.plans.findOne({ userId, _id: source.planId }, { session });
        if (!plan) throw new ApiError(404, 'plan_not_found', 'The selected plan was not found.');
        if (await this.weeks.findOne({ userId, planId: source.planId, week: input.week }, { session }))
          throw new ApiError(409, 'week_exists', 'This week number already exists in this plan.');
        const tasks = await this.tasks
          .find({ userId, plan: plan.name, week: { $in: [source.week, source._id] } }, { session })
          .sort({ createdAt: 1, _id: 1 })
          .toArray();
        const now = new Date();
        const copy: WeekDocument = { _id: crypto.randomUUID(), userId, ...input, createdAt: now, updatedAt: now };
        const offset = Date.parse(input.start) - Date.parse(source.start);
        await this.weeks.insertOne(copy, { session });
        if (tasks.length)
          await this.tasks.insertMany(
            tasks.map((task) => ({
              _id: crypto.randomUUID(),
              userId,
              title: task.title,
              plan: plan.name,
              week: copy.week,
              priority: task.priority,
              target: task.target,
              successThreshold: task.successThreshold,
              current: 0,
              manualStatus: null,
              reachedAt: null,
              due: task.due ? new Date(Date.parse(task.due) + offset).toISOString().slice(0, 10) : null,
              createdAt: now,
              updatedAt: now,
            })),
            { session }
          );
        return mapWeek(copy);
      })
    );
  }

  async deleteWeek(userId: string, id: string): Promise<boolean> {
    const week = await this.weeks.findOne({ userId, _id: id });
    if (!week) return false;
    const plan = await this.plans.findOne({ userId, _id: week.planId });
    if (plan)
      await this.tasks.updateMany(
        { userId, plan: plan.name, week: { $in: [week._id, week.week] } },
        { $set: { week: null, updatedAt: new Date() } }
      );
    const result = await this.weeks.deleteOne({ userId, _id: id, updatedAt: week.updatedAt });
    return result.deletedCount > 0;
  }
}
