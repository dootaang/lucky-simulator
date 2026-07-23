<script lang="ts">
  import Icon from '@simbot/ui/Icon.svelte';
  let { hasManagement = false, onsettings, onmanagement, ondismiss }: { hasManagement?: boolean; onsettings: () => void; onmanagement: () => void; ondismiss: () => void } = $props();
</script>

<aside class="notice" role="status" aria-label="메뉴 이동 안내">
  <div><Icon name="badge" size={18}/><p><b>설정과 관리 메뉴가 새 위치로 이동했습니다.</b><span>설정은 전체 설정에서, 게임 행동은 관리에서 찾을 수 있습니다.</span></p></div>
  <nav aria-label="이동한 메뉴 바로가기"><button onclick={onsettings}>설정 보기</button>{#if hasManagement}<button onclick={onmanagement}>관리 보기</button>{/if}<button class="dismiss" onclick={ondismiss}>확인</button></nav>
</aside>

<style>
  .notice{position:fixed;left:50%;bottom:calc(var(--nav-size) + var(--space-3) + env(safe-area-inset-bottom));z-index:70;display:grid;gap:var(--space-3);width:min(35rem,calc(100vw - var(--space-6)));padding:var(--space-4);transform:translateX(-50%);border:1px solid var(--color-line);border-radius:var(--radius-lg);background:var(--color-surface-raised);color:var(--color-text);box-shadow:var(--shadow-panel);pointer-events:none}
  .notice>div{display:flex;gap:var(--space-3);align-items:flex-start}.notice p{display:grid;gap:var(--space-1);margin:0}.notice span{color:var(--color-text-muted);font-size:var(--type-body);line-height:1.5}.notice nav{display:flex;justify-content:flex-end;gap:var(--space-2)}
  button{min-height:var(--touch-min);padding:var(--space-2) var(--space-3);border:1px solid var(--color-line);border-radius:var(--radius-md);background:var(--color-selected);color:var(--color-text);pointer-events:auto}button.dismiss{border-color:var(--color-accent);background:var(--color-accent);color:var(--color-canvas)}button:focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}
  @media(min-width:62.5rem){.notice{bottom:var(--space-6)}}
</style>
