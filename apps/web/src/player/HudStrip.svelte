<script lang="ts">
  import type { HudModel } from './hud-model';
  let { model }: { model: HudModel } = $props();
</script>

<!-- 계기판은 상태만 보여준다. 관리 진입은 모바일 버튼과 데스크톱 메뉴로 통일한다. -->
<div class="hud" role="status" aria-label="엔진 계기판">
  <div class="chips">{#each [...model.fixed,...model.gauges] as chip (chip.id)}<span class="chip">{#if chip.label}<b>{chip.label}</b>{/if}{chip.value}</span>{/each}</div>
</div>

<style>
  .hud{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:8px;min-height:36px;padding:5px 10px;border-bottom:1px solid #262a33;background:#12141af2;backdrop-filter:blur(3px);font-size:12px;color:#c9cedb}
  .chips{display:flex;flex:1;min-width:0;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:thin;scrollbar-color:#4e586b transparent;padding-bottom:2px}
  .chip{display:inline-flex;flex:none;align-items:center;gap:5px;padding:3px 9px;border:1px solid #2d323d;border-radius:999px;background:#191c23;white-space:nowrap}
  .chip b{font-weight:600;color:#8d95a5;font-size:11px}
  @media(max-width:680px){.hud{font-size:11px;min-height:32px;padding:4px 8px}}
</style>
