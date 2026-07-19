<script lang="ts">
  let{percent,label,detail=''}:{percent:number;label:string;detail?:string}=$props();
  let safe=$derived(Math.max(0,Math.min(100,Math.round(percent))));
</script>

<section class="boot-progress" aria-live="polite" aria-busy={safe<100}>
  <div class="spinner" aria-hidden="true"></div>
  <h1>럭키★시뮬레이터</h1>
  <p><b>로딩 중… {safe}%</b></p>
  <progress value={safe} max="100" aria-label={`로딩 진행률 ${safe}%`}></progress>
  <p class="label">{label}</p>
  {#if detail}<small>{detail}</small>{/if}
</section>

<style>
  .boot-progress{min-height:100dvh;display:grid;place-content:center;justify-items:center;gap:10px;padding:24px;text-align:center;background:#111318;color:#eee}.spinner{width:34px;height:34px;border:3px solid #343a46;border-top-color:#6c98f4;border-radius:50%;animation:spin .8s linear infinite}.boot-progress h1{margin:4px 0 0;font:600 26px/1.2 Georgia,'Noto Serif KR',serif}.boot-progress p{margin:0}.boot-progress progress{width:min(360px,76vw);height:10px;accent-color:#6c98f4}.label{color:#cbd3df}.boot-progress small{max-width:42ch;color:#8f98a8}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none;border-color:#6c98f4}}
</style>
