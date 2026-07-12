<script lang="ts">
  let {busy=false,onsend}:{busy?:boolean;onsend:(text:string)=>Promise<void>}=$props(); let text=$state('');
  async function submit(){const value=text.trim();if(!value||busy)return;text='';await onsend(value);}
</script>
<form onsubmit={(e)=>{e.preventDefault();void submit();}}><textarea bind:value={text} placeholder="메시지를 입력하세요" rows="1" onkeydown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void submit();}}}></textarea><button disabled={busy||!text.trim()} aria-label="보내기">{busy?'…':'➤'}</button></form>
<style>form{display:flex;gap:10px;align-items:flex-end;padding:14px 18px 18px;background:linear-gradient(transparent,#111318 28%)}textarea{flex:1;max-height:160px;resize:vertical;padding:13px 15px;border:1px solid #343843;border-radius:13px;background:#1b1e25;color:#eef0f5;font:15px/1.45 sans-serif}button{width:46px;height:46px;border:0;border-radius:12px;background:#608df0;color:white;font-size:18px}button:disabled{opacity:.45}</style>
