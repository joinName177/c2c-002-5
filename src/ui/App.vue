<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { LocalGardenRepository } from '../adapters/local-garden.repository';
import { EMOTION_META, EMOTIONS, type Emotion, type Tag } from '../core/models';
import { addTag, annualReport, createEntry, removeTag, renameTag, reportForTag, sampleSnapshot, syncPlants } from '../core/garden-engine';

const repo = new LocalGardenRepository();
const state = reactive(repo.load());
const tab = ref<'花园' | '种植' | '时间轴' | '标本馆' | '年报'>('花园');
const selectedEmotion = ref<Emotion>('喜悦');
const notice = ref('');
const draft = reactive({ note: '', intensity: 3 });
const draftTagIds = ref<string[]>([]);
const newTagName = ref('');
const UNCLASSIFIED = '__unclassified__';
const filterTagId = ref<string | null>(null);
const reportTagId = ref<string | null>(null);
const editingTagId = ref<string | null>(null);
const editingTagName = ref('');
const confirmDeleteId = ref<string | null>(null);

const report = computed(() => annualReport(state.entries));
const living = computed(() => state.plants.filter((plant) => plant.status === '繁茂'));
const specimens = computed(() => state.plants.filter((plant) => plant.status === '枯萎'));
const tagById = computed(() => new Map(state.tags.map((tag) => [tag.id, tag])));
const tagCounts = computed(() => {
  const counts = new Map<string, number>();
  state.entries.forEach((entry) => entry.tagIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
  return counts;
});
const unclassifiedCount = computed(() => state.entries.filter((entry) => entry.tagIds.length === 0).length);
const timeline = computed(() =>
  [...state.entries]
    .filter((entry) => {
      if (!filterTagId.value) return true;
      if (filterTagId.value === UNCLASSIFIED) return entry.tagIds.length === 0;
      return entry.tagIds.includes(filterTagId.value);
    })
    .sort((a, b) => b.date.localeCompare(a.date)),
);
const tagReport = computed(() => reportForTag(state.entries, state.tags, reportTagId.value));

function save() { state.plants = syncPlants(state.entries, state.plants); repo.save({ entries: state.entries, plants: state.plants, tags: state.tags }); }
function persistTags(nextTags: Tag[], nextEntries = state.entries) { state.tags = nextTags; state.entries = nextEntries as typeof state.entries; save(); }
function tagNamesOf(entry: { tagIds: string[] }) { return entry.tagIds.map((id) => tagById.value.get(id)?.name).filter((name): name is string => Boolean(name)); }
function toggleDraftTag(id: string) {
  draftTagIds.value = draftTagIds.value.includes(id) ? draftTagIds.value.filter((item) => item !== id) : [...draftTagIds.value, id];
  confirmDeleteId.value = null;
}
function plant() {
  state.entries.unshift(createEntry(selectedEmotion.value, draft.note, draft.intensity, draftTagIds.value));
  draft.note = ''; draftTagIds.value = [];
  save();
  notice.value = `${EMOTION_META[selectedEmotion.value].plant} 已经种下`;
  tab.value = '花园';
}
function createNewTag() {
  const name = newTagName.value.trim();
  if (!name) return;
  const result = addTag(state.tags, name);
  state.tags = result.tags;
  if (!draftTagIds.value.includes(result.tag.id)) draftTagIds.value.push(result.tag.id);
  newTagName.value = '';
  save();
  notice.value = state.tags.some((tag) => tag.id !== result.tag.id && tag.name === name)
    ? `「${name}」已存在，已直接为这条记录挂上`
    : `标签「${name}」已创建并挂到这条记录上`;
}
function startEditTag(tag: Tag) { editingTagId.value = tag.id; editingTagName.value = tag.name; confirmDeleteId.value = null; }
function cancelEditTag() { editingTagId.value = null; editingTagName.value = ''; }
function confirmRenameTag(tag: Tag) {
  const name = editingTagName.value.trim();
  if (!name) { cancelEditTag(); return; }
  const boundCount = state.entries.filter((entry) => entry.tagIds.includes(tag.id)).length;
  const result = renameTag(state.tags, state.entries, tag.id, name);
  if (result.mergedInto) {
    persistTags(result.tags, result.entries);
    draftTagIds.value = [...new Set(draftTagIds.value.map((id) => (id === tag.id ? result.mergedInto!.id : id)))];
    if (filterTagId.value === tag.id) filterTagId.value = result.mergedInto.id;
    if (reportTagId.value === tag.id) reportTagId.value = result.mergedInto.id;
    notice.value = `已合并到「${result.mergedInto.name}」，${boundCount} 条记录都归到了该标签下`;
  } else if (result.tags !== state.tags) {
    persistTags(result.tags, result.entries);
    notice.value = `标签已改名为「${name}」，时间轴和年报里的它一起更新了`;
  }
  cancelEditTag();
}
function askDeleteTag(tag: Tag) {
  if (confirmDeleteId.value === tag.id) {
    const boundCount = state.entries.filter((entry) => entry.tagIds.includes(tag.id)).length;
    const result = removeTag(state.tags, state.entries, tag.id);
    persistTags(result.tags, result.entries);
    draftTagIds.value = draftTagIds.value.filter((id) => id !== tag.id);
    if (filterTagId.value === tag.id) filterTagId.value = null;
    if (reportTagId.value === tag.id) reportTagId.value = null;
    confirmDeleteId.value = null;
    notice.value = `标签「${tag.name}」已删除，${boundCount} 条历史记录保留，已回到未分类`;
  } else {
    confirmDeleteId.value = tag.id;
  }
}
function reset() {
  const fresh = sampleSnapshot();
  state.entries = fresh.entries; state.plants = fresh.plants; state.tags = fresh.tags;
  draftTagIds.value = []; filterTagId.value = null; reportTagId.value = null;
  save();
  notice.value = '已恢复初始示例花园';
}
</script>

<template>
  <div class="garden-app">
    <header class="garden-topbar"><div class="garden-brand"><span class="garden-mark">✿</span><div><span class="eyebrow">THE INNER GARDEN / 02</span><h1>情绪植物园</h1></div></div><div class="garden-top-actions"><span class="weather">今日花园 · {{ living.length }} 株在生长</span><button class="quiet-button" type="button" @click="reset">重置演示</button></div></header>
    <main class="garden-wrap"><section class="garden-hero"><div><span class="eyebrow green-text">DAILY EMOTION CULTIVATION</span><h2>给情绪一块<br /><i>可以生长的土壤。</i></h2><p>你不需要每天都阳光明媚，只需要为此刻诚实地浇一次水。</p></div><div class="garden-stats"><div><strong>{{ report.active }}</strong><span>活跃日</span></div><div><strong>{{ report.lushness }}<small>%</small></strong><span>花园繁茂度</span></div><div><strong>{{ state.entries.length }}</strong><span>情绪标本</span></div></div></section>
      <nav class="garden-tabs"><button v-for="item in ['花园', '种植', '时间轴', '标本馆', '年报']" :key="item" type="button" :class="{ active: tab === item }" @click="tab = item as typeof tab">{{ item }}</button></nav>
      <section v-if="tab === '花园'" class="garden-board"><div class="board-heading"><div><span class="eyebrow">YOUR EMOTIONAL BIOME</span><h3>正在生长的情绪</h3></div><span class="season-label">秋季 · 第 40 周</span></div><div class="plant-grid"><article v-for="plant in living" :key="plant.id" class="plant-card" :style="{ '--plant-color': EMOTION_META[plant.emotion].color }"><div class="plant-card-top"><span class="plant-status">正在生长</span><span>{{ plant.streak }} 天连续</span></div><div class="plant-illustration"><span class="plant-glow"></span><strong>{{ EMOTION_META[plant.emotion].symbol }}</strong><i v-for="n in Math.min(plant.streak + 1, 5)" :key="n" :style="{ '--n': n }">●</i></div><div class="plant-info"><span class="plant-emotion">{{ plant.emotion }}</span><h4>{{ EMOTION_META[plant.emotion].plant }}</h4><p>{{ EMOTION_META[plant.emotion].hint }}</p><div class="growth-track"><span :style="{ width: `${Math.min(100, Math.max(12, plant.streak / 14 * 100))}%` }"></span></div><small>{{ plant.stage }} · 下一阶段还需 {{ Math.max(0, 3 - plant.streak) }} 天</small></div></article><button class="add-plant-card" type="button" @click="tab = '种植'"><span>＋</span><strong>种下一颗新情绪</strong><small>每天记录，植物就会长大</small></button></div></section>
      <section v-else-if="tab === '种植'" class="planting-layout"><article class="plant-form"><div class="board-heading"><div><span class="eyebrow">PLANT A FEELING</span><h3>今天的你，是什么天气？</h3></div></div><div class="emotion-picker"><button v-for="emotion in EMOTIONS" :key="emotion" type="button" :class="{ selected: selectedEmotion === emotion }" :style="{ '--emotion-color': EMOTION_META[emotion].color }" @click="selectedEmotion = emotion"><span>{{ EMOTION_META[emotion].symbol }}</span><b>{{ emotion }}</b><small>{{ EMOTION_META[emotion].plant }}</small></button></div><label>给这颗情绪留一句话<textarea v-model="draft.note" rows="5" placeholder="它今天为什么来到这里？"></textarea></label><label>情绪强度 <output>{{ draft.intensity }} / 5</output><input v-model.number="draft.intensity" type="range" min="1" max="5" /></label>
        <div class="tag-field"><span class="tag-field-label">这颗情绪来自哪里？<small>可挂多个标签，也可以不挂</small></span><div class="tag-picker"><button v-for="tag in state.tags" :key="tag.id" type="button" class="tag-chip" :class="{ selected: draftTagIds.includes(tag.id) }" @click="toggleDraftTag(tag.id)">{{ tag.name }}</button><span v-if="!state.tags.length" class="tag-empty">还没有标签，在下方先建一个吧</span></div><div class="tag-create"><input v-model="newTagName" type="text" placeholder="新标签名，如：工作、生活、家庭…" @keyup.enter="createNewTag" /><button type="button" @click="createNewTag">新建</button></div></div>
        <button class="plant-button" type="button" @click="plant">种下这颗情绪 ✦</button><p class="notice">{{ notice }}</p>
        <div class="tag-manager"><span class="eyebrow">TAG MANAGER</span><h4>标签管理</h4><p class="tag-manager-tip">改名会同步到时间轴和年报；改成已有的名字会自动合并；删除只解绑，记录仍会保留。</p><div v-for="tag in state.tags" :key="tag.id" class="tag-manager-row"><template v-if="editingTagId === tag.id"><input v-model="editingTagName" type="text" class="tag-rename-input" @keyup.enter="confirmRenameTag(tag)" @keyup.esc="cancelEditTag" /><button type="button" class="tag-op confirm" @click="confirmRenameTag(tag)">保存</button><button type="button" class="tag-op" @click="cancelEditTag">取消</button></template><template v-else><b>{{ tag.name }}</b><span class="tag-count">{{ tagCounts.get(tag.id) ?? 0 }} 条记录</span><button type="button" class="tag-op" @click="startEditTag(tag)">改名</button><button type="button" class="tag-op danger" :class="{ confirming: confirmDeleteId === tag.id }" @click="askDeleteTag(tag)">{{ confirmDeleteId === tag.id ? '再点一次确认删除' : '删除' }}</button></template></div><p v-if="!state.tags.length" class="tag-manager-empty">还没有标签。</p></div>
      </article><aside class="plant-preview" :style="{ '--preview-color': EMOTION_META[selectedEmotion].color }"><span class="eyebrow">PREVIEW / {{ selectedEmotion }}</span><div class="preview-plant">{{ EMOTION_META[selectedEmotion].symbol }}</div><h3>{{ EMOTION_META[selectedEmotion].plant }}</h3><p>今天种下，连续记录 3 天后发芽，7 天后开花，14 天后结果。</p></aside></section>
      <section v-else-if="tab === '时间轴'" class="timeline-section"><div class="board-heading"><div><span class="eyebrow">GROWTH TIMELINE</span><h3>每一天，都留下了一片叶子</h3></div></div>
        <div class="tag-filter"><button type="button" class="tag-chip" :class="{ selected: filterTagId === null }" @click="filterTagId = null">全部 <small>{{ state.entries.length }}</small></button><button v-for="tag in state.tags" :key="tag.id" type="button" class="tag-chip" :class="{ selected: filterTagId === tag.id }" @click="filterTagId = filterTagId === tag.id ? null : tag.id">{{ tag.name }} <small>{{ tagCounts.get(tag.id) ?? 0 }}</small></button><button type="button" class="tag-chip" :class="{ selected: filterTagId === UNCLASSIFIED }" @click="filterTagId = filterTagId === UNCLASSIFIED ? null : UNCLASSIFIED">未分类 <small>{{ unclassifiedCount }}</small></button></div>
        <div class="timeline"><div v-for="(entry, index) in timeline" :key="entry.id" class="timeline-item"><div class="timeline-date"><strong>{{ new Date(`${entry.date}T00:00:00`).getDate() }}</strong><span>{{ new Date(`${entry.date}T00:00:00`).toLocaleDateString('zh-CN', { month: 'short' }) }}</span></div><div class="timeline-dot" :style="{ background: EMOTION_META[entry.emotion].color }"></div><div class="timeline-content"><div><span class="timeline-emotion" :style="{ color: EMOTION_META[entry.emotion].color }">{{ EMOTION_META[entry.emotion].symbol }} {{ entry.emotion }}</span><span class="intensity">强度 {{ entry.intensity }}/5</span></div><p>{{ entry.note }}</p><div class="timeline-foot"><small>{{ EMOTION_META[entry.emotion].plant }} · 第 {{ index + 1 }} 片叶子</small><span class="entry-tags"><i v-for="name in tagNamesOf(entry)" :key="name">{{ name }}</i><i v-if="!entry.tagIds.length" class="none">未分类</i></span></div></div></div></div>
        <p v-if="!timeline.length" class="empty-state">这个标签下还没有记录。</p>
      </section>
      <section v-else-if="tab === '标本馆'" class="specimen-section"><div class="board-heading"><div><span class="eyebrow">SPECIMEN ARCHIVE</span><h3>枯萎不是消失，是被好好保存</h3></div></div><div v-if="specimens.length" class="specimen-grid"><div v-for="plant in specimens" :key="plant.id" class="specimen-card"><div class="pressed-flower">{{ EMOTION_META[plant.emotion].symbol }}</div><div><span>{{ plant.emotion }} · {{ EMOTION_META[plant.emotion].plant }}</span><strong>生长了 {{ plant.entryIds.length }} 天</strong><small>最后浇水：{{ plant.lastWatered }}</small></div></div></div><div v-else class="empty-state">你的标本馆还是空的。持续记录，等一朵花完成它的季节。</div></section>
      <section v-else class="report-section"><div class="report-heading"><span class="eyebrow">EMOTIONAL ECOLOGY REPORT · 2026</span><h3>你的情绪生态年报</h3><p>这一年，你和自己的内在天气相处得怎么样？</p><div class="report-tagbar"><button type="button" class="tag-chip" :class="{ selected: reportTagId === null }" @click="reportTagId = null">全年总览</button><button v-for="tag in state.tags" :key="tag.id" type="button" class="tag-chip" :class="{ selected: reportTagId === tag.id }" @click="reportTagId = reportTagId === tag.id ? null : tag.id">{{ tag.name }}</button></div></div>
        <div v-if="tagReport.total" class="report-grid"><div class="report-score"><span>{{ tagReport.tag ? `「${tagReport.tag.name}」繁茂度` : '花园繁茂度' }}</span><strong>{{ tagReport.lushness }}<small>/ 100</small></strong><div class="report-progress"><i :style="{ width: `${tagReport.lushness}%` }"></i></div><p>{{ tagReport.total }} 条记录 · {{ tagReport.active }} 个活跃日 · 平均强度 {{ tagReport.intensity }}/5</p></div><div class="top-emotion"><span>最常出现的物种</span><div><strong :style="{ color: EMOTION_META[tagReport.top.emotion].color }">{{ EMOTION_META[tagReport.top.emotion].symbol }}</strong><h4>{{ tagReport.top.emotion }}</h4></div><p>{{ tagReport.top.count }} 次记录 · 是{{ tagReport.tag ? `「${tagReport.tag.name}」` : '今年' }}最熟悉的一种天气</p></div><div class="count-chart"><span>{{ tagReport.tag ? `「${tagReport.tag.name}」情绪分布` : '情绪物种分布' }}</span><div v-for="item in tagReport.counts" :key="item.emotion" class="count-row"><b>{{ item.emotion }}</b><div><i :style="{ width: `${Math.max(5, item.count / Math.max(tagReport.top.count, 1) * 100)}%`, background: EMOTION_META[item.emotion].color }"></i></div><small>{{ item.count }}</small></div></div></div>
        <p v-else class="empty-state">这个标签下还没有记录，年报里暂时没有它的身影。</p>
      </section>
    </main>
  </div>
</template>
