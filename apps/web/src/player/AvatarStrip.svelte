<script lang="ts">
  import type { CardLibraryMeta } from './card-library';
  let {cards,activeId,avatarFor,onadd,onselect,onremove,onsettings}:{cards:Array<CardLibraryMeta&{ephemeral?:boolean}>;activeId:string|null;avatarFor:(id:string)=>string|null;onadd:()=>void;onselect:(id:string)=>void;onremove:(id:string)=>void;onsettings:()=>void}=$props();
</script>
<aside class="strip" aria-label="카드 라이브러리">
  <button class="add" onclick={onadd} aria-label="카드 가져오기">＋</button>
  <div class="cards">{#each cards as card (card.projectId)}<button class:active={card.projectId===activeId} class="avatar" title={`${card.name}${card.ephemeral?' · 이번 세션만':''}`} onclick={()=>onselect(card.projectId)} oncontextmenu={(e)=>{e.preventDefault();if(confirm(`${card.name} 카드와 채팅을 삭제할까요?`))onremove(card.projectId);}}>{#if avatarFor(card.projectId)}<img src={avatarFor(card.projectId)!} alt=""/>{:else}<span>{card.name.slice(0,1)}</span>{/if}{#if card.ephemeral}<i>!</i>{/if}</button>{/each}</div>
  <button class="gear" onclick={onsettings} aria-label="LLM 설정">⚙</button>
</aside>
<style>
  .strip{width:80px;height:100dvh;flex:none;display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px 10px;background:#17191f;border-right:1px solid #30333c}.cards{display:flex;flex-direction:column;gap:10px;overflow-y:auto}.avatar,.add,.gear{position:relative;width:52px;height:52px;border:1px solid #3a3e48;border-radius:12px;background:#242730;color:#d9dce5;font-size:20px;cursor:pointer;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}.avatar.active{border-color:#6999ff;box-shadow:0 0 0 2px #6999ff44}.add{border-style:dashed}.gear{margin-top:auto}.avatar i{position:absolute;right:2px;bottom:2px;border-radius:50%;background:#d59532;color:#111;width:16px;height:16px;font:700 11px/16px sans-serif}@media(max-width:680px){.strip{display:none}}
</style>
