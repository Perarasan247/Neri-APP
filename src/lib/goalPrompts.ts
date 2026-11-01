/**
 * Queue of "is this goal done too?" prompts. Mutations push the server's `goal_prompt` /
 * `parent_prompt` here; one <GoalPromptHost/> (mounted in the root layout) shows them.
 */
import type { GoalPrompt } from '@/api/types';

let queue: GoalPrompt[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** Queue a prompt, ignoring one for a goal that is already waiting. */
export function pushGoalPrompt(p: GoalPrompt | null | undefined) {
  if (!p || queue.some((q) => q.goal_id === p.goal_id)) return;
  queue = [...queue, p];
  emit();
}

/** Remove the prompt at the head of the queue once it has been answered. */
export function shiftGoalPrompt() {
  if (!queue.length) return;
  queue = queue.slice(1);
  emit();
}

export const subscribeGoalPrompts = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getGoalPrompts = () => queue;
