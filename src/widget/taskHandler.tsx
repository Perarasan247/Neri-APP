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
import { ToastAndroid } from 'react-native';
import {
  getWidgetInfo,
  requestWidgetUpdateById,
  type WidgetInfo,
  type WidgetTaskHandlerProps,
} from 'react-native-android-widget';

import { addDays, today } from '@/lib/format';
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

/** A short message over the home screen (the quick-add popup has already closed by now). */
const notify = (message: string) => {
  try {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } catch {}
};

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

/** The snapshot is from before midnight: its habit rows describe yesterday. */
const isStale = (s: WidgetSnapshot) => s.date !== now(s);

/**
 * The widget's data, refreshed from the server first when it is from a previous day (the widget isn't
 * redrawn at midnight), so a tap never lands on yesterday's date. Offline it stays stale and the caller decides.
 */
async function currentView(): Promise<WidgetSnapshot | null> {
  const view = await loadView();
  if (!view || view.signedOut || !isStale(view)) return view;
  await syncAndRedraw();
  return loadView();
}

/** A task or habit typed into the quick-add popup (QuickAddActivity). Says why when nothing was added. */
async function quickAdd(data: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> {
  const view = await currentView();
  if (!view || view.signedOut) return { ok: false, message: 'Sign in to Neri to add from the widget' };
  const title = str(data.title).slice(0, 500);
  if (!title) return { ok: false, message: 'Type something to add first' };
  const day = now(view); // never the (possibly stale) snapshot day or the day the popup was drawn for

  if (data.kind === 'habit') {
    const target = Math.round(Number(data.target));
    await enqueue({
      kind: 'habit_create',
      tempId: `tmp-${newClientId()}`,
      name: title.slice(0, 100),
      date: day,
      target: Number.isFinite(target) && target > 1 ? Math.min(target, 999) : null,
      color: '#635bff',
    });
  } else {
    const choice = str(data.dateChoice);
    const date = choice === 'today' ? day : choice === 'tomorrow' ? addDays(day, 1) : choice === 'none' ? '' : str(data.date);
    await enqueue({ kind: 'todo_create', clientId: newClientId(), title, date: ISO_DATE.test(date) ? date : null });
  }
  return { ok: true };
}

/** Whether a quick-added task is due today (or earlier), i.e. belongs on the widget's Today page. */
function wantsToday(data: Record<string, unknown>, view: WidgetSnapshot | null): boolean {
  const day = now(view);
  const choice = str(data.dateChoice);
  if (choice) return choice === 'today';
  return Boolean(str(data.date)) && str(data.date) <= day;
}

/** What the editor sheet asked for, turned into queued actions. Returns a toast message, or null for none. */
async function applyEdit(data: Record<string, unknown>): Promise<string | null> {
  const view = await currentView();
  if (!view || view.signedOut) return 'Sign in to Neri to edit from the widget';
  const id = str(data.id);
  const op = str(data.op);

  if (data.kind === 'task') {
    const task = view.today.find((t) => t.id === id) ?? view.inbox.find((t) => t.id === id);
    if (!task) return 'That task is no longer here';
    if (op === 'delete') {
      await enqueue({ kind: 'todo_delete', todoId: id });
      return 'Task deleted';
    }
    const title = str(data.title).slice(0, 500);
    const day = now(view);
    const choice = str(data.dateChoice);
    const date =
      choice === 'today' ? day : choice === 'tomorrow' ? addDays(day, 1) : choice === 'none' ? null : undefined;
    const patch: { title?: string; date?: string | null } = {};
    if (title && title !== task.title) patch.title = title;
    if (date !== undefined && date !== task.date) patch.date = date;
    if (patch.title !== undefined || patch.date !== undefined) await enqueue({ kind: 'todo_update', todoId: id, ...patch });
    const done = str(data.done);
    if (done && (done === '1') !== task.done) await enqueue({ kind: 'todo_toggle', todoId: id, done: done === '1' });
    return null;
  }

  const habit = view.habits.find((h) => h.id === id);
  if (!habit) return 'That habit is no longer here';
  if (op === 'delete' || op === 'archive') {
    await enqueue({ kind: 'habit_delete', habitId: id, keepData: op === 'archive' });
    return op === 'archive' ? 'Habit archived' : 'Habit deleted';
  }
  // Logging needs today's row: never write onto yesterday's (offline after midnight)
  if (isStale(view)) return 'Couldn’t refresh today’s habits. Try again when online';

  const count = Math.round(Number(data.count));
  const value = Number(data.value);
  const done = str(data.done);
  if ((habit.type === 'build_count' || habit.type === 'avoid_count') && Number.isFinite(count) && count >= 0 && count !== habit.count) {
    await enqueue({ kind: 'habit_inc', habitId: id, date: view.date, delta: count - habit.count, count: Math.min(count, 9999) });
  }
  if (Number.isFinite(value) && value > 0) {
    await enqueue({ kind: 'habit_value', habitId: id, date: view.date, value, clientId: newClientId() });
  } else if (habit.type === 'build_yesno' && done && (done === '1') !== habit.done) {
    await enqueue({ kind: 'habit_set', habitId: id, date: view.date, done: done === '1' });
  }
  return null;
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
      const view = await currentView();
      const habit = view?.habits.find((h) => h.id === data.id);
      // Habits needing more than a tap open the editor sheet from the widget itself (see HabitRow)
      if (!view || !habit || habit.opensApp || (habit.target && habit.done)) return;
      // Still showing yesterday (offline after midnight): a tap would log the wrong day
      if (isStale(view)) {
        await draw(props);
        return;
      }
      await enqueue(
        habit.target
          ? { kind: 'habit_inc', habitId: habit.id, date: view.date, delta: 1, count: habit.count + 1 }
          : { kind: 'habit_set', habitId: habit.id, date: view.date, done: !habit.done },
      );
      await draw(props);
      await syncSoon();
      return;
    }
    case ACTIONS.task: {
      if (typeof data.id !== 'string') return;
      // The new status is recorded, not "flip", so a replay can't undo itself
      const view = await loadView();
      const task = view?.today.find((t) => t.id === data.id) ?? view?.inbox.find((t) => t.id === data.id);
      if (!view || view.signedOut || !task) return;
      await enqueue({ kind: 'todo_toggle', todoId: task.id, done: !task.done });
      await draw(props);
      await syncSoon();
      return;
    }
    case ACTIONS.quickAdd: {
      const added = await quickAdd(data);
      if (!added.ok) {
        notify(added.message);
        return;
      }
      notify(data.kind === 'habit' ? 'Habit added' : 'Task added'); // only now: it is saved and queued
      // Show the new item on the page it belongs to
      const state = await readViewState(widgetId);
      const view = await loadView();
      const next: WidgetViewState =
        data.kind === 'habit'
          ? { ...state, page: 'habits' }
          : { page: 'tasks', taskView: wantsToday(data, view) ? 'today' : 'inbox' };
      await Promise.all([writeViewState(widgetId, next), draw(props, next)]);
      await syncSoon();
      return;
    }
    case ACTIONS.edit: {
      const message = await applyEdit(data);
      if (message) notify(message);
      await draw(props);
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
