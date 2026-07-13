<script lang="ts">
  import type{Persona}from'@simbot/risu';
  let{personas,active,bound=false,showBinding=false,onselect,onsave,onnew,onclone,onremove,onbind=()=>{},onimport,onexport}:{personas:Persona[];active:Persona;bound?:boolean;showBinding?:boolean;onselect:(id:string)=>void;onsave:(p:Persona)=>void;onnew:()=>void;onclone:()=>void;onremove:()=>void;onbind?:(v:boolean)=>void;onimport:(file:File)=>void;onexport:()=>void}=$props();
  async function icon(file:File){const img=new Image(),url=URL.createObjectURL(file);await new Promise<void>((ok,fail)=>{img.onload=()=>ok();img.onerror=fail;img.src=url;});const scale=Math.min(1,128/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);onsave({...active,icon:canvas.toDataURL('image/webp',.85)});}
</script>

<section class="persona-panel">
  <div class="persona-grid" aria-label="페르소나 목록">
    {#each personas as persona (persona.id)}
      <button class:active={persona.id===active.id} class="persona-tile" onclick={()=>onselect(persona.id)} aria-pressed={persona.id===active.id}>
        <span class="portrait">{#if persona.icon}<img src={persona.icon} alt=""/>{:else}<b>{persona.name.trim().slice(0,1)||'?'}</b>{/if}</span>
        <span>{persona.name||'이름 없음'}</span>
        {#if persona.id===active.id}<i aria-hidden="true">✓</i>{/if}
      </button>
    {/each}
    <button class="persona-tile add" onclick={onnew}><span class="portrait">＋</span><span>새 페르소나</span></button>
  </div>
  <div class="toolbar"><button onclick={onclone}>복제</button><button onclick={onremove}>삭제</button><label class="file">Risu 페르소나 PNG 가져오기<input type="file" accept=".png,image/png" onchange={(event)=>{const input=event.currentTarget,file=input.files?.[0];if(file)onimport(file);input.value='';}}/></label><button onclick={onexport}>PNG 내보내기</button></div>
  <div class="editor">
    <label class="icon-picker"><span class="portrait large">{#if active.icon}<img src={active.icon} alt=""/>{:else}<b>{active.name.trim().slice(0,1)||'?'}</b>{/if}</span><span>이미지 변경</span><input type="file" accept="image/*" onchange={(event)=>{const file=event.currentTarget.files?.[0];if(file)void icon(file);event.currentTarget.value='';}}/></label>
    <label>이름<input value={active.name} oninput={(event)=>onsave({...active,name:event.currentTarget.value})}/></label>
    <label>페르소나 정보<textarea rows="9" value={active.prompt} oninput={(event)=>onsave({...active,prompt:event.currentTarget.value})}></textarea></label>
    {#if showBinding}<label class="bind"><input type="checkbox" checked={bound} onchange={(event)=>onbind(event.currentTarget.checked)}/> 이 카드에 이 페르소나 고정</label>{/if}
  </div>
</section>

<style>
  .persona-panel{display:grid;gap:14px}.persona-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:9px}.persona-tile{position:relative;min-width:0;display:grid;justify-items:center;gap:6px;padding:8px 5px;border:1px solid #343a46;border-radius:9px;background:#171a20;color:#dce0e8;cursor:pointer}.persona-tile:hover{border-color:#60749a;background:#20252e}.persona-tile.active{border-color:#759ee9;background:#202a3a;box-shadow:0 0 0 1px #759ee944}.persona-tile>span:last-of-type{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.persona-tile i{position:absolute;right:5px;top:5px;width:18px;height:18px;display:grid;place-items:center;border-radius:50%;background:#668bd0;color:white;font-size:11px;font-style:normal}.portrait{width:64px;height:64px;display:grid;place-items:center;overflow:hidden;border-radius:8px;background:#303642;color:#aeb9cc;font-size:24px}.portrait img{width:100%;height:100%;object-fit:cover}.persona-tile.add{border-style:dashed;color:#aeb7c7}.persona-tile.add .portrait{background:transparent;border:1px dashed #4a5362}.toolbar{display:flex;flex-wrap:wrap;gap:5px}.toolbar button,.file,.editor input,.editor textarea{padding:7px;border:1px solid #3b414d;border-radius:5px;background:#12151b;color:#ddd}.toolbar button,.file{cursor:pointer}.toolbar button:hover,.file:hover{border-color:#6c98f4;background:#252a34}.file input,.icon-picker input{display:none}.editor{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 12px;padding-top:12px;border-top:1px solid #303640}.editor label{display:grid;gap:4px;color:#b8bfcb;font-size:11px}.editor label:not(.icon-picker):not(.bind){grid-column:2}.editor textarea{resize:vertical}.icon-picker{grid-row:1/3;align-content:start;justify-items:center;cursor:pointer}.icon-picker .large{width:82px;height:82px}.icon-picker>span:last-of-type{color:#8fa9da}.bind{grid-column:1/3!important;display:flex!important;align-items:center}.persona-panel button:focus-visible,.persona-panel input:focus-visible,.persona-panel textarea:focus-visible,.file:focus-within{outline:2px solid #6c98f4;outline-offset:2px}@media(max-width:560px){.persona-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.editor{grid-template-columns:1fr}.editor label,.editor label:not(.icon-picker):not(.bind),.bind{grid-column:1!important}.icon-picker{grid-row:auto}}
</style>
