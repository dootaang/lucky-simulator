<script lang="ts">
  import Button from '@simbot/ui/Button.svelte';
  import DecisionCard from '@simbot/ui/DecisionCard.svelte';
  import EntityCard from '@simbot/ui/EntityCard.svelte';
  import Gauge from '@simbot/ui/Gauge.svelte';
  import Panel from '@simbot/ui/Panel.svelte';
  import SpeakerStage from '@simbot/ui/SpeakerStage.svelte';
  import StatStrip from '@simbot/ui/StatStrip.svelte';
  import { evaluateCondition, resolveValue, type ProjectRuntime } from '@simbot/runtime';
  import type { PlaySession } from '@simbot/session';
  import ChatPanel from './ChatPanel.svelte';
  import CombatConsole from './CombatConsole.svelte';
  import InnManagement from './InnManagement.svelte';
  import GflConsole from './GflConsole.svelte';
  import { classifyWidgetValue, structuredEntries } from './widget-model.ts';
  import {declaredActionMode,type SimulationActionHandler} from './simulation-action';

  let { runtime, version, session = null, portraitFor = () => null, assetFor = () => null, busy=false,onaction=null,onchange = () => {} }: { runtime: ProjectRuntime; version: number; session?: PlaySession|null; portraitFor?: (npcId:string,emotion?:string,outfit?:number)=>string|null;assetFor?:(name:string)=>string|null;busy?:boolean;onaction?:SimulationActionHandler|null; onchange?:()=>void } = $props();
  let active=$state(''),selection=$state<Record<string,unknown>>({}),lastLog=$state<unknown[]>([]),revision=$state(0),pending=$state(false);
  $effect(()=>{revision=version;});
  let project=$derived(runtime.project),context=$derived({state:runtime.state,schema:project.schema,content:project.content,selection,featureToggles:project.featureToggles});
  let screens=$derived(project.screens.filter((item)=>evaluateCondition(item.visibleWhen,context)));
  let navigation=$derived(project.navigation.filter(item=>evaluateCondition(item.visibleWhen,context)));
  let screen=$derived(screens.find((item)=>item.id===(active||navigation[0]?.screenId))??screens[0]);
  let combatConsole=$derived.by(()=>{revision;try{const value=runtime.select('combat/console');return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}catch{return null;}});
  let hasSide=$derived(!!screen&&Object.entries((screen.regions??{}) as Record<string,Record<string,unknown>[]>).some(([region,widgets])=>['hud','side','actions'].includes(region)&&widgets.some(widget=>evaluateCondition(widget.visibleWhen,context))));
  function source(widget:Record<string,unknown>){revision;const value=widget.source;if(typeof value==='string'&&value.startsWith('engine:')){try{return runtime.select(value.slice(7));}catch{return null;}}if(typeof value==='string'&&value.startsWith('state.'))return value.split('.').slice(1).reduce<unknown>((current,key)=>current&&typeof current==='object'&&key!=='__proto__'&&key!=='constructor'&&key!=='prototype'&&Object.prototype.hasOwnProperty.call(current,key)?(current as Record<string,unknown>)[key]:undefined,runtime.state);return value;}
  async function act(action:Record<string,unknown>){if(pending||busy)return;const event=(action.event??action)as Record<string,unknown>,id=String(event.id??'');if(!id)return;const params=resolveValue(event.params??{},context)as Record<string,unknown>;pending=true;try{if(onaction)lastLog=await onaction({id,params,mode:declaredActionMode(action)});else lastLog=runtime.dispatch(id,params).log;revision+=1;onchange();}finally{pending=false;}}
  function asList(value:unknown):Record<string,unknown>[]{if(Array.isArray(value))return value as Record<string,unknown>[];if(value&&typeof value==='object')return Object.entries(value).map(([id,item])=>item&&typeof item==='object'?{id,...item as Record<string,unknown>}:{id,value:item});return[];}
  function choiceText(value:unknown){if(value==null)return undefined;if(['string','number','boolean'].includes(typeof value))return String(value);return structuredEntries(value).map((entry)=>`${entry.key}: ${entry.value}`).join(' · ');}
  function choices(widget:Record<string,unknown>){return asList(widget.choices??widget.actions).map((choice)=>{const detail=choiceText(choice.description??choice.desc),effects=choiceText(choice.effects??choice.effect);return{label:String(choice.label??choice.name??choice.id??'선택'),...(detail?{description:detail}:{}),...(effects?{effects}:{}),disabled:choice.enabled===false,action:choice};});}
</script>

<div class="renderer">
{#if navigation.length>1}<nav class="screen-nav" aria-label="프로젝트 화면">{#each navigation as item}<Button variant={(active||navigation[0]?.screenId)===item.screenId?'primary':'ghost'} onclick={()=>active=String(item.screenId)}>{String(item.label??item.id)}</Button>{/each}</nav>{/if}
{#if screen}
  <section class={`screen layout-${String(screen.layout??'dashboard')}`} class:single-column={!hasSide}><h1>{String(screen.title??screen.id)}</h1>
    {#if combatConsole?.present}<div class="combat-interrupt"><CombatConsole {runtime} {version} {busy} {onaction} onchange={()=>revision+=1}/></div>{/if}
    {#each Object.entries((screen.regions??{}) as Record<string,Record<string,unknown>[]>) as [region,widgets]}<div class={`region region-${region}`}>
      {#each widgets as widget}{#if evaluateCondition(widget.visibleWhen,context)}
        {@const model=classifyWidgetValue(source(widget),String(widget.title??widget.label??'상태'))}
        <Panel title={widget.title?String(widget.title):undefined}>
          {#if widget.widget==='chat'}
            {#if session}<ChatPanel {session} version={revision} {portraitFor} onchange={()=>revision+=1}/>{:else}<div class="chat"><p>플레이 세션을 준비하고 있습니다.</p>{#if lastLog.length}<dl class="structured">{#each structuredEntries(lastLog) as entry}<div><dt>{entry.key}</dt><dd>{entry.value}</dd></div>{/each}</dl>{/if}</div>{/if}
          {:else if widget.widget==='inn-management'}
            <InnManagement {runtime} {version} {busy} {onaction} onchange={()=>revision+=1}/>
          {:else if widget.widget==='gfl-console'}
            <GflConsole {runtime} {version} {busy} {onaction} {portraitFor} {assetFor} onchange={()=>revision+=1}/>
          {:else if widget.widget==='combat-console'}
            <CombatConsole {runtime} {version} {busy} {onaction} onchange={()=>revision+=1}/>
          {:else if widget.widget==='action-group'}
            <div class="actions">{#each asList(widget.actions) as action}<Button disabled={busy||pending||action.enabled===false} onclick={()=>act(action)}>{String(action.label??action.id)}</Button>{/each}</div>
          {:else if widget.widget==='decision-card'}
            <DecisionCard title={String(widget.cardTitle??widget.title??'선택')} choices={choices(widget).map(choice=>({...choice,disabled:busy||pending||choice.disabled}))} onchoose={act}/>
          {:else if widget.widget==='speaker-stage'}
            <SpeakerStage speakers={session?.lastSpeakers??[]} {portraitFor}/>
          {:else if ['card-list','map-nodes','inventory-grid','quest-board'].includes(String(widget.widget))}
            <div class="cards">{#each asList(source(widget)) as item,index}<Button variant="secondary" onclick={()=>selection[String(widget.selectionKey??'selectedId')]=item.id??index}>{String(item.label??item.name??item.id??index)}</Button>{/each}</div>
          {:else if model.kind==='gauge'}<Gauge label={model.label} cur={model.cur} max={model.max} percentage={model.percentage}/>
          {:else if model.kind==='stat-strip'}<StatStrip entries={model.entries}/>
          {:else if model.kind==='entity-card'}<EntityCard name={model.name} stats={model.stats} portrait={model.portrait}/>
          {:else}<dl class="structured">{#each model.entries as entry}<div><dt>{entry.key}</dt><dd>{entry.value}</dd></div>{/each}</dl>
          {/if}
        </Panel>
      {/if}{/each}
    </div>{/each}
  </section>
{:else}<Panel title="화면 없음"><p>이 프로젝트에는 표시 가능한 화면 선언이 없습니다.</p></Panel>{/if}
</div>

<style>.renderer{container-type:inline-size;min-width:0;overflow-x:hidden}.screen-nav,.actions,.cards{display:flex;gap:var(--space-2);flex-wrap:wrap}.screen-nav{margin-bottom:var(--space-4)}.screen{display:grid;grid-template-columns:minmax(0,1fr) minmax(16rem,var(--sidebar-width));gap:var(--space-4)}.screen.single-column{grid-template-columns:minmax(0,1fr)}.screen>h1,.combat-interrupt{grid-column:1/-1}.screen>h1{margin:0}.region{display:flex;min-width:0;flex-direction:column;gap:var(--space-4)}.region-main{grid-column:1}.region-hud,.region-side,.region-actions{grid-column:2}.single-column .region{grid-column:1}.chat{min-height:18rem}.structured{display:grid;gap:var(--space-2);margin:0}.structured>div{display:grid;grid-template-columns:minmax(6rem,auto) minmax(0,1fr);gap:var(--space-3);padding:var(--space-2);border-bottom:1px solid var(--color-line)}.structured dt{font-weight:700}.structured dd{margin:0;overflow-wrap:anywhere}@container (max-width:52rem){.screen{grid-template-columns:minmax(0,1fr)}.region-main,.region-hud,.region-side,.region-actions{grid-column:1}}@media(max-width:800px){.screen{grid-template-columns:minmax(0,1fr)}.region-main,.region-hud,.region-side,.region-actions{grid-column:1}}</style>
