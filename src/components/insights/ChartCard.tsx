import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { space } from '@/theme/tokens';

/** The three insights screens, switched with a segmented control at the top of each. */
export const INSIGHTS_ROUTES = {
  habits: '/insights',
  tasks: '/insights/tasks',
  goals: '/insights/goals',
} as const;

/** Card with a title, optional description / right accessory, and chart body. */
export function ChartCard({
  title,
  description,
  right,
  footer,
  children,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card padded>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body" weight="semibold">
            {title}
          </Text>
          {description ? (
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {description}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
      {footer ? <View style={{ marginTop: space.md }}>{footer}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.md },
});
