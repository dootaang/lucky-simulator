import {describe,expect,it} from 'vitest';
import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';
import {addCardLoreEntry,createCardDocument,exportCardDocument,parseCard,updateCardDocument} from '../src/index.ts';

const root={spec:'chara_card_v3',spec_version:'3.0',data:{name:'원본',description:'설명',first_mes:'안녕',unknown_field:{keep:true},character_book:{entries:[{keys:['왕국'],content:'설정',extensions:{custom:'보존'}}]},assets:[]}};

describe('CardDocument',()=>{
  it('JSON 카드의 알려지지 않은 필드를 보존하며 편집한다',()=>{const parsed=parseCard(strToU8(JSON.stringify(root)),'card.json'),document=createCardDocument(parsed);updateCardDocument(document,draft=>{draft.name='수정';draft.firstMessage='새 인사';draft.lorebook[0]!.content='새 설정';});const saved=exportCardDocument(document),data=JSON.parse(strFromU8(saved.bytes));expect(data.data.name).toBe('수정');expect(data.data.first_mes).toBe('새 인사');expect(data.data.unknown_field.keep).toBe(true);expect(data.data.character_book.entries[0].extensions.custom).toBe('보존');});
  it('charx에서는 card.json만 바꾸고 다른 파일 바이트를 보존한다',()=>{const image=Uint8Array.of(1,2,3,4),bytes=zipSync({'card.json':strToU8(JSON.stringify(root)),'assets/keep.bin':image}),document=createCardDocument(parseCard(bytes,'card.charx'));addCardLoreEntry(document);document.draft.lorebook.at(-1)!.content='추가';const saved=exportCardDocument(document),files=unzipSync(saved.bytes),data=JSON.parse(strFromU8(files['card.json']!));expect(files['assets/keep.bin']).toEqual(image);expect(data.data.character_book.entries).toHaveLength(2);});
});
