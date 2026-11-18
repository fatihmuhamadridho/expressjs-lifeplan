export type PlanInput = {
  name: string;
  goal: string;
  timeline: string;
  progress: number;
  weeks: number;
  tasks: number;
  focus: string;
  status: 'In Progress' | 'Completed' | 'On Hold' | 'Not Started';
};
export type Plan = PlanInput & { id: string; createdAt: Date; updatedAt: Date };
export type WeekInput = { week: string; start: string; end: string };
export type Week = WeekInput & { id: string; createdAt: Date; updatedAt: Date };
export type ResourceList<T> = {
  data: T[];
  meta: { page: number; limit: number; totalItems: number; totalPages: number };
};

export abstract class PlanRepository {
  abstract listPlans(userId: string, page: number, limit: number): Promise<ResourceList<Plan>>;
  abstract findPlan(userId: string, id: string): Promise<Plan | null>;
  abstract createPlan(userId: string, input: PlanInput): Promise<Plan>;
  abstract updatePlan(userId: string, id: string, input: Partial<PlanInput>): Promise<Plan | null>;
  abstract deletePlan(userId: string, id: string): Promise<'deleted' | 'not_found'>;
  abstract listWeeks(userId: string, page: number, limit: number): Promise<ResourceList<Week>>;
  abstract findWeek(userId: string, id: string): Promise<Week | null>;
  abstract createWeek(userId: string, input: WeekInput): Promise<Week>;
  abstract updateWeek(userId: string, id: string, input: Partial<WeekInput>): Promise<Week | null>;
  abstract deleteWeek(userId: string, id: string): Promise<boolean>;
}
