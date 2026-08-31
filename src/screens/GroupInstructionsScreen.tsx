import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  colors,
  glass,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { PressableScale } from '../components/ui/PressableScale';
import { EmptyState } from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { successFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupInstructions'>;

type InstructionCategory = 'nickname' | 'rule' | 'context';

const CATEGORIES: {
  key: InstructionCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { key: 'context', label: 'Note', icon: 'bulb-outline', color: '#FBBF24' },
  { key: 'nickname', label: 'Nickname', icon: 'person-outline', color: '#818CF8' },
  { key: 'rule', label: 'Rule', icon: 'shield-checkmark-outline', color: '#34D399' },
];

const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c])
) as Record<InstructionCategory, typeof CATEGORIES[number]>;

type Instruction = {
  id: string;
  instruction: string;
  user_id: string;
  category: InstructionCategory;
  created_at: string;
  profiles: {
    display_name: string;
    avatar_emoji: string;
    avatar_color: string;
    avatar_url: string | null;
  } | null;
};

export default function GroupInstructionsScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const { session } = useAuth();
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [newInstruction, setNewInstruction] = useState('');
  const [newCategory, setNewCategory] = useState<InstructionCategory>('context');
  const [filterCategory, setFilterCategory] = useState<'all' | InstructionCategory>('all');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingCategory, setEditingCategory] = useState<InstructionCategory>('context');
  const inputRef = useRef<TextInput>(null);
  const MAX_PER_USER = 20;

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('group_instructions')
      .select(
        'id, instruction, user_id, category, created_at, profiles(display_name, avatar_emoji, avatar_color, avatar_url)'
      )
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setInstructions(data as unknown as Instruction[]);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const myCount = instructions.filter((i) => i.user_id === session?.user.id).length;
  const filtered =
    filterCategory === 'all'
      ? instructions
      : instructions.filter((i) => i.category === filterCategory);

  async function handleAdd() {
    const text = newInstruction.trim();
    if (!text || !session?.user) return;

    setSaving(true);
    const { error } = await supabase.from('group_instructions').insert({
      group_id: groupId,
      user_id: session.user.id,
      instruction: text,
      category: newCategory,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message || 'Could not save instruction.');
    } else {
      successFeedback();
      setNewInstruction('');
      load();
    }
  }

  function startEditing(inst: Instruction) {
    setEditingId(inst.id);
    setEditingText(inst.instruction);
    setEditingCategory(inst.category);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingText('');
    setEditingCategory('context');
  }

  async function saveEdit() {
    if (!editingId || !editingText.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('group_instructions')
      .update({ instruction: editingText.trim(), category: editingCategory })
      .eq('id', editingId);
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message || 'Could not update instruction.');
    } else {
      successFeedback();
      cancelEditing();
      load();
    }
  }

  function confirmDelete(id: string) {
    const go = async () => {
      await supabase.from('group_instructions').delete().eq('id', id);
      if (editingId === id) cancelEditing();
      successFeedback();
      load();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this instruction?')) go();
      return;
    }
    Alert.alert('Delete instruction?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  }

  const placeholderText =
    newCategory === 'nickname'
      ? "e.g. Hari's nickname is gc leaver"
      : newCategory === 'rule'
      ? 'e.g. Never roast admin on weekdays'
      : 'e.g. Roast someone when they say anything related.....';

  return (
    <View style={styles.root}>
      <AmbientBackground tint="#818CF8" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <AppHeader
          title="Custom Instructions"
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
          right={
            <Text style={styles.headerCounter}>
              {myCount}/{MAX_PER_USER}
            </Text>
          }
        />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Clean Subtitle */}
            <Text style={styles.subtitle}>
              Teach GC inside jokes, nicknames, and rules. GC uses these as ground truth in this chat.
            </Text>

            {/* Filter Tabs (minimal) */}
            {instructions.length > 1 && (
              <View style={styles.filterRow}>
                <PressableScale
                  scaleTo={0.95}
                  haptic="light"
                  onPress={() => setFilterCategory('all')}
                  style={[
                    styles.filterPill,
                    filterCategory === 'all' && styles.filterPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      filterCategory === 'all' && styles.filterPillTextActive,
                    ]}
                  >
                    All ({instructions.length})
                  </Text>
                </PressableScale>

                {CATEGORIES.map((c) => {
                  const count = instructions.filter((i) => i.category === c.key).length;
                  if (count === 0) return null;
                  const isActive = filterCategory === c.key;
                  return (
                    <PressableScale
                      key={c.key}
                      scaleTo={0.95}
                      haptic="light"
                      onPress={() => setFilterCategory(c.key)}
                      style={[
                        styles.filterPill,
                        isActive && {
                          backgroundColor: `${c.color}18`,
                          borderColor: `${c.color}55`,
                        },
                      ]}
                    >
                      <Ionicons
                        name={c.icon}
                        size={12}
                        color={isActive ? c.color : colors.onSurfaceVariant}
                      />
                      <Text
                        style={[
                          styles.filterPillText,
                          isActive && { color: c.color, fontWeight: '700' },
                        ]}
                      >
                        {c.label}s ({count})
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            )}

            {/* Clean List */}
            {loading ? (
              <View style={styles.centered}>
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : filtered.length === 0 ? (
              <EmptyState
                emoji="💡"
                text={
                  filterCategory === 'all'
                    ? 'No instructions yet. Add a note or nickname below.'
                    : `No ${filterCategory}s saved yet.`
                }
              />
            ) : (
              <GlassPanel borderRadius={radius.lg} style={styles.listCard}>
                {filtered.map((inst, i) => {
                  const isOwn = inst.user_id === session?.user.id;
                  const isEditing = editingId === inst.id;
                  const profile = inst.profiles;
                  const cat = CATEGORY_MAP[inst.category] ?? CATEGORY_MAP.context;

                  if (isEditing) {
                    return (
                      <View key={inst.id} style={[styles.itemRow, i > 0 && styles.itemDivider]}>
                        <View style={styles.editContainer}>
                          <View style={styles.categoryPicker}>
                            {CATEGORIES.map((c) => {
                              const isSel = editingCategory === c.key;
                              return (
                                <PressableScale
                                  key={c.key}
                                  scaleTo={0.94}
                                  haptic="light"
                                  onPress={() => setEditingCategory(c.key)}
                                  style={[
                                    styles.pillBtn,
                                    isSel && {
                                      backgroundColor: `${c.color}22`,
                                      borderColor: `${c.color}66`,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name={c.icon}
                                    size={12}
                                    color={isSel ? c.color : colors.outline}
                                  />
                                  <Text
                                    style={[
                                      styles.pillBtnText,
                                      isSel && { color: c.color, fontWeight: '700' },
                                    ]}
                                  >
                                    {c.label}
                                  </Text>
                                </PressableScale>
                              );
                            })}
                          </View>

                          <TextInput
                            style={styles.editInput}
                            value={editingText}
                            onChangeText={setEditingText}
                            autoFocus
                            multiline
                            maxLength={500}
                          />

                          <View style={styles.editActions}>
                            <PressableScale
                              scaleTo={0.95}
                              haptic="light"
                              onPress={cancelEditing}
                              style={styles.editCancelBtn}
                            >
                              <Text style={styles.editCancelText}>Cancel</Text>
                            </PressableScale>
                            <PressableScale
                              scaleTo={0.95}
                              haptic="light"
                              onPress={saveEdit}
                              style={[
                                styles.editSaveBtn,
                                { opacity: editingText.trim() ? 1 : 0.4 },
                              ]}
                            >
                              <Text style={styles.editSaveText}>Save</Text>
                            </PressableScale>
                          </View>
                        </View>
                      </View>
                    );
                  }

                  return (
                    <View key={inst.id} style={[styles.itemRow, i > 0 && styles.itemDivider]}>
                      {/* Category Icon indicator */}
                      <View
                        style={[
                          styles.catIconWrap,
                          {
                            backgroundColor: `${cat.color}15`,
                            borderColor: `${cat.color}35`,
                          },
                        ]}
                      >
                        <Ionicons name={cat.icon} size={15} color={cat.color} />
                      </View>

                      {/* Content */}
                      <View style={styles.itemContent}>
                        <Text style={styles.itemText}>{inst.instruction}</Text>
                        <View style={styles.itemMetaRow}>
                          <Text style={styles.itemAuthor}>
                            {profile?.display_name ?? 'Someone'}
                          </Text>
                          <Text style={styles.itemDot}>·</Text>
                          <Text style={styles.itemTime}>{formatRelative(inst.created_at)}</Text>
                        </View>
                      </View>

                      {/* Actions */}
                      {isOwn && (
                        <View style={styles.itemActions}>
                          <PressableScale
                            scaleTo={0.88}
                            hitSlop={8}
                            onPress={() => startEditing(inst)}
                            style={styles.actionBtn}
                          >
                            <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                          </PressableScale>
                          <PressableScale
                            scaleTo={0.88}
                            hitSlop={8}
                            onPress={() => confirmDelete(inst.id)}
                            style={styles.actionBtn}
                          >
                            <Ionicons name="trash-outline" size={15} color={colors.error} />
                          </PressableScale>
                        </View>
                      )}
                    </View>
                  );
                })}
              </GlassPanel>
            )}
          </ScrollView>

          {/* Clean Bottom Composer */}
          <View style={styles.composerBar}>
            {/* Category selection row */}
            <View style={styles.categoryPicker}>
              {CATEGORIES.map((c) => {
                const isSelected = newCategory === c.key;
                return (
                  <PressableScale
                    key={c.key}
                    scaleTo={0.94}
                    haptic="light"
                    onPress={() => setNewCategory(c.key)}
                    style={[
                      styles.pillBtn,
                      isSelected && {
                        backgroundColor: `${c.color}20`,
                        borderColor: `${c.color}66`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={c.icon}
                      size={12}
                      color={isSelected ? c.color : colors.outline}
                    />
                    <Text
                      style={[
                        styles.pillBtnText,
                        isSelected && { color: c.color, fontWeight: '700' },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            {/* Input Row */}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={placeholderText}
                placeholderTextColor={colors.outline}
                value={newInstruction}
                onChangeText={setNewInstruction}
                multiline
                maxLength={500}
              />
              <PressableScale
                scaleTo={0.9}
                haptic="light"
                disabled={!newInstruction.trim() || saving}
                onPress={handleAdd}
                style={[
                  styles.sendBtn,
                  newInstruction.trim() && styles.sendBtnActive,
                ]}
              >
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={newInstruction.trim() ? '#FFFFFF' : colors.outline}
                />
              </PressableScale>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function formatRelative(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },

  headerCounter: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    color: colors.outline,
    paddingRight: 4,
  },

  scroll: {
    padding: CONTAINER_MARGIN,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },

  subtitle: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
    paddingHorizontal: 2,
    marginBottom: spacing.xs,
  },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    flexWrap: 'wrap',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  filterPillText: {
    ...typography.caption,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  filterPillTextActive: {
    color: colors.onSurface,
    fontWeight: '700',
  },

  listCard: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md + 2,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: glass.stroke,
  },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemText: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '500',
    color: colors.onSurface,
    lineHeight: 21,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  itemAuthor: {
    ...typography.caption,
    fontSize: 12,
    color: colors.outline,
    fontWeight: '500',
  },
  itemDot: {
    color: colors.outline,
    fontSize: 11,
  },
  itemTime: {
    ...typography.caption,
    fontSize: 11.5,
    color: colors.outline,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  editContainer: {
    flex: 1,
    gap: spacing.sm,
  },
  editInput: {
    ...typography.body,
    fontSize: 14,
    color: colors.onSurface,
    backgroundColor: colors.surfaceLowest,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderBright,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    maxHeight: 110,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  editCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editCancelText: {
    ...typography.label,
    fontSize: 12.5,
    color: colors.outline,
  },
  editSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  editSaveText: {
    ...typography.label,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Composer Bar
  composerBar: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: glass.stroke,
    gap: spacing.xs + 2,
  },
  categoryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pillBtnText: {
    ...typography.caption,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.outline,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    fontSize: 14,
    color: colors.onSurface,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 3,
    maxHeight: 90,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnActive: {
    backgroundColor: colors.primary,
  },

  centered: { paddingVertical: spacing.xl * 2, alignItems: 'center' },
  loadingText: { ...typography.caption, color: colors.outline },
});
