import type { Db, Document } from 'mongodb';
import type { Week } from '../application/plan.repository';

type WeekSchedule = Pick<Week, 'planId' | 'week' | 'start' | 'end'>;

export async function loadWeekSchedules(database: Db, userId: string) {
  const [plans, weeks] = await Promise.all([
    database.collection<Document & { _id: string; name: string }>('plans').find({ userId }).toArray(),
    database
      .collection<Document & WeekSchedule>('weeks')
      .find({ userId, planId: { $type: 'string' } })
      .toArray(),
  ]);
  const names = new Map(plans.map((plan) => [plan._id, plan.name]));
  const schedules = new Map<string, Map<string, WeekSchedule>>();
  for (const week of weeks) {
    const name = names.get(week.planId);
    if (!name) continue;
    if (!schedules.has(name)) schedules.set(name, new Map());
    schedules.get(name)!.set(week.week, week);
  }
  return schedules;
}
