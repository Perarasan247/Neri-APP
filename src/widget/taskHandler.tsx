'use no memo';
/**
 * Headless entry point for the widget. Android wakes this up when a widget is
 * added, resized, periodically refreshed (every 30 min) or tapped, even when
 * the app is closed.
 *
 * Taps follow "render first, sync after": the tap is queued and the widget
 * redrawn from local data straight away, then the queue is sent to the server
 * and the widget redrawn again only if the server's numbers differ.
 *
 * Every draw is expensive here (the library paints the whole widget, light and
 * dark, into PNGs), so we never repeat a draw whose inputs haven't changed, and
 * a burst of taps shares one sync instead of one each.
 */
import {
  getWidgetInfo,
  requestWidgetUpdateById,
  type WidgetInfo,
  type WidgetTaskHandlerProps,
} from 'react-native-android-widget';

import { today } from '@/lib/format';
import { newClientId } from '@/lib/id';

import { ACTIONS, renderNeriWidget, WIDGET_NAME } from './NeriWidget';
import {
  clearViewState,
  readViewState,
  readWidgetAccent,
  writeViewState,
  type WidgetSnapshot,
  type WidgetViewState,
} from './store';
import { enqueue, loadView, syncWidgetData } from './sync';

/** Today in the user's timezone (loadView() sets it from the snapshot). */
const now = (s: WidgetSnapshot | null) => (s ? today(s.timezone) : today());

/** How long to wait after the last tap before talking to the server. */
const SYNC_DELAY_MS = 700;

/* ---------- Drawing ---------- */

/** What each widget currently shows, so an identical redraw can be skipped. */
const drawn = new Map<number, string>();

function drawKey(
  snapshot: WidgetSnapshot | null,
  state: WidgetViewState,
  accent: string | null,
  info: Pick<WidgetInfo, 'width' | 'height'>,
) {
  const { syncedAt: _ignored, ...shown } = snapshot ?? ({} as WidgetSnapshot);
  return JSON.stringify([snapshot ? shown : null, state, accent, now(snapshot), info.width, info.height]);
}

/** Draw the widget that was tapped. `state` skips a storage read when the caller already knows it. */
async function draw(props: WidgetTaskHandlerProps, state?: WidgetViewState) {
  const { widgetInfo } = props;
  const [snapshot, viewState, accent] = await Promise.all([
    loadView(),
    state ?? readViewState(widgetInfo.widgetId),
    readWidgetAccent(),
  ]);
  props.renderWidget(renderNeriWidget(snapshot, viewState, now(snapshot), widgetInfo, accent));
  drawn.set(widgetInfo.widgetId, drawKey(snapshot, viewState, accent, widgetInfo));
}

/** Redraw every Neri widget on the home screen whose content changed (used from the app and after a sync). */
export async function updateAllWidgets(): Promise<void> {
  const [snapshot, accent, widgets] = await Promise.all([loadView(), readWidgetAccent(), getWidgetInfo(WIDGET_NAME)]);
  await Promise.all(
    widgets.map(async (info) => {
      const state = await readViewState(info.widgetId);
      const key = drawKey(snapshot, state, accent, info);
      if (drawn.get(info.widgetId) === key) return;
      drawn.set(info.widgetId, key);
      await requestWidgetUpdateById({
        widgetName: WIDGET_NAME,
        widgetId: info.widgetId,
        renderWidget: (i) => renderNeriWidget(snapshot, state, now(snapshot), i, accent),
      });
    }),
  );
}

/* ---------- Syncing ---------- */

/** Pull from the server, then redraw. Offline this just redraws local data. */
async function syncAndRedraw() {
  try {
    await syncWidgetData();
  } catch {}
  await updateAllWidgets();
}

let pendingSync: { timer?: ReturnType<typeof setTimeout>; done: Promise<void>; resolve: () => void } | null = null;

/**
 * Sync once the user stops tapping. Ticking off three habits in a row costs one
 * round of network calls and one redraw instead of three. Every caller awaits
 * the same promise, so each headless task stays alive until the sync is done.
 */
function syncSoon(): Promise<void> {
  if (!pendingSync) {
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    pendingSync = { done, resolve };
  }
  const p = pendingSync;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    if (pendingSync === p) pendingSync = null;
    syncAndRedraw().finally(p.resolve);
  }, SYNC_DELAY_MS);
  return p.done;
}

/* ---------- Taps ---------- */

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A task or habit typed into the quick-add popup (QuickAddActivity). */
async function quickAdd(data: Record<string, unknown>) {
  const view = await loadView();
  if (!view || view.signedOut) return false;
  const title = str(data.title).slice(0, 500);
  if (!title) return false;

  if (data.kind === 'habit') {
    const target = Math.round(Number(data.target));
    await enqueue({
      kind: 'habit_create',
      tempId: `tmp-${newClientId()}`,
      name: title.slice(0, 100),
      date: view.date,
      target: Number.isFinite(target) && target > 1 ? Math.min(target, 999) : null,
      color: '#635bff',
    });
  } else {
    const date = str(data.date);
    await enqueue({ kind: 'todo_create', clientId: newClientId(), title, date: ISO_DATE.test(date) ? date : null });
  }
  return true;
}

async function handleTap(props: WidgetTaskHandlerProps) {
  const { widgetId } = props.widgetInfo;
  const data = props.clickActionData ?? {};

  switch (props.clickAction) {
    case ACTIONS.setPage: {
      const state = await readViewState(widgetId);
      const next: WidgetViewState = { ...state, page: data.page === 'tasks' ? 'tasks' : 'habits' };
      await Promise.all([writeViewState(widgetId, next), draw(props, next)]);
      return;
    }
    case ACTIONS.setTaskView: {
      const state = await readViewState(widgetId);
      const next: WidgetViewState = { ...state, page: 'tasks', taskView: data.view === 'inbox' ? 'inbox' : 'today' };
      await Promise.all([writeViewState(widgetId, next), draw(props, next)]);
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
      await syncSoon();
      return;
    }
    case ACTIONS.task: {
      if (typeof data.id !== 'string') return;
      await enqueue({ kind: 'todo_toggle', todoId: data.id });
      await draw(props);
      await syncSoon();
      return;
    }
    case ACTIONS.quickAdd: {
      if (!(await quickAdd(data))) return;
      // Show the new item on the page it belongs to
      const state = await readViewState(widgetId);
      const next: WidgetViewState =
        data.kind === 'habit'
          ? { ...state, page: 'habits' }
          : { page: 'tasks', taskView: str(data.date) && str(data.date) <= now(await loadView()) ? 'today' : 'inbox' };
      await Promise.all([writeViewState(widgetId, next), draw(props, next)]);
      await syncSoon();
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
      drawn.delete(props.widgetInfo.widgetId);
      await clearViewState(props.widgetInfo.widgetId);
      break;
  }
}
