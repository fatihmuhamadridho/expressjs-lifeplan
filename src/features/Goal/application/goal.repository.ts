export type GoalInput = { title: string; description: string; progress: number; color: string };
export type Goal = GoalInput & { id: string; archived: boolean; createdAt: Date; updatedAt: Date };
export type GoalUpdateInput = Partial<GoalInput> & { archived?: boolean };
export type MilestoneInput = {
  title: string;
  timeline: string;
  progress: number;
  startDate?: string;
  endDate?: string;
};
export type Milestone = MilestoneInput & { id: string; createdAt: Date; updatedAt: Date };
export type GoalList = { data: Goal[]; meta: { page: number; limit: number; totalItems: number; totalPages: number } };

export abstract class GoalRepository {
  abstract list(userId: string, page: number, limit: number, archived?: boolean): Promise<GoalList>;
  abstract findById(userId: string, id: string): Promise<Goal | null>;
  abstract create(userId: string, input: GoalInput): Promise<Goal>;
  abstract update(userId: string, id: string, input: GoalUpdateInput): Promise<Goal | null>;
  abstract delete(userId: string, id: string): Promise<'deleted' | 'not_found' | 'has_plans' | 'not_archived'>;
  abstract listMilestones(userId: string, goalId: string): Promise<Milestone[] | null>;
  abstract createMilestone(userId: string, goalId: string, input: MilestoneInput): Promise<Milestone | null>;
  abstract updateMilestone(
    userId: string,
    goalId: string,
    id: string,
    input: Partial<MilestoneInput>
  ): Promise<Milestone | null>;
  abstract deleteMilestone(userId: string, goalId: string, id: string): Promise<boolean>;
}
