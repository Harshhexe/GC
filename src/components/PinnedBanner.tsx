import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { GlassPanel } from './ui/Glass';
import { describeMedia } from '../lib/media';
import type { PinnedMessage } from '../types';

type Props = {
  pins: PinnedMessage[];
  onPressPin: (pin: PinnedMessage) => void;
  onPressViewAll?: () => void;
  accentColor?: string;
};

export function PinnedBanner({ pins, onPressPin, onPressViewAll, accentColor }: Props) {
  const [index, setIndex] = useState(0);

  if (!pins || pins.length === 0) return null;

  const activeIndex = index % pins.length;
  const pin = pins[activeIndex];
  const activeAccent = accentColor || colors.primary;

  const previewText = pin.exists
    ? pin.text || (pin.mediaType ? describeMedia(pin.mediaType, pin.mediaName).label : 'Attachment')
    : 'Original message deleted';

  const previewIcon = pin.exists && pin.mediaType ? describeMedia(pin.mediaType, pin.mediaName).icon : null;

  function handlePressPin() {
    onPressPin(pin);
    if (pins.length > 1) {
      setIndex((prev) => (prev + 1) % pins.length);
    }
  }

  function handleNext() {
    setIndex((prev) => (prev + 1) % pins.length);
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.wrap}
    >
      <GlassPanel borderRadius={radius.md} style={styles.container}>
        <PressableScale
          style={styles.tapArea}
          scaleTo={0.98}
          onPress={handlePressPin}
        >
          <View style={styles.pinIconWrap}>
            <Ionicons name="pin" size={15} color={activeAccent} />
          </View>
          <View style={styles.copyArea}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>
                Pinned message {pins.length > 1 ? `${activeIndex + 1} of ${pins.length}` : ''}
              </Text>
              <Text style={styles.author} numberOfLines={1}>
                • {pin.authorName}
              </Text>
            </View>
            <View style={styles.previewRow}>
              {previewIcon && (
                <Ionicons name={previewIcon} size={13} color={colors.onSurfaceVariant} style={styles.mediaIcon} />
              )}
              <Text style={styles.subtitle} numberOfLines={1}>
                {previewText}
              </Text>
            </View>
          </View>
        </PressableScale>

        <View style={styles.actionsRow}>
          {pins.length > 1 && (
            <PressableScale hitSlop={6} scaleTo={0.88} onPress={handleNext} style={styles.actionBtn}>
              <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceVariant} />
            </PressableScale>
          )}
          {onPressViewAll && (
            <PressableScale hitSlop={6} scaleTo={0.88} onPress={onPressViewAll} style={styles.actionBtn}>
              <Ionicons name="list" size={16} color={activeAccent} />
            </PressableScale>
          )}
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLow,
  },
  tapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  pinIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyArea: {
    flex: 1,
    gap: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: 0,
  },
  author: {
    ...typography.micro,
    color: colors.onSurfaceVariant,
    flexShrink: 1,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mediaIcon: {
    marginRight: 2,
  },
  subtitle: {
    ...typography.caption,
    color: colors.onSurface,
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: spacing.xs,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
