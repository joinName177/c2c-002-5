import type { Emotion, EmotionEntry, GardenSnapshot, GrowthStage, Plant, Tag } from './models';
import { EMOTION_META, EMOTIONS } from './models';

const day = 86400000;
export function stageFor(streak: number): GrowthStage { if (streak >= 14) return '结果'; if (streak >= 7) return '开花'; if (streak >= 3) return '发芽'; return '种子'; }
export function streakFor(entries: EmotionEntry[], emotion: Emotion): number {
  const dates = new Set(entries.filter((item) => item.emotion === emotion).map((item) => item.date));
  let streak = 0; const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  while (dates.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setTime(cursor.getTime() - day); }
  if (!streak) {
    const sortedDates = [...dates].sort(); const latest = sortedDates[sortedDates.length - 1]; if (!latest) return 0;
    const distance = Math.floor((Date.now() - new Date(`${latest}T00:00:00`).getTime()) / day);
    if (distance > 1) return 0;
    streak = 1;
  }
  return streak;
}
export function syncPlants(entries: EmotionEntry[], previous: Plant[] = []): Plant[] {
  return EMOTIONS.filter((emotion) => entries.some((item) => item.emotion === emotion)).map((emotion) => {
    const own = entries.filter((item) => item.emotion === emotion).sort((a, b) => a.date.localeCompare(b.date));
    const existing = previous.find((item) => item.emotion === emotion);
    const streak = streakFor(entries, emotion);
    return { id: existing?.id ?? `plant-${emotion}`, emotion, plantedAt: own[0].date, lastWatered: own[own.length - 1].date, streak, stage: stageFor(streak), status: streak ? '繁茂' : '枯萎', entryIds: own.map((item) => item.id) };
  });
}
export function createEntry(emotion: Emotion, note: string, intensity: number, tagIds: string[] = [], date = new Date().toISOString().slice(0, 10)): EmotionEntry { return { id: `emotion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date, emotion, note: note.trim() || EMOTION_META[emotion].hint, intensity: Math.min(5, Math.max(1, Number(intensity) || 3)), tagIds: [...new Set(tagIds)] }; }

// ---- 标签：三处视图共用同一份数据，记录只通过 tagIds 引用 ----
export function createTag(name: string): Tag { return { id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim() }; }

/** 新建标签：同名（忽略首尾空白、大小写一致）则复用已有标签 */
export function addTag(tags: Tag[], name: string): { tags: Tag[]; tag: Tag } {
  const trimmed = name.trim();
  const existing = tags.find((tag) => tag.name === trimmed);
  if (existing) return { tags, tag: existing };
  const tag = createTag(trimmed);
  return { tags: [...tags, tag], tag };
}

/**
 * 标签改名：
 * - 新名字未被占用：仅更新这一个标签的名字，所有记录引用不变（三处视图立即跟着变）；
 * - 改成已存在的另一个标签名：合并两条标签，两条名下的记录都归到保留的标签，源标签删除。
 */
export function renameTag(tags: Tag[], entries: EmotionEntry[], id: string, name: string): { tags: Tag[]; entries: EmotionEntry[]; mergedInto?: Tag } {
  const target = tags.find((tag) => tag.id === id);
  if (!target) return { tags, entries };
  const trimmed = name.trim();
  if (!trimmed || trimmed === target.name) return { tags, entries };
  const counterpart = tags.find((tag) => tag.id !== id && tag.name === trimmed);
  if (!counterpart) {
    return { tags: tags.map((tag) => (tag.id === id ? { ...tag, name: trimmed } : tag)), entries };
  }
  const mergedEntries = entries.map((entry) => {
    if (!entry.tagIds.includes(id)) return entry;
    return { ...entry, tagIds: [...new Set([...entry.tagIds.filter((tagId) => tagId !== id), counterpart.id])] };
  });
  return { tags: tags.filter((tag) => tag.id !== id), entries: mergedEntries, mergedInto: counterpart };
}

/**
 * 删除标签：只解除与记录的绑定，历史记录一律保留并回到未分类；
 * 顺带清理指向已不存在标签的悬空引用。
 */
export function removeTag(tags: Tag[], entries: EmotionEntry[], id: string): { tags: Tag[]; entries: EmotionEntry[] } {
  const nextTags = tags.filter((tag) => tag.id !== id);
  const known = new Set(nextTags.map((tag) => tag.id));
  const nextEntries = entries.map((entry) =>
    entry.tagIds.some((tagId) => !known.has(tagId)) ? { ...entry, tagIds: entry.tagIds.filter((tagId) => known.has(tagId)) } : entry,
  );
  return { tags: nextTags, entries: nextEntries };
}

/** 旧版本数据迁移：补全 tags 与每条记录的 tagIds */
export function migrateSnapshot(raw: Partial<GardenSnapshot> | null | undefined): GardenSnapshot {
  const entries: EmotionEntry[] = (raw?.entries ?? []).map((entry) => ({ ...entry, tagIds: Array.isArray(entry.tagIds) ? entry.tagIds : [] }));
  const tags: Tag[] = raw?.tags ?? [];
  const known = new Set(tags.map((tag) => tag.id));
  entries.forEach((entry) => { entry.tagIds = [...new Set(entry.tagIds.filter((tagId) => known.has(tagId)))]; });
  const plants = raw?.plants ?? syncPlants(entries);
  return { entries, plants, tags };
}

export function annualReport(entries: EmotionEntry[]) {
  const counts = EMOTIONS.map((emotion) => ({ emotion, count: entries.filter((item) => item.emotion === emotion).length })).sort((a, b) => b.count - a.count);
  const active = new Set(entries.map((item) => item.date)).size;
  const intensity = entries.length ? entries.reduce((sum, item) => sum + item.intensity, 0) / entries.length : 0;
  return { top: counts[0], counts, active, lushness: Math.min(100, Math.round((active / 90) * 70 + (intensity / 5) * 30)), intensity: Math.round(intensity * 10) / 10 };
}
/** 年报：某个标签下的情绪分布；tagId 为空时统计全部记录 */
export function reportForTag(entries: EmotionEntry[], tags: Tag[], tagId: string | null) {
  const scoped = tagId ? entries.filter((entry) => entry.tagIds.includes(tagId)) : entries;
  const tag = tagId ? tags.find((item) => item.id === tagId) : undefined;
  const counts = EMOTIONS.map((emotion) => ({ emotion, count: scoped.filter((item) => item.emotion === emotion).length })).sort((a, b) => b.count - a.count);
  const active = new Set(scoped.map((item) => item.date)).size;
  const intensity = scoped.length ? scoped.reduce((sum, item) => sum + item.intensity, 0) / scoped.length : 0;
  return { tag: tag ?? null, total: scoped.length, counts, top: counts[0], active, intensity: Math.round(intensity * 10) / 10, lushness: Math.min(100, Math.round((active / 90) * 70 + (intensity / 5) * 30)) };
}
export function sampleSnapshot(): GardenSnapshot {
  const today = new Date(); const entries: EmotionEntry[] = [];
  const seed: { emotion: Emotion; tag: '工作' | '生活' | '' }[] = [
    { emotion: '喜悦', tag: '生活' }, { emotion: '喜悦', tag: '工作' }, { emotion: '平静', tag: '生活' }, { emotion: '平静', tag: '' },
    { emotion: '平静', tag: '工作' }, { emotion: '平静', tag: '生活' }, { emotion: '喜悦', tag: '生活' }, { emotion: '忧伤', tag: '工作' },
    { emotion: '焦虑', tag: '工作' }, { emotion: '平静', tag: '生活' }, { emotion: '喜悦', tag: '生活' },
  ];
  const tags: Tag[] = [{ id: 'tag-work', name: '工作' }, { id: 'tag-life', name: '生活' }];
  const tagIdOf = (tag: string) => (tag === '工作' ? 'tag-work' : tag === '生活' ? 'tag-life' : '');
  seed.forEach((item, index) => {
    const date = new Date(today.getTime() - (seed.length - index - 1) * day).toISOString().slice(0, 10);
    entries.push(createEntry(item.emotion, index % 2 ? '今天注意到了自己的节奏。' : '给这一天留下一颗种子。', (index % 5) + 1, tagIdOf(item.tag) ? [tagIdOf(item.tag)] : [], date));
  });
  return { entries, plants: syncPlants(entries), tags };
}
