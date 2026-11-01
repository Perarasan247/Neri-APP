'use no memo';
/**
 * Headless entry point for the widget. Android wakes this up when a widget is
 * added, resized, periodically refreshed (every 30 min) or tapped, even when
 * the app is closed.
 *
 * Taps follow "render first, sync after": the tap is queued and the widget
 * redrawn from local data straight away, then the queue is sent to the server
 * and the widget redrawn again with the confirmed numbers.
 */
import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { today } from '@/lib/format';

import { ACTIONS, renderNeriWidget, WIDGET_NAME } from './NeriWidget';
import { clearViewState, readViewState, writeViewState, type WidgetSnapshot } from './store';
import { enqueue, loadView, syncWidgetData } from './sync';

/** Today in the user's timezone (loadView() sets it from the snapshot). */
const now = (s: WidgetSnapshot | null) => (s ? today(s.timezone) : today());

async function draw(props: WidgetTaskHandlerProps) {
  const [snapshot, state] = await Promise.all([loadView(), readViewState(props.widgetInfo.widgetId)]);
  props.renderWidget(renderNeriWidget(snapshot, state, now(snapshot), props.widgetInfo));
}

/** Redraw every Neri widget on the home screen (used from the app and after a sync). */
export async function updateAllWidgets(): Promise<void> {
  const snapshot = await loadView();
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: async (info) => renderNeriWidget(snapshot, await readViewState(info.widgetId), now(snapshot), info),
  });
}

/** Pull from the server, then redraw. Offline this just redraws local data. */
async function syncAndRedraw() {
  try {
    await syncWidgetData();
  } catch {}
  await updateAllWidgets();
}

async function handleTap(props: WidgetTaskHandlerProps) {
  const { widgetId } = props.widgetInfo;
  const data = props.clickActionData ?? {};

  switch (props.clickAction) {
    case ACTIONS.setPage: {
      const state = await readViewState(widgetId);
      await writeViewState(widgetId, { ...state, page: data.page === 'tasks' ? 'tasks' : 'habits' });
      await draw(props);
      return;
    }
    case ACTIONS.setTaskView: {
      const state = await readViewState(widgetId);
      await writeViewState(widgetId, { ...state, page: 'tasks', taskView: data.view === 'inbox' ? 'inbox' : 'today' });
      await draw(props);
      return;
    }
    case ACTIONS.habit: {
      const view = await loadView();
      const habit = view?.habits.find((h) => h.id === data.id);
      // Habits needing the full UI open the app from the widget itself (see HabitRow)
      if (!view || !habit || habit.opensApp || (habit.target && habit.done)) return;
      await enqueue(
        habit.target
          ? { kind: 'habit_inc', habitId: habit.id, date: view.date, delta: 1 }
          : { kind: 'habit_set', habitId: habit.id, date: view.date, done: !habit.done },
      );
      await draw(props);
      await syncAndRedraw();
      return;
    }
    case ACTIONS.task: {
      if (typeof data.id !== 'string') return;
      await enqueue({ kind: 'todo_toggle', todoId: data.id });
      await draw(props);
      await syncAndRedraw();
      return;
    }
    case ACTIONS.refresh:
      await syncAndRedraw();
      return;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
      // Show cached data instantly, then refresh in the background
      await draw(props);
      await syncAndRedraw();
      break;
    case 'WIDGET_RESIZED':
      await draw(props);
      break;
    case 'WIDGET_CLICK':
      await handleTap(props);
      break;
    case 'WIDGET_DELETED':
      await clearViewState(props.widgetInfo.widgetId);
      break;
  }
}
