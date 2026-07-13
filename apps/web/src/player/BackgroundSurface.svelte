<script lang="ts">
  import type{CardAsset}from'@simbot/card';
  import{safeBackgroundSource}from'./background-render';
  let{html='',assets=[],assetUrlFor}:{html?:string;assets?:CardAsset[];assetUrlFor:(asset:CardAsset)=>string|null}=$props();
  let source=$derived(html.trim()?safeBackgroundSource(html,assets,asset=>assetUrlFor(asset as CardAsset)):'');
</script>
{#if source}<iframe title="봇 배경" sandbox="" srcdoc={source}></iframe>{/if}
<style>iframe{position:absolute;inset:0;z-index:0;width:100%;height:100%;border:0;pointer-events:none;opacity:.95}</style>

