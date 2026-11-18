import type { Db, Document } from 'mongodb';
import { ReportRepository, type OverviewReport, type WeeklyReport } from '../application/report.repository';

type TaskData = Document & {
  userId: string;
  due?: string | null;
  current: number;
  target: number;
  successThreshold: number;
  reachedAt: string | null;
  week?: string | null;
};
type ProgressData = Document & { userId: string; progress: number };

function taskStatus(task: TaskData, now = Date.now()): 'completed' | 'failed' | 'active' {
  const due = typeof task.due === 'string' ? new Date(`${task.due}T23:59:59.999`).getTime() : Infinity;
  const reached = task.target > 0 && (task.current / task.target) * 100 >= task.successThreshold;
  const reachedAt = typeof task.reachedAt === 'string' ? new Date(task.reachedAt).getTime() : Infinity;
  if (reached && reachedAt <= due) return 'completed';
  if (now > due) return 'failed';
  return 'active';
}

export class ReportRepositoryImpl extends ReportRepository {
  constructor(private readonly database: Db) {
    super();
  }

  async getOverview(userId: string): Promise<OverviewReport> {
    const [tasks, planCount, goals] = await Promise.all([
      this.database.collection<TaskData>('tasks').find({ userId }).toArray(),
      this.database.collection('plans').countDocuments({ userId }),
      this.database
        .collection<ProgressData>('goals')
        .find({ userId }, { projection: { progress: 1 } })
        .toArray(),
    ]);
    const counts = tasks.reduce(
      (result, task) => {
        result[taskStatus(task)] += 1;
        return result;
      },
      { completed: 0, failed: 0, active: 0 }
    );
    return {
      tasks: { total: tasks.length, ...counts },
      plans: { total: planCount },
      goals: {
        total: goals.length,
        averageProgress: goals.length
          ? goals.reduce((total, goal) => total + Number(goal.progress || 0), 0) / goals.length
          : 0,
      },
    };
  }

  async getWeekly(userId: string, year: number): Promise<WeeklyReport> {
    const tasks = await this.database.collection<TaskData>('tasks').find({ userId }).toArray();
    const firstThursday = new Date(year, 0, 4);
    const firstMonday = new Date(firstThursday);
    firstMonday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7));
    const weeks: WeeklyReport = [];
    let number = 1;
    for (const start = new Date(firstMonday); ; start.setDate(start.getDate() + 7)) {
      const thursday = new Date(start);
      thursday.setDate(start.getDate() + 3);
      if (thursday.getFullYear() > year) break;
      if (thursday.getFullYear() === year) {
        const items = tasks.filter((task) => task.week === `Week ${number}`);
        const completed = items.filter((task) => taskStatus(task) === 'completed').length;
        const failed = items.filter((task) => taskStatus(task) === 'failed').length;
        weeks.push({
          week: `Week ${number}`,
          month: thursday.getMonth(),
          successRate: items.length ? (completed / items.length) * 100 : null,
          failedRate: items.length ? (failed / items.length) * 100 : null,
        });
      }
      number += 1;
    }
    return weeks;
  }
}
