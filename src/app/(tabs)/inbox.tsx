import React, { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Flag,
  Hash,
  Inbox as InboxIcon,
  MoreHorizontal,
  Search,
  Sparkles,
  X,
} from 'lucide-react-native';

import type { Todo, TodoPriority } from '@/api/types';
import {
  ActionSheet,
  AddCta,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  LargeTitle,
  ListSkeleton,
  SectionHeader,
  TextField,
  useDisclosure,
  type MenuOption,
} from '@/components/ui';
import { usePickers } from '@/components/tasks/DatePickerSheet';
import { TaskRow } from '@/components/tasks/TaskRow';
import {
  collectCategories,
  groupSmart,
  PriorityFlag,
  priorityMenu,
  SORT_LABELS,
  sortByPriority,
  useReschedule,
  VIEW_LABELS,
  type TaskSection,
  type TodoSort,
  type TodoView,
} from '@/components/tasks/taskOptions';
import { useTodos } from '@/hooks/queries';
import { pluralize, PRIORITY_META, priorityColor, today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const VIEWS: TodoView[] = ['all', 'today', 'upcoming', 'overdue', 'completed'];

const EMPTY_COPY: Record<TodoView, { title: string; description: string }> = {
  all: { title: 'All clear', description: 'Your inbox is empty. Use “Add a task” to capture one — try “Call mom tomorrow 6pm p1”.' },
  today: { title: 'Nothing due today', description: 'Enjoy the breathing room, or plan something for today.' },
  upcoming: { title: 'Nothing upcoming', description: 'Tasks with a future due date will show up here.' },
  overdue: { title: 'No overdue tasks', description: 'You’re all caught up. Nice work.' },
  completed: { title: 'No completed tasks yet', description: 'Tasks you complete will be collected here.' },
};

/** Inbox: every task with views, filters, search and smart sections. */
export default function InboxScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pickers = usePickers();
  const reschedule = useReschedule();

  const [view, setView] = useState<TodoView>('all');
  const [sort, setSort] = useState<TodoSort>('smart');
  const [category, setCategory] = useState<string | undefined>();
  const [priority, setPriority] = useState<TodoPriority | undefined>();
  const [showCompleted, setShowCompleted] = useState(true);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  // The Calendar tab's search button opens Inbox with search focused
  const { focusSearch } = useLocalSearchParams<{ focusSearch?: string }>();
  useEffect(() => {
    if (!focusSearch) return;
    setSearchOpen(true);
    const id = setTimeout(() => searchRef.current?.focus(), 150);
    return () => clearTimeout(id);
  }, [focusSearch]);

  const menu = useDisclosure();
  const categorySheet = useDisclosure();
  const prioritySheet = useDisclosure();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useTodos({
    view,
    sort_by: sort,
    category,
    priority,
    search: debouncedSearch || undefined,
  });
  // Unfiltered list feeds the category chip (categories "found in your tasks")
  const all = useTodos({});

  const ref = today();
  const loaded = query.data ?? [];
  const visible = (sort === 'priority' ? sortByPriority(loaded) : loaded).filter(
    (t) => showCompleted || view === 'completed' || t.status !== 'completed',
  );

  const pending = visible.filter((t) => t.status !== 'completed');
  const dueToday = pending.filter((t) => t.due_date === ref).length;
  const overdue = pending.filter((t) => t.due_date && t.due_date < ref);
  const subtitle = [
    pluralize(pending.length, 'task'),
    dueToday > 0 && `${dueToday} due today`,
    overdue.length > 0 && `${overdue.length} overdue`,
  ]
    .filter(Boolean)
    .join(' · ');

  const hasFilters = Boolean(category || priority || debouncedSearch);
  const smart = sort === 'smart' && view === 'all';

  const sections: TaskSection[] = smart
    ? groupSmart(visible, ref)
    : visible.length
      ? [{ key: 'list', title: VIEW_LABELS[view], items: visible }]
      : [];
  const listSections = sections.map((s) => ({
    ...s,
    data: s.key === 'completed' && completedCollapsed ? [] : s.items,
  }));

  const categories = collectCategories(all.data);
  if (category && !categories.includes(category)) categories.unshift(category);

  const clearFilters = () => {
    setCategory(undefined);
    setPriority(undefined);
    setSearch('');
    setDebouncedSearch('');
  };

  const rescheduleOverdue = (items: Todo[]) =>
    pickers.pickDate(ref, (date) => reschedule(items, date), { title: `Reschedule ${pluralize(items.length, 'task')}`, minDate: ref });

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearch('');
    } else {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  };

  const menuOptions: MenuOption[] = [
    ...(Object.keys(SORT_LABELS) as TodoSort[]).map((s) => ({
      label: s === 'smart' ? 'Smart sort' : `Sort by ${SORT_LABELS[s].toLowerCase()}`,
      icon: <SortIcon sort={s} color={colors.fgMuted} />,
      selected: sort === s,
      onPress: () => setSort(s),
    })),
    {
      label: showCompleted ? 'Hide completed' : 'Show completed',
      icon: showCompleted ? <EyeOff size={18} color={colors.fgMuted} /> : <Eye size={18} color={colors.fgMuted} />,
      onPress: () => setShowCompleted((v) => !v),
    },
    {
      label: 'Task insights',
      icon: <BarChart3 size={18} color={colors.fgMuted} />,
      onPress: () => router.push('/insights/tasks'),
    },
  ];

  const categoryOptions: MenuOption[] = [
    { label: 'All categories', icon: <Hash size={16} color={colors.fgMuted} />, selected: !category, onPress: () => setCategory(undefined) },
    ...categories.map((c) => ({
      label: c,
      icon: <Hash size={16} color={colors.fgMuted} />,
      selected: category === c,
      onPress: () => setCategory(c),
    })),
  ];

  const priorityOptions: MenuOption[] = [
    { label: 'All priorities', icon: <Flag size={16} color={colors.fgMuted} />, selected: !priority, onPress: () => setPriority(undefined) },
    ...priorityMenu(priority, setPriority, colors),
  ];

  const header = (
    <View>
      <LargeTitle
        title="Inbox"
        subtitle={query.data ? subtitle : undefined}
        actions={
          <>
            <IconButton label={searchOpen ? 'Close search' : 'Search tasks'} onPress={toggleSearch}>
              {searchOpen ? <X size={22} color={colors.fgSoft} /> : <Search size={22} color={colors.fgSoft} />}
            </IconButton>
            <IconButton label="More options" onPress={menu.show}>
              <MoreHorizontal size={22} color={colors.fgSoft} />
            </IconButton>
          </>
        }
      />

      {searchOpen ? (
        <View style={styles.search}>
          <TextField
            ref={searchRef}
            value={search}
            onChangeText={setSearch}
            placeholder="Search tasks, notes, categories"
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        {VIEWS.map((v) => (
          <Chip key={v} label={VIEW_LABELS[v]} selected={view === v} onPress={() => setView(v)} />
        ))}
        <View style={[styles.chipDivider, { backgroundColor: colors.lineStrong }]} />
        <Chip
          label={category ? `#${category}` : 'Category'}
          selected={!!category}
          icon={<Hash size={14} color={category ? colors.accentText : colors.fgMuted} />}
          onPress={categorySheet.show}
        />
        <Chip
          label={priority ? PRIORITY_META[priority].short : 'Priority'}
          selected={!!priority}
          color={priority ? priorityColor(priority, colors) : undefined}
          icon={
            priority ? <PriorityFlag priority={priority} colors={colors} size={14} /> : <Flag size={14} color={colors.fgMuted} />
          }
          onPress={prioritySheet.show}
        />
        {hasFilters ? <Chip label="Clear" icon={<X size={14} color={colors.fgMuted} />} onPress={clearFilters} /> : null}
      </ScrollView>

      <AddCta label="Add a task" onPress={() => router.push('/task/new')} style={styles.cta} />
    </View>
  );

  const empty = query.isPending ? (
    <ListSkeleton rows={6} />
  ) : query.error ? (
    <ErrorState error={query.error} onRetry={() => query.refetch()} />
  ) : hasFilters ? (
    <EmptyState
      icon={<Search size={24} color={colors.fgSubtle} />}
      title="Nothing here"
      description="No tasks match these filters. Try another view or clear your filters."
      action={<Button title="Clear filters" onPress={clearFilters} />}
    />
  ) : (
    <EmptyState
      icon={view === 'completed' ? <CheckCircle2 size={24} color={colors.fgSubtle} /> : <InboxIcon size={24} color={colors.fgSubtle} />}
      title={EMPTY_COPY[view].title}
      description={EMPTY_COPY[view].description}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <SectionList
        sections={listSections}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TaskRow todo={item} hideDate={view === 'today'} />}
        renderSectionHeader={({ section }) => {
          if (section.key === 'list') {
            return (
              <SectionHeader
                title={section.title}
                count={section.items.length}
                tone={view === 'overdue' ? 'danger' : 'muted'}
                style={styles.sectionHeader}
                action={view === 'overdue' ? { label: 'Reschedule', onPress: () => rescheduleOverdue(section.items) } : undefined}
              />
            );
          }
          return (
            <SectionHeader
              title={section.title}
              count={section.items.length}
              tone={section.key === 'overdue' ? 'danger' : 'fg'}
              style={styles.sectionHeader}
              action={
                section.key === 'overdue'
                  ? { label: 'Reschedule', onPress: () => rescheduleOverdue(section.items) }
                  : undefined
              }
              collapsed={section.key === 'completed' ? completedCollapsed : undefined}
              onToggle={section.key === 'completed' ? () => setCompletedCollapsed((c) => !c) : undefined}
            />
          );
        }}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              query.refetch();
              all.refetch();
            }}
            tintColor={colors.fgSubtle}
            colors={[colors.accent]}
            progressViewOffset={insets.top}
          />
        }
      />

      <ActionSheet visible={menu.open} onClose={menu.hide} title="View options" options={menuOptions} />
      <ActionSheet visible={categorySheet.open} onClose={categorySheet.hide} title="Filter by category" options={categoryOptions} />
      <ActionSheet visible={prioritySheet.open} onClose={prioritySheet.hide} title="Filter by priority" options={priorityOptions} />
      {pickers.sheet}
    </View>
  );
}

function SortIcon({ sort, color }: { sort: TodoSort; color: string }) {
  const Icon = { smart: Sparkles, due_date: Calendar, priority: Flag, created: Clock }[sort];
  return <Icon size={18} color={color} />;
}

function Separator() {
  return <View style={{ height: space.sm }} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  search: { marginTop: -space.sm, marginBottom: space.md },
  chipsScroll: { marginHorizontal: -space.lg, marginBottom: space.sm },
  chips: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  chipDivider: { width: StyleSheet.hairlineWidth, height: 20, marginHorizontal: space.xs },
  cta: { marginBottom: space.sm },
  sectionHeader: { marginTop: space.md },
});
