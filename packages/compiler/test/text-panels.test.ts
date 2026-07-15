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
