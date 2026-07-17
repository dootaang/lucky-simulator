export interface GflBgmTrack {
  cue: string;
  label: string;
  youtubeId: string;
}

// 옛 제작자판 GF_BGM.js의 곡 순서와 ID. 카드의 프로그램을 실행하지 않고,
// 카드가 출력하는 제한된 큐만 이 안전 목록으로 번역한다.
export const GFL_BGM_TRACKS: readonly GflBgmTrack[] = [
  { cue: 'daily', label: '일상', youtubeId: 'bWfvqx2lSzE' },
  { cue: 'dailynight', label: '밤의 일상', youtubeId: 'OQD3Emi1Qik' },
  { cue: 'truth', label: '진실', youtubeId: 'xv_CxGlZxTI' },
  { cue: 'cafe', label: '카페', youtubeId: '-VPX5D9zj7I' },
  { cue: 'war', label: '전쟁', youtubeId: 'eu0UL_rdilk' },
  { cue: 'victory', label: '승리', youtubeId: 'M--ch1MBa2s' },
  { cue: 'select', label: '선택', youtubeId: 'ZPg3oPBvC90' },
  { cue: 'tension', label: '긴장', youtubeId: 'SaMjz5QcpWw' },
  { cue: 'mystery', label: '미스터리', youtubeId: 'G10AjhbIxs4' },
  { cue: 'day', label: '아침·낮', youtubeId: '92Eyg6ntieA' },
  { cue: 'sweet', label: '따뜻한 순간', youtubeId: 'nxdxWhte19c' },
  { cue: 'crisis', label: '위기', youtubeId: '9ccVyzsnWnE' },
  { cue: 'speed', label: '추격', youtubeId: 'ZzUKzKn84YQ' },
  { cue: 'memorial', label: '추모', youtubeId: 'vGHRu_aYr3g' },
  { cue: 'formation', label: '편성', youtubeId: 'hml1Bx6taKg' },
  { cue: 'frontline', label: '전선', youtubeId: 'Y3VwQo4Jc-M' },
  { cue: 'meeting', label: '회의', youtubeId: 'FBlx1B4zST8' },
  { cue: 'emotional', label: '감정', youtubeId: '91xHNwR9qq8' },
  { cue: 'danger', label: '위험', youtubeId: '_SvXbBjONA4' },
  { cue: 'stage', label: '작전', youtubeId: '8j0yhMnmzNA' },
  { cue: 'boss', label: '보스전', youtubeId: 'LdSyFhu6zc4' },
  { cue: 'cinetense', label: '영화적 긴장', youtubeId: 't-rBJeHhEhk' },
  { cue: 'scheme', label: '계략', youtubeId: '4eIgpM5au7U' },
  { cue: 'bosscommon', label: '강적', youtubeId: 'ofSoem3dh6Y' },
  { cue: 'battle', label: '전투', youtubeId: 'dcg2J9mYzqg' },
  { cue: 'wedding', label: '서약', youtubeId: 'ITZVEs19bpw' },
  { cue: 'deepdive', label: '심층 작전', youtubeId: 'TlGZfIciHK0' },
  { cue: 'shop', label: '상점', youtubeId: 'CiBq0UzUjmE' },
  { cue: 'gravity', label: '무거운 순간', youtubeId: 'Y6VcvtsvRSM' },
  { cue: 'nightdrive', label: '밤길', youtubeId: 'JzaNRU6SBJw' }
];

const trackByCue = new Map(GFL_BGM_TRACKS.map(track => [track.cue, track]));
// 모델이 장면 의미로 쓰는 자연어 별칭. 카드의 검증된 30곡 밖의 임의 영상은 열지 않고,
// 가장 가까운 원본 제작자 곡으로만 연결한다.
const cueAliases:Readonly<Record<string,string>>={dawn:'day',morning:'day'};

export function normalizeGflBgmCue(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase().replace(/^bgm_/, ''),cue=cueAliases[raw]??raw;
  if (cue === 'bgmoff') return 'bgmoff';
  return trackByCue.has(cue) ? cue : null;
}

export function gflBgmTrack(cue: string | null | undefined): GflBgmTrack | null {
  const normalized = normalizeGflBgmCue(cue);
  return normalized && normalized !== 'bgmoff' ? trackByCue.get(normalized) ?? null : null;
}

export function extractGflBgmCue(content: string): string | null {
  // 옛 플러그인과 같은 우선순위: BG_ 메타데이터 첫 줄의 마지막 값, 그 뒤 독립 태그.
  const metadata = content.split(/\r?\n/).find(line => /^\s*BG_/i.test(line));
  if (metadata) {
    const fields = metadata.split('|').map(field => field.trim()).filter(Boolean);
    for (let index = fields.length - 1; index >= 0; index -= 1) {
      const normalized = normalizeGflBgmCue(fields[index]);
      if (normalized) return normalized;
    }
  }
  for (const match of content.matchAll(/\|\s*BGM_([^|\r\n]+)\s*\|/gi)) {
    const normalized = normalizeGflBgmCue(match[1]);
    if (normalized) return normalized;
  }
  return null;
}

export function latestGflBgmCue(messages: readonly { role?: string; content?: string }[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant' || typeof message.content !== 'string') continue;
    const cue = extractGflBgmCue(message.content);
    if (cue) return cue;
  }
  return null;
}

export function stripGflBgmMarkers(content: string): string {
  return content
    .replace(/^\s*BG_[^\r\n]*\|\s*BGM_[^|\r\n]+\|\s*\r?\n?/gim, '')
    .replace(/\|\s*BGM_[^|\r\n]+\s*\|/gi, '')
    .replace(/^\s*(?:==@|\/{3})\s*$/gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function gflYoutubeEmbedUrl(track: GflBgmTrack, autoplay: boolean, origin = ''): string {
  const query = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    controls: '0',
    disablekb: '1',
    enablejsapi: '1',
    loop: '1',
    modestbranding: '1',
    playsinline: '1',
    playlist: track.youtubeId,
    rel: '0'
  });
  if (origin) query.set('origin', origin);
  return `https://www.youtube-nocookie.com/embed/${track.youtubeId}?${query}`;
}
