import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration as motionDuration, easing, reduceMotion } from '../theme/motion';
import { tapFeedback, successFeedback, warningFeedback } from '../utils/haptics';
import {
  MAX_VOICE_DURATION_MS,
  MIN_VOICE_DURATION_MS,
  formatDuration,
  releaseRecordingSession,
  voiceAttachmentFrom,
} from '../lib/voice';
import type { PendingAttachment } from '../lib/media';

/** Drag the mic this far left to bin the recording. */
const CANCEL_DISTANCE = 55;

/** Soothing animated live equalizer bar */
function WaveBar({ index, active }: { index: number; active: boolean }) {
  const height = useSharedValue(0.3);

  useEffect(() => {
    if (!active) {
      height.value = 0.3;
      return;
    }
    const speeds = [320, 260, 410, 290];
    const delay = index * 70;
    const dur = speeds[index % speeds.length];

    const timeout = setTimeout(() => {
      height.value = withRepeat(
        withSequence(
          withTiming(0.95, { duration: dur, easing: easing.inOut, reduceMotion }),
          withTiming(0.25, { duration: dur * 0.9, easing: easing.inOut, reduceMotion })
        ),
        -1,
        true
      );
    }, delay);

    return () => clearTimeout(timeout);
  }, [active, index, height]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: height.value }],
    opacity: interpolate(height.value, [0.25, 0.95], [0.6, 1], Extrapolation.CLAMP),
  }));

  return <Animated.View style={[styles.waveBar, barStyle]} />;
}

/**
 * Press and hold the mic to record with soothing ripple aura and live waveform.
 */
export function VoiceRecorder({
  accentColor,
  disabled,
  uploading,
  onRecorded,
  onError,
  onRecordingChange,
}: {
  accentColor: string;
  disabled?: boolean;
  uploading?: boolean;
  onRecorded: (attachment: PendingAttachment) => void;
  onError: (message: string) => void;
  onRecordingChange: (recording: boolean) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [armedToCancel, setArmedToCancel] = useState(false);

  const startedAt = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef = useRef(false);
  const stoppingRef = useRef(false);

  const translateX = useSharedValue(0);
  const pulse = useSharedValue(0);
  const micScale = useSharedValue(1);

  useEffect(() => {
    onRecordingChange(recording);
  }, [recording, onRecordingChange]);

  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
    },
    []
  );

  const stopTicking = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const finish = useCallback(
    async (cancelled: boolean) => {
      if (stoppingRef.current) return;
      stoppingRef.current = true;
      stopTicking();

      const heldFor = Date.now() - startedAt.current;
      let uri: string | null = null;
      try {
        await recorder.stop();
        uri = recorder.uri ?? null;
      } catch {
        // Falls through to cleanup
      }

      await releaseRecordingSession();

      setRecording(false);
      setElapsed(0);
      setArmedToCancel(false);
      translateX.value = withTiming(0, { duration: motionDuration.fast, reduceMotion });
      pulse.value = 0;
      micScale.value = withSpring(1, { damping: 20, stiffness: 260 });
      stoppingRef.current = false;

      if (cancelled || !uri) return;
      if (heldFor < MIN_VOICE_DURATION_MS) {
        warningFeedback();
        onError('Hold the mic to record a voice note.');
        return;
      }

      const attachment = await voiceAttachmentFrom(uri, Math.min(heldFor, MAX_VOICE_DURATION_MS));
      if (attachment) {
        successFeedback();
        onRecorded(attachment);
      }
    },
    [recorder, stopTicking, translateX, pulse, micScale, onRecorded, onError]
  );

  const start = useCallback(async () => {
    if (disabled || uploading || recording) return;

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      onError('GC needs microphone access to send a voice note.');
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      onError("Couldn't start recording — try again.");
      return;
    }

    cancelRef.current = false;
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    tapFeedback();

    micScale.value = withSpring(1.15, { damping: 16, stiffness: 220 });

    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: easing.out, reduceMotion }),
      -1,
      false
    );

    tickRef.current = setInterval(() => {
      const held = Date.now() - startedAt.current;
      setElapsed(held);
      if (held >= MAX_VOICE_DURATION_MS) finish(false);
    }, 100);
  }, [disabled, uploading, recording, recorder, onError, pulse, micScale, finish]);

  const setArmed = useCallback((armed: boolean) => {
    if (cancelRef.current !== armed) tapFeedback();
    cancelRef.current = armed;
    setArmedToCancel(armed);
  }, []);

  const checkAndFinish = useCallback(
    (cancelledByGesture?: boolean) => {
      const isCancelled =
        cancelledByGesture ?? (cancelRef.current || translateX.value <= -CANCEL_DISTANCE + 10);
      finish(isCancelled);
    },
    [finish, translateX]
  );

  const holdGesture = Gesture.LongPress()
    .enabled(!disabled && !uploading)
    .minDuration(120)
    .maxDistance(10_000)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      runOnJS(start)();
    })
    .onFinalize(() => {
      runOnJS(checkAndFinish)();
    });

  const dragGesture = Gesture.Pan()
    .enabled(!disabled && !uploading)
    .onUpdate((e) => {
      if (e.translationX >= 0) {
        translateX.value = 0;
        runOnJS(setArmed)(false);
        return;
      }
      translateX.value = Math.max(e.translationX, -CANCEL_DISTANCE - 20);
      runOnJS(setArmed)(e.translationX <= -CANCEL_DISTANCE);
    })
    .onFinalize(() => {
      runOnJS(checkAndFinish)();
    });

  const gesture = Gesture.Simultaneous(holdGesture, dragGesture);

  const recDotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 0.5, 1], [1, 0.4, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulse.value, [0, 0.5, 1], [1, 1.25, 1], Extrapolation.CLAMP) }],
  }));

  const micStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: micScale.value },
    ],
  }));

  const halo1Style = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 0.6, 1], [0.45, 0.15, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.9], Extrapolation.CLAMP) }],
  }));

  const halo2Style = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 0.3, 0.9], [0.25, 0.08, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 2.4], Extrapolation.CLAMP) }],
  }));

  const slideHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-CANCEL_DISTANCE, 0], [0.3, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(translateX.value, [-CANCEL_DISTANCE, 0], [-10, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={styles.wrap}>
      {recording && (
        <View style={styles.trayWrap} pointerEvents="none">
          <View style={styles.recordingInfo}>
            <Animated.View style={[styles.recDot, { backgroundColor: colors.error }, recDotStyle]} />
            <Text style={styles.timer}>{formatDuration(elapsed)}</Text>
            {/* Live Audio Visualizer Bars */}
            <View style={styles.waveGroup}>
              {[0, 1, 2, 3].map((i) => (
                <WaveBar key={i} index={i} active={recording} />
              ))}
            </View>
          </View>
          <Animated.View style={[styles.slideHint, slideHintStyle]}>
            <Ionicons
              name="chevron-back"
              size={14}
              color={armedToCancel ? colors.error : 'rgba(255, 255, 255, 0.5)'}
            />
            <Text style={[styles.slideText, armedToCancel && { color: colors.error, fontWeight: '700' }]}>
              {armedToCancel ? 'release to cancel' : 'slide to cancel'}
            </Text>
          </Animated.View>
        </View>
      )}

      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.micSlot}>
          {recording && (
            <>
              <Animated.View
                style={[
                  styles.halo,
                  { backgroundColor: armedToCancel ? colors.error : accentColor },
                  halo2Style,
                ]}
              />
              <Animated.View
                style={[
                  styles.halo,
                  { backgroundColor: armedToCancel ? colors.error : accentColor },
                  halo1Style,
                ]}
              />
            </>
          )}
          <Animated.View
            style={[
              styles.mic,
              {
                backgroundColor: recording
                  ? armedToCancel
                    ? colors.error
                    : accentColor
                  : 'rgba(255, 255, 255, 0.08)',
              },
              micStyle,
            ]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons
                name={armedToCancel ? 'trash-outline' : 'mic'}
                size={20}
                color={recording ? '#FFFFFF' : colors.onSurfaceVariant}
              />
            )}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center', position: 'relative' },
  micSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  halo: { position: 'absolute', width: 44, height: 44, borderRadius: radius.pill },
  mic: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  trayWrap: {
    position: 'absolute',
    right: 52,
    left: -230,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 4,
    paddingRight: 12,
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recDot: { width: 8, height: 8, borderRadius: radius.pill },
  timer: { ...typography.label, fontSize: 13.5, fontWeight: '700', color: colors.onSurface, minWidth: 38 },
  waveGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    height: 16,
    paddingHorizontal: 4,
  },
  waveBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#FF6B6B',
  },
  slideHint: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  slideText: { ...typography.caption, fontSize: 12.5, color: colors.onSurfaceVariant },
});
