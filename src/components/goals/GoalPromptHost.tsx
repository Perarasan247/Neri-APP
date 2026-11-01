import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Target } from 'lucide-react-native';

import { useDialog, useToast } from '@/components/ui';
import { useUpdateGoal } from '@/hooks/queries';
import { getGoalPrompts, shiftGoalPrompt, subscribeGoalPrompts } from '@/lib/goalPrompts';
import { promptMessage, promptTitle } from '@/lib/goals';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Shows "Is this goal complete too?" after a linked task (or the last sub-goal) is completed,
 * wherever that happened. Mounted once in the root layout; the prompts come from the task and
 * goal mutations in hooks/queries.ts. Answering "Yes" may queue one more prompt for the parent.
 */
export function GoalPromptHost() {
  const { colors } = useTheme();
  const dialog = useDialog();
  const toast = useToast();
  const update = useUpdateGoal();
  const queue = useSyncExternalStore(subscribeGoalPrompts, getGoalPrompts, getGoalPrompts);
  const showing = useRef<string | null>(null);

  const head = queue[0];

  useEffect(() => {
    if (!head || showing.current === head.goal_id) return;
    showing.current = head.goal_id;
    // A dismiss (outside tap / back) runs both the cancel button and onDismiss: answer only once
    let answered = false;
    const done = () => {
      if (answered) return;
      answered = true;
      showing.current = null;
      shiftGoalPrompt();
    };
    const onError = (e: Error) => toast(e.message, { tone: 'danger' });
    dialog.alert(
      promptTitle(head),
      promptMessage(head),
      [
        {
          text: 'Yes, complete it',
          onPress: () => {
            haptic.success();
            update.mutate(
              { id: head.goal_id, patch: { status: 'completed' } },
              { onSuccess: () => toast('Goal completed', { tone: 'success' }), onError },
            );
            done();
          },
        },
        { text: 'Not yet', style: 'cancel', onPress: done },
        {
          text: 'Don’t ask for this goal',
          onPress: () => {
            update.mutate(
              { id: head.goal_id, patch: { ask_on_task_complete: false } },
              { onSuccess: () => toast('Won’t ask again for this goal'), onError },
            );
            done();
          },
        },
      ],
      { cancelable: true, onDismiss: done, icon: <Target size={28} color={colors.accent} /> },
    );
  }, [head, dialog, toast, update, colors.accent]);

  return null;
}
