import type { Db, Document } from 'mongodb';
import type { Plan } from '../application/plan.repository';
import type { Task } from '../../Task/application/task.repository.js';
import { calculateTaskStatus, effectiveTaskDueDate } from '../../Task/application/task-status.js';
import { loadWeekSchedules } from './week-schedules';

export async function loadPlanProgress(database: Db, userId: string): Promise<Plan[]> {
  const [plans, tasks, schedules] = await Promise.all([
    database
      .collection<Document & Omit<Plan, 'id'> & { _id: string; userId: string }>('plans')
      .find({ userId })
      .toArray(),
    database.collection<Document & Task & { userId: string }>('tasks').find({ userId }).toArray(),
    loadWeekSchedules(database, userId),
  ]);
  const now = Date.now();
  return plans.map(({ _id, userId: _owner, ...plan }) => {
    const linkedTasks = tasks.filter((task) => task.plan === plan.name);
    const amount = linkedTasks.reduce((sum, task) => {
      const week = task.week ? schedules.get(plan.name)?.get(task.week) : undefined;
      const status = calculateTaskStatus({ ...task, effectiveDue: effectiveTaskDueDate(task.due, week?.end) }, now);
      const progress =
        status === 'Completed'
          ? 100
          : task.target > 0
            ? Math.min(100, Math.max(0, (task.current / task.target) * 100))
            : 0;
      return sum + progress;
    }, 0);
    const progress = linkedTasks.length ? Math.round(amount / linkedTasks.length) : 0;
    const status =
      plan.status === 'On Hold' || !linkedTasks.length
        ? plan.status
        : progress === 100
          ? 'Completed'
          : progress > 0
            ? 'In Progress'
            : plan.status === 'Completed'
              ? 'Not Started'
              : plan.status;
    return {
      ...plan,
      id: _id,
      progress,
      status,
      tasks: linkedTasks.length,
      weeks: schedules.get(plan.name)?.size ?? 0,
    };
  });
}
