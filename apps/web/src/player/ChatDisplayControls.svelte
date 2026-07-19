<script lang="ts">
  let{assetWidth,onchange}:{assetWidth:number;onchange:(value:number)=>void}=$props();
  let open=$state(false);
  const preset=(value:number)=>onchange(value);
</script>

<aside class="display-controls">
  <button class="trigger" aria-expanded={open} onclick={()=>open=!open}>Aa 보기 설정</button>
  {#if open}<section aria-label="채팅 보기 설정"><header><b>본문 이미지 크기</b><button aria-label="보기 설정 닫기" onclick={()=>open=false}>×</button></header><div class="presets"><button class:active={assetWidth===16} onclick={()=>preset(16)}>작게</button><button class:active={assetWidth===32} onclick={()=>preset(32)}>보통</button><button class:active={assetWidth===40} onclick={()=>preset(40)}>크게</button><button class:active={assetWidth===48} onclick={()=>preset(48)}>화면 너비</button></div><label>{assetWidth}rem<input aria-label="본문 이미지 최대 너비" type="range" min="8" max="48" step="1" value={assetWidth} oninput={(event)=>onchange(Number(event.currentTarget.value))}/></label><small>이미지를 누르면 원본 크기로 확대해 볼 수 있습니다.</small></section>{/if}
</aside>

<style>
  .display-controls{position:sticky;top:8px;z-index:4;display:grid;justify-content:end;width:min(900px,100%);margin:0 auto 10px;pointer-events:none}.display-controls button,.display-controls section{pointer-events:auto}.trigger{padding:6px 10px;border:1px solid #3a4150;border-radius:999px;background:#1c2029dd;color:#cbd3df;box-shadow:0 4px 14px #0006}.display-controls section{position:absolute;right:0;top:38px;display:grid;gap:10px;width:min(330px,calc(100vw - 28px));padding:12px;border:1px solid #414958;border-radius:9px;background:#171a21;box-shadow:0 14px 36px #000b}.display-controls header,.presets{display:flex;align-items:center;gap:6px}.display-controls header{justify-content:space-between}.display-controls header button{border:0;background:transparent;color:#aab2c0;font-size:20px}.presets button{flex:1;padding:6px;border:1px solid #3a4150;border-radius:5px;background:#222630;color:#bdc5d2}.presets button.active{border-color:#6c98f4;color:#d9e6ff}.display-controls label{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px;color:#aab2c0}.display-controls input{width:100%}.display-controls small{color:#8f98a8}
</style>
