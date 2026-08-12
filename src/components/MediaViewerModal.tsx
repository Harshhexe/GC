import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/theme';
import type { MessageMedia } from '../types';

/** Mounted only while a video is actually being viewed — useVideoPlayer
 *  needs a real source, so this stays a separate component rather than a
 *  conditional hook call inside MediaViewerModal itself. */
function VideoPlayerView({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return <VideoView player={player} style={styles.media} contentFit="contain" nativeControls />;
}

export function MediaViewerModal({ media, onClose }: { media: MessageMedia | null; onClose: () => void }) {
  return (
    <Modal visible={!!media} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        {media?.type === 'video' ? (
          <VideoPlayerView url={media.url} />
        ) : media ? (
          <Image source={{ uri: media.url }} style={styles.media} resizeMode="contain" />
        ) : null}

        <SafeAreaView style={styles.closeWrap} edges={['top']}>
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.96)' },
  media: { flex: 1, width: '100%' },
  closeWrap: { position: 'absolute', top: 0, right: 0, left: 0 },
  closeButton: {
    alignSelf: 'flex-end',
    margin: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
});
