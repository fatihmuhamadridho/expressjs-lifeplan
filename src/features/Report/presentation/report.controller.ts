import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../common/middlewares/auth.middleware.js';
import { fail } from '../../../common/utils/api.js';
import type { ReportRepository } from '../application/report.repository';

export class ReportController {
  constructor(private readonly reportRepository: ReportRepository) {}

  async handleOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.json({ data: await this.reportRepository.getOverview(req.userId) });
  }

  async handleWeekly(req: AuthenticatedRequest, res: Response): Promise<void> {
    const year = Number(req.query.year ?? new Date().getFullYear());
    if (!Number.isSafeInteger(year) || year < 1970 || year > 9999)
      fail(400, 'invalid_year', 'year must be a valid four-digit year.');
    res.json({ data: await this.reportRepository.getWeekly(req.userId, year) });
  }
}
