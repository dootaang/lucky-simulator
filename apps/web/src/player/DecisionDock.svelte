<script lang="ts">
  import Icon from '@simbot/ui/Icon.svelte';
  import type { DecisionCardModel } from './decision-model';
  import type { SimulationActionHandler } from './simulation-action';
  let { cards, busy, onaction }: { cards: DecisionCardModel[]; busy: boolean; onaction: SimulationActionHandler } = $props();
</script>

<!-- 조종대: 엔진이 결정을 기다릴 때만 입력창 위에 나타난다. ★ 서명 = 엔진이 제시한 진짜 선택지(LLM 서사의 가짜 선택지와 구분). -->
{#if cards.length}
  <div class="dock" role="region" aria-label="엔진 결정 카드">
    {#each cards as card (card.key)}
      <article>
        <div class="head"><Icon name={card.icon} size={13}/><b>{card.title}</b>{#if card.more}<small>{card.more}</small>{/if}</div>
        {#if card.desc}<p>{card.desc}</p>{/if}
        <div class="options">{#each card.options as option (option.label)}<button class={option.kind} disabled={busy} onclick={()=>void onaction({id:option.id,params:option.params,mode:option.mode})}>{option.label}</button>{/each}</div>
      </article>
    {/each}
  </div>
{/if}

<style>
  .dock{position:relative;z-index:2;display:grid;gap:7px;margin:0 auto;padding:8px 20px 4px;width:100%;max-width:900px;box-sizing:border-box}
  article{display:grid;gap:6px;padding:9px 12px;border:1px solid #4a4133;border-left:3px solid #d8b36a;border-radius:9px;background:#171512f0}
  .head{display:flex;align-items:center;gap:7px;color:#d8b36a;font-size:12px}
  .head b{color:#eee;font-size:13px}
  .head small{margin-left:auto;color:#8d95a5;font-size:11px}
  p{margin:0;color:#aeb3bd;font-size:12px;line-height:1.5}
  .options{display:flex;flex-wrap:wrap;gap:6px}
  button{padding:6px 13px;border:1px solid #3a3f4a;border-radius:7px;background:#20242d;color:#dfe3eb;font-size:12px;cursor:pointer}
  button.primary{border-color:#5c4b2a;background:#2a2417;color:#ecd9ab}
  button:hover:not(:disabled){border-color:#d8b36a}
  button:disabled{opacity:.5;cursor:default}
  @media(max-width:680px){.dock{padding:8px 10px 4px}}
</style>
