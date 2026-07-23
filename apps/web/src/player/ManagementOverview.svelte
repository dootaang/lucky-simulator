<script lang="ts">
  import DecisionDock from './DecisionDock.svelte';
  import FactReceipt from './FactReceipt.svelte';
  import type { ManagementSummaryModel } from './management-summary';
  import type { SimulationActionHandler } from './simulation-action';
  let { model, busy=false, compact=false, onaction, onfull }: { model:ManagementSummaryModel; busy?:boolean; compact?:boolean; onaction:SimulationActionHandler; onfull:()=>void } = $props();
</script>

<section class="overview" class:compact aria-label="관리 요약">
  <header><div><small>현재 봇</small><h2>{compact?'빠른 관리':'관리'}</h2></div>{#if compact}<button class="full" onclick={onfull}>전체 관리 기능</button>{/if}</header>
  <div class="block"><h3>지금 상태</h3>{#if model.status.length}<div class="status">{#each model.status as item (item.id)}<span><small>{item.label||'현재'}</small><b>{item.value}</b></span>{/each}</div>{:else}<p class="empty">표시할 상태가 없습니다.</p>{/if}</div>
  <div class="block tasks"><h3>지금 할 일</h3>{#if model.tasks.length}<DecisionDock cards={model.tasks} {busy} {onaction}/>{:else}<p class="empty">지금 바로 처리할 일은 없습니다.</p>{/if}</div>
  <div class="block"><h3>최근 결과</h3>{#if model.recentLogs.length}<FactReceipt logs={model.recentLogs}/>{:else}<p class="empty">아직 기록된 결과가 없습니다.</p>{/if}</div>
  {#if !compact}<button class="console" onclick={onfull}>전체 관리 기능 보기</button>{/if}
</section>

<style>
  .overview{min-height:100%;padding:var(--space-5);box-sizing:border-box;background:var(--color-canvas);color:var(--color-text);overflow:auto}.overview>header{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);max-width:760px;margin:0 auto var(--space-5)}header div{display:grid;gap:2px}h2,h3{margin:0}header small,.empty{color:var(--color-text-muted)}.block{max-width:760px;margin:0 auto var(--space-5)}h3{margin-bottom:var(--space-3);font-size:var(--type-title)}.status{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:var(--space-2)}.status span{display:grid;gap:4px;padding:var(--space-3);border:1px solid var(--color-line);border-radius:var(--radius-lg);background:var(--color-surface)}.status small{color:var(--color-text-muted)}.status b{font-size:var(--type-title)}.tasks :global(.dock){max-width:none;padding:0}.console,.full{min-height:var(--touch-min);padding:var(--space-2) var(--space-4);border:1px solid var(--color-accent);border-radius:var(--radius-md);background:var(--color-selected);color:var(--color-text);cursor:pointer}.console{display:block;width:min(100%,760px);margin:0 auto}.compact{min-height:0;max-height:min(72dvh,680px);padding:var(--space-4);border-radius:var(--radius-xl) var(--radius-xl) 0 0}.compact>header{margin-bottom:var(--space-4)}.compact .block{margin-bottom:var(--space-4)}@media(max-width:600px){.overview{padding:var(--space-4) var(--space-3) calc(var(--nav-size) + var(--space-5))}.compact{padding-bottom:calc(var(--space-4) + env(safe-area-inset-bottom))}.status{grid-template-columns:repeat(3,minmax(0,1fr))}.status span{padding:var(--space-2)}.status b{font-size:var(--type-body)}}
</style>
