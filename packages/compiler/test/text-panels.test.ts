import {describe,expect,it} from 'vitest';
import {extractTextPanels} from '../src/index.ts';

const chain=(labels:string[])=>labels.map(label=>`${label}:\\s*([^|]+?)\\s*\\|`).join('\\s*');

describe('text panel extraction',()=>{
  it('extracts long field chains and single-field feeds from display patterns',()=>{
    const scripts=[
      {type:'editdisplay',comment:'플레이어 상태',in:chain(['이름','계급/소속','종족','나이','성별','현재 위치','평판','보유 장비','수주한 최근 임무'])},
      {type:'editoutput',comment:'함선 자산',in:chain(['함선명','함급','소속','함장','현재 위치','항행 상태','선체','보호막','동력','연료','승무원','화물','무장','센서','최근 명령'])},
      {type:'editdisplay',comment:'연방 뉴스',in:String.raw`\|\s*연방 뉴스:\s*([^|]+?)\s*\|`},
      {type:'editdisplay',comment:'유령 신호',in:String.raw`\|\s*유령 신호:\s*([^|]+?)\s*\|`},
      {type:'editdisplay',comment:'이미지 프레임',in:String.raw`<img[^>]+src="([^"]+)"[^>]*>`},
      {type:'editinput',comment:'슬래시 명령',in:String.raw`^/sum\s+([\s\S]+)$`},
      {type:'editoutput',comment:'캐치올',in:String.raw`^([\s\S]*)$`},
    ];
    expect(extractTextPanels(scripts)).toEqual([
      {id:'플레이어-상태',kind:'panel',fields:['이름','계급/소속','종족','나이','성별','현재 위치','평판','보유 장비','수주한 최근 임무'],source:'플레이어 상태'},
      {id:'함선-자산',kind:'panel',fields:['함선명','함급','소속','함장','현재 위치','항행 상태','선체','보호막','동력','연료','승무원','화물','무장','센서','최근 명령'],source:'함선 자산'},
      {id:'연방-뉴스',kind:'feed',fields:['연방 뉴스'],source:'연방 뉴스'},
      {id:'유령-신호',kind:'feed',fields:['유령 신호'],source:'유령 신호'},
    ]);
  });

  it('uses stable fallback ids and ignores isolated captures without a leading pipe',()=>{
    expect(extractTextPanels([{type:'editdisplay',in:String.raw`제목:\s*([^|]+?)\s*\|`}])).toEqual([]);
    expect(extractTextPanels([{type:'editdisplay',in:chain(['이름','상태'])}])[0]).toMatchObject({id:'panel-1',kind:'panel'});
  });
});

describe('실카드 이스케이프·탐욕 캡처 변형 (지휘자 수술 고정)', () => {
  it('라벨 안 \\s* 이스케이프는 공백 하나로 정규화되고 체인이 끊기지 않는다', () => {
    const pattern = String.raw`이름:\s*([^|]+?)\s*\|\s*일자\s*정보:\s*([^|]+?)\s*\|\s*수주한\s*최근\s*임무:\s*([^|]+?)\s*\|`;
    const panels = extractTextPanels([{in: pattern, type: 'editdisplay', comment: 'Status Panel'}]);
    expect(panels).toHaveLength(1);
    expect(panels[0]!.fields).toEqual(['이름', '일자 정보', '수주한 최근 임무']);
  });
  it('비탐욕(?) 없는 탐욕 캡처 체인도 패널로 추출된다', () => {
    const pattern = String.raw`함선명:\s*([^|]+)\s*\|\s*주요\s*무장:\s*([^|]+)\s*\|\s*연료:\s*([^|]+)\s*\|`;
    const panels = extractTextPanels([{in: pattern, type: 'editdisplay', comment: 'Ship Panel'}]);
    expect(panels).toHaveLength(1);
    expect(panels[0]!.fields).toEqual(['함선명', '주요 무장', '연료']);
  });
  it('\\s* 라벨을 가진 단일 필드 피드도 추출된다', () => {
    const pattern = String.raw`\|\s*연방\s*뉴스:\s*([^|]+?)\s*\|`;
    const panels = extractTextPanels([{in: pattern, type: 'editdisplay', comment: 'IBS'}]);
    expect(panels).toHaveLength(1);
    expect(panels[0]!.kind).toBe('feed');
    expect(panels[0]!.fields).toEqual(['연방 뉴스']);
  });
});
