import React from 'react';
import { View } from 'react-native';
import {
  BookOpen,
  Brain,
  Code,
  Coffee,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Heart,
  MessageSquare,
  Moon,
  Music,
  ShieldAlert,
  Smile,
  Sparkles,
  Sun,
  Target,
  type LucideIcon,
} from 'lucide-react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

/** Same icon names the web app stores on habits (frontend/src/lib/icons.tsx). */
export const HABIT_ICONS: Array<{ name: string; Icon: LucideIcon }> = [
  { name: 'Target', Icon: Target },
  { name: 'Dumbbell', Icon: Dumbbell },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'Flame', Icon: Flame },
  { name: 'Droplets', Icon: Droplets },
  { name: 'Moon', Icon: Moon },
  { name: 'Sun', Icon: Sun },
  { name: 'Heart', Icon: Heart },
  { name: 'ShieldAlert', Icon: ShieldAlert },
  { name: 'Sparkles', Icon: Sparkles },
  { name: 'Brain', Icon: Brain },
  { name: 'Footprints', Icon: Footprints },
  { name: 'MessageSquare', Icon: MessageSquare },
  { name: 'Coffee', Icon: Coffee },
  { name: 'Code', Icon: Code },
  { name: 'Music', Icon: Music },
  { name: 'Smile', Icon: Smile },
];

export function HabitIcon({ name, size = 18, color }: { name?: string; size?: number; color: string }) {
  const Icon = HABIT_ICONS.find((i) => i.name.toLowerCase() === (name ?? '').toLowerCase())?.Icon ?? Target;
  return <Icon size={size} color={color} strokeWidth={2} />;
}

/** Rounded tile tinted with the habit's color, holding its icon. */
export function HabitTile({ icon, color, size = 36 }: { icon?: string; color: string; size?: number }) {
  const { scheme } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withAlpha(color, scheme === 'dark' ? 0.2 : 0.13),
      }}
    >
      <HabitIcon name={icon} color={color} size={Math.round(size * 0.5)} />
    </View>
  );
}

/** "#rrggbb" + alpha → "rgba(...)". Falls back to the input for non-hex colors. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
