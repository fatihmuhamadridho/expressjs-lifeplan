import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../../common/middlewares/auth.middleware';
import { dateField, fail, numberField, objectBody, stringField } from '../../../common/utils/api';
import type { PlanInput, PlanRepository, WeekInput } from '../application/plan.repository';

function pagination(req: Request) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1)
    fail(400, 'invalid_pagination', 'page and limit must be positive integers.');
  return { page, limit: Math.min(limit, 100) };
}

function parsePlan(input: unknown, partial = false): Partial<PlanInput> {
  const body = objectBody(input);
  const result: Partial<PlanInput> = {};
  const has = (key: string) => !partial || body[key] !== undefined;
  for (const field of ['name', 'goal', 'timeline', 'focus'] as const)
    if (has(field)) result[field] = stringField(body, field, { required: true, max: 200 }) as string;
  if (has('status')) {
    const status = stringField(body, 'status', { required: true, max: 20 });
    if (!['In Progress', 'Completed', 'On Hold', 'Not Started'].includes(status as string))
      fail(400, 'invalid_field', 'status must be In Progress, Completed, On Hold, or Not Started.');
    result.status = status as PlanInput['status'];
  }
  for (const field of ['progress', 'weeks', 'tasks'] as const)
    if (has(field))
      result[field] = numberField(body, field, {
        required: true,
        min: 0,
        max: field === 'progress' ? 100 : 100_000,
      }) as number;
  if (partial && Object.keys(result).length === 0)
    fail(400, 'empty_patch', 'Provide at least one plan field to update.');
  return result;
}

function parseWeek(input: unknown, partial = false): Partial<WeekInput> {
  const body = objectBody(input);
  const result: Partial<WeekInput> = {};
  const has = (key: string) => !partial || body[key] !== undefined;
  if (has('planId')) result.planId = stringField(body, 'planId', { required: true, max: 100 }) as string;
  if (has('week')) result.week = stringField(body, 'week', { required: true, max: 80 }) as string;
  for (const field of ['start', 'end'] as const) {
    if (has(field)) {
      result[field] = stringField(body, field, { required: true, max: 10 }) as string;
      dateField(result[field], field);
    }
  }
  if (result.start && result.end && result.start > result.end)
    fail(400, 'invalid_date_range', 'Week start must be on or before week end.');
  if (partial && Object.keys(result).length === 0)
    fail(400, 'empty_patch', 'Provide at least one week field to update.');
  return result;
}

export class PlanController {
  constructor(private readonly planRepository: PlanRepository) {}

  async handleListPlans(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { page, limit } = pagination(req);
    res.json(await this.planRepository.listPlans(req.userId, page, limit));
  }

  async handleGetPlan(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await this.planRepository.findPlan(req.userId, String(req.params.id));
    if (!item) fail(404, 'not_found', 'Plan was not found.');
    res.json({ data: item });
  }

  async handleCreatePlan(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await this.planRepository.createPlan(req.userId, parsePlan(req.body) as PlanInput);
    res.status(201).location(`/api/v1/plans/${item.id}`).json({ data: item });
  }

  async handleUpdatePlan(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await this.planRepository.updatePlan(req.userId, String(req.params.id), parsePlan(req.body, true));
    if (!item) fail(404, 'not_found', 'Plan was not found.');
    res.json({ data: item });
  }

  async handleDeletePlan(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await this.planRepository.deletePlan(req.userId, String(req.params.id));
    if (result === 'not_found') fail(404, 'not_found', 'Plan was not found.');
    res.status(204).end();
  }

  async handleListWeeks(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { page, limit } = pagination(req);
    if (req.query.planId !== undefined && (typeof req.query.planId !== 'string' || !req.query.planId.trim()))
      fail(400, 'invalid_field', 'planId must be a non-empty string.');
    res.json(await this.planRepository.listWeeks(req.userId, page, limit, req.query.planId as string | undefined));
  }

  async handleGetWeek(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await this.planRepository.findWeek(req.userId, String(req.params.id));
    if (!item) fail(404, 'not_found', 'Week was not found.');
    res.json({ data: item });
  }

  async handleCreateWeek(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await this.planRepository.createWeek(req.userId, parseWeek(req.body) as WeekInput);
    res.status(201).location(`/api/v1/weeks/${item.id}`).json({ data: item });
  }

  async handleUpdateWeek(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id);
    const current = await this.planRepository.findWeek(req.userId, id);
    if (!current) fail(404, 'not_found', 'Week was not found.');
    const updates = parseWeek(req.body, true);
    const nextStart = updates.start ?? current.start;
    const nextEnd = updates.end ?? current.end;
    if (nextStart > nextEnd) fail(400, 'invalid_date_range', 'Week start must be on or before week end.');
    const item = await this.planRepository.updateWeek(req.userId, id, updates);
    if (!item) fail(404, 'not_found', 'Week was not found.');
    res.json({ data: item });
  }

  async handleDuplicateWeek(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await this.planRepository.duplicateWeek(
      req.userId,
      String(req.params.id),
      parseWeek(req.body) as WeekInput
    );
    if (!item) fail(404, 'not_found', 'Week was not found.');
    res.status(201).location(`/api/v1/weeks/${item.id}`).json({ data: item });
  }

  async handleDeleteWeek(req: AuthenticatedRequest, res: Response): Promise<void> {
    const week = await this.planRepository.findWeek(req.userId, String(req.params.id));
    if (!week) fail(404, 'not_found', 'Week was not found.');
    if (!(await this.planRepository.deleteWeek(req.userId, week.id))) fail(404, 'not_found', 'Week was not found.');
    res.status(204).end();
  }
}
