import React, { useState } from 'react';

import { DatePickerSheet, TimePickerSheet } from '@/components/ui';
import { formatHHMM } from '@/lib/calendarMath';
import { today } from '@/lib/format';

interface PickRequest {
  id: number;
  mode: 'date' | 'time';
  /** "YYYY-MM-DD" or "HH:MM" (empty for none). */
  value: string;
  title?: string;
  minDate?: string;
  onPick: (value: string) => void;
  onClear?: () => void;
}

interface PickOptions {
  title?: string;
  /** Show a "Clear"/"Remove" action that calls this. */
  onClear?: () => void;
  /** "YYYY-MM-DD" lower bound (date mode only). */
  minDate?: string;
}

/** Opening hour offered when nothing is set: the next full hour, capped at 23:00. */
function defaultTime(): string {
  return formatHHMM(Math.min(new Date().getHours() + 1, 23), 0);
}

let nextId = 1;

/**
 * Date / time picking with the app-themed sheets. Render `sheet` once in the
 * screen (inside the sheet that triggers it, when opened from one).
 *
 *   const pickers = usePickers();
 *   pickers.pickDate(todo.due_date, (iso) => save({ due_date: iso }));
 *   ...
 *   {pickers.sheet}
 *
 * The picker is a Modal, so when it is opened right after another sheet closes,
 * defer the call until that sheet has dismissed (`ActionSheet` options, `Sheet`'s
 * `onDismissed`); iOS drops a Modal presented mid-animation.
 */
export function usePickers() {
  const [request, setRequest] = useState<PickRequest | null>(null);
  const [visible, setVisible] = useState(false);

  const open = (r: Omit<PickRequest, 'id'>) => {
    setRequest({ ...r, id: nextId++ });
    setVisible(true);
  };

  const pickDate = (iso: string | null | undefined, onPick: (iso: string) => void, opts: PickOptions = {}) =>
    open({ mode: 'date', value: iso || today(), title: opts.title, minDate: opts.minDate, onClear: opts.onClear, onPick });

  const pickTime = (time: string | null | undefined, onPick: (hhmm: string) => void, opts: PickOptions = {}) =>
    open({ mode: 'time', value: time || defaultTime(), title: opts.title, onClear: opts.onClear, onPick });

  const close = () => setVisible(false);
  // The request stays mounted while the sheet slides away, and `key` resets the draft per opening
  const sheet = request ? (
    request.mode === 'date' ? (
      <DatePickerSheet
        key={request.id}
        visible={visible}
        onClose={close}
        value={request.value}
        onSelect={request.onPick}
        minDate={request.minDate}
        title={request.title ?? 'Date'}
        onClear={request.onClear}
      />
    ) : (
      <TimePickerSheet
        key={request.id}
        visible={visible}
        onClose={close}
        value={request.value}
        onSelect={request.onPick}
        title={request.title ?? 'Time'}
        onClear={request.onClear}
      />
    )
  ) : null;

  return { pickDate, pickTime, sheet };
}
