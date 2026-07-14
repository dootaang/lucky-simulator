<script lang="ts">
  import Icon from '@simbot/ui/Icon.svelte';
  import type { HudModel } from './hud-model';
  let { model, onmanage }: { model: HudModel; onmanage: () => void } = $props();
</script>

<!-- 계기판: 시계·지갑은 고정, 게이지만 가로 스크롤(오너 결정). 슬롯 0개면 부모가 아예 렌더하지 않는다. -->
<div class="hud" role="status" aria-label="엔진 계기판">
  <div class="fixed">{#each model.fixed as chip (chip.id)}<span class="chip"><b>{chip.label}</b>{chip.value}</span>{/each}</div>
  {#if model.gauges.length}<div class="gauges">{#each model.gauges as chip (chip.id)}<span class="chip"><b>{chip.label}</b>{chip.value}</span>{/each}</div>{/if}
  <button class="manage" title="시뮬레이션 · 관리" aria-label="관리 화면 열기" onclick={onmanage}><Icon name="badge" size={14}/></button>
</div>

<style>
  .hud{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:8px;min-height:36px;padding:5px 10px;border-bottom:1px solid #262a33;background:#12141af2;backdrop-filter:blur(3px);font-size:12px;color:#c9cedb}
  .fixed{display:flex;flex:none;align-items:center;gap:6px}
  .gauges{display:flex;flex:1;min-width:0;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none;mask-image:linear-gradient(to right,#000 calc(100% - 26px),transparent)}
  .gauges::-webkit-scrollbar{display:none}
  .chip{display:inline-flex;flex:none;align-items:center;gap:5px;padding:3px 9px;border:1px solid #2d323d;border-radius:999px;background:#191c23;white-space:nowrap}
  .chip b{font-weight:600;color:#8d95a5;font-size:11px}
  .manage{display:grid;flex:none;place-items:center;margin-left:auto;padding:6px;border:1px solid #2d323d;border-radius:7px;background:#191c23;color:#aeb6c6;cursor:pointer}
  .manage:hover{color:#fff;border-color:#6c98f4}
  @media(max-width:680px){.hud{font-size:11px;min-height:32px;padding:4px 8px}}
</style>
