<script lang="ts">
  import type { CardPassport } from '@simbot/risu';
  let {passport}:{passport:CardPassport}=$props();
  let rows=$derived([
    {label:'직역',icon:'✅',values:passport.grades.exact,empty:'직역 태그 없음'},
    {label:'근사',icon:'⚠️',values:passport.grades.approx,empty:'근사 태그 없음'},
    {label:'보존',icon:'📦',values:passport.grades.preserved,empty:'보존 태그 없음'}
  ]);
</script>

<section class="passport" aria-label="카드 호환성 여권">
  <header><div><span class="eyebrow">호환성 여권</span><strong>{passport.cardName}</strong></div><span class:full={passport.mode==='full-sim'} class="mode">{passport.mode==='full-sim'?'완전 시뮬':'일반 채팅'}</span></header>
  <dl>{#each rows as row}<div><dt>{row.icon} {row.label}</dt><dd class:empty={!row.values.length}>{row.values.length?row.values.join(' · '):row.empty}</dd></div>{/each}</dl>
</section>

<style>
  .passport{margin-bottom:var(--space-4);border:1px dashed var(--color-line);border-radius:var(--radius-md);background:var(--color-panel);overflow:hidden;font-size:.8rem}header{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-3);border-bottom:1px dashed var(--color-line)}header>div{display:grid;gap:.15rem}.eyebrow{color:var(--color-muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.06em}.mode{padding:.2rem .55rem;border:1px solid var(--color-line);border-radius:999px;color:var(--color-muted);font-size:.7rem}.mode.full{border-color:var(--color-accent);color:var(--color-accent);background:color-mix(in srgb,var(--color-accent) 8%,transparent)}dl{margin:0}dl>div{display:grid;grid-template-columns:5rem 1fr;gap:var(--space-2);padding:var(--space-2) var(--space-3)}dl>div+div{border-top:1px solid color-mix(in srgb,var(--color-line) 45%,transparent)}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}.empty{color:var(--color-muted)}
</style>
