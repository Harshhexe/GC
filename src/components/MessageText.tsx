import { memo } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme/theme';
import { segmentMentionText } from '../lib/mentions';
import type { GroupMember, Mention } from '../types';

/**
 * Message body text with @mentions drawn as real pills.
 *
 * The previous version styled mentions as nested `<Text>` runs carrying
 * `borderRadius`, `borderWidth` and `paddingVertical`. React Native ignores all
 * three on a nested Text on Android — only `color` and `backgroundColor` apply
 * — so the "pill" rendered as a hard-edged colour block with no border, and the
 * vertical padding fought the line height. An `<Image>` nested in `<Text>` for
 * the avatar had the same problem: no border radius, and no way to centre it
 * against the text baseline. That is what made mentions look broken.
 *
 * A pill can only be a `<View>`, so the text has to flow around Views rather
 * than contain them. That means a wrapping row of word-level `<Text>` nodes
 * with pill Views sitting inline among them. Views cannot line-break, so the
 * text is split into words and each is its own node; the row wraps between
 * them exactly where a paragraph would.
 *
 * The cost is one node per word, so it is paid only when a message actually
 * contains a mention. Everything else — the overwhelming majority of messages —
 * takes the fast path below and renders as a single flat `<Text>`, unchanged.
 */

const AVATAR = 17;

type Props = {
  text: string;
  mentions: Mention[];
  mentionEveryone: boolean;
  /** Group accent, so member pills match the GC they are in. */
  accent: string;
  memberMap?: Map<string, GroupMember>;
  onMentionPress?: (userId: string) => void;
  /** Bubble text style, so pills sit on the same type scale as the body. */
  textStyle?: object;
};

function MessageTextInner({
  text,
  mentions,
  mentionEveryone,
  accent,
  memberMap,
  onMentionPress,
  textStyle,
}: Props) {
  const segments = segmentMentionText(text, mentions, mentionEveryone);
  const hasMention = segments.some((s) => s.type === 'mention');

  // Fast path: no mentions, so no reason to pay for per-word nodes.
  if (!hasMention) {
    return <Text style={[styles.text, textStyle]}>{text}</Text>;
  }

  const nodes: React.ReactNode[] = [];

  segments.forEach((seg) => {
    if (seg.type === 'text') {
      /*
       * Split on newlines first: a wrapping row has no concept of "\n", so an
       * explicit break has to become a full-width spacer that pushes the next
       * item onto a new line.
       */
      seg.value.split('\n').forEach((line, lineIdx) => {
        if (lineIdx > 0) {
          nodes.push(<View key={`${seg.key}-br${lineIdx}`} style={styles.lineBreak} />);
        }
        /*
         * Each token is one word carrying its own surrounding whitespace, so
         * the original spacing survives exactly. Emitting words and then adding
         * a space after every pill instead would turn "@alice!" into
         * "@alice !", because the segment following a mention is the bare
         * punctuation with no space of its own.
         */
        const tokens = line.match(/\s*\S+\s*/g);
        if (!tokens) {
          // Whitespace-only run — the gap between two adjacent mentions. It has
          // no word to ride along with, so it has to be emitted on its own.
          if (line.length > 0) {
            nodes.push(
              <Text key={`${seg.key}-${lineIdx}-ws`} style={[styles.text, textStyle]}>
                {line}
              </Text>
            );
          }
          return;
        }
        tokens.forEach((token, wordIdx) => {
          nodes.push(
            <Text key={`${seg.key}-${lineIdx}-${wordIdx}`} style={[styles.text, textStyle]}>
              {token}
            </Text>
          );
        });
      });
      return;
    }

    const isGC = seg.mentionKind === 'gc' || seg.value.toLowerCase() === '@gc';
    const isEveryone =
      seg.mentionKind === 'everyone' || seg.value.toLowerCase() === '@everyone';
    const label = seg.value.startsWith('@') ? seg.value.slice(1) : seg.value;

    if (isGC || isEveryone) {
      const tint = isGC ? '#C084FC' : '#FBBF24';
      nodes.push(
        <View
          key={seg.key}
          style={[
            styles.pill,
            { backgroundColor: `${tint}22`, borderColor: `${tint}59` },
          ]}
        >
          <Text style={styles.pillGlyph}>{isGC ? '✨' : '📢'}</Text>
          <Text style={[styles.pillLabel, { color: tint }]}>{label}</Text>
        </View>
      );
      return;
    }

    const member = seg.userId && memberMap ? memberMap.get(seg.userId) : undefined;
    const tappable = !!(onMentionPress && seg.userId);

    const pill = (
      <View
        style={[styles.pill, { backgroundColor: `${accent}24`, borderColor: `${accent}4D` }]}
      >
        {member?.avatarUrl ? (
          // Replaces the "@" entirely — the avatar is the marker that this is
          // a person, so the sigil would only be noise beside it.
          <Image
            source={{ uri: member.avatarUrl }}
            style={styles.pillAvatar}
            cachePolicy="memory-disk"
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              styles.pillAvatar,
              styles.pillAvatarFallback,
              { backgroundColor: member?.avatarColor ?? accent },
            ]}
          >
            <Text style={styles.pillAvatarEmoji}>{member?.avatarEmoji || '👤'}</Text>
          </View>
        )}
        <Text style={[styles.pillLabel, { color: accent }]}>{label}</Text>
      </View>
    );

    nodes.push(
      tappable ? (
        <Pressable
          key={seg.key}
          hitSlop={4}
          onPress={() => onMentionPress!(seg.userId!)}
          // Views do not inherit text opacity feedback, so the press state is
          // explicit here rather than relying on Text's onPress highlight.
          style={({ pressed }) => (pressed ? styles.pillPressed : undefined)}
        >
          {pill}
        </Pressable>
      ) : (
        <View key={seg.key}>{pill}</View>
      )
    );
  });

  return <View style={styles.flow}>{nodes}</View>;
}

export const MessageText = memo(MessageTextInner);

const styles = StyleSheet.create({
  text: { ...typography.body, fontSize: 15, lineHeight: 21, color: colors.onSurface },
  flow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  // Zero-height full-width item: the only way to force a hard break inside a
  // wrapping row.
  lineBreak: { width: '100%', height: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 3,
    paddingRight: 8,
    paddingVertical: 2,
    // Keeps consecutive lines of a mention-heavy message from touching.
    marginVertical: 1,
  },
  pillPressed: { opacity: 0.6 },
  pillAvatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  pillAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  pillAvatarEmoji: { fontSize: 10, lineHeight: 13 },
  pillGlyph: { fontSize: 11, marginLeft: 4 },
  pillLabel: {
    ...typography.body,
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
});
