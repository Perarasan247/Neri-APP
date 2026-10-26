import React from 'react';
import { View } from 'react-native';

import { Card, KpiGrid, Skeleton } from '@/components/ui';
import { space } from '@/theme/tokens';

/** First-load placeholder: KPI tiles and two chart cards. */
export function InsightsSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <View style={{ gap: space.lg }}>
      <KpiGrid>
        {Array.from({ length: kpis }).map((_, i) => (
          <Card key={i} padded style={{ gap: space.sm }}>
            <Skeleton height={10} width="50%" />
            <Skeleton height={22} width="40%" />
            <Skeleton height={10} width="70%" />
          </Card>
        ))}
      </KpiGrid>
      {[0, 1].map((i) => (
        <Card key={i} padded style={{ gap: space.md }}>
          <Skeleton height={14} width="45%" />
          <Skeleton height={160} />
        </Card>
      ))}
    </View>
  );
}
