import type { Goal } from './goal.repository';
import type { Plan } from '../../Plan/application/plan.repository.js';

export function calculateGoalProgress(goal: Pick<Goal, 'title' | 'progress'>, plans: Plan[]): number {
  const linkedPlans = plans.filter((plan) => plan.goal === goal.title);
  return linkedPlans.length
    ? Math.round(linkedPlans.reduce((sum, plan) => sum + plan.progress, 0) / linkedPlans.length)
    : goal.progress;
}
