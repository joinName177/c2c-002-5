<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { LocalGardenRepository } from '../adapters/local-garden.repository';
import { EMOTION_META, EMOTIONS, type Emotion, type Tag } from '../core/models';
import { annualReport, createEntry, sampleSnapshot, syncPlants } from '../core/garden-engine';
import { createTag, removeTag, renameTag, reportByTag } from '../core/tag-engine';

const repo = new LocalGardenRepository();
const state = reactive(repo.load());
const tab = ref<'花园' | '种植' | '时间轴' | '标本馆' | '年报'>('花园');
const selectedEmotion = ref<Emotion>('喜悦');
const notice = ref('');
const draft = reactive({ note: '', intensity: 3, tagIds: [] as string[] });
// 'all' 全部 | 'untagged' 未分类 | 标签 id
const timelineFilter = ref<string>('all');
const creatingTag = ref(false);
const newTagName = ref('');
const editingTag = ref<{ id: string; name: string } | null>(null);

const report = computed(() => annualReport(state.entries));
const tagReports = computed(() => reportByTag(state));
const living = computed(() => state.plants.filter((plant) => plant.status === '繁茂'));
const specimens = computed(() => state.plants.filter((plant) => plant.status === '枯萎'));
const timeline = computed(() => [...state.entries].sort((a, b) => b.date.localeCompare(a.date)));
const leafOf = computed(() => new Map(timeline.value.map((entry, index) => [entry.id, index + 1])));
const tagNameById = computed(() => new Map(state.tags.map((tag) => [tag.id, tag.name])));
const filteredTimeline = computed(() => {
  if (timelineFilter.value === 'all') return timeline.value;
  if (timelineFilter.value === 'untagged') return timeline.value.filter((entry) => entry.tagIds.length === 0);
  return timeline.value.filter((entry) => entry.tagIds.includes(timelineFilter.value));
});

function flash(message: string) { notice.value = message; }
function save() {
  state.plants = syncPlants(state.entries, state.plants);
  repo.save({ entries: state.entries, plants: state.plants, tags: state.tags });
}
function plant() {
  state.entries.unshift(createEntry(selectedEmotion.value, draft.note, draft.intensity, draft.tagIds));
  draft.note = '';
  save();
  flash(`${EMOTION_META[selectedEmotion.value].plant} 已经种下`);
  tab.value = '花园';
}
function reset() {
  const fresh = sampleSnapshot();
  state.entries = fresh.entries; state.plants = fresh.plants; state.tags = fresh.tags;
  draft.tagIds = []; timelineFilter.value = 'all';
  save();
  flash('已恢复初始示例花园');
}

function toggleDraftTag(id: string) {
  draft.tagIds = draft.tagIds.includes(id) ? draft.tagIds.filter((item) => item !== id) : [...draft.tagIds, id];
}
function startNewTag() { creatingTag.value = true; newTagName.value = ''; }
function cancelNewTag() { creatingTag.value = false; newTagName.value = ''; }
function confirmNewTag() {
  if (!creatingTag.value) return;
  const name = newTagName.value.trim();
  creatingTag.value = false; newTagName.value = '';
  if (!name) return;
  const existed = state.tags.some((tag) => tag.name === name);
  const tag = createTag(state, name);
  if (!draft.tagIds.includes(tag.id)) draft.tagIds.push(tag.id);
  save();
  flash(existed ? `「${name}」已存在，已直接为这条记录选中` : `已创建标签「${name}」并选中`);
}
function startRename(tag: Tag) { editingTag.value = { id: tag.id, name: tag.name }; }
function cancelRename() { editingTag.value = null; }
function confirmRename() {
  const editing = editingTag.value;
  if (!editing) return;
  const name = editing.name.trim();
  editingTag.value = null;
  if (!name) return;
  const result = renameTag(state, editing.id, name);
  if (result.merged) {
    const target = state.tags.find((tag) => tag.name === name);
    draft.tagIds = [...new Set(draft.tagIds.map((id) => (id === editing.id && target ? target.id : id)))];
    if (timelineFilter.value === editing.id) timelineFilter.value = target ? target.id : 'all';
    save();
    flash(`已合并到「${name}」，两边的记录都归到了一起，一条也没丢`);
  } else {
    save();
    flash('标签已改名，时间轴和年报已同步');
  }
}
function confirmRemove(tag: Tag) {
  const count = tagCount(tag.id);
  if (!window.confirm(`删除标签「${tag.name}」？\n它名下的 ${count} 条历史记录会全部保留，只是回到未分类，不会被删除。`)) return;
  removeTag(state, tag.id);
  draft.tagIds = draft.tagIds.filter((id) => id !== tag.id);
  if (timelineFilter.value === tag.id) timelineFilter.value = 'all';
  save();
  flash(`标签「${tag.name}」已删除，${count} 条记录已回到未分类`);
}
function tagCount(id: string) { return state.entries.filter((entry) => entry.tagIds.includes(id)).length; }
function entryTagNames(entry: { tagIds: string[] }) {
  return entry.tagIds.map((id) => tagNameById.value.get(id)).filter((name): name is string => Boolean(name));
}
</script>

<template>
  <div class="garden-app">
    <header class="garden-topbar"><div class="garden-brand"><span class="garden-mark">✿</span><div><span class="eyebrow">THE INNER GARDEN / 02</span><h1>情绪植物园</h1></div></div><div class="garden-top-actions"><span class="weather">今日花园 · {{ living.length }} 株在生长</span><button class="quiet-button" type="button" @click="reset">重置演示</button></div></header>
    <main class="garden-wrap"><section class="garden-hero"><div><span class="eyebrow green-text">DAILY EMOTION CULTIVATION</span><h2>给情绪一块<br /><i>可以生长的土壤。</i></h2><p>你不需要每天都阳光明媚，只需要为此刻诚实地浇一次水。</p></div><div class="garden-stats"><div><strong>{{ report.active }}</strong><span>活跃日</span></div><div><strong>{{ report.lushness }}<small>%</small></strong><span>花园繁茂度</span></div><div><strong>{{ state.entries.length }}</strong><span>情绪标本</span></div></div></section>
      <nav class="garden-tabs"><button v-for="item in ['花园', '种植', '时间轴', '标本馆', '年报']" :key="item" type="button" :class="{ active: tab === item }" @click="tab = item as typeof tab">{{ item }}</button></nav>
      <section v-if="tab === '花园'" class="garden-board"><div class="board-heading"><div><span class="eyebrow">YOUR EMOTIONAL BIOME</span><h3>正在生长的情绪</h3></div><span class="season-label">秋季 · 第 40 周</span></div><div class="plant-grid"><article v-for="plant in living" :key="plant.id" class="plant-card" :style="{ '--plant-color': EMOTION_META[plant.emotion].color }"><div class="plant-card-top"><span class="plant-status">正在生长</span><span>{{ plant.streak }} 天连续</span></div><div class="plant-illustration"><span class="plant-glow"></span><strong>{{ EMOTION_META[plant.emotion].symbol }}</strong><i v-for="n in Math.min(plant.streak + 1, 5)" :key="n" :style="{ '--n': n }">●</i></div><div class="plant-info"><span class="plant-emotion">{{ plant.emotion }}</span><h4>{{ EMOTION_META[plant.emotion].plant }}</h4><p>{{ EMOTION_META[plant.emotion].hint }}</p><div class="growth-track"><span :style="{ width: `${Math.min(100, Math.max(12, plant.streak / 14 * 100))}%` }"></span></div><small>{{ plant.stage }} · 下一阶段还需 {{ Math.max(0, 3 - plant.streak) }} 天</small></div></article><button class="add-plant-card" type="button" @click="tab = '种植'"><span>＋</span><strong>种下一颗新情绪</strong><small>每天记录，植物就会长大</small></button></div></section>
      <section v-else-if="tab === '种植'" class="planting-layout"><article class="plant-form"><div class="board-heading"><div><span class="eyebrow">PLANT A FEELING</span><h3>今天的你，是什么天气？</h3></div></div><div class="emotion-picker"><button v-for="emotion in EMOTIONS" :key="emotion" type="button" :class="{ selected: selectedEmotion === emotion }" :style="{ '--emotion-color': EMOTION_META[emotion].color }" @click="selectedEmotion = emotion"><span>{{ EMOTION_META[emotion].symbol }}</span><b>{{ emotion }}</b><small>{{ EMOTION_META[emotion].plant }}</small></button></div><label>给这颗情绪留一句话<textarea v-model="draft.note" rows="5" placeholder="它今天为什么来到这里？"></textarea></label><label>情绪强度 <output>{{ draft.intensity }} / 5</output><input v-model.number="draft.intensity" type="range" min="1" max="5" /></label>
        <div class="tag-field"><div class="tag-field-head"><span class="tag-field-label">这颗情绪来自哪里（可挂多个标签）</span><button v-if="!creatingTag" class="tag-add-btn" type="button" @click="startNewTag">＋ 新标签</button></div><div class="tag-chip-row"><button v-for="tag in state.tags" :key="tag.id" type="button" class="tag-chip" :class="{ on: draft.tagIds.includes(tag.id) }" @click="toggleDraftTag(tag.id)">{{ tag.name }}<i v-if="draft.tagIds.includes(tag.id)">✓</i></button><input v-if="creatingTag" v-model="newTagName" class="tag-chip-input" type="text" placeholder="输入标签名，回车确认" autofocus @keyup.enter="confirmNewTag" @keyup.esc="cancelNewTag" @blur="confirmNewTag" /><span v-if="!state.tags.length && !creatingTag" class="tag-empty">还没有标签，先建一个吧（比如：工作、生活）</span></div>
          <div v-if="state.tags.length" class="tag-manager"><div v-for="tag in state.tags" :key="tag.id" class="tag-manage-row"><template v-if="editingTag?.id === tag.id"><input v-model="editingTag.name" class="tag-rename-input" type="text" autofocus @keyup.enter="confirmRename" @keyup.esc="cancelRename" @blur="confirmRename" /></template><template v-else><span class="tag-manage-name">{{ tag.name }}</span><small>{{ tagCount(tag.id) }} 条记录</small><span class="tag-manage-actions"><button type="button" @click="startRename(tag)">改名</button><button type="button" class="danger" @click="confirmRemove(tag)">删除</button></span></template></div></div>
          <p class="tag-hint">改成已有标签的名字会自动合并两个标签；删除标签只会解除绑定，历史记录保留并回到未分类。</p>
        </div>
        <button class="plant-button" type="button" @click="plant">种下这颗情绪 ✦</button><p class="notice">{{ notice }}</p></article><aside class="plant-preview" :style="{ '--preview-color': EMOTION_META[selectedEmotion].color }"><span class="eyebrow">PREVIEW / {{ selectedEmotion }}</span><div class="preview-plant">{{ EMOTION_META[selectedEmotion].symbol }}</div><h3>{{ EMOTION_META[selectedEmotion].plant }}</h3><p>今天种下，连续记录 3 天后发芽，7 天后开花，14 天后结果。</p></aside></section>
      <section v-else-if="tab === '时间轴'" class="timeline-section"><div class="board-heading"><div><span class="eyebrow">GROWTH TIMELINE</span><h3>每一天，都留下了一片叶子</h3></div></div>
        <div class="tag-filter-bar"><button type="button" class="filter-chip" :class="{ on: timelineFilter === 'all' }" @click="timelineFilter = 'all'">全部</button><button v-for="tag in state.tags" :key="tag.id" type="button" class="filter-chip" :class="{ on: timelineFilter === tag.id }" @click="timelineFilter = tag.id">{{ tag.name }}<em>{{ tagCount(tag.id) }}</em></button><button type="button" class="filter-chip" :class="{ on: timelineFilter === 'untagged' }" @click="timelineFilter = 'untagged'">未分类</button></div>
        <div class="timeline"><div v-for="entry in filteredTimeline" :key="entry.id" class="timeline-item"><div class="timeline-date"><strong>{{ new Date(`${entry.date}T00:00:00`).getDate() }}</strong><span>{{ new Date(`${entry.date}T00:00:00`).toLocaleDateString('zh-CN', { month: 'short' }) }}</span></div><div class="timeline-dot" :style="{ background: EMOTION_META[entry.emotion].color }"></div><div class="timeline-content"><div><span class="timeline-emotion" :style="{ color: EMOTION_META[entry.emotion].color }">{{ EMOTION_META[entry.emotion].symbol }} {{ entry.emotion }}</span><span class="intensity">强度 {{ entry.intensity }}/5</span></div><div v-if="entryTagNames(entry).length" class="timeline-tags"><span v-for="name in entryTagNames(entry)" :key="name" class="entry-tag">{{ name }}</span></div><p>{{ entry.note }}</p><small>{{ EMOTION_META[entry.emotion].plant }} · 第 {{ leafOf.get(entry.id) }} 片叶子</small></div></div></div>
        <div v-if="!filteredTimeline.length" class="empty-state">这个标签下还没有记录。</div>
      </section>
      <section v-else-if="tab === '标本馆'" class="specimen-section"><div class="board-heading"><div><span class="eyebrow">SPECIMEN ARCHIVE</span><h3>枯萎不是消失，是被好好保存</h3></div></div><div v-if="specimens.length" class="specimen-grid"><div v-for="plant in specimens" :key="plant.id" class="specimen-card"><div class="pressed-flower">{{ EMOTION_META[plant.emotion].symbol }}</div><div><span>{{ plant.emotion }} · {{ EMOTION_META[plant.emotion].plant }}</span><strong>生长了 {{ plant.entryIds.length }} 天</strong><small>最后浇水：{{ plant.lastWatered }}</small></div></div></div><div v-else class="empty-state">你的标本馆还是空的。持续记录，等一朵花完成它的季节。</div></section>
      <section v-else class="report-section"><div class="report-heading"><span class="eyebrow">EMOTIONAL ECOLOGY REPORT · 2026</span><h3>你的情绪生态年报</h3><p>这一年，你和自己的内在天气相处得怎么样？</p></div><div class="report-grid"><div class="report-score"><span>花园繁茂度</span><strong>{{ report.lushness }}<small>/ 100</small></strong><div class="report-progress"><i :style="{ width: `${report.lushness}%` }"></i></div><p>每一次诚实的记录，都会让生态系统更完整。</p></div><div class="top-emotion"><span>最常出现的物种</span><div><strong :style="{ color: EMOTION_META[report.top.emotion].color }">{{ EMOTION_META[report.top.emotion].symbol }}</strong><h4>{{ report.top.emotion }}</h4></div><p>{{ report.top.count }} 次记录 · 是你今年最熟悉的一种天气</p></div><div class="count-chart"><span>情绪物种分布</span><div v-for="item in report.counts" :key="item.emotion" class="count-row"><b>{{ item.emotion }}</b><div><i :style="{ width: `${Math.max(5, item.count / Math.max(report.top.count, 1) * 100)}%`, background: EMOTION_META[item.emotion].color }"></i></div><small>{{ item.count }}</small></div></div></div>
        <div class="tag-report"><div class="tag-report-head"><span class="eyebrow">EMOTIONS BY TAG</span><h3>每个标签下的情绪分布</h3><p>看看工作与生活，各自给你带来了哪些天气。</p></div><div v-if="tagReports.length" class="tag-report-grid"><article v-for="row in tagReports" :key="row.tag ? row.tag.id : 'untagged'" class="tag-report-card"><header><span class="tag-report-name">{{ row.tag ? row.tag.name : '未分类' }}</span><small>{{ row.total }} 条记录</small></header><div v-for="item in row.counts" :key="item.emotion" class="tag-count-row"><b>{{ item.emotion }}</b><div><i :style="{ width: `${Math.max(6, item.count / row.total * 100)}%`, background: EMOTION_META[item.emotion].color }"></i></div><small>{{ item.count }}</small></div></article></div><div v-else class="empty-state">还没有标签。去「种植」页建一个，再回来看每个标签下的情绪分布。</div></div>
      </section>
    </main>
  </div>
</template>
