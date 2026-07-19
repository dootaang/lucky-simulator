<script lang="ts">
 import type{PresetToggle}from'@simbot/risu';
 let{toggles,values,onchange,title='프리셋 토글'}:{toggles:PresetToggle[];values:Record<string,string>;onchange:(key:string,value:string)=>void;title?:string}=$props();
 const value=(key:string)=>values[`toggle_${key}`]??'0';
</script>
{#if toggles.some(toggle=>toggle.type!=='decor')}
 <section class="preset-toggles"><h4>{title}</h4>{#each toggles as toggle}
  {#if toggle.type==='decor'}
   {#if toggle.decor==='group'}<h5 class="group">{toggle.label}</h5>{:else if toggle.decor==='divider'}<h6>{toggle.label}</h6>{:else if toggle.decor==='caption'}<p>{toggle.label}</p>{:else}<hr/>{/if}
  {:else if toggle.type==='boolean'}<label class="check"><input type="checkbox" checked={value(toggle.key)==='1'} onchange={(event)=>onchange(toggle.key,event.currentTarget.checked?'1':'0')}/><span>{toggle.label}</span></label>
  {:else if toggle.type==='select'}<label><span>{toggle.label}</span><select value={value(toggle.key)} onchange={(event)=>onchange(toggle.key,event.currentTarget.value)}>{#each toggle.options as option,index}<option value={String(index)}>{option}</option>{/each}</select></label>
  {:else}<label><span>{toggle.label}</span><input value={values[`toggle_${toggle.key}`]??''} onchange={(event)=>onchange(toggle.key,event.currentTarget.value)}/></label>{/if}
 {/each}</section>
{/if}
<style>.preset-toggles{display:grid;gap:7px;padding:10px;border:1px solid #343945;border-radius:7px;background:#15181e}.preset-toggles h4{margin:0 0 4px;color:#e5e8ef}.preset-toggles h5{margin:8px 0 0;padding:7px;background:#20242c;color:#d7e2fa;font-size:12px}.preset-toggles h6{margin:7px 0 0;padding-bottom:4px;border-bottom:1px solid #414754;color:#aeb8c9;font-size:11px}.preset-toggles p{margin:0;color:#8992a2;font-size:10px;line-height:1.45}.preset-toggles hr{width:100%;border:0;border-top:1px solid #343945}.preset-toggles label{display:grid;grid-template-columns:minmax(120px,1fr) minmax(120px,1fr);align-items:center;gap:8px;color:#c5cad3;font-size:11px}.preset-toggles .check{display:flex}.preset-toggles input,.preset-toggles select{box-sizing:border-box;min-width:0;padding:6px;border:1px solid #3b414d;border-radius:4px;background:#11141a;color:#ddd}@media(max-width:600px){.preset-toggles label{grid-template-columns:1fr}}
</style>
