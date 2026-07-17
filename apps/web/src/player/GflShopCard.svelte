<script lang="ts">
  type Row=Record<string,unknown>;
  let{item,image=null,funds=0,busy=false,onbuy}:{item:Row;image?:string|null;funds?:number;busy?:boolean;onbuy:()=>void}=$props();
  const effectText=(value:unknown)=>{
    if(!value)return'직접 수치 효과 없음';
    if(typeof value==='string')return value||'직접 수치 효과 없음';
    if(typeof value!=='object'||Array.isArray(value))return String(value);
    const labels:Record<string,string>={hp:'HP',mp:'정신력',mood:'기분',aff:'호감도',power:'전투력'};
    const result=Object.entries(value as Row).map(([key,amount])=>`${labels[key]??key} ${Number(amount)>=0?'+':''}${String(amount)}`).join(' · ');
    return result||'직접 수치 효과 없음';
  };
  let price=$derived(Math.max(0,Number(item.price??0))),owned=$derived(Number(item.owned??0)),equipment=$derived(item.kind==='equipment'),usable=$derived(item.type==='use'),usage=$derived(equipment?'구매 후 인형 탭에서 대상 인형에게 장착':usable?'구매 후 인형 탭에서 대상 인형에게 사용':'구매 후 보관함에서 확인');
</script>

<article class="product">
  <div class="visual" class:empty={!image}>{#if image}<img src={image} alt={`${String(item.name)} 상품 이미지`}/>{:else}<span>{equipment?'EQUIP':'SUPPLY'}</span>{/if}</div>
  <div class="info">
    <header><b>{String(item.name)}</b><span>보유 {owned}</span></header>
    <p>{String(item.description??'설명 없음')}</p>
    <strong>{effectText(item.effect)}</strong>
    <small>{usage}</small>
  </div>
  <footer><div><b>{price.toLocaleString()} 자금</b><small>판매가 {Math.floor(price/2).toLocaleString()}</small></div><button disabled={busy||funds<price} title={funds<price?'자금이 부족합니다.':''} onclick={onbuy}>{funds<price?'자금 부족':'구매'}</button></footer>
</article>

<style>
  .product{display:grid!important;grid-template-columns:88px minmax(0,1fr)!important;align-items:stretch!important;gap:12px!important;margin:0!important;padding:11px!important;border:1px solid #394544!important;background:linear-gradient(145deg,#151d1f,#101617)!important}.visual{display:grid;place-items:center;min-height:96px;overflow:hidden;border:1px solid #354342;background:radial-gradient(circle at 50% 45%,#334345,#121819 70%)}.visual img{width:100%;height:100%;max-height:112px;object-fit:contain}.visual span{color:#71817f;font:9px ui-monospace;letter-spacing:.14em}.info{display:grid;align-content:start;gap:4px;min-width:0}.info header{display:flex;justify-content:space-between;gap:8px}.info header b{color:#f0d29a;font-size:14px}.info header span{color:#7cc8d8;font-size:10px}.info p{margin:0;color:#aab5b2;line-height:1.45}.info strong{color:#dce5e3;font-size:11px}.info small{color:#82918f}.product footer{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid #303a3a}.product footer div{display:grid}.product footer b{color:#e5a84b}.product footer small{color:#788784}.product button{min-width:86px;border-color:#9b7131;background:#30271a;color:#ffd78e}.product button:disabled{border-color:#475353;background:#172024;color:#89918f}@media(max-width:520px){.product{grid-template-columns:72px minmax(0,1fr)!important}.visual{min-height:84px}.product footer{grid-column:1/-1}}
</style>
