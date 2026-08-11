import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { Reaction } from '../types';
import { PressableScale } from './ui/PressableScale';

export function ReactionPill({ reaction, onPress }: { reaction: Reaction; onPress: () => void }) {
  const pop = useSharedValue(1);
  const prevCount = useRef(reaction.count);

  useEffect(() => {
    if (reaction.count !== prevCount.current) {
      prevCount.current = reaction.count;
      pop.value = withSequence(
        withTiming(1.18, { duration: duration.instant, easing: easing.out, reduceMotion }),
        withTiming(1, { duration: duration.fast, easing: easing.out, reduceMotion })
      );
    }
  }, [reaction.count, pop]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Animated.View entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)} style={popStyle}>
      <PressableScale
        onPress={onPress}
        scaleTo={0.85}
        style={[styles.pill, reaction.reactedByMe && styles.pillActive]}
      >
        <Text style={styles.emoji}>{reaction.emoji}</Text>
        {reaction.count > 1 && (
          <Text style={[styles.count, reaction.reactedByMe && styles.countActive]}>
            {reaction.count}
          </Text>
        )}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 2,
    paddingVertical: 1,
    backgroundColor: 'transparent',
  },
  pillActive: {
    opacity: 1,
  },
  emoji: { fontSize: 14 },
  count: {
    ...typography.micro,
    fontSize: 9.5,
    fontFamily: typography.label.fontFamily,
    color: colors.onSurfaceVariant,
    marginLeft: 1,
  },
  countActive: { color: colors.primary },
});
