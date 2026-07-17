<script lang="ts">
  import type{CardAsset}from'@simbot/card';
  import{normalizeAssetName}from'@simbot/risu';
  let{cue=null,assets=[],assetUrlFor}:{cue?:string|null;assets?:CardAsset[];assetUrlFor:(asset:CardAsset)=>string|null}=$props();
  let asset=$derived.by(()=>{const wanted=normalizeAssetName(cue??'');return wanted?assets.find(item=>normalizeAssetName(item.name||item.type)===wanted)??null:null;});
  let url=$derived(asset?assetUrlFor(asset):null);
</script>

{#if url}<div class="scene" aria-hidden="true"><img src={url} alt=""/></div>{/if}

<style>
  .scene{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#0c1014}.scene::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,#0d1116aa,#0d1116e8 48%,#0d1116 86%)}img{width:100%;height:100%;object-fit:cover;filter:saturate(.72) brightness(.62);transform:scale(1.02)}
</style>
