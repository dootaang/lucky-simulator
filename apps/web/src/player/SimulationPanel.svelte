<script lang="ts">
  import type {ProjectRuntime} from '@simbot/runtime';
  import type {PlaySession} from '@simbot/session';
  import Icon from '@simbot/ui/Icon.svelte';
  import ScreenRenderer from './ScreenRenderer.svelte';
  let {runtime,version,session,portraitFor,onclose}:{runtime:ProjectRuntime;version:number;session:PlaySession;portraitFor:(npcId:string,emotion?:string)=>string|null;onclose:()=>void}=$props();
</script>
<div class="backdrop" role="presentation" onclick={(event)=>{if(event.target===event.currentTarget)onclose();}}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="시뮬레이션">
    <header><div><b>시뮬레이션</b><small>엔진이 직접 계산하고 기록하는 게임 화면</small></div><button aria-label="닫기" onclick={onclose}><Icon name="close"/></button></header>
    <main><ScreenRenderer {runtime} {version} {session} {portraitFor}/></main>
  </div>
</div>
<style>
  .backdrop{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:18px;background:#07090db8;backdrop-filter:blur(4px)}.panel{width:min(1100px,100%);height:min(860px,calc(100dvh - 36px));display:flex;flex-direction:column;border:1px solid #3b414d;border-radius:12px;background:#12151b;color:#eceef3;box-shadow:0 24px 80px #000b;overflow:hidden}header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #30343d;background:#191c22}header div{display:grid;gap:2px}header small{font-size:11px;color:#9299a7}header button{display:grid;place-items:center;padding:7px;border:0;background:transparent;color:#b4bac6;cursor:pointer}main{padding:14px;overflow:auto}@media(max-width:700px){.backdrop{padding:0}.panel{width:100%;height:100dvh;border:0;border-radius:0}main{padding:10px}}
</style>
