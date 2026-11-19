// Fixed scenes for honest screenshots and export checks, driven by the query:
//   ?shot=cover&photo=both&caption=SUNSET%20HEIST&layout=grid&grade=sunset&size=1920x1080
//     shows the cover alone, drawn by the app at the exact export size.
//   ?shot=editor&photo=boulevard&caption=BOULEVARD%20QUEEN
//     shows the editor with a sample photo loaded and a panel selected.
//   ?shot=exporttest
//     exports all three sizes and writes the byte counts into #exportTestOutput.
// window.__shotReady is set once the scene has painted.
import { defaultPanels, SIZES, LAYOUTS, GRADES } from './cover.js';

function pickParam(query, name, valid, fallback) {
  const value = query.get(name);
  return value && Object.prototype.hasOwnProperty.call(valid, value) ? value : fallback;
}

async function waitForFonts() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await document.fonts.load('100px "Anton"');
    await document.fonts.ready;
  } catch {
    // The cover still renders with the fallback face.
  }
}

function markReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}

async function loadScenePhotos(api, photoParam) {
  const names = photoParam === 'both' ? ['boulevard', 'pier']
    : [photoParam || 'pier'];
  api.state.photos.length = 0;
  api.photoMeta.length = 0;
  for (const name of names) {
    const img = await api.loadSample(name);
    api.state.photos.push(img);
    api.photoMeta.push({ name: `${name}.jpg`, url: `samples/${name}.jpg` });
  }
}

function applySceneState(api, query) {
  const state = api.state;
  state.layout = pickParam(query, 'layout', LAYOUTS, 'grid');
  state.grade = pickParam(query, 'grade', GRADES, 'sunset');
  state.size = pickParam(query, 'size', SIZES, '1920x1080');
  const caption = query.get('caption');
  const subtitle = query.get('subtitle');
  if (caption !== null) state.caption = caption;
  if (subtitle !== null) state.subtitle = subtitle;
  state.panels = defaultPanels(state.layout, state.photos.length);
}

export async function runShot(shot, query, api) {
  const canvas = document.getElementById('preview');

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    await loadScenePhotos(api, query.get('photo') || 'both');
    applySceneState(api, query);
    api.state.selectedPanel = -1;
    const [W, H] = SIZES[api.state.size];
    canvas.width = W;
    canvas.height = H;
    await waitForFonts();
    api.redraw();
    markReady();
    return;
  }

  if (shot === 'editor') {
    await loadScenePhotos(api, query.get('photo') || 'both');
    applySceneState(api, query);
    api.state.selectedPanel = 0;
    api.sizePreviewCanvas();
    api.rebuildTray();
    const captionInput = document.getElementById('captionInput');
    const subtitleInput = document.getElementById('subtitleInput');
    if (captionInput) captionInput.value = api.state.caption;
    if (subtitleInput) subtitleInput.value = api.state.subtitle;
    // Keep the choice buttons honest about the scene's layout, grade, and size.
    for (const [groupId, key, value] of [
      ['layoutBtns', 'layout', api.state.layout],
      ['gradeBtns', 'grade', api.state.grade],
      ['sizeBtns', 'size', api.state.size],
    ]) {
      document.querySelectorAll(`#${groupId} .btn-choice`).forEach((b) => {
        b.classList.toggle('is-active', b.dataset[key] === value);
      });
    }
    await waitForFonts();
    api.redraw();
    markReady();
    return;
  }

  if (shot === 'exporttest') {
    await api.addSamplePhotos();
    await waitForFonts();
    const out = document.getElementById('exportTestOutput');
    const lines = [];
    for (const size of Object.keys(SIZES)) {
      api.state.size = size;
      const { blob, width, height } = await api.exportCoverPng();
      lines.push(`OK ${size} ${width}x${height} ${blob.size} bytes`);
    }
    out.hidden = false;
    out.textContent = lines.join('\n');
    window.__shotReady = true;
    return;
  }

  markReady();
}
