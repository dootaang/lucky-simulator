function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0; const l = (max + min) / 2; const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// WCAG 상대 휘도·대비율.
function relativeLuminance(r, g, b) {
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(lumA, lumB) {
  const [hi, lo] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (hi + 0.05) / (lo + 0.05);
}

// 배경 토큰(--bg)을 읽어 대비 기준으로 쓴다. 파싱 실패 시 현 테마의 잉크빛 다크로 폴백.
function backgroundLuminance() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const match = /^#([0-9a-f]{6})$/i.exec(raw);
    if (match) {
      const n = parseInt(match[1], 16);
      return relativeLuminance((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
  } catch (_) { /* 아래 폴백 */ }
  return relativeLuminance(0x14, 0x11, 0x10); // #141110
}

// 배경 대비 4.5:1에 도달할 때까지 명도를 끌어올린다(색상·채도 유지).
function ensureContrast(h, s, l, bgLum) {
  let lum = relativeLuminance(...hslToRgb(h, s, l));
  while (contrastRatio(lum, bgLum) < 4.5 && l < 0.92) {
    l = Math.min(0.92, l + 0.03);
    lum = relativeLuminance(...hslToRgb(h, s, l));
  }
  return l;
}

export async function applyCardTheme(asset, objectUrlFor) {
  const root = document.documentElement.style;
  for (const token of ['--card-accent', '--card-accent-soft', '--card-accent-strong']) root.removeProperty(token);
  try {
    if (!asset) return null;
    const src = objectUrlFor(asset);
    if (!src) return null;
    const image = new Image();
    image.src = src;
    await image.decode();
    // 고유 크기 없는 리소스(일부 SVG 등)는 NaN 캔버스가 되므로 추출 포기.
    if (!image.naturalWidth || !image.naturalHeight) return null;
    const scale = Math.min(48 / image.naturalWidth, 48 / image.naturalHeight, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    // hue는 원형이므로 빈 안에서 sin/cos로 누적한다 — 0°/360° 경계에서 평균이 반대색으로 튀지 않도록.
    const bins = Array.from({ length: 12 }, () => ({ weight: 0, x: 0, y: 0, s: 0, l: 0 }));
    const data = context.getImageData(0, 0, width, height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (s < 0.25 || l < 0.15 || l > 0.85) continue;
      const weight = s * data[i + 3] / 255; const bin = bins[Math.floor(h / 30) % 12];
      const rad = h * Math.PI / 180;
      bin.weight += weight; bin.x += Math.cos(rad) * weight; bin.y += Math.sin(rad) * weight;
      bin.s += s * weight; bin.l += l * weight;
    }
    // 경계에 걸친 지배색이 이웃 빈으로 갈라지는 것을 보정: 이웃 빈 가중 포함 창(window)으로 승자 선정.
    let bestIndex = -1; let bestScore = 0;
    for (let i = 0; i < 12; i += 1) {
      const score = bins[i].weight + 0.5 * (bins[(i + 11) % 12].weight + bins[(i + 1) % 12].weight);
      if (score > bestScore) { bestScore = score; bestIndex = i; }
    }
    if (bestIndex < 0) return null;
    const window = [bins[(bestIndex + 11) % 12], bins[bestIndex], bins[(bestIndex + 1) % 12]];
    const agg = window.reduce((acc, bin) => ({
      weight: acc.weight + bin.weight, x: acc.x + bin.x, y: acc.y + bin.y, s: acc.s + bin.s, l: acc.l + bin.l,
    }), { weight: 0, x: 0, y: 0, s: 0, l: 0 });
    if (!agg.weight) return null;
    const h = (Math.atan2(agg.y, agg.x) * 180 / Math.PI + 360) % 360;
    const s = agg.s / agg.weight;
    const l = ensureContrast(h, s, Math.max(agg.l / agg.weight, 0.62), backgroundLuminance());
    const accent = `hsl(${h.toFixed(1)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
    const strong = `hsl(${h.toFixed(1)} ${Math.round(s * 100)}% ${Math.round(Math.min(92, l * 100 + 10))}%)`;
    root.setProperty('--card-accent', accent);
    root.setProperty('--card-accent-soft', `hsl(${h.toFixed(1)} ${Math.round(s * 100)}% ${Math.round(l * 100)}% / 0.18)`);
    root.setProperty('--card-accent-strong', strong);
    return { accent, strong };
  } catch (_) { return null; }
}
