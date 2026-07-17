import{expect,test}from'@playwright/test';
import{strToU8}from'fflate';
import{joinBytes,makePngChunk,PNG_SIGNATURE}from'@simbot/card';

const classes=Array.from({length:20},(_,index)=>`["${index===0?'M4A1':`D${index+1}`}"]="${index===0?'AR':'SMG'}"`).join(',');
const grades=Array.from({length:20},(_,index)=>`["${index===0?'M4A1':`D${index+1}`}"]=${index===0?5:3}`).join(',');
const lua=`local DOLL_CLASS={${classes}}
local DOLL_GRADE={${grades}}
local ITEM_DATA={["전투식량"]={price=50,type="use",desc="회복"}}
local EQUIP_DATA={["옵티컬"]={price=100,power=50}}
local MISSION_DATA={["ALPHA"]={name="ALPHA",power=800,reward="자금 +500 / 부품 +100",enemy="철혈"},["BETA"]={name="BETA",power=900},["GAMMA"]={name="GAMMA",power=1000}}
local FAIRY_DATA={["지휘요정"]={power=300}}
${'-- certified runtime\n'.repeat(700)}`;
const card={spec:'chara_card_v3',spec_version:'3.0',data:{name:'소녀전선:잔불',description:'전술인형과 제대를 운영하는 대형 시뮬레이션',first_mes:'그리폰 기지에 접속했다.',mes_example:'',personality:'',scenario:'',creator_notes:'',system_prompt:'',post_history_instructions:'',alternate_greetings:[],tags:['소녀전선'],creator:'test',character_version:'1',extensions:{risuai:{defaultVariables:'A_day=1\nA_gold=5000\nA_res=3000',triggerscript:[{effect:[{type:'triggerlua',code:lua}]}]}},group_only_greetings:[],character_book:{entries:[]},assets:[]}};
const png=joinBytes(PNG_SIGNATURE,makePngChunk('tEXt',strToU8(`ccv3\0${Buffer.from(JSON.stringify(card)).toString('base64')}`)),makePngChunk('IEND',new Uint8Array()));

async function importGfl(page:import('@playwright/test').Page){
  await page.goto('/');
  await page.locator('input[accept=".simpack,.charx,.png,.json"]').setInputFiles({name:'소녀전선_잔불.png',mimeType:'image/png',buffer:Buffer.from(png)});
  const simulation=page.getByRole('dialog',{name:'시뮬레이션'});
  await expect(simulation).toBeVisible({timeout:15_000});
  await expect(simulation.getByLabel('소녀전선 지휘 콘솔')).toBeVisible();
  return simulation;
}

test('소녀전선 PNG를 넣으면 별도 컴파일 질문 없이 네이티브 플레이로 바로 전환된다',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const simulation=await importGfl(page);
  const console=simulation.getByLabel('소녀전선 지휘 콘솔');
  await expect(console).toContainText('소녀전선: 잔불');
  await console.getByRole('button',{name:'지휘관으로 시작'}).click();
  await expect(console).toContainText('현재 위치 · 지휘관실');
  await expect(console.getByRole('button',{name:'제조·수복'})).toBeDisabled();
  await console.getByRole('button',{name:'정비실'}).click();
  await expect(simulation).toBeHidden();
  await page.getByRole('button',{name:'현재 봇 메뉴'}).click();
  await page.getByRole('button',{name:'시뮬레이션 열기'}).click();
  const reopened=page.getByRole('dialog',{name:'시뮬레이션'}).getByLabel('소녀전선 지휘 콘솔');
  await expect(reopened).toContainText('현재 위치 · 정비실');
  await expect(reopened.getByRole('button',{name:'제조·수복'})).toBeEnabled();
  await reopened.getByRole('button',{name:'인형 고용',exact:true}).click();
  await reopened.getByRole('button',{name:'오늘의 목록 확인'}).click();
  await expect(reopened).toContainText('숙소 0/4');
  await expect(reopened.getByRole('button',{name:'계약',exact:true}).first()).toBeVisible();
  await reopened.getByRole('button',{name:'작전',exact:true}).click();
  await reopened.getByRole('button',{name:/레드·오렌지 작전구역/}).click();
  await expect(reopened).toContainText('ALPHA');
});

test('저전투력 출격 위험도와 전술 교전 과정을 관리 화면 안에서 확인한다',async({page})=>{
  await page.setViewportSize({width:844,height:720});
  const simulation=await importGfl(page),console=simulation.getByLabel('소녀전선 지휘 콘솔');
  await expect(simulation).toContainText('럭키 시뮬레이션');
  await console.getByRole('button',{name:'지휘관으로 시작'}).click();
  await console.getByRole('button',{name:'인형 고용',exact:true}).click();
  await console.getByRole('button',{name:'오늘의 목록 확인'}).click();
  await console.getByRole('button',{name:'계약',exact:true}).first().click();
  await console.getByRole('button',{name:/수송 도착/}).click();
  await console.getByRole('button',{name:'제대',exact:true}).click();
  await console.locator('.roster button').first().click();
  await console.getByRole('button',{name:'작전',exact:true}).click();
  await console.getByRole('button',{name:/레드·오렌지 작전구역/}).click();
  await console.getByRole('button',{name:/ALPHA/}).click();
  await expect(console.locator('.risk')).toContainText('성공 가능성 약');
  await expect(console.locator('.risk')).toContainText('전투력이 낮아도 출격');
  await console.getByRole('button',{name:'전술 교전',exact:true}).click();
  await expect(console.getByRole('button',{name:/집중 사격/})).toBeVisible();
  await console.getByRole('button',{name:/균형 전술/}).click();
  await expect(console.locator('.battle-report')).toContainText('최근 전투 보고');
});

test('휴대폰 가로모드에서 대화 장면과 관리창이 한 화면에 맞고 가로 스크롤이 생기지 않는다',async({page})=>{
  await page.setViewportSize({width:844,height:390});
  const simulation=await importGfl(page),console=simulation.getByLabel('소녀전선 지휘 콘솔');
  await console.getByRole('button',{name:'전술인형으로 시작'}).click();
  const layout=await console.evaluate(element=>{const workspace=element.querySelector<HTMLElement>('.workspace'),stage=element.querySelector<HTMLElement>('.stage'),dialogue=element.querySelector<HTMLElement>('.dialogue');return{fits:element.scrollWidth<=element.clientWidth+1,columns:workspace?getComputedStyle(workspace).gridTemplateColumns.split(' ').filter(Boolean).length:0,stageVisible:!!stage&&stage.getBoundingClientRect().width>0,dialogueVisible:!!dialogue&&dialogue.getBoundingClientRect().width>0};});
  expect(layout).toEqual({fits:true,columns:2,stageVisible:true,dialogueVisible:true});
  await console.getByRole('button',{name:'상점·장비'}).click();
  await expect(console).toContainText('카리나 보급 상점');
});

test('소녀전선 장면 BGM은 모바일 채팅을 가리지 않고 원본 태그를 재생 조작으로 바꾼다',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('simbot.llm',JSON.stringify({provider:'custom',endpoint:'http://127.0.0.1:4173/test-llm',model:'test',apiKey:'key'})));
  await page.route('http://127.0.0.1:4173/test-llm',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'카리나가 보급 목록을 펼쳤다.\n|BGM_shop|'}}]})}));
  const simulation=await importGfl(page);
  await simulation.getByRole('button',{name:'닫기'}).click();
  await expect(page.getByRole('button',{name:'관리 화면 열기'})).toContainText('★ 관리');
  const bgm=page.getByRole('region',{name:'소녀전선 장면 음악'});
  await expect(bgm).toContainText('장면 신호 대기');
  await expect(bgm.getByRole('button',{name:'음악 재생'})).toBeDisabled();
  await page.getByPlaceholder('메시지를 입력하세요').fill('카리나 상점으로 간다.');
  await page.getByRole('button',{name:'보내기'}).click();
  await expect(page.getByText('카리나가 보급 목록을 펼쳤다.')).toBeVisible();
  await expect(page.getByText('|BGM_shop|')).toHaveCount(0);
  await expect(bgm).toContainText('상점');
  await expect(bgm.getByRole('button',{name:'음악 재생'})).toBeEnabled();
  const layout=await bgm.evaluate(element=>({fits:element.scrollWidth<=element.clientWidth+1,width:Math.round(element.getBoundingClientRect().width)}));
  expect(layout).toEqual({fits:true,width:390});
});
