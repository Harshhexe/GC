import { useMemo } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import { formatDuration, releaseRecordingSession, waveformFor } from '../lib/voice';
import type { MessageMedia } from '../types';

const BAR_COUNT = 28;

/**
 * A voice note in the transcript: play/pause, a waveform that fills as it
 * plays, and a running time. The waveform is derived from the URL rather than
 * the audio itself — see waveformFor — so it's stable per message and costs
 * nothing to draw.
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

  // The recorded duration is known at send time; the player's own duration is
  // only available once it has loaded enough to know, so prefer ours and let
  // the player's value correct it if it disagrees.
  const totalMs = status.duration > 0 ? status.duration * 1000 : media.durationMs ?? 0;
  const playedMs = status.currentTime * 1000;
  const progress = totalMs > 0 ? Math.min(playedMs / totalMs, 1) : 0;

  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    // Belt and braces on the audio route: the recorder already hands the
    // session back when it stops, but a recording cut short by a crash or a
    // backgrounded app would leave iOS in PlayAndRecord — and this would then
    // play out of the earpiece instead of the speaker.
    await releaseRecordingSession();
    // Playing to the end leaves the head parked there; without this a second
    // tap would replay nothing at all.
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
      <View style={[styles.playButton, { backgroundColor: `${tint}2E`, borderColor: `${tint}66` }]}>
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={17}
          color={tint}
          // Nudged right so the play triangle looks optically centred.
          style={status.playing ? undefined : styles.playGlyph}
        />
      </View>

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
