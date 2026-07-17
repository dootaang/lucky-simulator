<script lang="ts">
  import Icon from '@simbot/ui/Icon.svelte';
  import type { HudModel } from './hud-model';
  let { model, onmanage }: { model: HudModel; onmanage: () => void } = $props();
</script>

<!-- 계기판: 관리 버튼만 고정하고 모든 상태 칩을 한 덩어리로 가로 스크롤한다. -->
<div class="hud" role="status" aria-label="엔진 계기판">
  <div class="chips">{#each [...model.fixed,...model.gauges] as chip (chip.id)}<span class="chip">{#if chip.label}<b>{chip.label}</b>{/if}{chip.value}</span>{/each}</div>
  <button class="manage" title="시뮬레이션 · 관리" aria-label="관리 화면 열기" onclick={onmanage}><Icon name="badge" size={14}/></button>
</div>

<style>
  .hud{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:8px;min-height:36px;padding:5px 10px;border-bottom:1px solid #262a33;background:#12141af2;backdrop-filter:blur(3px);font-size:12px;color:#c9cedb}
  .chips{display:flex;flex:1;min-width:0;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:thin;scrollbar-color:#4e586b transparent;padding-bottom:2px}
  .chip{display:inline-flex;flex:none;align-items:center;gap:5px;padding:3px 9px;border:1px solid #2d323d;border-radius:999px;background:#191c23;white-space:nowrap}
  .chip b{font-weight:600;color:#8d95a5;font-size:11px}
  .manage{display:grid;flex:none;place-items:center;margin-left:auto;padding:6px;border:1px solid #5f8cf0;border-radius:7px;background:#25477c;color:#dbe9ff;box-shadow:0 0 0 1px #79a4ff22;cursor:pointer}
  .manage:hover{color:#fff;border-color:#9abbff;background:#315b99}
  @media(max-width:680px){.hud{font-size:11px;min-height:32px;padding:4px 8px}}
</style>
