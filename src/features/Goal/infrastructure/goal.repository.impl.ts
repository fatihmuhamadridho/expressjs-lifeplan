import type { Collection, Db, Document } from 'mongodb';
import { ApiError } from '@common/utils/api';
import { loadPlanProgress } from '@features/Plan/infrastructure/plan-progress';
import { calculateGoalProgress } from '../application/goal-progress';
import {
  GoalRepository,
  type Goal,
  type GoalInput,
  type GoalList,
  type GoalUpdateInput,
  type Milestone,
  type MilestoneInput,
} from '../application/goal.repository';

type GoalDocument = Document & Omit<Goal, 'id'> & { _id: string; userId: string };
type MilestoneDocument = Document & Omit<Milestone, 'id'> & { _id: string; userId: string; goalId: string };

function mapGoal(goal: GoalDocument): Goal {
  const { _id, userId: _owner, ...data } = goal;
  return { ...data, id: _id };
}

function mapMilestone(milestone: MilestoneDocument): Milestone {
  const { _id, userId: _owner, goalId: _goal, ...data } = milestone;
  return { ...data, id: _id };
}

export class GoalRepositoryImpl extends GoalRepository {
  private readonly goals: Collection<GoalDocument>;
  private readonly milestones: Collection<MilestoneDocument>;
  private readonly plans: Collection<Document & { userId: string; goal: string }>;

  constructor(private readonly database: Db) {
    super();
    this.goals = database.collection<GoalDocument>('goals');
    this.milestones = database.collection<MilestoneDocument>('milestones');
    this.plans = database.collection('plans');
  }

  private async mapGoals(items: GoalDocument[]): Promise<Goal[]> {
    if (!items.length) return [];
    const plans = await loadPlanProgress(this.database, items[0].userId);
    return items.map((item) => ({ ...mapGoal(item), progress: calculateGoalProgress(item, plans) }));
  }

  async list(userId: string, page: number, limit: number, archived?: boolean): Promise<GoalList> {
    const filter = { userId, ...(archived !== undefined && { archived }) };
    const [items, totalItems] = await Promise.all([
      this.goals
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.goals.countDocuments(filter),
    ]);
    return {
      data: await this.mapGoals(items),
      meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) },
    };
  }

  async findById(userId: string, id: string): Promise<Goal | null> {
    const goal = await this.goals.findOne({ userId, _id: id });
    return goal ? (await this.mapGoals([goal]))[0] : null;
  }

  async create(userId: string, input: GoalInput): Promise<Goal> {
    const now = new Date();
    const goal: GoalDocument = {
      _id: crypto.randomUUID(),
      userId,
      ...input,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.goals.insertOne(goal);
    return (await this.mapGoals([goal]))[0];
  }

  async update(userId: string, id: string, input: GoalUpdateInput): Promise<Goal | null> {
    const existing = await this.goals.findOne({ userId, _id: id });
    if (!existing) return null;
    const goal = await this.goals.findOneAndUpdate(
      { userId, _id: id, updatedAt: existing.updatedAt },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (goal && input.title !== undefined && input.title !== existing.title)
      await this.plans.updateMany(
        { userId, goal: existing.title },
        { $set: { goal: input.title, updatedAt: new Date() } }
      );
    return goal ? (await this.mapGoals([goal]))[0] : null;
  }

  async delete(userId: string, id: string): Promise<'deleted' | 'not_found' | 'has_plans' | 'not_archived'> {
    const goal = await this.goals.findOne({ userId, _id: id });
    if (!goal) return 'not_found';
    if (!goal.archived) return 'not_archived';
    if (await this.plans.findOne({ userId, goal: goal.title })) return 'has_plans';
    const result = await this.goals.deleteOne({ userId, _id: id });
    if (!result.deletedCount) throw new ApiError(409, 'concurrent_update', 'Goal changed while it was being deleted.');
    await this.milestones.deleteMany({ userId, goalId: id });
    return 'deleted';
  }

  async listMilestones(userId: string, goalId: string): Promise<Milestone[] | null> {
    const goal = await this.goals.findOne({ userId, _id: goalId });
    if (!goal) return null;
    const items = await this.milestones.find({ userId, goalId }).sort({ createdAt: 1 }).toArray();
    const plans = await loadPlanProgress(this.database, userId);
    return items.map((item) => {
      const plan = plans.find((plan) => plan.goal === goal.title && plan.name === item.title);
      return { ...mapMilestone(item), progress: plan?.progress ?? item.progress };
    });
  }

  async createMilestone(userId: string, goalId: string, input: MilestoneInput): Promise<Milestone | null> {
    if (!(await this.goals.findOne({ userId, _id: goalId }))) return null;
    const now = new Date();
    const item: MilestoneDocument = {
      _id: crypto.randomUUID(),
      userId,
      goalId,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    await this.milestones.insertOne(item);
    return mapMilestone(item);
  }

  async updateMilestone(
    userId: string,
    goalId: string,
    id: string,
    input: Partial<MilestoneInput>
  ): Promise<Milestone | null> {
    const item = await this.milestones.findOneAndUpdate(
      { userId, goalId, _id: id },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return item ? mapMilestone(item) : null;
  }

  async deleteMilestone(userId: string, goalId: string, id: string): Promise<boolean> {
    const result = await this.milestones.deleteOne({ userId, goalId, _id: id });
    return result.deletedCount > 0;
  }
}
