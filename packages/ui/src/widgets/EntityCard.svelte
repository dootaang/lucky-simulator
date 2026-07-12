<script lang="ts">import StatStrip from './StatStrip.svelte';let {name,stats,portrait=undefined}:{name:string;stats:readonly {key:string;value:string}[];portrait?:string|undefined}=$props();</script>
<article>{#if portrait}<img src={portrait} alt={name}/>{/if}<div><h3>{name}</h3><StatStrip entries={stats}/></div></article>
<style>article{display:flex;gap:var(--space-3);align-items:start}img{width:5rem;aspect-ratio:3/4;object-fit:cover;border-radius:var(--radius-md)}article>div{min-width:0;flex:1}h3{margin:0 0 var(--space-3)}</style>
