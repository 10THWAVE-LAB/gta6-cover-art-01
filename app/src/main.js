// Vice Cover Maker — the editor: photos in, cover out.
// Wires the page to the render engine (cover.js): upload and tray, panel
// picking, drag-to-pan and scroll-to-zoom crops, layout / grade / size picks,
// caption editing, and PNG export at the exact post size.
import { renderCover, panelAtPoint, layoutPanelRects, defaultPanels, SIZES } from './cover.js';
import { runShot } from './shots.js';

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

export function loadSample(name) {
  return loadImage(`samples/${name}.jpg`);
}

const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const tray = document.getElementById('tray');
const panelLabel = document.getElementById('panelLabel');
const zoomSlider = document.getElementById('zoomSlider');
const dropHint = document.getElementById('dropHint');

const state = {
  layout: 'grid',
  grade: 'sunset',
  size: '1920x1080',
  caption: 'SUNSET HEIST',
  subtitle: 'TWO CITIES · ONE NIGHT',
  photos: [],
  panels: defaultPanels('grid', 0),
  selectedPanel: 0,
};

const photoMeta = []; // { name, url } alongside state.photos, same index
let pickedPhoto = -1; // tray photo waiting to be placed in a panel

// Preview canvas sized to the export aspect, capped for the screen.
function sizePreviewCanvas() {
  const [W, H] = SIZES[state.size];
  const scale = Math.min(960 / W, 860 / H);
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
}

function redraw() {
  renderCover(ctx, canvas.width, canvas.height, state, { selectedPanel: state.selectedPanel });
  updatePanelBar();
  // The drop hint only earns its space while no photo is loaded yet.
  if (dropHint) dropHint.style.display = state.photos.length > 0 ? 'none' : 'block';
}

function updatePanelBar() {
  const panel = state.panels[state.selectedPanel];
  if (!panel) {
    panelLabel.textContent = 'No panel selected';
    return;
  }
  const name = panel.photo >= 0 ? photoMeta[panel.photo].name : 'empty';
  panelLabel.textContent = `Panel ${state.selectedPanel + 1} — ${name}`;
  zoomSlider.value = Math.round(panel.zoom * 100);
}

function rebuildTray() {
  tray.innerHTML = '';
  state.photos.forEach((img, i) => {
    const thumb = document.createElement('img');
    thumb.src = photoMeta[i].url;
    thumb.alt = photoMeta[i].name;
    thumb.title = photoMeta[i].name;
    if (i === pickedPhoto) thumb.classList.add('is-picked');
    thumb.addEventListener('click', () => {
      pickedPhoto = pickedPhoto === i ? -1 : i;
      rebuildTray();
    });
    tray.appendChild(thumb);
  });
}

function assignPhotosToEmptyPanels() {
  if (state.photos.length === 0) return;
  state.panels.forEach((panel, i) => {
    if (panel.photo < 0) panel.photo = i % state.photos.length;
  });
}

async function addPhotoFile(file) {
  const img = await loadImage(URL.createObjectURL(file));
  state.photos.push(img);
  photoMeta.push({ name: file.name, url: img.src });
}

async function addPhotos(files) {
  const hadPhotos = state.photos.length > 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      await addPhotoFile(file);
    } catch {
      // Skip a file that is not a readable image; the rest still load.
    }
  }
  if (!hadPhotos && state.photos.length > 0) {
    state.panels = defaultPanels(state.layout, state.photos.length);
  } else {
    assignPhotosToEmptyPanels();
  }
  rebuildTray();
  redraw();
}

async function addSamplePhotos() {
  const wanted = ['boulevard', 'pier'];
  for (const name of wanted) {
    if (photoMeta.some((m) => m.name === `${name}.jpg`)) continue;
    try {
      const img = await loadSample(name);
      state.photos.push(img);
      photoMeta.push({ name: `${name}.jpg`, url: `samples/${name}.jpg` });
    } catch {
      // A missing sample never breaks the editor.
    }
  }
  if (state.photos.length > 0) {
    state.panels = defaultPanels(state.layout, state.photos.length);
  }
  rebuildTray();
  redraw();
}

// ---------- panel interaction on the preview canvas ----------

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

let drag = null; // { panel, lastX, lastY }

canvas.addEventListener('pointerdown', (event) => {
  const { x, y } = canvasPoint(event);
  const hit = panelAtPoint(state.layout, canvas.width, canvas.height, x, y);
  if (hit < 0) return;
  if (pickedPhoto >= 0) {
    state.panels[hit].photo = pickedPhoto;
    state.selectedPanel = hit;
    redraw();
    return;
  }
  state.selectedPanel = hit;
  drag = { panel: hit, lastX: x, lastY: y };
  canvas.setPointerCapture(event.pointerId);
  redraw();
});

canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const { x, y } = canvasPoint(event);
  const rects = layoutPanelRects(state.layout, canvas.width, canvas.height);
  const rect = rects[drag.panel];
  const panel = state.panels[drag.panel];
  panel.dx += (x - drag.lastX) / rect.w;
  panel.dy += (y - drag.lastY) / rect.h;
  drag.lastX = x;
  drag.lastY = y;
  redraw();
});

canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const panel = state.panels[state.selectedPanel];
  if (!panel) return;
  panel.zoom = Math.min(3, Math.max(1, panel.zoom * Math.exp(-event.deltaY * 0.0012)));
  redraw();
}, { passive: false });

// ---------- controls ----------

document.getElementById('fileInput').addEventListener('change', (event) => {
  addPhotos([...event.target.files]);
  event.target.value = '';
});
document.getElementById('sampleBtn').addEventListener('click', addSamplePhotos);

window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => {
  event.preventDefault();
  if (event.dataTransfer.files.length > 0) addPhotos([...event.dataTransfer.files]);
});

function wireChoiceGroup(elementId, onPick) {
  const group = document.getElementById(elementId);
  group.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-choice');
    if (!button) return;
    group.querySelectorAll('.btn-choice').forEach((b) => b.classList.remove('is-active'));
    button.classList.add('is-active');
    onPick(button.dataset);
  });
}

wireChoiceGroup('layoutBtns', ({ layout }) => {
  const old = state.panels;
  state.layout = layout;
  state.panels = defaultPanels(layout, state.photos.length);
  state.panels.forEach((panel, i) => {
    if (old[i] && old[i].photo >= 0) panel.photo = old[i].photo;
  });
  state.selectedPanel = 0;
  redraw();
});

wireChoiceGroup('gradeBtns', ({ grade }) => {
  state.grade = grade;
  redraw();
});

wireChoiceGroup('sizeBtns', ({ size }) => {
  state.size = size;
  sizePreviewCanvas();
  redraw();
});

document.getElementById('captionInput').addEventListener('input', (event) => {
  state.caption = event.target.value;
  redraw();
});
document.getElementById('subtitleInput').addEventListener('input', (event) => {
  state.subtitle = event.target.value;
  redraw();
});

zoomSlider.addEventListener('input', () => {
  const panel = state.panels[state.selectedPanel];
  if (!panel) return;
  panel.zoom = zoomSlider.value / 100;
  redraw();
});

document.getElementById('fillAllBtn').addEventListener('click', () => {
  const panel = state.panels[state.selectedPanel];
  if (!panel || panel.photo < 0) return;
  state.panels.forEach((p) => { p.photo = panel.photo; });
  redraw();
});

document.getElementById('resetCropBtn').addEventListener('click', () => {
  const fresh = defaultPanels(state.layout, state.photos.length)[state.selectedPanel];
  const panel = state.panels[state.selectedPanel];
  if (!fresh || !panel) return;
  panel.zoom = fresh.zoom;
  panel.dx = fresh.dx;
  panel.dy = fresh.dy;
  redraw();
});

// ---------- export ----------

export async function exportCoverPng() {
  const [W, H] = SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  renderCover(off.getContext('2d'), W, H, state);
  const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/png'));
  return { blob, width: W, height: H, name: `vice-cover-${state.size}.png` };
}

async function downloadExport(button) {
  const original = button.textContent;
  button.textContent = 'Exporting…';
  try {
    const { blob, name } = await exportCoverPng();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    button.textContent = 'Saved!';
    setTimeout(() => { button.textContent = original; }, 1600);
  } catch {
    button.textContent = 'Export failed — try again';
    setTimeout(() => { button.textContent = original; }, 2000);
  }
}

document.getElementById('exportBtn').addEventListener('click', (e) => downloadExport(e.currentTarget));
document.getElementById('exportBtn2').addEventListener('click', (e) => downloadExport(e.currentTarget));

// ---------- boot ----------

sizePreviewCanvas();
redraw();
if (document.fonts && document.fonts.load) {
  document.fonts.load('100px "Anton"').then(redraw).catch(() => {});
  document.fonts.ready.then(redraw).catch(() => {});
}

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  runShot(shot, params, {
    state,
    photoMeta,
    redraw,
    rebuildTray,
    sizePreviewCanvas,
    loadSample,
    addSamplePhotos,
    exportCoverPng,
    setPickedPhoto: (i) => { pickedPhoto = i; },
  });
}
