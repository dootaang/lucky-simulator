<script lang="ts" module>
  export type NavDestination='bots'|'chats'|'settings';
</script>
<script lang="ts">
  import Icon from './icons/Icon.svelte';
  // 목록 화면의 최상위 목적지는 봇·대화·설정 세 개다. 실제 채팅 안에서는 이 막대를 숨긴다.
  // 1000px 미만에서는 하단 탭바, 이상에서는 왼쪽 세로 레일로 배치만 바뀐다.
  let{active,chatEnabled=true,onnavigate}:{active:NavDestination;chatEnabled?:boolean;onnavigate:(dest:NavDestination)=>void}=$props();
  const items:Array<{id:NavDestination;label:string;icon:string;aria?:string}>=[
    {id:'bots',label:'봇',icon:'bot',aria:'봇 목록'},
    {id:'chats',label:'대화',icon:'message',aria:'대화 목록'},
    {id:'settings',label:'설정',icon:'settings',aria:'전체 설정'}
  ];
</script>

<nav class="adaptive-nav" aria-label="주요 메뉴">
  {#each items as item(item.id)}
    <button class:active={active===item.id} aria-label={item.aria??item.label} aria-current={active===item.id?'page':undefined} disabled={item.id==='chats'&&!chatEnabled} onclick={()=>onnavigate(item.id)}>
      <Icon name={item.icon} size={22}/><span>{item.label}</span>
    </button>
  {/each}
</nav>

<style>
  .adaptive-nav{display:flex;background:var(--color-inset);border-color:var(--color-line)}
  .adaptive-nav button{display:grid;place-items:center;gap:2px;min-width:var(--touch-min);min-height:var(--touch-min);padding:var(--space-1);border:0;background:transparent;color:var(--color-text-muted);font-size:var(--type-caption);cursor:pointer;transition:color var(--motion-fast)}
  .adaptive-nav button.active{color:var(--color-accent)}
  .adaptive-nav button:hover:not(:disabled){color:var(--color-text)}
  .adaptive-nav button:disabled{opacity:.4;cursor:default}
  .adaptive-nav button:focus-visible{outline:2px solid var(--color-focus);outline-offset:-2px}
  @media(max-width:999px){
    /* 설정 오버레이(z=80)보다 위 — 설정에서도 목록 목적지로 한 번에 돌아간다. */
    .adaptive-nav{position:fixed;inset:auto 0 0;z-index:95;justify-content:space-around;border-top:1px solid var(--color-line);padding-bottom:env(safe-area-inset-bottom)}
    .adaptive-nav button{flex:1;height:var(--nav-size)}
  }
  @media(min-width:1000px){
    .adaptive-nav{flex-direction:column;justify-content:flex-start;gap:var(--space-2);width:100%;padding:var(--space-2) 0;border:0;background:transparent}
    .adaptive-nav button{width:100%}
  }
</style>
