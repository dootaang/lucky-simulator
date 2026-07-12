<script lang="ts">let {entries}:{entries:readonly {key:string;value:string}[]}=$props();</script>
<dl>{#each entries as entry}<div><dt>{entry.key}</dt><dd>{entry.value}</dd></div>{/each}</dl>
<style>dl{display:flex;gap:var(--space-3);flex-wrap:wrap;margin:0}dl>div{min-width:6rem;padding:var(--space-2) var(--space-3);border-radius:var(--radius-md);background:var(--color-inset)}dt{color:var(--color-muted);font-size:.75rem}dd{margin:.2rem 0 0;font-weight:700}</style>
