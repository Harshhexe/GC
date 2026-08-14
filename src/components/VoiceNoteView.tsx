import { useEffect, useMemo } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '../theme/theme';
import { easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { formatDuration, releaseRecordingSession, waveformFor } from '../lib/voice';
import { tapFeedback } from '../utils/haptics';
import type { MessageMedia } from '../types';

const BAR_COUNT = 28;

/**
 * A voice note in the transcript with soothing playback animation.
 */
export function VoiceNoteView({
  media,
  tint,
  onLongPress,
}: {
  media: MessageMedia;
  tint: string;
  onLongPress?: (e: GestureResponderEvent) => void;
}) {
  const player = useAudioPlayer({ uri: media.url });
  const status = useAudioPlayerStatus(player);

  const bars = useMemo(() => waveformFor(media.url, BAR_COUNT), [media.url]);

  const totalMs = status.duration > 0 ? status.duration * 1000 : media.durationMs ?? 0;
  const playedMs = status.currentTime * 1000;
  const progress = totalMs > 0 ? Math.min(playedMs / totalMs, 1) : 0;

  const playPulse = useSharedValue(0);

  useEffect(() => {
    if (status.playing) {
      playPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 750, easing: easing.inOut, reduceMotion }),
          withTiming(0, { duration: 750, easing: easing.inOut, reduceMotion })
        ),
        -1,
        true
      );
    } else {
      playPulse.value = withTiming(0, { duration: 200, reduceMotion });
    }
  }, [status.playing, playPulse]);

  const playGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(playPulse.value, [0, 1], [1, 1.06], Extrapolation.CLAMP) }],
    borderColor: interpolate(playPulse.value, [0, 1], [0.4, 0.9]) > 0.6 ? `${tint}AA` : `${tint}55`,
  }));

  async function toggle() {
    tapFeedback();
    if (status.playing) {
      player.pause();
      return;
    }
    await releaseRecordingSession();
    if (status.didJustFinish || progress >= 1) player.seekTo(0);
    player.play();
  }

  return (
    <PressableScale
      style={styles.row}
      scaleTo={0.99}
      haptic="light"
      onPress={toggle}
      onLongPress={onLongPress}
    >
      <Animated.View
        style={[
          styles.playButton,
          { backgroundColor: `${tint}2E`, borderColor: `${tint}66` },
          playGlowStyle,
        ]}
      >
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={17}
          color={tint}
          style={status.playing ? undefined : styles.playGlyph}
        />
      </Animated.View>

      <View style={styles.body}>
        <View style={styles.waveform}>
          {bars.map((height, i) => {
            const played = i / BAR_COUNT <= progress;
            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: `${height * 100}%`,
                    backgroundColor: played ? tint : 'rgba(255, 255, 255, 0.22)',
                  },
                ]}
              />
            );
          })}
        </View>
        <Text style={styles.time}>
          {formatDuration(status.playing || playedMs > 0 ? playedMs : totalMs)}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 235,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  playGlyph: { marginLeft: 2 },
  body: { flex: 1, gap: 3 },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 26,
  },
  bar: { flex: 1, borderRadius: radius.pill, minHeight: 3 },
  time: { ...typography.micro, fontSize: 11, color: colors.onSurfaceVariant },
});
