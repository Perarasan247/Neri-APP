import type { Repeat, TodoPriority } from '@/api/types';
import { addDays, parseISODate, today } from '@/lib/format';
import { describeRepeat, isoWeekday, nextMatchingDate, WEEKDAYS_MON_FRI } from '@/lib/repeat';

export interface ParsedTodo {
  title: string;
  cleanTitle: string;
  priority?: TodoPriority;
  category?: string;
  dueDate?: string;
  dueTime?: string;
  startTime?: string;
  endTime?: string;
  repeat?: Repeat;
  chips: {
    type: 'date' | 'time' | 'priority' | 'category' | 'repeat';
    label: string;
    value: string;
  }[];
}

const DAY = '(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const DAY_SEP = '(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+|\\s*&\\s*|\\s+)';
const REPEAT_WEEKDAY = /\bevery\s+weekdays?\b/i;
const REPEAT_EVERY_N = /\bevery\s+(\d{1,2})\s*(day|week|month)s?\b/i;
const REPEAT_EVERY_UNIT = /\bevery\s+(day|week|month)\b/i;
const REPEAT_ADVERB = /\b(daily|weekly|monthly)\b/i;
const REPEAT_DAYS = new RegExp(`\\bevery\\s+${DAY}(?:${DAY_SEP}${DAY})*\\b`, 'i');
const REPEAT_DAY_WORD = new RegExp(`\\b${DAY}\\b`, 'gi');

const DAY_INDEX: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

/** The repeat phrase in `text` (e.g. "every mon, wed and fri") and the rule it means. */
export function findRepeatPhrase(text: string): { match: string; index: number; repeat: Repeat } | null {
  const rule = (frequency: Repeat['frequency'], interval = 1, weekdays: number[] = []): Repeat => ({
    frequency,
    interval,
    weekdays,
    end_date: null,
  });
  const unit = (u: string, n: number): Repeat => {
    const f = u.toLowerCase();
    return rule(f === 'day' ? 'daily' : f === 'week' ? 'weekly' : 'monthly', Math.min(52, Math.max(1, n)));
  };

  let m = text.match(REPEAT_WEEKDAY);
  if (m) return { match: m[0], index: m.index ?? 0, repeat: rule('weekly', 1, WEEKDAYS_MON_FRI) };

  m = text.match(REPEAT_EVERY_N);
  if (m) return { match: m[0], index: m.index ?? 0, repeat: unit(m[2], parseInt(m[1], 10)) };

  m = text.match(REPEAT_EVERY_UNIT);
  if (m) return { match: m[0], index: m.index ?? 0, repeat: unit(m[1], 1) };

  m = text.match(REPEAT_DAYS);
  if (m) {
    const days = [...m[0].matchAll(REPEAT_DAY_WORD)].map((d) => DAY_INDEX[d[1].slice(0, 3).toLowerCase()]);
    return { match: m[0], index: m.index ?? 0, repeat: rule('weekly', 1, [...new Set(days)].sort((a, b) => a - b)) };
  }

  m = text.match(REPEAT_ADVERB);
  if (m) {
    const u = m[1].toLowerCase();
    return { match: m[0], index: m.index ?? 0, repeat: unit(u === 'daily' ? 'day' : u === 'weekly' ? 'week' : 'month', 1) };
  }
  return null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function formatTime12(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  const mStr = m.toString().padStart(2, '0');
  return `${displayH}:${mStr} ${ampm}`;
}

export function parseTodoistInput(raw: string): ParsedTodo {
  let text = raw.trim();
  const chips: ParsedTodo['chips'] = [];
  let priority: TodoPriority | undefined;
  let category: string | undefined;
  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let startTime: string | undefined;
  let endTime: string | undefined;
  let repeat: Repeat | undefined;

  // Calendar dates are relative to "today" in the user's timezone, not the UTC day
  const base = today();

  // 1. Parse Priority: p1, p2, p3, p4, !urgent, !high, !med, !low
  const priorityRegex = /\b(p[1-4]|!urgent|!high|!med(?:ium)?|!low)\b/i;
  const pMatch = text.match(priorityRegex);
  if (pMatch) {
    const pStr = pMatch[1].toLowerCase();
    if (pStr === 'p1' || pStr === '!urgent') {
      priority = 'urgent';
      chips.push({ type: 'priority', label: 'P1 Urgent', value: 'urgent' });
    } else if (pStr === 'p2' || pStr === '!high') {
      priority = 'high';
      chips.push({ type: 'priority', label: 'P2 High', value: 'high' });
    } else if (pStr === 'p3' || pStr.startsWith('!med')) {
      priority = 'medium';
      chips.push({ type: 'priority', label: 'P3 Medium', value: 'medium' });
    } else if (pStr === 'p4' || pStr === '!low') {
      priority = 'low';
      chips.push({ type: 'priority', label: 'P4 Low', value: 'low' });
    }
    text = text.replace(priorityRegex, '').trim();
  }

  // 2. Parse Project / Category: #Work, #Personal, #Health, etc.
  const categoryRegex = /#([a-zA-Z0-9_\-]+)/i;
  const cMatch = text.match(categoryRegex);
  if (cMatch) {
    const rawCat = cMatch[1];
    category = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);
    chips.push({ type: 'category', label: `#${category}`, value: category });
    text = text.replace(categoryRegex, '').trim();
  }

  // 2b. Parse repeat: "every day", "every weekday", "every mon wed fri", "every 2 weeks", "weekly"…
  // (before times and dates so the digits and weekday names are not mistaken for them)
  const rep = findRepeatPhrase(text);
  if (rep) {
    repeat = rep.repeat;
    chips.push({ type: 'repeat', label: `🔁 ${describeRepeat(repeat)}`, value: describeRepeat(repeat) });
    text = `${text.slice(0, rep.index)} ${text.slice(rep.index + rep.match.length)}`.replace(/\s+/g, ' ').trim();
  }

  // 3. Parse Time Range: e.g. "from 3 to 4 PM", "3 to 4pm", "3-4pm", "15:00-16:00", "6 to 7 meeting"
  const rangeRegex = /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|until|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const rMatch = text.match(rangeRegex);

  if (rMatch) {
    let startH = parseInt(rMatch[1], 10);
    const startM = parseInt(rMatch[2] || '0', 10);
    let startAmPm = (rMatch[3] || '').toLowerCase();

    let endH = parseInt(rMatch[4], 10);
    const endM = parseInt(rMatch[5] || '0', 10);
    let endAmPm = (rMatch[6] || '').toLowerCase();

    // Contextual AM/PM inference
    if (!startAmPm && endAmPm) {
      if (endAmPm === 'pm') {
        if (endH === 12) {
          // e.g. 11 to 12 PM -> 11 AM
          startAmPm = startH === 12 ? 'pm' : (startH < 12 ? 'am' : 'pm');
        } else if (startH <= endH) {
          // e.g. 3 to 4 PM -> 3 PM
          startAmPm = 'pm';
        } else if (startH >= 8) {
          // e.g. 9 to 1 PM -> 9 AM
          startAmPm = 'am';
        } else {
          startAmPm = 'pm';
        }
      } else {
        startAmPm = 'am';
      }
    } else if (startAmPm && !endAmPm) {
      endAmPm = startAmPm;
    } else if (!startAmPm && !endAmPm) {
      // Neither specified: e.g. "6 to 7" or "14 to 15"
      if (startH < 8 && endH <= 12) {
        // e.g. 3 to 4, 6 to 7 -> afternoon/evening PM
        startAmPm = 'pm';
        endAmPm = 'pm';
      } else if (startH >= 8 && startH <= 12 && endH <= 12) {
        startAmPm = 'am';
        endAmPm = endH === 12 ? 'pm' : 'am';
      }
    }

    if (startAmPm === 'pm' && startH < 12) startH += 12;
    if (startAmPm === 'am' && startH === 12) startH = 0;
    if (endAmPm === 'pm' && endH < 12) endH += 12;
    if (endAmPm === 'am' && endH === 12) endH = 0;

    if (startH >= 0 && startH <= 23 && endH >= 0 && endH <= 23) {
      startTime = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
      endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
      dueTime = startTime;
      
      const label = `🕒 ${formatTime12(startH, startM)} – ${formatTime12(endH, endM)}`;
      chips.push({ type: 'time', label, value: `${startTime}-${endTime}` });
      text = text.replace(rangeRegex, '').trim();
    }
  } else {
    // 4. Parse Single Time: e.g. "at 5pm", "at 17:00", "9:30am", "10pm"
    const strictTimeRegex = /\b(?:at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?|(\d{1,2}):(\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm))\b/i;
    const tMatch = text.match(strictTimeRegex);
    if (tMatch) {
      let hours = parseInt(tMatch[1] || tMatch[4] || tMatch[7] || '0', 10);
      const minutes = parseInt(tMatch[2] || tMatch[5] || '0', 10);
      const ampm = (tMatch[3] || tMatch[6] || tMatch[8] || '').toLowerCase();

      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        // Default end time + 1 hour
        const endHour = (hours + 1) % 24;
        endTime = `${endHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        dueTime = startTime;
        chips.push({ type: 'time', label: `🕒 ${formatTime12(hours, minutes)}`, value: dueTime });
        text = text.replace(strictTimeRegex, '').trim();
      }
    }
  }

  // 4. Parse Dates:
  // - "today"
  // - "tomorrow", "tmr"
  // - "in X days", "in X weeks"
  // - "next [weekday]", "on [weekday]", "[weekday]"
  const todayRegex = /\b(today)\b/i;
  const tmrRegex = /\b(tomorrow|tmr)\b/i;
  const inDaysRegex = /\bin\s+(\d+)\s*(days?|weeks?)\b/i;
  const weekdayRegex = /\b(?:next\s+|on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

  if (todayRegex.test(text)) {
    dueDate = base;
    chips.push({ type: 'date', label: '📅 Today', value: dueDate });
    text = text.replace(todayRegex, '').trim();
  } else if (tmrRegex.test(text)) {
    dueDate = addDays(base, 1);
    chips.push({ type: 'date', label: '📅 Tomorrow', value: dueDate });
    text = text.replace(tmrRegex, '').trim();
  } else {
    const inDaysMatch = text.match(inDaysRegex);
    if (inDaysMatch) {
      const amount = parseInt(inDaysMatch[1], 10);
      const unit = inDaysMatch[2].toLowerCase();
      dueDate = addDays(base, unit.startsWith('week') ? amount * 7 : amount);
      chips.push({ type: 'date', label: `📅 In ${amount} ${unit}`, value: dueDate });
      text = text.replace(inDaysRegex, '').trim();
    } else {
      const wMatch = text.match(weekdayRegex);
      if (wMatch) {
        const targetDay = wMatch[1].toLowerCase();
        const targetIdx = WEEKDAYS.indexOf(targetDay);
        if (targetIdx !== -1) {
          const currentIdx = parseISODate(base).getDay();
          let diff = targetIdx - currentIdx;
          if (diff <= 0) diff += 7; // Next occurrence
          dueDate = addDays(base, diff);
          chips.push({ 
            type: 'date', 
            label: `📅 Next ${targetDay.charAt(0).toUpperCase() + targetDay.slice(1)}`, 
            value: dueDate 
          });
          text = text.replace(weekdayRegex, '').trim();
        }
      }
    }
  }

  if (repeat) {
    // A bare "weekly" repeats on the weekday of its start date
    const start = dueDate ?? base;
    if (repeat.frequency === 'weekly' && !repeat.weekdays.length) repeat = { ...repeat, weekdays: [isoWeekday(start)] };
    // The first occurrence is the first day that fits the rule (today counts)
    dueDate = nextMatchingDate(start, repeat);
  }

  // Cleanup leftover extra spaces
  const cleanTitle = text.replace(/\s+/g, ' ').trim() || raw.trim();

  return {
    title: raw,
    cleanTitle,
    priority,
    category,
    dueDate,
    dueTime,
    startTime,
    endTime,
    repeat,
    chips
  };
}
