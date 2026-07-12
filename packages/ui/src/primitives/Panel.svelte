<script lang="ts">import type { Snippet } from 'svelte'; let { title=undefined, children }: { title:string|undefined; children:Snippet }=$props();</script>
<section>{#if title}<h2>{title}</h2>{/if}<div>{@render children()}</div></section>
<style>section{border:1px solid var(--color-line);border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:var(--shadow-panel);overflow:hidden}h2{margin:0;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-line);font-size:1rem}section>div{padding:var(--space-4)}</style>
