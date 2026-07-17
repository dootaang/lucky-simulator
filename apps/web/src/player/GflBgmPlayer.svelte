<script lang="ts">
  import{onMount}from'svelte';
  import{GFL_BGM_TRACKS,gflBgmTrack,gflYoutubeEmbedUrl}from'./gfl-bgm';

  let{cue=null}:{cue?:string|null}=$props();
  let iframe=$state<HTMLIFrameElement>(),activated=$state(false),playing=$state(false),actualPlaying=$state(false),ready=$state(false),muted=$state(false),collapsed=$state(false),volume=$state(50),manualCue=$state<string|null>(null),previousCue=$state<string|null>(null),origin=$state(''),playerError=$state('');
  let effectiveCue=$derived(manualCue??cue),track=$derived(gflBgmTrack(effectiveCue)),source=$derived(track&&activated?gflYoutubeEmbedUrl(track,false,origin):'');

  onMount(()=>{
    origin=location.origin;
    try{volume=Math.max(0,Math.min(100,Number(localStorage.getItem('simbot.gfl.bgm.volume')??50)));muted=localStorage.getItem('simbot.gfl.bgm.muted')==='1';collapsed=localStorage.getItem('simbot.gfl.bgm.collapsed')==='1';}catch{/* 저장 불가 환경에서도 현재 탭 재생은 유지한다. */}
    const receive=(event:MessageEvent)=>{
      if(event.source!==iframe?.contentWindow||!/^https:\/\/www\.youtube(?:-nocookie)?\.com$/.test(event.origin))return;
      let data:Record<string,unknown>;try{data=typeof event.data==='string'?JSON.parse(event.data)as Record<string,unknown>:event.data as Record<string,unknown>;}catch{return;}
      if(data.event==='onReady'){ready=true;playerError='';syncPlayer();}
      if(data.event==='onStateChange'){const state=Number(data.info);actualPlaying=state===1;if(state===0&&playing){command('seekTo',[0,true]);command('playVideo');}}
      if(data.event==='onError'){actualPlaying=false;playerError='외부 음원 재생 실패';}
    };
    addEventListener('message',receive);
    return()=>removeEventListener('message',receive);
  });

  $effect(()=>{if(cue===previousCue)return;previousCue=cue;manualCue=null;ready=false;actualPlaying=false;playerError='';if(cue==='bgmoff')playing=false;});

  function command(func:string,args:unknown[]=[]){iframe?.contentWindow?.postMessage(JSON.stringify({event:'command',func,args}),'https://www.youtube-nocookie.com');}
  function syncPlayer(){if(!ready)return;command('setVolume',[volume]);command(muted?'mute':'unMute');command(playing?'playVideo':'pauseVideo');}
  function togglePlay(){if(!track)return;activated=true;playing=!playing;queueMicrotask(syncPlayer);}
  function choose(delta:number){const current=Math.max(0,GFL_BGM_TRACKS.findIndex(item=>item.cue===effectiveCue));manualCue=GFL_BGM_TRACKS[(current+delta+GFL_BGM_TRACKS.length)%GFL_BGM_TRACKS.length]!.cue;activated=true;playing=true;ready=false;actualPlaying=false;}
  function iframeLoaded(){ready=false;actualPlaying=false;playerError='';let attempts=0;const listen=()=>{if(ready||attempts++>=12)return;iframe?.contentWindow?.postMessage(JSON.stringify({event:'listening'}),'https://www.youtube-nocookie.com');setTimeout(listen,250);};listen();}
  function setVolume(event:Event){volume=Number((event.currentTarget as HTMLInputElement).value);try{localStorage.setItem('simbot.gfl.bgm.volume',String(volume));}catch{/* noop */}command('setVolume',[volume]);}
  function toggleMute(){muted=!muted;try{localStorage.setItem('simbot.gfl.bgm.muted',muted?'1':'0');}catch{/* noop */}command(muted?'mute':'unMute');}
  function toggleCollapse(){collapsed=!collapsed;try{localStorage.setItem('simbot.gfl.bgm.collapsed',collapsed?'1':'0');}catch{/* noop */}}
</script>

<section class="bgm" class:collapsed aria-label="소녀전선 장면 음악">
  <div class="identity"><span class="signal" class:active={actualPlaying}>♫</span><div><small>SCENE BGM</small><strong>{track?.label??(effectiveCue==='bgmoff'?'음악 꺼짐':'장면 신호 대기')}</strong></div></div>
  {#if !collapsed}
    <div class="controls">
      <button title="이전 곡" aria-label="이전 곡" disabled={!track} onclick={()=>choose(-1)}>‹</button>
      <button class="play" title={playing?'일시정지':'음악 재생'} aria-label={playing?'음악 일시정지':'음악 재생'} disabled={!track} onclick={togglePlay}>{playing?'Ⅱ':'▶'}</button>
      <button title="다음 곡" aria-label="다음 곡" disabled={!track} onclick={()=>choose(1)}>›</button>
      <button title={muted?'음소거 해제':'음소거'} aria-label={muted?'음소거 해제':'음소거'} disabled={!track} onclick={toggleMute}>{muted?'×':'♪'}</button>
      <input aria-label="BGM 음량" title={`음량 ${volume}`} type="range" min="0" max="100" value={volume} oninput={setVolume}/>
    </div>
    <span class="source">{playerError||(!activated?'재생을 누르면 외부 음원 연결':!ready?'음원 연결 중…':actualPlaying?'재생 중':'일시정지')}</span>
  {/if}
  <button class="collapse" title={collapsed?'BGM 조작 펼치기':'BGM 조작 접기'} aria-label={collapsed?'BGM 조작 펼치기':'BGM 조작 접기'} onclick={toggleCollapse}>{collapsed?'＋':'−'}</button>
  {#if source}<iframe bind:this={iframe} src={source} title={`${track?.label??''} 배경음악`} allow="autoplay; encrypted-media" onload={iframeLoaded}></iframe>{/if}
</section>

<style>
  .bgm{position:relative;z-index:3;box-sizing:border-box;display:grid;grid-template-columns:minmax(150px,1fr) auto auto auto;align-items:center;gap:10px;min-height:46px;padding:6px 12px;border-bottom:1px solid #394445;border-left:3px solid #d49c3e;background:linear-gradient(90deg,#172124,#11171a);color:#e7ecec;box-shadow:0 8px 20px #0003;font-family:ui-monospace,'Noto Sans KR',sans-serif}.identity{display:flex;align-items:center;gap:9px;min-width:0}.identity div{display:grid;min-width:0}.identity small{color:#87a2a5;font-size:9px;letter-spacing:.13em}.identity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.signal{display:grid;place-items:center;width:27px;height:27px;border:1px solid #506164;border-radius:2px;color:#819092;background:#0b1012}.signal.active{border-color:#d49c3e;color:#f7bd5a;box-shadow:0 0 10px #d49c3e44}.controls{display:flex;align-items:center;gap:3px}.controls button,.collapse{display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid #3d4a4d;border-radius:3px;background:#1d292c;color:#cbd5d6;cursor:pointer}.controls .play{border-color:#9a7130;color:#ffd27c;background:#30281b}.controls button:disabled{opacity:.3;cursor:default}.controls input{width:82px;accent-color:#d49c3e}.source{color:#7f8e90;font-size:9px;white-space:nowrap}.collapse{width:27px;height:27px;background:transparent}iframe{position:absolute;width:1px;height:1px;left:-10000px;bottom:0;border:0;opacity:.01;pointer-events:none}.bgm.collapsed{grid-template-columns:minmax(130px,1fr) auto}.collapsed .collapse{grid-column:2}
  @media(max-width:680px){.bgm{grid-template-columns:minmax(120px,1fr) auto auto;gap:6px;padding:6px 8px}.controls input{width:58px}.source{display:none}.collapse{grid-column:3}.bgm.collapsed{grid-template-columns:minmax(120px,1fr) auto}.collapsed .collapse{grid-column:2}.controls button{width:28px;height:28px}}
</style>
