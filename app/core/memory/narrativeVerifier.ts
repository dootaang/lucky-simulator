// SPDX-License-Identifier: GPL-3.0-or-later
// LLM 서사를 엔진 사실로 승격하지 않기 위한 마지막 표시 관문.

export interface NarrativeVerification {
  text: string;
  issues: Array<{ code: 'failed-event-claim' | 'unsupported-number'; detail?: string }>;
}

function numericTokens(text: string): string[] {
  return Array.from(String(text || '').matchAll(/\d[\d,]*(?:\.\d+)?/g))
    .map((match) => match[0].replace(/,/g, ''));
}

function sentences(text: string): string[] {
  return String(text || '').split(/(?<=[.!?。！？]|다\.|요\.)\s+|\n+/u).map((part) => part.trim()).filter(Boolean);
}

export function verifyNarrative(input: {
  narrative: string;
  evidenceTexts?: string[];
  hasFailedProposedEvent?: boolean;
  fallback?: string;
}): NarrativeVerification {
  const narrative = String(input.narrative || '').trim();
  const fallback = String(input.fallback || '엔진 판정 결과가 반영되었습니다.');
  if (input.hasFailedProposedEvent) {
    return { text: fallback, issues: [{ code: 'failed-event-claim' }] };
  }
  const allowed = new Set(numericTokens((input.evidenceTexts || []).join('\n')));
  const issues: NarrativeVerification['issues'] = [];
  const kept = sentences(narrative).filter((sentence) => {
    const unsupported = numericTokens(sentence).filter((token) => !allowed.has(token));
    if (!unsupported.length) return true;
    issues.push({ code: 'unsupported-number', detail: unsupported.join(',') });
    return false;
  });
  return { text: kept.join('\n').trim() || (issues.length ? fallback : narrative), issues };
}
