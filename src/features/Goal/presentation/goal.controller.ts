import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '@common/middlewares/auth.middleware';
import { fail, numberField, objectBody, stringField } from '@common/utils/api';
import type { GoalInput, GoalRepository, GoalUpdateInput, MilestoneInput } from '../application/goal.repository';

function pagination(req: Request) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1)
    fail(400, 'invalid_pagination', 'page and limit must be positive integers.');
  return { page, limit: Math.min(limit, 100) };
}

function parseGoal(input: unknown, partial = false): GoalUpdateInput {
  const body = objectBody(input);
  const result: GoalUpdateInput = {};
  const has = (key: string) => !partial || body[key] !== undefined;
  for (const field of ['title', 'description', 'color'] as const)
    if (has(field))
      result[field] = stringField(body, field, { required: true, max: field === 'description' ? 2000 : 160 }) as string;
  if (has('progress')) result.progress = numberField(body, 'progress', { required: true, min: 0, max: 100 }) as number;
  if (body.archived !== undefined) {
    if (typeof body.archived !== 'boolean') fail(400, 'invalid_field', 'archived must be a boolean.');
    result.archived = body.archived;
  }
  if (partial && Object.keys(result).length === 0)
    fail(400, 'empty_patch', 'Provide at least one goal field to update.');
  return result;
}

function parseMilestone(input: unknown, partial = false): Partial<MilestoneInput> {
  const body = objectBody(input);
  const result: Partial<MilestoneInput> = {};
  const has = (key: string) => !partial || body[key] !== undefined;
  for (const field of ['title', 'timeline'] as const)
    if (has(field)) result[field] = stringField(body, field, { required: true, max: 160 }) as string;
  if (has('progress')) result.progress = numberField(body, 'progress', { required: true, min: 0, max: 100 }) as number;
  for (const field of ['startDate', 'endDate'] as const) {
    if (body[field] !== undefined) {
      result[field] = stringField(body, field, { max: 40 }) as string;
    }
  }
  if (partial && Object.keys(result).length === 0)
    fail(400, 'empty_patch', 'Provide at least one milestone field to update.');
  return result;
}

export class GoalController {
  constructor(private readonly goalRepository: GoalRepository) {}

  async handleList(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { page, limit } = pagination(req);
    if (req.query.archived !== undefined && req.query.archived !== 'true' && req.query.archived !== 'false')
      fail(400, 'invalid_filter', 'archived must be true or false.');
    const archived = req.query.archived === undefined ? undefined : req.query.archived === 'true';
    res.json(await this.goalRepository.list(req.userId, page, limit, archived));
  }

  async handleGet(req: AuthenticatedRequest, res: Response): Promise<void> {
    const goal = await this.goalRepository.findById(req.userId, String(req.params.id));
    if (!goal) fail(404, 'not_found', 'Goal was not found.');
    res.json({ data: goal });
  }

  async handleCreate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const goal = await this.goalRepository.create(req.userId, parseGoal(req.body) as GoalInput);
    res.status(201).location(`/api/v1/goals/${goal.id}`).json({ data: goal });
  }

  async handleUpdate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const goal = await this.goalRepository.update(req.userId, String(req.params.id), parseGoal(req.body, true));
    if (!goal) fail(404, 'not_found', 'Goal was not found.');
    res.json({ data: goal });
  }

  async handleDelete(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await this.goalRepository.delete(req.userId, String(req.params.id));
    if (result === 'not_found') fail(404, 'not_found', 'Goal was not found.');
    if (result === 'has_plans')
      fail(409, 'resource_in_use', 'Remove or reassign this goal’s plans before deleting the goal.');
    if (result === 'not_archived') fail(409, 'goal_not_archived', 'Archive the goal before deleting it.');
    res.status(204).end();
  }

  async handleListMilestones(req: AuthenticatedRequest, res: Response): Promise<void> {
    const data = await this.goalRepository.listMilestones(req.userId, String(req.params.goalId));
    if (!data) fail(404, 'not_found', 'Goal was not found.');
    res.json({ data });
  }

  async handleCreateMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    const milestone = await this.goalRepository.createMilestone(
      req.userId,
      String(req.params.goalId),
      parseMilestone(req.body) as MilestoneInput
    );
    if (!milestone) fail(404, 'not_found', 'Goal was not found.');
    res.status(201).location(`/api/v1/goals/${req.params.goalId}/milestones/${milestone.id}`).json({ data: milestone });
  }

  async handleUpdateMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    const milestone = await this.goalRepository.updateMilestone(
      req.userId,
      String(req.params.goalId),
      String(req.params.id),
      parseMilestone(req.body, true)
    );
    if (!milestone) fail(404, 'not_found', 'Milestone was not found.');
    res.json({ data: milestone });
  }

  async handleDeleteMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!(await this.goalRepository.deleteMilestone(req.userId, String(req.params.goalId), String(req.params.id))))
      fail(404, 'not_found', 'Milestone was not found.');
    res.status(204).end();
  }
}
