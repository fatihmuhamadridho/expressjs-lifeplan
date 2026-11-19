import type { Db, Document } from 'mongodb';
import { ReportRepository, type OverviewReport, type WeeklyReport } from '../application/report.repository';
import { calculateTaskStatus, effectiveTaskDueDate } from '../../Task/application/task-status';
import type { TaskStatus } from '../../Task/application/task.repository';
import { loadWeekSchedules } from '../../Plan/infrastructure/week-schedules';
import { loadPlanProgress } from '../../Plan/infrastructure/plan-progress';
import { calculateGoalProgress } from '../../Goal/application/goal-progress';

type TaskData = Document & {
  userId: string;
  plan: string;
  due?: string | null;
  current: number;
  target: number;
  successThreshold: number;
  reachedAt: string | null;
  week?: string | null;
  createdAt?: Date | string;
  manualStatus?: TaskStatus | null;
  effectiveDue?: string | null;
};
type ProgressData = Document & { userId: string; title: string; progress: number };

function taskStatus(task: TaskData, now = Date.now()): 'completed' | 'failed' | 'active' {
  const status = calculateTaskStatus(task, now);
  if (status === 'Completed') return 'completed';
  if (status === 'Failed') return 'failed';
  return 'active';
}

export class ReportRepositoryImpl extends ReportRepository {
  constructor(private readonly database: Db) {
    super();
  }

  async getOverview(userId: string): Promise<OverviewReport> {
    const [tasks, plans, goals, schedules] = await Promise.all([
      this.database.collection<TaskData>('tasks').find({ userId }).toArray(),
      loadPlanProgress(this.database, userId),
      this.database
        .collection<ProgressData>('goals')
        .find({ userId }, { projection: { title: 1, progress: 1 } })
        .toArray(),
      loadWeekSchedules(this.database, userId),
    ]);
    const counts = tasks.reduce(
      (result, task) => {
        result[
          taskStatus({
            ...task,
            effectiveDue: effectiveTaskDueDate(
              task.due,
              task.week ? schedules.get(task.plan)?.get(task.week)?.end : undefined
            ),
          })
        ] += 1;
        return result;
      },
      { completed: 0, failed: 0, active: 0 }
    );
    return {
      tasks: { total: tasks.length, ...counts },
      plans: { total: plans.length },
      goals: {
        total: goals.length,
        averageProgress: goals.length
          ? goals.reduce((total, goal) => total + calculateGoalProgress(goal, plans), 0) / goals.length
          : 0,
      },
    };
  }

  async getWeekly(userId: string, year: number): Promise<WeeklyReport> {
    const [tasks, schedules] = await Promise.all([
      this.database.collection<TaskData>('tasks').find({ userId }).toArray(),
      loadWeekSchedules(this.database, userId),
    ]);
    const datedTasks = tasks.map((task) => {
      const schedule = task.week ? schedules.get(task.plan)?.get(task.week) : undefined;
      const date = schedule?.start ?? task.due ?? task.createdAt ?? task.reachedAt;
      return {
        task: { ...task, effectiveDue: effectiveTaskDueDate(task.due, schedule?.end) },
        time: date instanceof Date ? date.getTime() : new Date(date ?? NaN).getTime(),
      };
    });
    const firstThursday = new Date(Date.UTC(year, 0, 4));
    const firstMonday = new Date(firstThursday);
    firstMonday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7));
    const weeks: WeeklyReport = [];
    let number = 1;
    for (const start = new Date(firstMonday); ; start.setUTCDate(start.getUTCDate() + 7)) {
      const thursday = new Date(start);
      thursday.setUTCDate(start.getUTCDate() + 3);
      if (thursday.getUTCFullYear() > year) break;
      if (thursday.getUTCFullYear() === year) {
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 7);
        const items = datedTasks
          .filter(({ time }) => time >= start.getTime() && time < end.getTime())
          .map(({ task }) => task);
        const completed = items.filter((task) => taskStatus(task) === 'completed').length;
        const failed = items.filter((task) => taskStatus(task) === 'failed').length;
        weeks.push({
          week: `Week ${number}`,
          start: start.toISOString().slice(0, 10),
          end: new Date(end.getTime() - 1).toISOString().slice(0, 10),
          month: thursday.getUTCMonth() + 1,
          successRate: items.length ? (completed / items.length) * 100 : null,
          failedRate: items.length ? (failed / items.length) * 100 : null,
          successCount: completed,
          failedCount: failed,
        });
      }
      number += 1;
    }
    return weeks;
  }
}
