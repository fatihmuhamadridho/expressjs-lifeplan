import type { Task, TaskStatus } from './task.repository';

export function effectiveTaskDueDate(due?: string | null, weekEnd?: string | null): string | null {
  if (!due) return weekEnd ?? null;
  if (!weekEnd) return due;
  return due < weekEnd ? due : weekEnd;
}

export function calculateTaskStatus(
  task: Pick<Task, 'current' | 'target' | 'successThreshold' | 'manualStatus' | 'effectiveDue' | 'due'>,
  now = Date.now()
): TaskStatus {
  if (task.manualStatus === 'Completed') return 'Completed';
  const due = task.effectiveDue ?? task.due;
  const deadline = due ? new Date(`${due}T23:59:59.999Z`).getTime() : Infinity;
  const reached = task.target > 0 && (task.current / task.target) * 100 >= task.successThreshold;
  if (now > deadline) return reached ? 'Completed' : 'Failed';
  if (task.manualStatus) return task.manualStatus;
  if (reached) return 'Completed';
  return task.current > 0 ? 'In Progress' : 'To Do';
}
