<script lang="ts">
  // 범용 사다리 게이지 — 호감도·평판·등급처럼 "순서 있는 칸 + 칸 이름 + 문턱"이면 전부 이 하나로 그린다.
  // 카드가 정의한 티어 이름을 그대로 쓴다(하트·숫자 같은 우리식 표기를 발명하지 않는다).
  let { label, value, min = 0, max, next = null, brief = '' }: { label: string; value: number; min?: number; max: number; next?: number | null; brief?: string } = $props();
  let pct = $derived(max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 100);
</script>
<div class="ladder" title={brief}>
  <span class="tier">{label}</span>
  <span class="bar"><i style:width={`${pct}%`}></i></span>
  <span class="value">{value.toLocaleString()}{next !== null ? ` · 다음 +${next.toLocaleString()}` : ''}</span>
</div>
<style>
  .ladder{display:flex;align-items:center;gap:7px;min-width:0;font-size:11px}
  .tier{flex:none;padding:1px 7px;border:1px solid #4a4133;border-radius:999px;background:#241f16;color:#d8b36a;font-weight:600}
  .bar{flex:1;min-width:34px;height:5px;border-radius:999px;background:#262a33;overflow:hidden}
  .bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(to right,#8a6d3b,#d8b36a)}
  .value{flex:none;color:#8d95a5;white-space:nowrap}
</style>
