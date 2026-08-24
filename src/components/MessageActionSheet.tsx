import { Fragment, useRef, type ReactElement } from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { reactionCatalog } from '../data/reactions';
import { PressableScale } from './ui/PressableScale';
import { selectFeedback } from '../utils/haptics';
import { useSignedMediaUrl } from '../lib/mediaUrl';
import { useVideoPoster } from '../hooks/useVideoPoster';
import type { MessageMedia } from '../types';

/** Reactions people actually reach for most — the rest live behind "+". */
const QUICK_REACTIONS = reactionCatalog.slice(0, 6);

export type MessageActionTarget = {
  id: string;
  authorName: string;
  text: string;
  isMine: boolean;
  /** A tombstoned message — no private comment can be started on it. */
  isDeleted?: boolean;
  /** No author to address, so no private comment either — the database
   *  refuses it anyway, and offering the option would just fail. */
  isAnonymous?: boolean;
  /** Owner/admin moderation rights, independent of authorship. */
  canModerate: boolean;
  isPinned: boolean;
  media?: MessageMedia | null;
  /** Set only when `media.type === 'sticker'` — lets the sheet offer a
   *  favorite toggle for the sticker itself, not just this message. */
  stickerId?: string | null;
  stickerFavorited?: boolean;
};

/** Where the long-pressed bubble was, so the menu opens right next to it
 *  instead of sliding up from the bottom of the screen. */
export type MessageActionAnchor = {
  /** Screen-space Y of the touch that triggered the long-press. */
  y: number;
  /** Screen-space X of that same touch. */
  x: number;
  /** Which side the bubble sits on — the menu hugs the same side. */
  mine: boolean;
};

/**
 * iOS-style contextual menu: a quick-reaction bar and an action list open
 * right where you pressed, instead of a bottom-sheet drawer. What's offered
 * depends on who's looking — mirrors the same eligibility rules as before,
 * the server (RLS + the edit trigger) is still what enforces them for real.
 */
export function MessageActionSheet({
  visible,
  target,
  anchor,
  onQuickReact,
  onMoreReactions,
  onReply,
  onComment,
  onCopy,
  onShare,
  onEdit,
  onDeleteForEveryone,
  onDeleteForMe,
  onSelect,
  onPin,
  onUnpin,
  onToggleStickerFavorite,
  onDownload,
  onDismiss,
  onClose,
}: {
  visible: boolean;
  target: MessageActionTarget | null;
  anchor: MessageActionAnchor | null;
  onQuickReact: (emoji: string, label: string) => void;
  onMoreReactions: () => void;
  onReply: () => void;
  /** Opens the private side-conversation on this message. Omitted where a
   *  private comment makes no sense (your own message, a tombstone). */
  onComment?: () => void;
  onCopy: () => void;
  onShare: () => void;
  onEdit: () => void;
  /** Only ever called when `target.stickerId` is set. */
  onToggleStickerFavorite?: () => void;
  /** Only ever called for image/video messages. */
  onDownload?: () => void;
  /** Tombstones the message for every member. Only offered when the viewer
   *  is the author or a moderator — RLS enforces the same rule. */
  onDeleteForEveryone: () => void;
  /** Hides it for this viewer only. Always available. */
  onDeleteForMe: () => void;
  onSelect: () => void;
  onPin: () => void;
  onUnpin: () => void;
  /** Fired when native Modal dismissal animation finishes (iOS). */
  onDismiss?: () => void;
  onClose: () => void;
}) {
  const lastTargetRef = useRef<MessageActionTarget | null>(null);
  if (target) {
    lastTargetRef.current = target;
  }
  const currentTarget = target ?? lastTargetRef.current;

  const alignItems: 'flex-end' | 'flex-start' = anchor?.mine ? 'flex-end' : 'flex-start';

  // The menu is a full-window Modal, so hugging a side means hugging the side
  // of the *window*. On a phone the window is the chat and that's right; in
  // the desktop web shell the chat is only the right-hand pane, so a message
  // from someone else pinned the menu to the far left — on top of the group
  // list. Anchoring to the pointer's X instead keeps it over the message it
  // belongs to, which is also what a desktop context menu should do.
  const { width: windowWidth } = useWindowDimensions();
  const pointerStyle =
    Platform.OS === 'web' && anchor && Number.isFinite(anchor.x)
      ? {
          alignItems: 'flex-start' as const,
          // Clamped against the reaction bar, which is the wider of the two
          // cards — clamping to the menu alone would let the bar overhang the
          // right edge. No width is set here: both cards size themselves, and
          // constraining the stack would squash the emoji row.
          marginLeft: Math.max(
            0,
            Math.min(anchor.x - POPOVER_WIDTH / 2, windowWidth - POPOVER_WIDTH - EDGE_GAP * 2)
          ),
        }
      : { alignItems };

  if (!currentTarget) return null;

  // Anyone can drop a message from their own view; taking it down for the
  // whole group is the author's call, or a moderator's.
  const canDeleteForEveryone = currentTarget.isMine || currentTarget.canModerate;

  // What's actually offered narrows by what the message *is* — copying or
  // sharing "text" makes no sense on a photo/video/voice note/sticker/gif
  // (there is no text to lift), and editing isn't a thing for the media
  // types that have no caption-editing UI in the first place.
  const mediaType = currentTarget.media?.type ?? null;
  const hideCopyShare =
    mediaType === 'image' ||
    mediaType === 'video' ||
    mediaType === 'voice' ||
    mediaType === 'sticker' ||
    mediaType === 'gif';
  const hideEdit = mediaType === 'voice' || mediaType === 'sticker' || mediaType === 'gif';
  // Never offered for a view-once attachment — saving it to the device
  // library would defeat the entire "one look" premise.
  const showDownload =
    (mediaType === 'image' || mediaType === 'video') && !currentTarget.media?.viewOnce;

  return (
    <Modal
      visible={visible && !!target}
      transparent
      animationType="none"
      onDismiss={onDismiss}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
          exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable style={styles.backdrop} onPress={onClose}>
            {Platform.OS !== 'web' && (
              <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            )}
          </Pressable>
        </Animated.View>

        <View style={[styles.stack, pointerStyle]} pointerEvents="box-none">
          <Animated.View
            entering={ZoomIn.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
            exiting={ZoomOut.duration(duration.fast).reduceMotion(reduceMotion)}
            style={styles.reactionBar}
          >
            {Platform.OS !== 'web' && (
              <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <View style={styles.reactionBarInner}>
              {QUICK_REACTIONS.map((r) => (
                <PressableScale
                  key={r.emoji}
                  style={styles.emojiItem}
                  scaleTo={1.25}
                  haptic="medium"
                  onPress={() => {
                    selectFeedback();
                    onQuickReact(r.emoji, r.label);
                  }}
                >
                  <Text style={styles.emojiText}>{r.emoji}</Text>
                </PressableScale>
              ))}
              <PressableScale style={styles.moreButton} scaleTo={1.15} haptic="light" onPress={onMoreReactions}>
                <Ionicons name="add" size={18} color={colors.onSurfaceVariant} />
              </PressableScale>
            </View>
          </Animated.View>

          <Animated.View
            entering={ZoomIn.duration(duration.base).delay(20).easing(easing.out).reduceMotion(reduceMotion)}
            exiting={ZoomOut.duration(duration.fast).reduceMotion(reduceMotion)}
            style={styles.previewCard}
          >
            {Platform.OS !== 'web' && (
              <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <Text style={styles.previewAuthor} numberOfLines={1}>
              {currentTarget.isMine ? 'You' : currentTarget.authorName}
            </Text>

            {currentTarget.media && (
              <View style={styles.previewMediaWrap}>
                {currentTarget.media.type === 'file' ? (
                  <View style={styles.previewFileRow}>
                    <Ionicons name="document-text" size={20} color={colors.primary} />
                    <Text style={styles.previewFileName} numberOfLines={1}>
                      {currentTarget.media.name || 'Document'}
                    </Text>
                  </View>
                ) : currentTarget.media.viewOnce ? (
                  // Never the real thumbnail here — same rule ViewOnceCard
                  // enforces in the transcript itself. Long-pressing a
                  // view-once bubble is not a second look.
                  <View style={[styles.previewImageContainer, styles.previewLockedContainer]}>
                    <Ionicons
                      name={currentTarget.media.type === 'video' ? 'videocam' : 'flame'}
                      size={22}
                      color={colors.onSurfaceVariant}
                    />
                    <Text style={styles.previewLockedText}>
                      View once {currentTarget.media.type === 'video' ? 'video' : 'photo'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.previewImageContainer}>
                    <MediaThumb media={currentTarget.media} />
                    {currentTarget.media.type === 'video' && (
                      <View style={styles.previewPlayOverlay}>
                        <View style={styles.previewPlayIcon}>
                          <Ionicons name="play" size={16} color="#FFFFFF" />
                        </View>
                      </View>
                    )}
                    {currentTarget.media.type === 'gif' && (
                      <View style={styles.previewGifBadge}>
                        <Text style={styles.previewGifText}>GIF</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {!!currentTarget.text && (
              <Text style={styles.previewText} numberOfLines={2}>
                {currentTarget.text}
              </Text>
            )}
          </Animated.View>

          <Animated.View
            entering={ZoomIn.duration(duration.base).delay(40).easing(easing.out).reduceMotion(reduceMotion)}
            exiting={ZoomOut.duration(duration.fast).reduceMotion(reduceMotion)}
            style={styles.menu}
          >
            {Platform.OS !== 'web' && (
              <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <View style={styles.menuInner}>
              {/* Quick actions top bar — auto-centers as a tight group
                  rather than stretching to fill the row, so it looks right
                  whether it's holding 1, 2, or all 3 icons. */}
              <View style={styles.quickActionsRow}>
                <PressableScale style={styles.quickActionButton} scaleTo={0.9} haptic="medium" onPress={onReply}>
                  <Ionicons name="arrow-undo-outline" size={19} color={colors.onSurface} />
                  <Text style={styles.quickActionLabel}>Reply</Text>
                </PressableScale>

                {currentTarget.isMine && !hideEdit && (
                  <PressableScale style={styles.quickActionButton} scaleTo={0.9} haptic="medium" onPress={onEdit}>
                    <Ionicons name="pencil-outline" size={19} color={colors.onSurface} />
                    <Text style={styles.quickActionLabel}>Edit</Text>
                  </PressableScale>
                )}

                {!hideCopyShare && (
                  <PressableScale style={styles.quickActionButton} scaleTo={0.9} haptic="medium" onPress={onShare}>
                    <Ionicons name="share-outline" size={19} color={colors.onSurface} />
                    <Text style={styles.quickActionLabel}>Share</Text>
                  </PressableScale>
                )}

                {showDownload && (
                  <PressableScale
                    style={styles.quickActionButton}
                    scaleTo={0.9}
                    haptic="medium"
                    onPress={() => onDownload?.()}
                  >
                    <Ionicons name="download-outline" size={19} color={colors.onSurface} />
                    <Text style={styles.quickActionLabel}>Save</Text>
                  </PressableScale>
                )}
              </View>

              <Divider />

              {[
                // Private comment. Distinct from Reply on purpose: Reply is
                // public to the GC, this is only ever seen by the two people.
                // Not offered on your own message — there is nobody to whisper
                // to — nor on a tombstone.
                !!onComment && !currentTarget.isMine && !currentTarget.isDeleted && (
                  <MenuRow
                    key="comment"
                    icon="lock-closed-outline"
                    label="Comment privately"
                    onPress={onComment}
                  />
                ),
                !hideCopyShare && <MenuRow key="copy" icon="copy-outline" label="Copy" onPress={onCopy} />,
                !!currentTarget.stickerId && (
                  <MenuRow
                    key="fav"
                    icon={currentTarget.stickerFavorited ? 'star' : 'star-outline'}
                    label={currentTarget.stickerFavorited ? 'Unfavorite sticker' : 'Favorite sticker'}
                    onPress={() => onToggleStickerFavorite?.()}
                  />
                ),
                currentTarget.canModerate &&
                  (currentTarget.isPinned ? (
                    <MenuRow key="pin" icon="pin" label="Unpin message" onPress={onUnpin} />
                  ) : (
                    <MenuRow key="pin" icon="pin-outline" label="Pin message" onPress={onPin} />
                  )),
                <MenuRow key="select" icon="checkmark-circle-outline" label="Select" onPress={onSelect} />,
                <MenuRow
                  key="deleteme"
                  icon="eye-off-outline"
                  label="Delete for me"
                  onPress={onDeleteForMe}
                  destructive
                />,
                canDeleteForEveryone && (
                  <MenuRow
                    key="deleteall"
                    icon="trash-outline"
                    label="Delete for everyone"
                    onPress={onDeleteForEveryone}
                    destructive
                  />
                ),
              ]
                .filter((row): row is ReactElement => !!row)
                .map((row, i) => (
                  <Fragment key={row.key}>
                    {i > 0 && <Divider />}
                    {row}
                  </Fragment>
                ))}
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

/** Same rule as everywhere else media is drawn: a video URL isn't something
 *  an <Image> can render, so use its poster — stored for newer messages,
 *  derived on the device for ones sent before posters existed. */
function MediaThumb({ media }: { media: MessageMedia }) {
  const isVideo = media.type === 'video';
  const signedUrl = useSignedMediaUrl(media.url);
  const signedThumb = useSignedMediaUrl(media.thumbUrl);
  const derivedPoster = useVideoPoster(isVideo && !media.thumbUrl ? signedUrl : null);
  const previewUri = isVideo ? signedThumb ?? derivedPoster : signedUrl;

  if (!previewUri) return <View style={styles.previewImage} />;
  return (
    <Image
      source={previewUri}
      style={styles.previewImage}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={120}
    />
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function MenuRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <PressableScale style={styles.row} scaleTo={0.98} haptic="medium" onPress={onPress}>
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
      <Ionicons name={icon} size={17} color={destructive ? colors.error : colors.onSurface} />
    </PressableScale>
  );
}

const MENU_WIDTH = 232;
/** Widest card in the stack: the quick-reaction bar (6 × 36 + more + padding). */
const POPOVER_WIDTH = 288;
/** Matches styles.root's horizontal padding — the clamp has to allow for it. */
const EDGE_GAP = spacing.lg;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 50,
    paddingBottom: 30,
  },
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  stack: {
    width: '100%',
    gap: spacing.sm + 2,
  },

  reactionBar: {
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22, 22, 34, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  reactionBarInner: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  emojiItem: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 22 },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginLeft: 2,
  },

  previewCard: {
    maxWidth: MENU_WIDTH + 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(28, 28, 42, 0.85)',
    borderWidth: 1,
    borderColor: glass.stroke,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    overflow: 'hidden',
  },
  previewAuthor: { ...typography.label, fontSize: 10, color: colors.onSurfaceVariant, marginBottom: 2 },
  previewText: { ...typography.body, fontSize: 14, color: colors.onSurface },
  previewMediaWrap: {
    marginVertical: spacing.xs,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  previewImageContainer: {
    width: MENU_WIDTH - 20,
    height: 105,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewLockedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  previewLockedText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  previewPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlayIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  previewGifBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  previewGifText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  previewFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  previewFileName: {
    ...typography.caption,
    fontSize: 12.5,
    color: colors.onSurface,
    flex: 1,
  },

  menu: {
    width: MENU_WIDTH,
    borderRadius: radius.md + 2,
    backgroundColor: 'rgba(30, 30, 44, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Centered as a tight group rather than stretched with space-around —
    // with Copy/Share/Edit/Download all conditional now, this can hold
    // anywhere from 1 to 4 icons and should look deliberate either way.
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  quickActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 48,
    paddingVertical: 2,
  },
  quickActionLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  menuInner: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  rowLabel: { ...typography.bodyMedium, fontSize: 15.5, color: colors.onSurface },
  rowLabelDestructive: { color: colors.error },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
});
