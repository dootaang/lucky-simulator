// SPDX-License-Identifier: GPL-3.0-or-later
// C2 — Risu 호환 프롬프트 컴파일러 계약.
// PromptPreset/PromptBlock/Persona는 C1 계약(../compat/contracts)을 재사용한다 — 중복 정의 금지.

import type { Persona, PromptPreset, PromptRole } from '../compat/contracts';

export interface CompileCard {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  systemPrompt?: string;
  postHistoryInstructions?: string;
}

export interface CompileLoreEntry {
  content: string;
  name?: string;
}

export interface CompileChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompileAuthorNote {
  content: string;
  /** chat 끝에서 몇 메시지 앞에 주입할지. 0 또는 생략이면 블록 위치에 그대로 출력. */
  depth?: number;
}

export interface CompileEngineContext {
  facts?: string;
  availableActions?: string;
  groundedMemory?: string;
}

export interface CompileOptions {
  /** 제공자(교대 role 규칙) 대응용 후처리. Risu 패리티 기본값은 병합하지 않음(false). */
  mergeConsecutiveRoles?: boolean;
}

export interface PromptCompileInput {
  preset: PromptPreset;
  card: CompileCard;
  persona?: Persona | null;
  /** 활성화 판정이 이미 끝난 로어 항목 목록 — 스캔·활성화 재구현 금지. */
  lore?: { entries: CompileLoreEntry[] } | null;
  chat?: CompileChatMessage[];
  authorNote?: CompileAuthorNote | null;
  /** Risu memory 블록 내용(요약 메모리). 없으면 memory 블록은 비활성. */
  memory?: string | null;
  engineContext?: CompileEngineContext | null;
  options?: CompileOptions;
}

export interface PromptTraceRow {
  blockId: string;
  blockType: string;
  /** 값의 출처 경로 — 예: preset.blocks[3], card.systemPrompt, input.authorNote, engineContext.facts */
  sourcePath: string;
  role: PromptRole | 'none';
  active: boolean;
  /** 활성이면 'ok', 비활성이면 사유(empty/disabled/unsupported/...) */
  reason: string;
  chars: number;
  tokensEstimate: number;
  /** authorNote depth 주입처럼 블록 위치와 다른 곳에 삽입된 경우의 실제 위치 표기. */
  insertedAt?: string;
}

export interface PromptWarning {
  code: string;
  path: string;
  detail?: string;
}

export interface CompiledPrompt {
  messages: Array<{ role: PromptRole; content: string }>;
  assistantPrefill: string;
  trace: PromptTraceRow[];
  warnings: PromptWarning[];
}

export type CompilePromptFn = (input: PromptCompileInput) => CompiledPrompt;
