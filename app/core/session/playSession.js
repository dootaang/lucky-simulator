'use strict';

// S2 — 플레이 세션 저장 파일 포맷(내보내기/가져오기)과 검증.
// 원장(journal)의 손상 감지는 engine/core/sessionJournal.restoreSessionJournal이 담당하고,
// 이 계층은 파일 골격(대화·PromptRun 포함)의 형태 검증만 맡는다.
// 결정론 원칙: savedAt 등 시각은 호출자(UI)가 주입한다.

const PLAY_SESSION_CONTRACT = 'play-session/0.1';

function buildPlaySessionExport({ journal, messages, promptRuns, savedAt, title }) {
  if (!journal || journal.contract !== 'session-journal/0.1') throw new TypeError('play_session_journal_required');
  return {
    contract: PLAY_SESSION_CONTRACT,
    title: typeof title === 'string' ? title : '',
    savedAt: Number.isFinite(Number(savedAt)) ? Number(savedAt) : 0,
    journal,
    messages: sanitizeMessages(messages),
    promptRuns: sanitizePromptRuns(promptRuns),
  };
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message === 'object' && ['user', 'assistant', 'ledger'].includes(message.role))
    .map((message) => JSON.parse(JSON.stringify({
      role: message.role,
      content: String(message.content == null ? '' : message.content),
      ...(Array.isArray(message.chips) ? { chips: message.chips } : {}),
      ...(Array.isArray(message.npcIds) ? { npcIds: message.npcIds } : {}),
    })));
}

function sanitizePromptRuns(promptRuns) {
  if (!Array.isArray(promptRuns)) return [];
  return promptRuns
    .filter((run) => run && typeof run === 'object')
    .map((run, index) => JSON.parse(JSON.stringify({
      index: index + 1,
      promptHash: String(run.promptHash || ''),
      model: String(run.model || ''),
      responseText: String(run.responseText == null ? '' : run.responseText),
      proposedEvents: Array.isArray(run.proposedEvents) ? run.proposedEvents.map((id) => String(id)) : [],
      appliedOk: Number.isFinite(Number(run.appliedOk)) ? Number(run.appliedOk) : 0,
    })));
}

// 가져오기 1차 검증 — 구조가 맞으면 정제된 페이로드를 돌려준다.
// 원장 내용의 진위(해시·판정)는 이후 restoreSessionJournal이 검증한다.
function parsePlaySessionImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch (_) {
    throw new TypeError('play_session_not_json');
  }
  if (!parsed || typeof parsed !== 'object' || parsed.contract !== PLAY_SESSION_CONTRACT) {
    throw new TypeError('play_session_contract_mismatch');
  }
  if (!parsed.journal || parsed.journal.contract !== 'session-journal/0.1') {
    throw new TypeError('play_session_journal_missing');
  }
  return {
    contract: PLAY_SESSION_CONTRACT,
    title: typeof parsed.title === 'string' ? parsed.title : '',
    savedAt: Number.isFinite(Number(parsed.savedAt)) ? Number(parsed.savedAt) : 0,
    journal: parsed.journal,
    messages: sanitizeMessages(parsed.messages),
    promptRuns: sanitizePromptRuns(parsed.promptRuns),
  };
}

module.exports = { PLAY_SESSION_CONTRACT, buildPlaySessionExport, parsePlaySessionImport };
