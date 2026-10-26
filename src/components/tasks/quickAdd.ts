/**
 * Wraps the shared Todoist-style parser for the mobile composer:
 * - chips can be dismissed (the token then stays in the title as plain text),
 * - a parsed token can be stripped when the user picks a value from the toolbar,
 */
import type { Repeat, TodoPriority } from '@/api/types';
import { findRepeatPhrase, parseTodoistInput, type ParsedTodo } from '@/lib/todoistParser';

export type ChipType = ParsedTodo['chips'][number]['type'];

export interface QuickAddResult {
  title: string;
  chips: ParsedTodo['chips'];
  priority?: TodoPriority;
  category?: string;
  repeat?: Repeat;
  dueDate?: string;
  dueTime?: string;
  startTime?: string;
  endTime?: string;
}

const hasChip = (text: string, type: ChipType) => parseTodoistInput(text).chips.some((c) => c.type === type);

/** Word span [start, end) whose removal makes the parser stop finding `type`. */
function findTokenSpan(words: string[], type: ChipType): [number, number] | null {
  const text = words.join(' ');
  if (!hasChip(text, type)) return null;
  if (type === 'repeat') {
    // Remove the whole phrase ("every mon wed fri"), not just its first word
    const hit = findRepeatPhrase(text);
    if (hit) {
      const before = text.slice(0, hit.index).split(' ').filter(Boolean).length;
      return [before, before + hit.match.split(/\s+/).length];
    }
  }
  for (let len = 1; len <= Math.min(6, words.length); len++) {
    for (let i = 0; i + len <= words.length; i++) {
      const rest = [...words.slice(0, i), ...words.slice(i + len)].join(' ');
      if (!hasChip(rest, type)) return [i, i + len];
    }
  }
  return null;
}

/** Remove the token for `type` from raw input (used when the toolbar overrides it). */
export function stripToken(raw: string, type: ChipType): string {
  const words = raw.split(/\s+/).filter(Boolean);
  const span = findTokenSpan(words, type);
  if (!span) return raw;
  // Let the parser remove the whole token (e.g. "from 3 to 4pm") while every other type is kept as text
  const others = new Set(ALL_TYPES.filter((t) => t !== type));
  const stripped = parseQuickAdd(raw, others).title;
  if (stripped && stripped !== raw.trim()) return stripped;
  return [...words.slice(0, span[0]), ...words.slice(span[1])].join(' ');
}

const ALL_TYPES: ChipType[] = ['date', 'time', 'priority', 'category', 'repeat'];

/** Time chip value is "HH:MM" or "HH:MM-HH:MM". */
function times(value?: string): Pick<QuickAddResult, 'dueTime' | 'startTime' | 'endTime'> {
  if (!value) return {};
  const [start, end] = value.split('-');
  return { dueTime: start, startTime: start, endTime: end };
}

export function parseQuickAdd(raw: string, ignored: ReadonlySet<ChipType>): QuickAddResult {
  let input = raw;
  const masked: string[] = [];

  // Mask the tokens of ignored chip types so they survive as plain title text
  if (ignored.size) {
    let words = raw.split(/\s+/).filter(Boolean);
    for (const type of ignored) {
      const span = findTokenSpan(words, type);
      if (!span) continue;
      // Private-use character: never matched by any parser rule
      const placeholder = String.fromCharCode(0xe000 + masked.length);
      masked.push(words.slice(span[0], span[1]).join(' '));
      words = [...words.slice(0, span[0]), placeholder, ...words.slice(span[1])];
    }
    input = words.join(' ');
  }

  const p = parseTodoistInput(input);
  let title = p.cleanTitle;
  masked.forEach((text, i) => {
    title = title.replace(String.fromCharCode(0xe000 + i), text);
  });
  // A title made only of tokens falls back to the raw text (parser behaviour)
  if (!title.trim()) title = raw.trim();

  const chips = p.chips
    .filter((c) => !ignored.has(c.type))
    .map((c) => (c.type === 'date' ? { ...c, value: c.value ?? c.value } : c));

  return {
    title: title.trim(),
    chips,
    priority: p.priority,
    category: p.category,
    repeat: chips.some((c) => c.type === 'repeat') ? p.repeat : undefined,
    dueDate: p.dueDate,
    ...times(chips.find((c) => c.type === 'time')?.value),
  };
}

/** "📅 Today" → "Today" (we render our own icons). */
export const chipText = (label: string) => label.replace(/^[^\p{L}\p{N}#]+/u, '').trim();
