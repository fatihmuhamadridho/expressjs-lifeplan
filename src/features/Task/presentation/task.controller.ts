import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '@common/middlewares/auth.middleware';
import { fail, dateField, numberField, objectBody, stringField } from '@common/utils/api';
import type { TaskInput, TaskRepository } from '../application/task.repository';

function parseTask(input: unknown, partial = false): Partial<TaskInput> {
  const body = objectBody(input);
  const result: Partial<TaskInput> = {};
  const has = (key: string) => !partial || body[key] !== undefined;
  if (has('title')) result.title = stringField(body, 'title', { required: true, max: 160 }) as string;
  if (has('plan')) {
    if (typeof body.plan !== 'string' || body.plan.length > 160)
      fail(400, 'invalid_field', 'plan must be a string with at most 160 characters.');
    result.plan = body.plan.trim();
  }
  if (has('priority')) {
    const priority = stringField(body, 'priority', { required: true, max: 16 });
    if (!['Low', 'Medium', 'High'].includes(priority as string))
      fail(400, 'invalid_field', 'priority must be Low, Medium, or High.');
    result.priority = priority as TaskInput['priority'];
  }
  if (has('due')) {
    result.due = stringField(body, 'due', { max: 80, nullable: true });
    dateField(result.due, 'due');
  }
  if (has('week')) result.week = stringField(body, 'week', { max: 80, nullable: true });
  for (const field of ['current', 'target'] as const)
    if (has(field)) result[field] = numberField(body, field, { required: true, min: 0, max: 1_000_000 }) as number;
  if (has('successThreshold'))
    result.successThreshold = numberField(body, 'successThreshold', { required: true, min: 0, max: 100 }) as number;
  if (partial && Object.keys(result).length === 0)
    fail(400, 'empty_patch', 'Provide at least one task field to update.');
  return result;
}

function pagination(req: Request) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1)
    fail(400, 'invalid_pagination', 'page and limit must be positive integers.');
  return { page, limit: Math.min(limit, 100) };
}

export class TaskController {
  constructor(private readonly taskRepository: TaskRepository) {}

  async handleList(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { page, limit } = pagination(req);
    const filters: { plan?: string; week?: string } = {};
    if (typeof req.query.plan === 'string') filters.plan = req.query.plan;
    if (typeof req.query.week === 'string') filters.week = req.query.week;
    res.json(await this.taskRepository.list(req.userId, page, limit, filters));
  }

  async handleGet(req: AuthenticatedRequest, res: Response): Promise<void> {
    const task = await this.taskRepository.findById(req.userId, String(req.params.id));
    if (!task) fail(404, 'not_found', 'Task was not found.');
    res.json({ data: task });
  }

  async handleCreate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const task = await this.taskRepository.create(req.userId, parseTask(req.body) as TaskInput);
    res.status(201).location(`/api/v1/tasks/${task.id}`).json({ data: task });
  }

  async handleUpdate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const task = await this.taskRepository.update(req.userId, String(req.params.id), parseTask(req.body, true));
    if (!task) fail(404, 'not_found', 'Task was not found.');
    res.json({ data: task });
  }

  async handleDelete(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!(await this.taskRepository.delete(req.userId, String(req.params.id))))
      fail(404, 'not_found', 'Task was not found.');
    res.status(204).end();
  }
}
