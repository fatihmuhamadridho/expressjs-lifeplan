export type TaskStatus = 'To Do' | 'In Progress' | 'Completed' | 'Failed';

export type TaskInput = {
  title: string;
  plan: string;
  due?: string | null;
  priority: 'Low' | 'Medium' | 'High';
  current: number;
  target: number;
  successThreshold: number;
  week?: string | null;
  manualStatus?: TaskStatus | null;
};

export type Task = TaskInput & {
  id: string;
  effectiveDue?: string | null;
  status?: TaskStatus;
  reachedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskList = { data: Task[]; meta: { page: number; limit: number; totalItems: number; totalPages: number } };

export abstract class TaskRepository {
  abstract list(
    userId: string,
    page: number,
    limit: number,
    filters?: { plan?: string; week?: string }
  ): Promise<TaskList>;
  abstract findById(userId: string, id: string): Promise<Task | null>;
  abstract create(userId: string, input: TaskInput): Promise<Task>;
  abstract update(userId: string, id: string, input: Partial<TaskInput>): Promise<Task | null>;
  abstract delete(userId: string, id: string): Promise<boolean>;
}
