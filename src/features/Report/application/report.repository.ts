export type OverviewReport = {
  tasks: { total: number; completed: number; failed: number; active: number };
  plans: { total: number };
  goals: { total: number; averageProgress: number };
};

export type WeeklyReport = {
  week: string;
  start: string;
  end: string;
  month: number;
  successRate: number | null;
  failedRate: number | null;
  successCount: number;
  failedCount: number;
}[];

export abstract class ReportRepository {
  abstract getOverview(userId: string): Promise<OverviewReport>;
  abstract getWeekly(userId: string, year: number): Promise<WeeklyReport>;
}
