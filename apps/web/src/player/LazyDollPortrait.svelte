<script lang="ts">
  let{id,revision=0,portraitFor}:{id:string;revision?:number;portraitFor:(id:string)=>string|null}=$props();
  let visible=$state(false),image=$state<string|null>(null),retry=$state(0);
  function observe(node:HTMLElement){if(typeof IntersectionObserver==='undefined'){visible=true;return{};}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){visible=true;observer.disconnect();}},{rootMargin:'240px 0px'});observer.observe(node);return{destroy:()=>observer.disconnect()};}
  $effect(()=>{revision;retry;if(!visible||image)return;image=portraitFor(id);if(!image&&retry<20){const timer=setTimeout(()=>retry+=1,150);return()=>clearTimeout(timer);}});
</script>
<span class="lazy" use:observe>{#if image}<img loading="lazy" decoding="async" width="192" height="192" src={image} alt=""/>{:else if visible}<span class="loading">불러오는 중</span>{/if}</span>
<style>.lazy{display:grid;width:100%;height:100%;place-items:center}.lazy img{width:100%;height:100%;object-fit:cover;object-position:top}.loading{padding:3px;color:#71817e;font-size:9px;text-align:center}</style>
