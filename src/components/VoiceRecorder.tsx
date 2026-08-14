import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
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
import { tapFeedback, successFeedback } from '../utils/haptics';
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

/**
 * Press and hold the mic to record, slide left to bin it, let go to attach.
 *
 * Hold-to-record rather than tap-to-start/tap-to-stop because a voice note is
 * usually a few seconds of "yeah I'm on my way" — making the user aim at a
 * stop button afterwards is the slower half of the interaction. The recording
 * lands in the composer as a normal pending attachment rather than sending
 * itself, so it can be captioned, replied-with, or thrown away like anything
 * else you attach.
 */
export function VoiceRecorder({
  accentColor,
  disabled,
  onRecorded,
  onError,
  onRecordingChange,
}: {
  accentColor: string;
  disabled?: boolean;
  onRecorded: (attachment: PendingAttachment) => void;
  onError: (message: string) => void;
  /** Lets the composer collapse its text field while a recording is live. */
  onRecordingChange: (recording: boolean) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [armedToCancel, setArmedToCancel] = useState(false);

  const startedAt = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Read inside stop() which can be called from a gesture callback, where a
  // stale closure over `armedToCancel` would bin the wrong recordings.
  const cancelRef = useRef(false);
  // Guards against a second stop arriving (gesture end + auto-stop racing).
  const stoppingRef = useRef(false);

  const translateX = useSharedValue(0);
  const pulse = useSharedValue(0);

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
        // Falls through to the cleanup below — a recorder that wouldn't stop
        // has nothing usable to hand back anyway.
      }

      // Hand the audio session back to playback. Recording puts iOS in the
      // PlayAndRecord category, which routes output to the receiver — the
      // earpiece you hold to your head on a call — so everything played
      // afterwards comes out of the wrong speaker until this is undone.
      await releaseRecordingSession();

      setRecording(false);
      setElapsed(0);
      setArmedToCancel(false);
      translateX.value = withTiming(0, { duration: motionDuration.fast, reduceMotion });
      pulse.value = 0;
      stoppingRef.current = false;

      if (cancelled || !uri) return;
      if (heldFor < MIN_VOICE_DURATION_MS) {
        onError('Hold the mic to record a voice note.');
        return;
      }

      const attachment = await voiceAttachmentFrom(uri, Math.min(heldFor, MAX_VOICE_DURATION_MS));
      if (attachment) {
        successFeedback();
        onRecorded(attachment);
      }
    },
    [recorder, stopTicking, translateX, pulse, onRecorded, onError]
  );

  const start = useCallback(async () => {
    if (disabled || recording) return;

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      onError('GC needs microphone access to send a voice note.');
      return;
    }

    try {
      // Without this iOS records at a whisper and refuses to play back through
      // the loud speaker afterwards.
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

    pulse.value = withRepeat(
      withTiming(1, { duration: 800, easing: easing.inOut, reduceMotion }),
      -1,
      true
    );

    tickRef.current = setInterval(() => {
      const held = Date.now() - startedAt.current;
      setElapsed(held);
      // Stop itself at the ceiling rather than letting it run — the note is
      // kept, since cutting someone off and binning it would be worse.
      if (held >= MAX_VOICE_DURATION_MS) finish(false);
    }, 100);
  }, [disabled, recording, recorder, onError, pulse, finish]);

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
    .minDuration(150)
    .maxDistance(10_000) // sliding away must not cancel the gesture — that's the cancel affordance
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      runOnJS(start)();
    })
    .onFinalize(() => {
      runOnJS(checkAndFinish)();
    });

  const dragGesture = Gesture.Pan()
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
    opacity: interpolate(pulse.value, [0, 1], [1, 0.4], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.25], Extrapolation.CLAMP) }],
  }));

  const micStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: 1 + pulse.value * 0.1 },
    ],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.4, 0.05], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.8], Extrapolation.CLAMP) }],
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
          </View>
          <Animated.View style={[styles.slideHint, slideHintStyle]}>
            <Ionicons
              name="chevron-back"
              size={14}
              color={armedToCancel ? colors.error : 'rgba(255, 255, 255, 0.5)'}
            />
            <Text style={[styles.slideText, armedToCancel && { color: colors.error, fontWeight: '600' }]}>
              {armedToCancel ? 'release to cancel' : 'slide to cancel'}
            </Text>
          </Animated.View>
        </View>
      )}

      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.micSlot}>
          {recording && (
            <Animated.View
              style={[styles.halo, { backgroundColor: armedToCancel ? colors.error : accentColor }, haloStyle]}
            />
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
            <Ionicons
              name={armedToCancel ? 'trash-outline' : 'mic'}
              size={20}
              color={recording ? '#FFFFFF' : colors.onSurfaceVariant}
            />
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
  timer: { ...typography.label, fontSize: 13.5, fontWeight: '600', color: colors.onSurface, minWidth: 38 },
  slideHint: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  slideText: { ...typography.caption, fontSize: 12.5, color: colors.onSurfaceVariant },
});
