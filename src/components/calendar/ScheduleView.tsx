import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { RefreshControl, SectionList, StyleSheet, View, type ListViewToken } from 'react-native';
import { Plus } from 'lucide-react-native';

import type { Todo, TodoPriority } from '@/api/types';
import { ErrorState, IconButton, ListSkeleton, SectionHeader, Text } from '@/components/ui';
import { WeekStrip } from '@/components/tasks/CalendarStrip';
import { usePickers } from '@/components/tasks/DatePickerSheet';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useReschedule } from '@/components/tasks/taskOptions';
import { useTodos } from '@/hooks/queries';
import { addDays, diffDays, longDate, pluralize, startOfWeek } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

import { groupByDate } from './layout';

/** Days always covered by the agenda, starting today. */
const AGENDA_DAYS = 30;
const VIEWABILITY = { itemVisiblePercentThreshold: 10, minimumViewTime: 80 };
const PRIORITY_RANK: Record<TodoPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

interface AgendaSection {
  key: string;
  /** null for the Overdue section. */
  date: string | null;
  data: Todo[];
}

const timeOf = (t: Todo) => (t.is_all_day ? '' : t.start_time || t.due_time || '');

function byTimeThenPriority(a: Todo, b: Todo) {
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta && tb && ta !== tb) return ta.localeCompare(tb);
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

const maxDate = (...d: string[]) => d.reduce((a, b) => (a > b ? a : b));

interface Props {
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  onAdd: (date: string) => void;
}

/** Agenda: week strip over a day-by-day list with an Overdue section. */
export function ScheduleView({ today: ref, selected, onSelect, onAdd }: Props) {
  const { colors } = useTheme();
  const pickers = usePickers();
  const reschedule = useReschedule();

  const listRef = useRef<SectionList<Todo, AgendaSection>>(null);
  /** Ignore viewability updates while we scroll programmatically. */
  const suppressSync = useRef(0);
  const scrollTarget = useRef(ref);
  /** Last date reported from scrolling, so we don't scroll back to it. */
  const fromScroll = useRef<string | null>(null);

  const weekOf = selected < ref ? ref : selected;
  const baseEnd = addDays(ref, AGENDA_DAYS - 1);
  const agendaEnd = maxDate(baseEnd, addDays(startOfWeek(weekOf), 6), selected);

  const near = useTodos({ view: 'pending', start_date: ref, end_date: baseEnd, surface: 'calendar' });
  const far = useTodos(
    { view: 'pending', start_date: addDays(baseEnd, 1), end_date: agendaEnd, surface: 'calendar' },
    agendaEnd > baseEnd,
    true,
  );
  const overdueQuery = useTodos({ view: 'overdue', surface: 'calendar' });

  const { sections, marked, overdue, total, offset } = useMemo(() => {
    const tasks = [...(near.data ?? []), ...(agendaEnd > baseEnd ? (far.data ?? []) : [])].filter(
      (t) => t.status !== 'completed' && t.due_date,
    );
    const overdue = (overdueQuery.data ?? []).filter((t) => t.status !== 'completed');
    const byDate = groupByDate(tasks);
    const sections: AgendaSection[] = [];
    if (overdue.length) sections.push({ key: 'overdue', date: null, data: overdue });
    const span = diffDays(agendaEnd, ref);
    for (let i = 0; i <= span; i++) {
      const d = addDays(ref, i);
      sections.push({ key: d, date: d, data: (byDate.get(d) ?? []).sort(byTimeThenPriority) });
    }
    return { sections, marked: new Set(byDate.keys()), overdue, total: tasks.length, offset: overdue.length ? 1 : 0 };
  }, [near.data, far.data, overdueQuery.data, agendaEnd, baseEnd, ref]);

  const scrollTo = useCallback(
    (date: string) => {
      suppressSync.current = Date.now() + 900;
      scrollTarget.current = date;
      setTimeout(() => {
        const sectionIndex = offset + Math.max(0, diffDays(date, ref));
        listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: 0, animated: true });
      }, 60);
    },
    [offset, ref],
  );

  // External changes (today button, header chevrons) scroll the list
  useEffect(() => {
    if (selected === fromScroll.current) return;
    scrollTo(selected < ref ? ref : selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const choose = (date: string) => {
    fromScroll.current = null;
    onSelect(date);
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
      if (Date.now() < suppressSync.current) return;
      const first = viewableItems.find((v) => (v.section as AgendaSection | undefined)?.date);
      const date = (first?.section as AgendaSection | undefined)?.date;
      if (date) {
        fromScroll.current = date;
        onSelect(date);
      }
    },
    [onSelect],
  );

  const onScrollToIndexFailed = (info: { index: number; averageItemLength: number }) => {
    listRef.current?.getScrollResponder()?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
    setTimeout(() => {
      const sectionIndex = offset + Math.max(0, diffDays(scrollTarget.current, ref));
      listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: 0, animated: true });
    }, 120);
  };

  const rescheduleOverdue = () =>
    pickers.pickDate(ref, (date) => reschedule(overdue, date), {
      title: `Reschedule ${pluralize(overdue.length, 'task')}`,
      minDate: ref,
    });

  const shiftWeek = (delta: number) => {
    const target = maxDate(addDays(startOfWeek(weekOf), delta * 7), ref);
    choose(target);
  };

  const renderSectionHeader = ({ section }: { section: AgendaSection }) => {
    if (!section.date) {
      return (
        <SectionHeader
          title="Overdue"
          count={section.data.length}
          tone="danger"
          action={{ label: 'Reschedule', onPress: rescheduleOverdue }}
          style={styles.sectionHeader}
        />
      );
    }
    const diff = diffDays(section.date, ref);
    const suffix = diff === 0 ? ' · Today' : diff === 1 ? ' · Tomorrow' : '';
    const empty = section.data.length === 0;
    return (
      <View style={[styles.dayHeader, { borderBottomColor: colors.line }]}>
        <Text
          variant="small"
          weight="semibold"
          tone={empty ? 'subtle' : diff === 0 ? 'accent' : 'fg'}
          style={styles.flex}
          numberOfLines={1}
        >
          {longDate(section.date)}
          {suffix}
          {!empty ? <Text variant="small" tone="subtle">{`  ${section.data.length}`}</Text> : null}
        </Text>
        <IconButton label={`Add task on ${longDate(section.date)}`} size={30} onPress={() => onAdd(section.date!)}>
          <Plus size={16} color={colors.fgSubtle} />
        </IconButton>
      </View>
    );
  };

  const firstLoad = near.isPending || overdueQuery.isPending;

  return (
    <View style={styles.flex}>
      <View style={[styles.strip, { borderBottomColor: colors.line }]}>
        <WeekStrip
          weekOf={weekOf}
          today={ref}
          selected={selected}
          marked={marked}
          minDate={ref}
          onSelect={choose}
          onPrev={() => shiftWeek(-1)}
          onNext={() => shiftWeek(1)}
          canPrev={startOfWeek(weekOf) > startOfWeek(ref)}
        />
        {near.data ? (
          <Text variant="caption" tone="subtle" style={styles.summary}>
            {`${pluralize(total, 'task')} planned${overdue.length ? ` · ${overdue.length} overdue` : ''}`}
          </Text>
        ) : null}
      </View>
      {near.error && !near.data ? (
        <ErrorState error={near.error} onRetry={() => near.refetch()} />
      ) : firstLoad ? (
        <View style={styles.skeleton}>
          <ListSkeleton rows={6} />
        </View>
      ) : (
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(t) => t.id}
          renderItem={({ item, section }) => (
            <View style={styles.item}>
              <TaskRow todo={item} hideDate={!!section.date} />
            </View>
          )}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY}
          onScrollToIndexFailed={onScrollToIndexFailed}
          initialNumToRender={40}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={near.isRefetching || overdueQuery.isRefetching}
              onRefresh={() => {
                near.refetch();
                overdueQuery.refetch();
                if (agendaEnd > baseEnd) far.refetch();
              }}
              tintColor={colors.fgSubtle}
              colors={[colors.accent]}
            />
          }
        />
      )}
      {pickers.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  strip: { paddingHorizontal: space.lg, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  summary: { textAlign: 'center', marginTop: space.xs },
  content: { paddingHorizontal: space.lg, paddingBottom: 96 },
  skeleton: { paddingHorizontal: space.lg },
  sectionHeader: { marginTop: space.md },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.lg,
    marginBottom: space.sm,
    paddingLeft: space.xs,
    paddingBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  item: { marginBottom: space.sm },
});
