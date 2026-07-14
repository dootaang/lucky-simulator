<script lang="ts">
  import LadderGauge from '@simbot/ui/LadderGauge.svelte';
  import type { RosterRow } from './roster-model';
  let { rows, portraitFor, revealAll, onreveal }: { rows: RosterRow[]; portraitFor: (npcId: string, emotion?: string) => string | null; revealAll: boolean; onreveal: (value: boolean) => void } = $props();
  let metCount = $derived(rows.filter((row) => row.met).length);
</script>
<section class="roster" aria-label="NPC 로스터">
  <header><h4>NPC 로스터 <small>{metCount}/{rows.length}</small></h4><label class="reveal"><input type="checkbox" checked={revealAll} onchange={(event)=>onreveal(event.currentTarget.checked)}/>전부 공개</label></header>
  {#each rows as row (row.id)}
    <article class:silhouette={!row.met}>
      <span class="portrait">{#if row.met && portraitFor(row.id)}<img src={portraitFor(row.id)} alt=""/>{:else if row.met}{row.name.slice(0, 1)}{:else}?{/if}</span>
      <div class="meta">
        <div class="line"><b>{row.name}</b>{#each row.tags as tag}<small class="tag">{tag}</small>{/each}</div>
        {#if row.ladder}<LadderGauge label={row.ladder.label} value={row.ladder.value} min={row.ladder.tierMin} max={row.ladder.tierMax} next={row.ladder.next} brief={row.ladder.brief ?? ''}/>{/if}
      </div>
    </article>
  {/each}
  {#if !rows.length}<p class="empty">이 카드에는 등록된 NPC가 없습니다.</p>{/if}
</section>
<style>
  .roster{display:grid;gap:7px}
  header{display:flex;align-items:center;justify-content:space-between}
  header h4{margin:0}header small{color:#8d95a5;font-weight:400}
  .reveal{display:flex;align-items:center;gap:5px;font-size:11px;color:#8d95a5;cursor:pointer}
  article{display:grid;grid-template-columns:38px minmax(0,1fr);align-items:center;gap:9px;padding:6px;border:1px solid #262a33;border-radius:8px;background:#14161c}
  article.silhouette{opacity:.55}
  .portrait{width:38px;height:38px;display:grid;place-items:center;overflow:hidden;border-radius:7px;background:#262b36;color:#8d95a5;font-weight:700}
  .portrait img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}
  .meta{display:grid;gap:4px;min-width:0}
  .line{display:flex;align-items:center;gap:6px;min-width:0}
  .line b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tag{flex:none;padding:1px 6px;border-radius:999px;background:#20303f;color:#9cc3e8;font-size:10px}
  .empty{margin:0;color:#8d95a5;font-size:12px}
</style>
