<script lang="ts">
  import Button from '@simbot/ui/Button.svelte';
  import SpeakerStage from '@simbot/ui/SpeakerStage.svelte';
  import type { PlaySession } from '@simbot/session';
  let {session,onchange,portraitFor=()=>null}:{session:PlaySession;onchange:()=>void;portraitFor?:(npcId:string,emotion?:string)=>string|null}=$props();
  let input=$state(''),busy=$state(false),error=$state(''),revision=$state(0);
  let messages=$derived.by(()=>{revision;return session.messages;}),speakers=$derived.by(()=>{revision;return session.lastSpeakers;});
  async function send(){if(!input.trim()||busy)return;const value=input;input='';busy=true;error='';revision+=1;try{await session.send(value);onchange();}catch(reason){error=reason instanceof Error?reason.message:String(reason);}finally{busy=false;revision+=1;}}
  function keydown(event:KeyboardEvent){if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}
</script>
{#if speakers.length}<SpeakerStage {speakers} {portraitFor}/>{/if}
<div class="messages" aria-live="polite">{#if !messages.length}<p class="empty">대화를 시작하세요. 엔진은 수치와 선택지를 관리하고 LLM은 서사를 담당합니다.</p>{/if}{#each messages as message}<article class={message.role}><small>{message.role==='user'?'나':'AI'}</small><p>{message.content}</p></article>{/each}{#if busy}<p class="thinking">응답을 만들고 있습니다…</p>{/if}</div>
{#if error}<p class="error">{error}</p>{/if}<div class="composer"><textarea rows="3" bind:value={input} onkeydown={keydown} placeholder="행동이나 대화를 입력하세요" disabled={busy}></textarea><Button onclick={send} disabled={busy||!input.trim()}>전송</Button></div>
{#if session.lastLogs.length}<details><summary>엔진 처리 {session.lastLogs.length}건</summary><pre>{JSON.stringify(session.lastLogs,null,2)}</pre></details>{/if}
<style>.messages small{color:var(--color-muted);font-size:.75rem}.messages{display:flex;flex-direction:column;gap:var(--space-3);min-height:14rem;max-height:32rem;overflow:auto;padding:var(--space-3)}article{max-width:85%;padding:var(--space-3);border-radius:var(--radius-lg);background:var(--color-inset)}article.user{align-self:flex-end;background:color-mix(in srgb,var(--color-accent) 18%,var(--color-inset))}article p{margin:.25rem 0 0;white-space:pre-wrap}.empty,.thinking{color:var(--color-muted)}.composer{display:grid;grid-template-columns:1fr auto;gap:var(--space-2)}textarea{resize:vertical;padding:var(--space-3);border:1px solid var(--color-line);border-radius:var(--radius-md);background:var(--color-inset);color:var(--color-text)}.error{color:var(--color-danger)}pre{white-space:pre-wrap;font:12px var(--font-mono)}@media(max-width:600px){.composer{grid-template-columns:1fr}}</style>
