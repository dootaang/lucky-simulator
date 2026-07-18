export type DollPickerSort = 'name'|'grade'|'power'|'price';
export type DollPickerRow = Record<string,unknown>;
export interface DollPickerQuery { search:string; classes:ReadonlySet<string>; minGrade:number; sort:DollPickerSort; priceKey?:string; limit:number }

const text=(value:unknown)=>String(value??'').normalize('NFKC').toLocaleLowerCase();
const number=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;

export function dollClasses(rows:ReadonlyArray<DollPickerRow>){return[...new Set(rows.map(row=>String(row.class??'')).filter(Boolean))].sort();}
export function filterDolls(rows:ReadonlyArray<DollPickerRow>,query:DollPickerQuery){
  const needle=text(query.search).trim(),priceKey=query.priceKey??'price';
  return rows.filter(row=>(!needle||text(row.name).includes(needle))&&(!query.classes.size||query.classes.has(String(row.class??'')))&&number(row.grade)>=query.minGrade)
    .sort((a,b)=>query.sort==='name'?String(a.name??'').localeCompare(String(b.name??''),'ko'):query.sort==='grade'?number(b.grade)-number(a.grade)||String(a.name??'').localeCompare(String(b.name??''),'ko'):query.sort==='power'?number(b.power)-number(a.power)||String(a.name??'').localeCompare(String(b.name??''),'ko'):number(a[priceKey])-number(b[priceKey])||String(a.name??'').localeCompare(String(b.name??''),'ko'))
    .slice(0,Math.max(0,query.limit));
}
