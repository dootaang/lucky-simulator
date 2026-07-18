import{describe,expect,it}from'vitest';import{filterDolls}from'./doll-picker-model';
const rows=[...Array.from({length:55},(_,index)=>({id:`ar${index}`,name:`AR ${String(index).padStart(2,'0')}`,class:'AR',grade:index%6+1,power:index*10,snipePrice:9000-index})),{id:'m4',name:'Ｍ４Ａ１',class:'RF',grade:5,power:7000,snipePrice:12000}];
const query=(overrides:Partial<Parameters<typeof filterDolls>[1]>={})=>({search:'',classes:new Set<string>(),minGrade:0,sort:'name' as const,priceKey:'snipePrice',limit:50,...overrides});
describe('DollPicker model',()=>{
  it('searches names with NFKC normalization and case folding',()=>expect(filterDolls(rows,query({search:'m4a1'})).map(row=>row.id)).toEqual(['m4']));
  it('applies multi-class chips',()=>expect(filterDolls(rows,query({classes:new Set(['RF'])}))).toHaveLength(1));
  it('filters by minimum star grade',()=>expect(filterDolls(rows,query({minGrade:6,limit:100})).every(row=>Number(row.grade)>=6)).toBe(true));
  it('sorts by power and price',()=>{expect(filterDolls(rows,query({sort:'power',limit:1}))[0]?.id).toBe('m4');expect(Number(filterDolls(rows,query({sort:'price',limit:2}))[0]?.snipePrice)).toBeLessThanOrEqual(Number(filterDolls(rows,query({sort:'price',limit:2}))[1]?.snipePrice));});
  it('shows fifty at first and exposes the next page when the limit grows',()=>{expect(filterDolls(rows,query())).toHaveLength(50);expect(filterDolls(rows,query({limit:100}))).toHaveLength(56);});
});
