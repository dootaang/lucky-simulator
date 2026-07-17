export interface ImportFileLike{name:string}

const cardFirst=/\.(?:simpack|png|json)$/i;
const cardFallback=/\.charx$/i;
const assetModule=/\.(?:charx|zip)$/i;

/**
 * The main picker accepts a card and its split asset modules in one selection.
 * PNG/JSON/SimPack are unambiguous cards. When every selected file is CharX,
 * the first selected CharX remains the card for backwards compatibility.
 */
export function partitionCardImportFiles<T extends ImportFileLike>(files:readonly T[]){
  const card=files.find(file=>cardFirst.test(file.name))??files.find(file=>cardFallback.test(file.name));
  if(!card)throw new Error('가져올 봇카드를 찾지 못했습니다. 카드와 에셋 모듈을 함께 선택해 주세요.');
  const rest=files.filter(file=>file!==card),invalid=rest.filter(file=>!assetModule.test(file.name));
  if(invalid.length)throw new Error(`봇카드는 한 번에 하나만 가져올 수 있습니다: ${invalid.map(file=>file.name).join(', ')}`);
  return{card,modules:rest};
}
