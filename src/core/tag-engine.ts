import type { Emotion, EmotionEntry, GardenSnapshot, Tag } from './models';
import { EMOTIONS } from './models';
import { syncPlants } from './garden-engine';
import { createTagId } from './ids';

export { createTagId };

/** 归一化任意来源（旧版 localStorage、示例数据等）的快照：补齐 tags/tagIds、同名标签合并、失效引用剔除 */
export function normalizeSnapshot(raw: unknown): GardenSnapshot {
  const source = (raw ?? {}) as Partial<GardenSnapshot>;
  const entries = Array.isArray(source.entries) ? source.entries : [];
  const rawTags = Array.isArray(source.tags) ? source.tags : [];

  // 同名标签以首次出现者为准，后续重复 id 作为别名，最终一并并入规范 id
  const canonical = new Map<string, Tag>();
  const alias = new Map<string, string>();
  const tags: Tag[] = [];
  rawTags.forEach((rawTag) => {
    if (!rawTag || typeof rawTag !== 'object') return;
    const name = String((rawTag as Partial<Tag>).name ?? '').trim();
    const id = String((rawTag as Partial<Tag>).id ?? '');
    if (!name || !id) return;
    const existing = canonical.get(name);
    if (existing) alias.set(id, existing.id);
    else { const tag: Tag = { id, name }; canonical.set(name, tag); tags.push(tag); }
  });

  const validIds = new Set(tags.map((tag) => tag.id));
  const normalizedEntries: EmotionEntry[] = entries.map((entry) => {
    const rawIds = Array.isArray((entry as Partial<EmotionEntry>).tagIds) ? (entry as Partial<EmotionEntry>).tagIds as unknown[] : [];
    const resolved = new Set<string>();
    rawIds.forEach((value) => {
      const id = String(value);
      const target = alias.get(id) ?? id;
      if (validIds.has(target)) resolved.add(target);
    });
    return { ...(entry as EmotionEntry), tagIds: [...resolved] };
  });

  return {
    entries: normalizedEntries,
    tags,
    plants: Array.isArray(source.plants) && source.plants.length ? (source.plants as GardenSnapshot['plants']) : syncPlants(normalizedEntries),
  };
}

/** 新建标签；同名时直接返回已有标签，保证标签名唯一 */
export function createTag(snapshot: GardenSnapshot, name: string): Tag {
  const trimmed = name.trim();
  const existing = snapshot.tags.find((tag) => tag.name === trimmed);
  if (existing) return existing;
  const tag: Tag = { id: createTagId(), name: trimmed };
  snapshot.tags.push(tag);
  return tag;
}

/**
 * 重命名标签。
 * 目标名字已被其他标签占用时执行合并：旧标签名下的记录全部转入目标标签（去重），旧标签删除。
 * 返回 { merged } 标识是否发生了合并。
 */
export function renameTag(snapshot: GardenSnapshot, tagId: string, name: string): { merged: boolean } {
  const target = snapshot.tags.find((tag) => tag.id === tagId);
  if (!target) return { merged: false };
  const trimmed = name.trim();
  if (!trimmed || trimmed === target.name) return { merged: false };

  const other = snapshot.tags.find((tag) => tag.id !== tagId && tag.name === trimmed);
  if (!other) { target.name = trimmed; return { merged: false }; }

  snapshot.entries.forEach((entry) => {
    if (entry.tagIds.includes(tagId)) {
      entry.tagIds = entry.tagIds.filter((id) => id !== tagId);
      if (!entry.tagIds.includes(other.id)) entry.tagIds.push(other.id);
    }
  });
  snapshot.tags = snapshot.tags.filter((tag) => tag.id !== tagId);
  return { merged: true };
}

/** 删除标签：仅解除与历史记录的绑定，记录保留并回到未分类 */
export function removeTag(snapshot: GardenSnapshot, tagId: string): void {
  snapshot.tags = snapshot.tags.filter((tag) => tag.id !== tagId);
  snapshot.entries.forEach((entry) => {
    if (entry.tagIds.includes(tagId)) entry.tagIds = entry.tagIds.filter((id) => id !== tagId);
  });
}

export interface TagReport { tag: Tag | null; total: number; counts: { emotion: Emotion; count: number }[]; }

/** 每个标签（含未分类）下的情绪分布，供年报使用 */
export function reportByTag(snapshot: GardenSnapshot): TagReport[] {
  const build = (tag: Tag | null, own: EmotionEntry[]): TagReport => ({
    tag,
    total: own.length,
    counts: EMOTIONS.map((emotion) => ({ emotion, count: own.filter((entry) => entry.emotion === emotion).length }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count),
  });
  const reports = snapshot.tags.map((tag) => build(tag, snapshot.entries.filter((entry) => entry.tagIds.includes(tag.id))));
  const untagged = snapshot.entries.filter((entry) => entry.tagIds.length === 0);
  if (untagged.length) reports.push(build(null, untagged));
  return reports;
}
