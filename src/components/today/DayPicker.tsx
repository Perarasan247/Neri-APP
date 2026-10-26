import React, { useState } from 'react';

import { DatePickerSheet } from '@/components/ui';

interface DayPickerOptions {
  /** Currently viewed day ("YYYY-MM-DD"). */
  value: string;
  /** Latest selectable day (today — future days are locked). */
  max: string;
  /** Earliest selectable day (tracking start), optional. */
  min?: string;
  onPick: (date: string) => void;
}

/**
 * Past-days-only date picker (the Today tab's calendar icon), shown in the
 * app-themed date sheet. Returns `open()` plus an element to render.
 */
export function useDayPicker({ value, max, min, onPick }: DayPickerOptions) {
  const [visible, setVisible] = useState(false);

  const element = (
    <DatePickerSheet
      visible={visible}
      onClose={() => setVisible(false)}
      value={value}
      minDate={min}
      maxDate={max}
      title="Go to date"
      onSelect={onPick}
    />
  );

  return { open: () => setVisible(true), element };
}
