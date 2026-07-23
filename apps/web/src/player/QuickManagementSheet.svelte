<script lang="ts">
  import OverlayGuard from '@simbot/ui/OverlayGuard.svelte';
  import ManagementOverview from './ManagementOverview.svelte';
  import type { ManagementSummaryModel } from './management-summary';
  import type { SimulationActionHandler } from './simulation-action';
  let { model, busy=false, onaction, onfull, onclose }: { model:ManagementSummaryModel; busy?:boolean; onaction:SimulationActionHandler; onfull:()=>void; onclose:()=>void } = $props();
</script>

<OverlayGuard label="빠른 관리" {onclose} modal={false} dock>
  <div class="sheet"><ManagementOverview {model} {busy} compact {onaction} {onfull}/></div>
</OverlayGuard>

<style>.sheet{width:min(760px,100vw);max-height:72dvh;overflow:hidden;border:1px solid var(--color-line);border-bottom:0;border-radius:var(--radius-xl) var(--radius-xl) 0 0;background:var(--color-canvas);box-shadow:var(--shadow-panel)}@media(max-width:760px){.sheet{width:100vw;border-inline:0}}</style>
