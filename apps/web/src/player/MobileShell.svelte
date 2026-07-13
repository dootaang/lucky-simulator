<script lang="ts">
  import type { ChatIndex } from '@simbot/session';
  import type { CardLibraryMeta } from './card-library';
  import Icon from '@simbot/ui/Icon.svelte';

  export type MobileSettingsTab = 'model' | 'prompt' | 'persona' | 'other';
  let {
    cardName = '카드를 선택하세요', cards, index, activeId, hasCard = false, compiling = false, compiled = false,
    onadd, oncard, onchat, onnewchat, onrenamechat, onremovechat, onexport, onimport, oncompile, oninspect, onsettings,
  }: {
    cardName?: string; cards: CardLibraryMeta[]; index: ChatIndex; activeId: string | null; hasCard?: boolean; compiling?: boolean; compiled?: boolean;
    onadd: () => void; oncard: (id: string) => void; onchat: (id: string) => void;
    onnewchat?: () => void; onrenamechat?: (id: string) => void; onremovechat?: (id: string) => void; onexport?: () => void; onimport?: (file: File) => void; oncompile?: () => void; oninspect?: () => void;
    onsettings: (tab: MobileSettingsTab) => void;
  } = $props();

  let open = $state(false);
  let view = $state<'home' | 'cards' | 'chats' | 'settings'>('home');
  let importInput = $state<HTMLInputElement>();
  const close = () => { open = false; view = 'home'; };
  const openSettings = (tab: MobileSettingsTab) => { close(); onsettings(tab); };
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') close(); }}/>

<header class="appbar">
  <button aria-label="메뉴 열기" aria-expanded={open} onclick={() => { open = true; view = 'home'; }}><Icon name="list"/></button>
  <strong>{cardName}</strong>
  <button aria-label="설정 열기" onclick={() => openSettings('model')}><Icon name="settings"/></button>
</header>

{#if open}
  <button class="scrim" aria-label="메뉴 닫기" onclick={close}></button>
  <aside class="drawer" aria-label="주 메뉴">
    <header class="drawer-head">
      {#if view !== 'home'}<button aria-label="뒤로" onclick={() => view = 'home'}><Icon name="left"/></button>{/if}
      <strong>{view === 'home' ? '럭키 시뮬레이터' : view === 'cards' ? '봇 목록' : view === 'chats' ? '채팅 목록' : '설정'}</strong>
      <button class="close" aria-label="닫기" onclick={close}>×</button>
    </header>

    {#if view === 'home'}
      <nav class="home-menu">
        <button class="settings-entry" onclick={() => view = 'settings'}><Icon name="settings"/><span><b>설정</b><small>모델 · 프롬프트 · 페르소나</small></span><Icon name="right"/></button>
        <button onclick={() => view = 'cards'}><Icon name="user"/><span><b>봇 목록</b><small>{cards.length}개</small></span><Icon name="right"/></button>
        <button onclick={() => view = 'chats'}><Icon name="message"/><span><b>채팅 목록</b><small>{index.chats.length}개</small></span><Icon name="right"/></button>
        {#if hasCard&&oncompile}<button class="compile-entry" disabled={compiling} onclick={()=>{close();oncompile?.();}}><Icon name="star"/><span><b>{compiling?'엔진 컴파일 중…':compiled?'엔진 재컴파일':'엔진 컴파일'}</b><small>{compiled?'승인된 엔진 적용 중':'봇카드를 시뮬 엔진으로 변환'}</small></span><Icon name="right"/></button>{/if}
        {#if hasCard&&oninspect}<button onclick={()=>{close();oninspect?.();}}><Icon name="badge"/><span><b>세션 검사기</b><small>프롬프트 · 기억 · 엔진 증거</small></span><Icon name="right"/></button>{/if}
      </nav>
    {:else if view === 'settings'}
      <nav class="list-menu">
        <button onclick={() => openSettings('model')}><Icon name="bot"/><span>모델 · 생성 설정</span><Icon name="right"/></button>
        <button onclick={() => openSettings('prompt')}><Icon name="message"/><span>프롬프트</span><Icon name="right"/></button>
        <button onclick={() => openSettings('persona')}><Icon name="user"/><span>페르소나</span><Icon name="right"/></button>
        <button onclick={() => openSettings('other')}><Icon name="settings"/><span>기타 · 보조 모델</span><Icon name="right"/></button>
      </nav>
    {:else if view === 'cards'}
      <section class="items">
        <button class="create" onclick={() => { close(); onadd(); }}><Icon name="plus"/> 봇카드 가져오기</button>
        {#each cards as card}
          <button class:active={card.projectId === activeId} onclick={() => { close(); oncard(card.projectId); }}>
            <span class="avatar">{card.name.slice(0, 1)}</span><span>{card.name}</span>{#if card.missing}<small>재연결 필요</small>{/if}
          </button>
        {/each}
      </section>
    {:else}
      <section class="items">
        {#if hasCard && onnewchat}<button class="create" onclick={() => { close(); onnewchat?.(); }}><Icon name="plus"/> 새 채팅</button>{/if}
        {#if hasCard&&onexport&&onimport}<div class="transfer"><button onclick={onexport}>현재 채팅 내보내기</button><button onclick={()=>importInput?.click()}>채팅 가져오기</button><input class="hidden" bind:this={importInput} type="file" accept="application/json,.json" onchange={(event)=>{const input=event.currentTarget,file=input.files?.[0];if(file)onimport?.(file);input.value='';}}/></div>{/if}
        {#if index.chats.length === 0}<p>봇을 선택하면 채팅 목록이 표시됩니다.</p>{/if}
        {#each index.chats as chat}
          <div class="chatrow" class:active={chat.chatId === index.activeChatId}>
            <button class="pick" onclick={() => { close(); onchat(chat.chatId); }}><Icon name="message"/><span>{chat.name}</span><small>{chat.turn}턴</small></button>
            {#if onrenamechat}<button class="row-action" aria-label="이름 변경" onclick={() => onrenamechat?.(chat.chatId)}><Icon name="pencil"/></button>{/if}
            {#if onremovechat}<button class="row-action" aria-label="채팅 삭제" onclick={() => onremovechat?.(chat.chatId)}><Icon name="trash"/></button>{/if}
          </div>
        {/each}
      </section>
    {/if}
  </aside>
{/if}

<style>
  .appbar,.drawer,.scrim{display:none}
  @media(max-width:999px){
    .appbar{position:fixed;inset:0 0 auto;z-index:35;min-height:56px;display:grid;grid-template-columns:52px minmax(0,1fr) 52px;align-items:center;border-bottom:1px solid #30343d;background:#111318;color:#eef0f5;padding-top:env(safe-area-inset-top)}
    .appbar strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}.appbar button,.drawer button{border:0;background:transparent;color:inherit;cursor:pointer}.appbar button{height:56px;display:grid;place-items:center}
    .scrim{display:block;position:fixed;inset:0;z-index:40;border:0;background:#0009}.drawer{display:flex;position:fixed;inset:0 auto 0 0;z-index:45;width:min(88vw,380px);flex-direction:column;background:#15171c;color:#e8eaf0;box-shadow:8px 0 28px #0008;animation:slide .18s ease-out;padding-top:env(safe-area-inset-top)}
    .drawer-head{height:56px;display:grid;grid-template-columns:48px 1fr 48px;align-items:center;border-bottom:1px solid #30343d}.drawer-head strong{align-self:center}.drawer-head button{height:48px;display:grid;place-items:center}.drawer-head strong:first-child{grid-column:1/3;padding-left:16px}.drawer-head .close{font-size:26px;color:#9aa1ae}
    .home-menu,.list-menu{display:grid;padding:10px}.home-menu button,.list-menu button{min-height:62px;display:grid;grid-template-columns:34px minmax(0,1fr) 24px;align-items:center;gap:8px;padding:10px;border-radius:8px;text-align:left}.home-menu button:hover,.list-menu button:hover{background:#292d36}.home-menu .settings-entry{margin-bottom:10px;border:1px solid #343a47;background:#20242c}.home-menu span{display:grid;gap:3px}.home-menu b{font-size:14px}.home-menu small{color:#858c99}
    .items{overflow-y:auto;padding:10px}.items>button{width:100%;min-height:50px;display:flex;align-items:center;gap:10px;padding:8px;border-radius:7px;text-align:left}.items>button:hover,.items>button.active{background:#292d36}.items .create{border:1px dashed #4b5260;margin-bottom:8px;justify-content:center}.avatar{width:36px;height:36px;display:grid;place-items:center;border-radius:6px;background:#333844}.items small{margin-left:auto;color:#d59d6a}.items p{color:#9299a7;font-size:13px}
    .transfer{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}.transfer button{padding:8px;border:1px solid #353b48;border-radius:6px;color:#aeb6c5}.hidden{display:none}.chatrow{display:flex;align-items:center;gap:2px;border-radius:8px}.chatrow.active{background:#2a3040}.chatrow .pick{flex:1;display:flex;align-items:center;gap:8px;padding:10px;text-align:left}.chatrow .pick small{margin-left:auto;color:#7d8596;font-size:11px}.chatrow .row-action{color:#8a92a2;padding:8px;border-radius:6px}.chatrow .row-action:hover{color:#fff;background:#333b4d}
    @keyframes slide{from{transform:translateX(-100%)}to{transform:none}}
  }
  @media(prefers-reduced-motion:reduce){.drawer{animation:none}}
</style>
