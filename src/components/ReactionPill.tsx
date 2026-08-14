import { useEffect, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { Reaction } from '../types';
import { PressableScale } from './ui/PressableScale';

export function ReactionPill({ reaction, onPress }: { reaction: Reaction; onPress: () => void }) {
  const pop = useSharedValue(1);
  const prevCount = useRef(reaction.count);
  const prevReacted = useRef(reaction.reactedByMe);

  useEffect(() => {
    if (reaction.count !== prevCount.current || reaction.reactedByMe !== prevReacted.current) {
      prevCount.current = reaction.count;
      prevReacted.current = reaction.reactedByMe;
      pop.value = withSequence(
        withTiming(1.24, { duration: duration.instant, easing: easing.out, reduceMotion }),
        withSpring(1, { damping: 12, stiffness: 240 })
      );
    }
  }, [reaction.count, reaction.reactedByMe, pop]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Animated.View
      entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
      style={popStyle}
    >
      <PressableScale
        onPress={onPress}
        scaleTo={0.88}
        haptic="light"
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
    paddingHorizontal: 3,
    paddingVertical: 1.5,
    backgroundColor: 'transparent',
  },
  pillActive: {
    opacity: 1,
  },
  emoji: { fontSize: 14 },
  count: {
    ...typography.micro,
    fontSize: 10,
    fontFamily: typography.label.fontFamily,
    color: colors.onSurfaceVariant,
    marginLeft: 1,
    fontWeight: '700',
  },
  countActive: { color: colors.primary },
});
