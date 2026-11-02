import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Check, Minus, Plus } from 'lucide-react-native';

import { Button, Card, Row, SectionHeader, Segmented, Text, TextField } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { ACCENT_PRESETS, contrast, normalizeHex } from '@/theme/accent';
import { TEXT_SCALE_STEPS, type ReduceMotionPreference, type ThemePreference } from '@/theme/appearance';
import { useTheme } from '@/theme/ThemeProvider';
import { palette, radius, space } from '@/theme/tokens';

const SWATCH = 40;
const DEFAULT_BASE = palette.light.accent;

/** Index of the step closest to the current scale. */
const stepIndex = (scale: number) =>
  TEXT_SCALE_STEPS.reduce((best, s, i) => (Math.abs(s.value - scale) < Math.abs(TEXT_SCALE_STEPS[best].value - scale) ? i : best), 0);

/** Theme, accent colour, text size and reduced motion. */
export function AppearanceSettings() {
  const {
    colors,
    preference,
    setPreference,
    accent,
    setAccent,
    textScale,
    setTextScale,
    reduceMotionPreference,
    setReduceMotionPreference,
    reduceMotion,
  } = useTheme();

  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState(accent ?? '');
  const draftHex = normalizeHex(draft);
  const draftInvalid = draft.trim().length > 0 && !draftHex;

  const isPreset = (hex: string | null) => (hex ?? null) === (accent ?? null);
  const onCustom = accent !== null && !ACCENT_PRESETS.some((p) => isPreset(p.hex));

  const pickPreset = (hex: string | null) => {
    haptic.tap();
    setAccent(hex);
    setCustomOpen(false);
  };

  const applyCustom = () => {
    if (!draftHex) return;
    haptic.success();
    setAccent(draftHex);
  };

  const idx = textScale === null ? 1 : stepIndex(textScale);
  const step = TEXT_SCALE_STEPS[idx];
  const stepTo = (i: number) => {
    const next = TEXT_SCALE_STEPS[Math.min(TEXT_SCALE_STEPS.length - 1, Math.max(0, i))];
    haptic.tap();
    setTextScale(next.value);
  };

  return (
    <View style={styles.group}>
      <SectionHeader title="Appearance" tone="muted" />
      <Card padded style={{ gap: space.xl }}>
        {/* Light / dark */}
        <View style={styles.block}>
          <Text weight="semibold">Theme</Text>
          <Segmented<ThemePreference>
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <Text variant="caption" tone="subtle">
            System follows your device’s light or dark setting.
          </Text>
        </View>

        {/* Accent */}
        <View style={styles.block}>
          <Text weight="semibold">Accent colour</Text>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {ACCENT_PRESETS.map((p) => {
              const selected = isPreset(p.hex);
              const base = p.hex ?? DEFAULT_BASE;
              return (
                <Swatch
                  key={p.id}
                  color={base}
                  label={p.name}
                  selected={selected}
                  ring={colors.fg}
                  onPress={() => pickPreset(p.hex)}
                />
              );
            })}
            <Swatch
              color={onCustom ? accent! : colors.muted}
              label="Custom colour"
              selected={onCustom}
              ring={colors.fg}
              dashed={!onCustom}
              onPress={() => {
                setDraft(accent ?? '');
                setCustomOpen((v) => !v);
              }}
            />
          </View>

          {customOpen || onCustom ? (
            <View style={{ gap: space.sm }}>
              <Row gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <TextField
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="#5b4ff5"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={7}
                    invalid={draftInvalid}
                    accessibilityLabel="Custom accent colour, hex code"
                    returnKeyType="done"
                    onSubmitEditing={applyCustom}
                  />
                </View>
                <Button title="Apply" variant="primary" disabled={!draftHex} onPress={applyCustom} />
              </Row>
              <Text variant="caption" tone={draftInvalid ? 'danger' : 'subtle'}>
                {draftInvalid
                  ? 'Enter a hex colour like #5b4ff5.'
                  : 'Colours that are too light or too dark are nudged so text stays easy to read.'}
              </Text>
            </View>
          ) : null}

          {/* Live preview with the colours actually in use */}
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            <View style={[styles.previewButton, { backgroundColor: colors.accent }]}>
              <Text variant="small" weight="semibold" color={colors.accentFg}>
                Button
              </Text>
            </View>
            <View style={[styles.previewButton, { backgroundColor: colors.accentSoft }]}>
              <Text variant="small" weight="semibold" color={colors.accentText}>
                Soft tag
              </Text>
            </View>
            <Text variant="small" weight="semibold" tone="accent">
              Link text
            </Text>
          </Row>
          {accent !== null ? (
            <Button title="Reset to default" size="sm" variant="ghost" onPress={() => pickPreset(null)} style={{ alignSelf: 'flex-start' }} />
          ) : null}
        </View>

        {/* Text size */}
        <View style={styles.block}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: space.md }}>
              <Text weight="semibold">Match device text size</Text>
              <Text variant="caption" tone="subtle">
                Use the font size from your device’s accessibility settings.
              </Text>
            </View>
            <Switch
              value={textScale === null}
              onValueChange={(on) => {
                haptic.tap();
                setTextScale(on ? null : 1);
              }}
              trackColor={{ true: colors.accent, false: colors.mutedStrong }}
              thumbColor="#ffffff"
              accessibilityLabel="Match device text size"
            />
          </Row>

          {textScale !== null ? (
            <Row gap={space.sm}>
              <StepButton
                label="Smaller text"
                disabled={idx === 0}
                onPress={() => stepTo(idx - 1)}
                icon={<Minus size={18} color={colors.fgSoft} />}
              />
              <View style={[styles.stepValue, { backgroundColor: colors.muted }]} accessibilityLiveRegion="polite">
                <Text weight="semibold" numberOfLines={1}>
                  {step.label}
                </Text>
                <Text variant="caption" tone="subtle">
                  {Math.round(step.value * 100)}%
                </Text>
              </View>
              <StepButton
                label="Larger text"
                disabled={idx === TEXT_SCALE_STEPS.length - 1}
                onPress={() => stepTo(idx + 1)}
                icon={<Plus size={18} color={colors.fgSoft} />}
              />
            </Row>
          ) : null}

          <View style={[styles.sample, { backgroundColor: colors.subtle, borderColor: colors.line }]}>
            <Text variant="title">Morning run</Text>
            <Text variant="small" tone="muted">
              A sample of how text will look across Neri.
            </Text>
          </View>
        </View>

        {/* Motion */}
        <View style={styles.block}>
          <Text weight="semibold">Reduce motion</Text>
          <Segmented<ReduceMotionPreference>
            value={reduceMotionPreference}
            onChange={setReduceMotionPreference}
            options={[
              { value: 'system', label: 'System' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <Text variant="caption" tone="subtle">
            {reduceMotionPreference === 'system'
              ? `Following your device setting (animations are currently ${reduceMotion ? 'reduced' : 'on'}).`
              : reduceMotionPreference === 'on'
                ? 'Screens, sheets and the intro appear instantly instead of sliding and fading.'
                : 'Animations stay on, even if your device asks to reduce them.'}
          </Text>
        </View>
      </Card>
    </View>
  );
}

function Swatch({
  color,
  label,
  selected,
  ring,
  dashed,
  onPress,
}: {
  color: string;
  label: string;
  selected: boolean;
  ring: string;
  dashed?: boolean;
  onPress: () => void;
}) {
  const fg = contrast('#ffffff', color) >= contrast('#121218', color) ? '#ffffff' : '#121218';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.swatch,
        { borderColor: selected ? ring : dashed ? ring : 'transparent', borderStyle: dashed && !selected ? 'dashed' : 'solid' },
      ]}
    >
      <View style={[styles.swatchFill, { backgroundColor: color }]}>
        {selected ? <Check size={18} color={fg} strokeWidth={3} /> : dashed ? <Plus size={16} color={ring} /> : null}
      </View>
    </Pressable>
  );
}

function StepButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: pressed ? colors.mutedStrong : colors.muted, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: space.xl },
  block: { gap: space.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: {
    width: SWATCH + 6,
    height: SWATCH + 6,
    borderRadius: (SWATCH + 6) / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchFill: {
    width: SWATCH - 4,
    height: SWATCH - 4,
    borderRadius: (SWATCH - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButton: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.md },
  step: { width: 48, height: 48, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center' },
  stepValue: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  sample: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md + 2, padding: space.md, gap: 2 },
});
