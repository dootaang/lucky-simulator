export function renderAssetsView(container, ctx) {
  let observer = null;
  const header = document.createElement('div');
  header.className = 'view-header with-controls';
  const title = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.textContent = '에셋';
  const meta = document.createElement('p');
  meta.textContent = `${ctx.parsed.assets.length}개 · 보이는 이미지만 디코드`;
  title.append(h2, meta);
  const search = document.createElement('input');
  search.className = 'search-input';
  search.type = 'search';
  search.placeholder = '에셋 이름 검색';
  header.append(title, search);

  const grid = document.createElement('div');
  grid.className = 'asset-grid';
  container.append(header, grid);

  const setupObserver = () => {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((items) => {
      for (const item of items) {
        if (!item.isIntersecting) continue;
        loadThumb(item.target, ctx);
        observer.unobserve(item.target);
      }
    }, { rootMargin: '240px' });
  };

  const render = () => {
    ctx.revokeViewUrls();
    setupObserver();
    grid.replaceChildren();
    const q = search.value.trim().toLowerCase();
    const assets = ctx.parsed.assets.filter((asset) => !q || String(asset.name || '').toLowerCase().includes(q));
    for (const asset of assets) grid.append(assetCard(asset, ctx, observer));
  };

  search.addEventListener('input', render);
  render();

  return () => {
    if (observer) observer.disconnect();
  };
}

function assetCard(asset, ctx, observer) {
  const card = document.createElement('article');
  card.className = 'asset-card';
  const preview = document.createElement('div');
  preview.className = 'asset-preview';
  if (isImageAsset(asset)) {
    const img = document.createElement('img');
    img.className = 'lazy-img';
    img.alt = asset.name || 'asset';
    img._asset = asset;
    preview.append(img);
    observer.observe(img);
  } else {
    const icon = document.createElement('div');
    icon.className = 'file-icon';
    icon.textContent = String(asset.ext || 'file').slice(0, 5).toUpperCase();
    preview.append(icon);
  }

  const name = document.createElement('div');
  name.className = 'asset-name';
  name.textContent = asset.name || '(이름 없음)';
  const meta = document.createElement('div');
  meta.className = 'asset-meta';
  meta.textContent = `${asset.ext || '-'} · ${ctx.formatBytes(asset.size)} · ${asset.found ? 'found' : 'missing'}${asset.bytes ? ' · decoded' : ' · lazy'}`;
  card.append(preview, name, meta);
  return card;
}

function loadThumb(img, ctx) {
  const url = ctx.objectUrlFor(img._asset);
  if (!url) {
    img.classList.add('broken');
    return;
  }
  img.src = url;
}

function isImageAsset(asset) {
  const mime = String(asset.mime || '').toLowerCase();
  const ext = String(asset.ext || '').toLowerCase();
  return mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg'].includes(ext);
}
