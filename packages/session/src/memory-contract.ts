import type { CompiledPrompt } from '@simbot/risu';

const PACKET = 'SIMBOT_MEMORY_PACKET';
const MAX_PACKET_CHARS = 12_000;

export interface MemoryPacketResponse {
  text: string;
  memories?: unknown[];
  factRefs?: unknown[];
  continuityPatch?: unknown;
}

function contract(format: 'json' | 'prose') {
  const schema = 'memories:[{text,kind,entities,evidenceQuote,eventIds,canonicalKey,knowledgeScope,importance,knowledge,lifecycle}], factRefs:[{claim,refs}], continuityPatch:{confirmMemoryIds,resolveMemoryIds,reason}';
  const rules = [
    '[장기 기억 후보 계약]',
    '나중 장면에 영향을 줄 새 약속·비밀·관계 변화·중요 사건만 최대 3건 제출한다. 일상적인 동작과 이미 주어진 현재 수치는 반복 저장하지 않는다.',
    'evidenceQuote는 이번 사용자 메시지의 정확한 연속 인용문만 쓴다. eventIds는 이번 응답에서 실제로 성공한 엔진 사건 ID만 쓴다. 근거가 없으면 둘 다 비운다.',
    '인물만 아는 정보는 knowledge.privacy를 private 또는 secret으로 하고 knowledge.holderEntityIds에 아는 인물 ID를 적는다. 다른 인물에게 누설하지 않는다.',
    '기억을 확정·폐기하자는 continuityPatch는 기존 기억 ID가 문맥에 명시된 경우에만 제안한다. 중요한 새 사실이 없으면 빈 memories와 factRefs를 낸다.',
  ];
  if (format === 'json') return `${rules.join('\n')}\n최종 JSON은 기존 text/events/speakers와 함께 다음 선택 필드를 사용할 수 있다: ${schema}.`;
  return `${rules.join('\n')}\n서사 본문 뒤에 다음 HTML 주석을 정확히 한 번 붙인다. 주석은 독자에게 보이지 않는다.\n<!--${PACKET}\n{"memories":[],"factRefs":[]}\n-->`;
}

export function withMemoryCaptureContract(prompt: CompiledPrompt, format: 'json' | 'prose'): CompiledPrompt {
  const content = contract(format), messages = prompt.messages.map((message) => ({ ...message }));
  let systemIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'system') { systemIndex = index; break; }
  }
  if (systemIndex >= 0) {
    const target = messages[systemIndex]!;
    messages[systemIndex] = { ...target, content: `${target.content}\n\n${content}` };
  } else {
    messages.unshift({ role: 'system', content });
  }
  const messageMeta = prompt.messageMeta
    ? (systemIndex >= 0
      ? prompt.messageMeta.map((meta) => ({ ...meta }))
      : [{ blockType: 'memory-capture-contract' }, ...prompt.messageMeta])
    : undefined;
  return {
    ...prompt,
    messages,
    ...(messageMeta ? { messageMeta } : {}),
    trace: [...prompt.trace, { blockId: 'memory-capture-contract', blockType: 'memory-capture-contract', sourcePath: 'session.memory-contract', role: 'system', active: true, reason: 'ok', chars: content.length, tokensEstimate: Math.ceil(content.length / 4) }],
  };
}

function arrays(value: unknown, limit: number) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

export type MemoryPacketResult<T extends { text: string }> = T & Omit<MemoryPacketResponse, 'text'>;

export function ingestHiddenMemoryPacket<T extends { text: string }>(response: T): MemoryPacketResult<T> {
  const expression = new RegExp(`<!--\\s*${PACKET}\\s*([\\s\\S]*?)-->`, 'gi');
  let match: RegExpExecArray | null, packet: Record<string, unknown> | null = null;
  while ((match = expression.exec(response.text))) {
    const raw = (match[1] ?? '').trim();
    if (!raw || raw.length > MAX_PACKET_CHARS) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) packet = parsed as Record<string, unknown>;
    } catch { /* 잘못된 숨은 봉투는 본문만 제거하고 기억으로 쓰지 않는다. */ }
  }
  const text = response.text.replace(expression, '').trimEnd();
  if (!packet) return { ...response, text };
  const existing = response as T & Omit<MemoryPacketResponse, 'text'>;
  const memories = [...arrays(existing.memories, 12), ...arrays(packet.memories, 12)].slice(0, 12),
    factRefs = [...arrays(existing.factRefs, 20), ...arrays(packet.factRefs, 20)].slice(0, 20),
    continuityPatch = existing.continuityPatch ?? (packet.continuityPatch && typeof packet.continuityPatch === 'object' ? packet.continuityPatch : undefined);
  return {
    ...response,
    text,
    ...(memories.length ? { memories } : {}),
    ...(factRefs.length ? { factRefs } : {}),
    ...(continuityPatch ? { continuityPatch } : {}),
  };
}
