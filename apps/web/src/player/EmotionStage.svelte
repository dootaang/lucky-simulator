<script lang="ts">
  import type { PlaySession } from '@simbot/session';
  let { session, version, portraitFor }: { session: PlaySession; version: number; portraitFor: (id: string, emotion?: string) => string | null } = $props();
  let speakers = $derived.by(() => { void version; return session.lastSpeakers.slice(0, 3); });
</script>

{#if speakers.length}
  <section class="stage" aria-label="현재 대화 인물">
    {#each speakers as speaker}
      {@const portrait = portraitFor(speaker.npcId, speaker.emotion)}
      <figure class:focus={speaker.focus}>
        {#if portrait}<img src={portrait} alt={speaker.name}/>{:else}<div class="fallback">{speaker.name.slice(0, 1)}</div>{/if}
        <figcaption><b>{speaker.name}</b>{#if speaker.emotion}<small>{speaker.emotion}</small>{/if}</figcaption>
      </figure>
    {/each}
  </section>
{/if}

<style>
  .stage{position:sticky;top:0;z-index:8;height:210px;display:flex;justify-content:center;align-items:flex-end;gap:clamp(0px,2vw,24px);overflow:hidden;border-bottom:1px solid #30343d;background:radial-gradient(circle at 50% 100%,#293140 0,#171a20 54%,#101217 100%)}
  figure{position:relative;width:min(29%,220px);height:195px;margin:0;opacity:.58;filter:saturate(.7);transform:translateY(16px) scale(.92);transition:.18s ease}figure.focus{z-index:2;opacity:1;filter:none;transform:none}img,.fallback{width:100%;height:100%;object-fit:contain;object-position:bottom}.fallback{display:grid;place-items:center;font:700 64px Georgia,serif;color:#8f9aae;background:linear-gradient(transparent,#242a35)}figcaption{position:absolute;inset:auto 6px 8px;display:flex;justify-content:center;gap:7px;padding:5px 8px;border-radius:6px;background:#0d1015c9;color:#eceff5;font-size:12px}figcaption small{color:#9da7b8}
  @media(max-width:680px){.stage{height:150px}.stage figure{height:142px;width:33%}figcaption{font-size:10px}.fallback{font-size:42px}}
  @media(prefers-reduced-motion:reduce){figure{transition:none}}
</style>
