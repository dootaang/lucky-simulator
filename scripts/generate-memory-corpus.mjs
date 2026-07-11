// 결정론 기억 벤치마크 코퍼스 생성기 — LLM·Math.random 미사용, seed 기반 재현.
// 출력을 app/test/fixtures/memory-benchmark/{corpus,questions}.json에 고정 커밋한다.
// 테스트는 이 스크립트를 실행하지 않고 커밋된 JSON만 읽는다(CLAUDE-TASK §4 Phase A).
// 실행: node scripts/generate-memory-corpus.mjs
//
// 원리: 추적된 그라운드 트루스(골드·HP·NPC별 호감/위치/관계단계/약속/비밀·퀘스트)를
// turn 순으로 갱신하며 진술 메시지를 낸다. 정답지는 같은 그라운드 트루스에서 도출하므로
// 코퍼스-정답 정합이 구조적으로 보장된다. 사이사이 필러가 방해(distractor)를 만든다.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'test', 'fixtures', 'memory-benchmark');
const SEED = 20260712;

function lcg(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
const rand = lcg(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const NPCS = [
  { id: 'silvia', ko: '실비아', en: 'Silvia' },
  { id: 'mirian', ko: '미리안', en: 'Mirian' },
  { id: 'kang', ko: '강한결', en: 'Kang' },
  { id: 'iris', ko: '아이리스', en: 'Iris' },
  { id: 'sera', ko: '세라', en: 'Sera' },
];

const messages = [];
const records = [];
const questions = [];
let turn = 0;
let recordSeq = 0;
let eventSeq = 0;
const latest = {}; // key -> { recordId, value }

const nextMsgId = () => `m${String(messages.length + 1).padStart(4, '0')}`;
const nextRecId = () => `r${String((recordSeq += 1)).padStart(4, '0')}`;

function emitMessage(role, content, entities) {
  turn += 1;
  const id = nextMsgId();
  messages.push({ id, turn, role, content, entities });
  return id;
}

function setFact(key, value, { kind, text, role = 'assistant', entities = [], importance = 0 }) {
  const messageId = emitMessage(role, text, entities);
  eventSeq += 1;
  const recordId = nextRecId();
  const prev = latest[key];
  const supersedes = prev ? [prev.recordId] : [];
  if (prev) {
    const prevRec = records.find((r) => r.id === prev.recordId);
    if (prevRec) { prevRec.validToTurn = turn - 1; prevRec.status = 'superseded'; }
  }
  records.push({
    id: recordId, kind, text, sourceMessageIds: [messageId], sourceEventIndexes: [eventSeq],
    entities, createdTurn: turn, validFromTurn: turn, validToTurn: null, supersedes, importance, status: 'approved',
  });
  latest[key] = { recordId, value };
  return recordId;
}

const FILLER = [
  '테이블을 닦고 잔을 정리했다.', '창밖으로 비가 그쳤다.', '난롯불이 탁탁 소리를 냈다.',
  '길드 게시판에 새 공고가 붙었다.', '시장에서 향신료 냄새가 풍겼다.', '멀리서 종소리가 울렸다.',
  '손님 몇이 들어와 자리를 잡았다.', '지도를 펼쳐 경로를 훑었다.', '검을 손질하며 숫돌을 갈았다.',
  '주방에서 스튜 끓는 냄새가 났다.', '동전을 세어 장부에 적었다.', '바람이 문틈으로 새어들었다.',
];
const emitFiller = () => emitMessage(rand() < 0.5 ? 'user' : 'assistant', pick(FILLER), []);

const RELATION_TIERS = ['서먹함', '지인', '친구', '가까운 사이', '연인 직전'];
function tierOf(aff) { return RELATION_TIERS[Math.min(RELATION_TIERS.length - 1, Math.floor(aff / 20))]; }

// ── 그라운드 트루스 ──
let gold = 500000;
const affinity = {}; const location = {}; const tier = {};
for (const n of NPCS) { affinity[n.id] = 20; location[n.id] = '여관'; tier[n.id] = tierOf(20); }
const LOCATIONS = ['여관', '시장', '길드', '북부 관문', '지하 수로', '왕성 앞', '온천 마을'];
const GOLD_SERIES = [520000, 480000, 610000, 590000, 720000, 655000, 810000, 770000];

const goldSnapshots = []; // { turn, value } — 시점 질문용
const affSnapshots = {}; const locSnapshots = {};
for (const n of NPCS) { affSnapshots[n.id] = []; locSnapshots[n.id] = []; }

// 명시적 스케줄: 300턴을 채우되 사실 갱신 지점을 결정론으로 배치.
let goldIdx = 0;
for (let step = 0; step < 300; step += 1) {
  const npc = NPCS[step % NPCS.length];
  if (step % 35 === 4 && goldIdx < GOLD_SERIES.length) {
    gold = GOLD_SERIES[goldIdx++];
    setFact('gold', String(gold), { kind: 'engine-fact', text: `정산 결과 금고의 골드가 ${gold.toLocaleString('ko-KR')}원이 되었다.` });
    goldSnapshots.push({ turn, value: gold });
  } else if (step % 7 === 2) {
    const delta = ((step % 3) === 0) ? 12 : -6;
    const before = affinity[npc.id];
    affinity[npc.id] = Math.max(0, before + delta);
    const beforeTier = tier[npc.id];
    tier[npc.id] = tierOf(affinity[npc.id]);
    setFact(`aff:${npc.id}`, String(affinity[npc.id]), {
      kind: 'relation', text: `${npc.ko}와의 호감도가 ${affinity[npc.id]}이 되었다.`, entities: [npc.id],
    });
    affSnapshots[npc.id].push({ turn, value: affinity[npc.id] });
    if (tier[npc.id] !== beforeTier) {
      setFact(`tier:${npc.id}`, tier[npc.id], {
        kind: 'relation', importance: 0.5,
        text: `${npc.ko}(${npc.en})와의 관계가 '${tier[npc.id]}' 단계로 접어들었다.`, entities: [npc.id],
      });
    }
  } else if (step % 11 === 5) {
    const loc = pick(LOCATIONS.filter((l) => l !== location[npc.id]));
    location[npc.id] = loc;
    setFact(`loc:${npc.id}`, loc, { kind: 'event', text: `${npc.ko}(${npc.en})는 지금 ${loc}에 있다.`, entities: [npc.id] });
    locSnapshots[npc.id].push({ turn, value: loc });
  } else {
    emitFiller();
  }
  // 고정 이벤트(약속·비밀·퀘스트) — 특정 step에 1회.
  if (step === 60) setFact('promise:silvia', 'p', { kind: 'promise', importance: 0.9, text: '실비아가 다음 보름달 뜨는 밤 여관 옥상에서 단둘이 만나자고 약속했다.', entities: ['silvia'] });
  if (step === 72) setFact('promise:mirian', 'p', { kind: 'promise', importance: 0.4, text: '미리안은 창고 옥상의 재고를 함께 정리해 주기로 했다.', entities: ['mirian'] });
  if (step === 95) setFact('secret:kang', 's', { kind: 'secret', importance: 0.95, text: '강한결이 은밀히 털어놓았다 — 사실 그는 다른 이름으로도 협회에 등록된 이중 등록 헌터라고.', entities: ['kang'] });
  if (step === 118) setFact('secret:sera', 's', { kind: 'secret', importance: 0.9, text: '세라가 조용히 고백했다. 자신은 몰락한 귀족 가문의 마지막 후계라는 비밀을.', entities: ['sera'] });
  if (step === 130) setFact('promise:iris', 'p', { kind: 'promise', importance: 0.85, text: '아이리스가 다음 A급 게이트를 나와 파티로 함께 공략하기로 약속했다.', entities: ['iris'] });
  if (step === 145) setFact('promise:kang', 'p', { kind: 'promise', importance: 0.7, text: '강한결이 마정석 수익을 반씩 나누기로 약속했다.', entities: ['kang'] });
  if (step === 158) setFact('secret:silvia', 's', { kind: 'secret', importance: 0.8, text: '실비아가 사실은 이 여관을 빚 때문에 곧 넘겨야 할지도 모른다는 비밀을 털어놓았다.', entities: ['silvia'] });
  if (step === 170) setFact('secret:iris', 's', { kind: 'secret', importance: 0.75, text: '아이리스는 게이트에서 죽은 동생의 유품을 아직 간직하고 있다는 비밀을 보여줬다.', entities: ['iris'] });
  if (step === 182) setFact('promise:sera', 'p', { kind: 'promise', importance: 0.6, text: '세라가 다음 무도회에 나를 파트너로 초대하겠다고 약속했다.', entities: ['sera'] });
  if (step === 195) setFact('secret:mirian', 's', { kind: 'secret', importance: 0.65, text: '미리안이 실은 왕성 주방에서 쫓겨난 요리사였다는 과거를 고백했다.', entities: ['mirian'] });
  if (step === 205) setFact('quest:q_boar', '완료', { kind: 'event', text: '멧돼지 소탕 의뢰를 완료하고 협회에 보고했다.', entities: ['kang', 'iris'] });
  if (step === 230) setFact('quest:q_gate', '완료', { kind: 'event', text: 'A급 게이트 공략 의뢰를 아이리스와 함께 완수했다.', entities: ['iris'] });
}

// ── 질문 도출 ──
const NOW = turn; // "지금" = 코퍼스의 실제 마지막 턴(atTurn 정합).
const qId = (cat, n) => `${cat}-${String(n).padStart(2, '0')}`;
const recOf = (id) => records.find((r) => r.id === id);
const curRec = (key) => (latest[key] ? recOf(latest[key].recordId) : null);
function supChain(key) {
  const cur = curRec(key);
  const chain = [];
  let sup = cur ? cur.supersedes : [];
  while (sup && sup.length) { const prev = recOf(sup[0]); if (!prev) break; chain.push(prev.id); sup = prev.supersedes; }
  return chain;
}
// atTurn 시점에 유효한 record(있으면). keyByRecord로 record→key 매핑.
function recordValidAt(key, atTurn) {
  return records.filter((r) => keyByRecord[r.id] === key && r.validFromTurn <= atTurn && (r.validToTurn == null || r.validToTurn >= atTurn))[0] || null;
}
const keyByRecord = {}; // recordId -> key
for (const r of records) { /* fill below via scan of setFact history is lost; rebuild from text keys */ }
// key 복원: setFact가 latest만 남겼으므로 record→key 매핑을 별도로 만든다.
// 각 record의 supersede 체인은 같은 key이므로, 현재 latest에서 역방향으로 key를 칠한다.
for (const [key, l] of Object.entries(latest)) {
  let id = l.recordId;
  while (id) { keyByRecord[id] = key; const rec = recOf(id); id = rec && rec.supersedes[0]; }
}

function makeQ(queryId, category, atTurn, query, expectedCurrentFacts, record, supersededRecordIds, forbiddenClaims) {
  return {
    queryId, category, atTurn, query, expectedCurrentFacts,
    relevantMessageIds: record ? record.sourceMessageIds.slice() : [],
    relevantEventIndexes: record ? record.sourceEventIndexes.slice() : [],
    supersededRecordIds: supersededRecordIds.slice(), forbiddenClaims: forbiddenClaims.slice(),
  };
}

// 1) current-fact (>=20)
let cf = 0;
questions.push(makeQ(qId('current-fact', ++cf), 'current-fact', NOW, '지금 금고에 골드가 얼마나 있지?', { gold: String(gold) }, curRec('gold'), supChain('gold'), []));
for (const n of NPCS) {
  questions.push(makeQ(qId('current-fact', ++cf), 'current-fact', NOW, `${n.ko}에 대한 지금 호감도는 몇이야?`, { [`affinity:${n.id}`]: String(affinity[n.id]) }, curRec(`aff:${n.id}`), supChain(`aff:${n.id}`), []));
  questions.push(makeQ(qId('current-fact', ++cf), 'current-fact', NOW, `${n.ko}는 지금 어디 있어?`, { [`location:${n.id}`]: location[n.id] }, curRec(`loc:${n.id}`), supChain(`loc:${n.id}`), []));
  const tr = curRec(`tier:${n.id}`);
  if (tr) questions.push(makeQ(qId('current-fact', ++cf), 'current-fact', NOW, `${n.ko}와 지금 어떤 관계 단계야?`, { [`tier:${n.id}`]: tier[n.id] }, tr, supChain(`tier:${n.id}`), []));
}
// 시점 스냅샷 current-fact로 20 채우기 — 특정 과거 턴 T에서의 현재 위치.
for (const n of NPCS) {
  if (cf >= 20) break;
  for (const snap of locSnapshots[n.id]) {
    if (cf >= 20) break;
    const rec = recordValidAt(`loc:${n.id}`, snap.turn);
    if (rec) questions.push(makeQ(qId('current-fact', ++cf), 'current-fact', snap.turn, `${snap.turn}턴 시점에 ${n.ko}는 어디 있었어?`, { [`location:${n.id}`]: snap.value }, rec, [], []));
  }
}

// 2) superseded (>=20) — 각 사실의 직전 값.
let sc = 0;
function pushSuperseded(key, forbiddenNow) {
  const chain = supChain(key);
  if (!chain.length) return;
  const oldRec = recOf(chain[0]);
  questions.push(makeQ(qId('superseded', ++sc), 'superseded', NOW, `${describeKey(key)}, 지금 값으로 바뀌기 직전엔 뭐였어?`, {}, oldRec, [], [String(forbiddenNow)]));
}
function describeKey(key) {
  if (key === 'gold') return '금고 골드가';
  const [type, id] = key.split(':');
  const n = NPCS.find((x) => x.id === id);
  if (type === 'aff') return `${n.ko} 호감도가`;
  if (type === 'loc') return `${n.ko} 위치가`;
  if (type === 'tier') return `${n.ko}와의 관계 단계가`;
  return key;
}
pushSuperseded('gold', gold);
for (const n of NPCS) { pushSuperseded(`aff:${n.id}`, affinity[n.id]); pushSuperseded(`loc:${n.id}`, location[n.id]); }
// 시점 스냅샷도 superseded 성격(과거 특정 시점 값) — 20까지 보충.
for (const snap of goldSnapshots) {
  if (sc >= 20) break;
  const rec = recordValidAt('gold', snap.turn);
  if (rec && rec.validToTurn != null) questions.push(makeQ(qId('superseded', ++sc), 'superseded', NOW, `골드가 ${snap.turn}턴 무렵엔 얼마였지? 지금 말고 그때 값.`, {}, rec, [], [String(gold)]));
}
for (const n of NPCS) {
  if (sc >= 20) break;
  for (const snap of affSnapshots[n.id]) {
    if (sc >= 20) break;
    const rec = recordValidAt(`aff:${n.id}`, snap.turn);
    if (rec && rec.validToTurn != null) questions.push(makeQ(qId('superseded', ++sc), 'superseded', NOW, `${n.ko} 호감도가 ${snap.turn}턴 무렵엔 얼마였어? 지금 값 말고.`, {}, rec, [], [String(affinity[n.id])]));
  }
}

// 3) promise-secret-relation (>=20)
let pr = 0;
const psrKeys = [
  ['promise:silvia', '실비아가 나랑 무슨 약속을 했더라?'], ['promise:mirian', '미리안이 도와주기로 한 일이 뭐였어?'],
  ['promise:iris', '아이리스랑 같이 하기로 한 게 뭐였어?'], ['promise:kang', '강한결이 수익에 관해 한 약속이 뭐였지?'],
  ['promise:sera', '세라가 무도회에 관해 한 약속이 뭐였어?'],
  ['secret:kang', '강한결이 나한테만 털어놓은 비밀이 뭐였지?'], ['secret:sera', '세라의 출신 비밀이 뭐였지?'],
  ['secret:silvia', '실비아가 여관에 관해 털어놓은 비밀이 뭐였어?'], ['secret:iris', '아이리스가 간직한 유품 비밀이 뭐였지?'],
  ['secret:mirian', '미리안의 과거 비밀이 뭐였어?'],
];
for (const [key, q] of psrKeys) { const cur = curRec(key); if (cur) questions.push(makeQ(qId('promise-secret-relation', ++pr), 'promise-secret-relation', NOW, q, {}, cur, [], [])); }
for (const n of NPCS) { const cur = curRec(`tier:${n.id}`); if (cur) questions.push(makeQ(qId('promise-secret-relation', ++pr), 'promise-secret-relation', NOW, `${n.ko}와의 관계가 어느 단계까지 왔지?`, {}, cur, [], [])); }
// 관계 milestone 추가로 20 채우기
for (const n of NPCS) {
  if (pr >= 20) break;
  const cur = curRec(`aff:${n.id}`);
  if (cur) questions.push(makeQ(qId('promise-secret-relation', ++pr), 'promise-secret-relation', NOW, `${n.ko}와 최근 관계가 어떻게 변했어?`, {}, cur, [], []));
}

// 4) paraphrase (>=20) — 원문과 어휘가 겹치지 않게.
let pp = 0;
const paras = [
  ['promise:silvia', '달이 가장 밝은 밤에 누구와 어디서 보기로 했더라?'],
  ['secret:kang', '두 개의 신분으로 협회 명부에 오른 사람이 누구였지?'],
  ['secret:sera', '가세가 기운 명문가의 유일한 계승자라고 밝힌 인물은?'],
  ['promise:iris', '상급 균열을 한 팀으로 돌파하자고 한 사람은 누구였어?'],
  ['quest:q_boar', '산짐승 토벌 임무는 결국 어떻게 마무리됐지?'],
  ['secret:silvia', '경영난으로 가게를 잃을지 모른다고 걱정한 사람은?'],
  ['secret:iris', '균열에서 잃은 혈육의 물건을 품고 있는 사람은 누구야?'],
  ['promise:kang', '전리품 대금을 절반씩 가르자고 제안한 게 누구였지?'],
  ['secret:mirian', '궁정 조리실에서 밀려난 이력이 있는 사람은?'],
  ['promise:sera', '다가오는 연회에 짝으로 데려가겠다고 한 사람은?'],
  ['quest:q_gate', '상급 균열 소탕 임무는 누구와 함께 끝냈지?'],
  ['promise:mirian', '저장고 위층 물건 정돈을 거들겠다고 한 사람은?'],
];
for (const [key, q] of paras) { const cur = curRec(key); if (cur) questions.push(makeQ(qId('paraphrase', ++pp), 'paraphrase', NOW, q, {}, cur, [], [])); }
// 위치/호감 paraphrase로 20 채우기
for (const n of NPCS) {
  if (pp >= 20) break;
  const cur = curRec(`loc:${n.id}`);
  if (cur) questions.push(makeQ(qId('paraphrase', ++pp), 'paraphrase', NOW, `${n.en}가 머무는 곳이 지금 어디랬지?`, {}, cur, [], []));
}
for (const n of NPCS) {
  if (pp >= 20) break;
  const cur = curRec(`aff:${n.id}`);
  if (cur) questions.push(makeQ(qId('paraphrase', ++pp), 'paraphrase', NOW, `${n.en}랑 나 사이 친밀도 수치가 얼마랬어?`, {}, cur, [], []));
}

// 5) npc-disambiguation (>=20) — 유사 사건 NPC 구분.
let nd = 0;
function pushDisambig(keyTrue, keyDistract, q) {
  const t = curRec(keyTrue); const d = curRec(keyDistract);
  if (t && d) questions.push(makeQ(qId('npc-disambiguation', ++nd), 'npc-disambiguation', NOW, q, {}, t, [], [d.text]));
}
pushDisambig('promise:silvia', 'promise:mirian', '옥상에서 만나자고 은밀히 약속한 건 누구였지, 실비아야 미리안이야?');
pushDisambig('promise:mirian', 'promise:silvia', '창고 옥상 재고 정리를 도와주기로 한 사람은 실비아가 아니라 누구였어?');
pushDisambig('secret:kang', 'secret:sera', '이중 등록이라는 비밀을 가진 건 세라가 아니라 누구였지?');
pushDisambig('secret:sera', 'secret:kang', '몰락 귀족 후계라는 비밀은 강한결이 아니라 누구 것이었어?');
pushDisambig('promise:iris', 'promise:kang', '게이트를 함께 공략하자고 한 건 강한결이 아니라 누구였어?');
pushDisambig('promise:kang', 'promise:iris', '수익을 반씩 나누자고 한 건 아이리스가 아니라 누구였지?');
pushDisambig('secret:silvia', 'secret:mirian', '여관을 빚 때문에 잃을까 걱정한 건 미리안이 아니라 누구였어?');
pushDisambig('secret:mirian', 'secret:silvia', '왕성 주방에서 쫓겨난 과거를 가진 건 실비아가 아니라 누구였지?');
pushDisambig('secret:iris', 'secret:kang', '죽은 동생 유품을 간직한 건 강한결이 아니라 누구였어?');
pushDisambig('promise:sera', 'promise:silvia', '무도회 파트너로 초대한 건 실비아가 아니라 누구였지?');
// 위치·호감 기반 구분으로 20 채우기 — 두 NPC 구분
for (let i = 0; i < NPCS.length && nd < 20; i += 1) {
  const a = NPCS[i]; const b = NPCS[(i + 1) % NPCS.length];
  const ra = curRec(`loc:${a.id}`); const rb = curRec(`loc:${b.id}`);
  if (ra && rb) questions.push(makeQ(qId('npc-disambiguation', ++nd), 'npc-disambiguation', NOW, `${a.ko}가 지금 있는 곳은 ${b.ko}가 있는 곳과 같아, 달라? ${a.ko} 위치를 짚어줘.`, {}, ra, [], [rb.text]));
}
for (let i = 0; i < NPCS.length && nd < 20; i += 1) {
  const a = NPCS[i]; const b = NPCS[(i + 2) % NPCS.length];
  const ra = curRec(`aff:${a.id}`); const rb = curRec(`aff:${b.id}`);
  if (ra && rb) questions.push(makeQ(qId('npc-disambiguation', ++nd), 'npc-disambiguation', NOW, `${b.ko} 말고 ${a.ko}의 현재 호감도가 얼마였지?`, {}, ra, [], [rb.text]));
}

// 6) negative (>=20)
let ng = 0;
const negatives = [
  ['미리안이 나한테 반지를 선물하겠다고 약속한 적 있었나?', ['반지']],
  ['아이리스가 협회를 탈퇴하겠다고 한 적 있어?', ['탈퇴']],
  ['세라가 왕이 되겠다고 선언했었나?', ['왕이 되', '즉위']],
  ['강한결이 실비아와 결혼하기로 했었지?', ['결혼']],
  ['금고 골드가 100만 원을 넘긴 적 있었나?', ['1,000,000', '100만']],
  ['실비아가 헌터로 전직하겠다고 했었나?', ['전직']],
  ['세라가 나에게 검술을 가르쳐주기로 했었지?', ['검술']],
  ['미리안이 게이트 공략에 함께 가기로 했었나?', ['게이트']],
  ['강한결이 여관을 인수하겠다고 했었어?', ['인수']],
  ['아이리스가 귀족가의 후계라고 밝혔었나?', ['귀족']],
  ['실비아가 이중 등록 헌터라는 비밀을 털어놓았었지?', ['이중 등록']],
  ['세라가 왕성 주방에서 일했다고 했었나?', ['주방']],
  ['미리안이 마정석 수익을 나누자고 했었어?', ['마정석']],
  ['강한결이 무도회에 초대했었지?', ['무도회']],
  ['아이리스가 여관을 빚 때문에 넘긴다고 했었나?', ['빚']],
  ['세라가 동생 유품을 간직하고 있다고 했었어?', ['유품']],
  ['실비아가 협회에 정체를 숨겼다고 했었지?', ['정체를 숨']],
  ['미리안이 보름달 밤 옥상에서 단둘이 만나자고 했었나?', ['단둘이']],
  ['강한결이 몰락 귀족 가문 출신이라고 했었어?', ['몰락']],
  ['아이리스가 재고 정리를 도와주기로 했었지?', ['재고']],
];
for (const [q, forbidden] of negatives) {
  questions.push({ queryId: qId('negative', ++ng), category: 'negative', atTurn: NOW, query: q, expectedCurrentFacts: {}, relevantMessageIds: [], relevantEventIndexes: [], supersededRecordIds: [], forbiddenClaims: forbidden });
}

// ── 카테고리별 20문항 보장 패딩 (레코드 풀에서 직접) ──
function countCat(cat) { return questions.filter((q) => q.category === cat).length; }
const superseded = records.filter((r) => r.validToTurn != null); // 과거값 레코드
let padS = countCat('superseded');
for (const rec of superseded) {
  if (padS >= 20) break;
  const key = keyByRecord[rec.id];
  const already = questions.some((q) => q.category === 'superseded' && q.relevantMessageIds[0] === rec.sourceMessageIds[0]);
  if (already) continue;
  const curVal = latest[key] ? latest[key].value : '';
  questions.push(makeQ(qId('superseded', ++padS), 'superseded', NOW, `${describeKey(key)} 지금은 아니지만 예전엔 ${rec.validFromTurn}턴부터 얼마였지?`, {}, rec, [], [String(curVal)]));
}
let padC = countCat('current-fact');
const goldFor = (t) => { const r = recordValidAt('gold', t); return r; };
for (const snap of goldSnapshots) {
  if (padC >= 20) break;
  const rec = goldFor(snap.turn);
  if (rec) questions.push(makeQ(qId('current-fact', ++padC), 'current-fact', snap.turn, `${snap.turn}턴 시점 기준 금고 골드는 얼마야?`, { gold: String(snap.value) }, rec, [], []));
}
let padP = countCat('promise-secret-relation');
// 현재 유효 약속·비밀 우선, 부족하면 관계 변화(tier 전이) 레코드로 보충 — 모두 정당한 서사 기억.
const psrPool = records.filter((r) => r.kind === 'promise' || r.kind === 'secret' || r.kind === 'tier' || r.text.includes('단계로 접어들었다'));
for (const rec of psrPool) {
  if (padP >= 20) break;
  const already = questions.some((q) => q.category === 'promise-secret-relation' && q.relevantMessageIds[0] === rec.sourceMessageIds[0]);
  if (already) continue;
  const who = NPCS.find((n) => rec.entities.includes(n.id));
  questions.push(makeQ(qId('promise-secret-relation', ++padP), 'promise-secret-relation', rec.validToTurn == null ? NOW : rec.validToTurn, `${who ? who.ko : '그 인물'}와의 관계에서 기억해 둘 변화가 ${rec.createdTurn}턴 무렵 있었지?`, {}, rec, [], []));
}

// ── 출력 ──
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'corpus.json'), JSON.stringify({ contract: 'memory-benchmark-corpus/0.1', seed: SEED, messages, records }, null, 2) + '\n');
writeFileSync(join(OUT_DIR, 'questions.json'), JSON.stringify({ contract: 'memory-benchmark-questions/0.1', questions }, null, 2) + '\n');

const byCat = {};
for (const q of questions) byCat[q.category] = (byCat[q.category] || 0) + 1;
console.log(`corpus: ${messages.length} messages, ${records.length} records`);
console.log(`questions: ${questions.length} total`, byCat);
