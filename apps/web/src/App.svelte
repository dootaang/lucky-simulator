<script lang="ts">
  import Button from '@simbot/ui/Button.svelte';
  import Badge from '@simbot/ui/Badge.svelte';
  import Panel from '@simbot/ui/Panel.svelte';
  import PlayerPage from './player/PlayerPage.svelte';
  import EditorPage from './editor/EditorPage.svelte';
  import { createRouter, type AppRoute } from './app/router.svelte.ts';
  const router=createRouter();
  const routes:[AppRoute,string][]=[['home','홈'],['player','플레이어'],['editor','제작 편집기'],['components','UI 갤러리']];
</script>
<svelte:head><meta name="description" content="결정론 시뮬레이션 메이커와 플레이어"/></svelte:head>
<header><div><strong>SimBot Studio</strong><Badge label="Beta" tone="warning"/></div><nav aria-label="주 화면">{#each routes as [id,label]}<Button variant={router.route===id?'primary':'ghost'} onclick={()=>router.go(id)}>{label}</Button>{/each}</nav></header>
<main>{#if router.route==='home'}<Panel title="봇카드를 게임으로"><p>봇카드를 가져와 프롬프트·로어·규칙·화면을 검수하고, 장기 세션용 SimPack으로 만드세요.</p><div class="actions"><Button onclick={()=>router.go('player')}>플레이 시작</Button><Button variant="secondary" onclick={()=>router.go('editor')}>프로젝트 만들기</Button></div></Panel>{:else if router.route==='player'}<PlayerPage/>{:else if router.route==='editor'}<EditorPage/>{:else}<Panel title="UI Foundation"><div class="gallery"><Button>기본 행동</Button><Button variant="secondary">보조 행동</Button><Button variant="danger">위험 행동</Button><Button disabled>비활성</Button><Badge label="정상" tone="success"/><Badge label="주의" tone="warning"/><Badge label="오류" tone="danger"/></div></Panel>{/if}</main>
<style>header{min-height:4rem;padding:var(--space-3) var(--space-6);border-bottom:1px solid var(--color-line);display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);background:var(--color-surface)}header>div,nav,.actions,.gallery{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap}main{width:min(calc(100% - 2rem),var(--content-max));margin:var(--space-8) auto}@media(max-width:720px){header{align-items:flex-start;flex-direction:column;padding:var(--space-3)}nav{width:100%;overflow-x:auto;flex-wrap:nowrap}main{margin:var(--space-4) auto}}</style>
