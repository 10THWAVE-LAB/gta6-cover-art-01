// Vice Cover Maker — the cover render engine.
// Draws the multi-panel GTA-style poster onto any 2D canvas: panel photos with a
// colour grade, white poster gutters, a sunset title band with a retro sun, and
// bold outlined caption lettering. Pure Canvas 2D, no libraries.

export const FONT_FAMILY = '"Anton", "Arial Narrow", sans-serif';

// Panel rects as fractions of the cover [x, y, width, height]; the title band is
// [y, height] as fractions too. Solo has no band: the caption floats over a scrim.
export const LAYOUTS = {
  grid: {
    panels: [
      [0.025, 0.03, 0.58, 0.66],
      [0.625, 0.03, 0.35, 0.315],
      [0.625, 0.365, 0.35, 0.315],
    ],
    band: [0.72, 0.25],
  },
  quad: {
    panels: [
      [0.025, 0.03, 0.465, 0.315],
      [0.51, 0.03, 0.465, 0.315],
      [0.025, 0.365, 0.465, 0.315],
      [0.51, 0.365, 0.465, 0.315],
    ],
    band: [0.72, 0.25],
  },
  duo: {
    panels: [
      [0.025, 0.03, 0.62, 0.66],
      [0.665, 0.03, 0.31, 0.66],
    ],
    band: [0.72, 0.25],
  },
  solo: {
    panels: [[0, 0, 1, 1]],
    band: null,
  },
};

export const GRADES = {
  sunset: {
    filter: 'saturate(1.28) contrast(1.08) brightness(1.02)',
    overlays: [
      { stops: [[0, 'rgba(255,140,60,0.20)'], [1, 'rgba(255,45,120,0.22)']], composite: 'overlay' },
      { stops: [[0, 'rgba(0,180,200,0.12)'], [1, 'rgba(0,0,0,0)']], composite: 'soft-light' },
    ],
    vignette: 0.32,
    grain: 0.05,
    band: ['#2b0a4a', '#7b1049', '#ff7a3d'],
    sun: ['#ffe66d', '#ff9a3d', '#ff2d78'],
    accent: '#ffd166',
    shadow: '#ff2d78',
  },
  neon: {
    filter: 'saturate(1.7) contrast(1.18) brightness(1.03)',
    overlays: [
      { stops: [[0, 'rgba(255,45,120,0.26)'], [1, 'rgba(0,229,255,0.22)']], composite: 'overlay' },
      { stops: [[0, 'rgba(123,47,255,0.18)'], [1, 'rgba(0,0,0,0)']], composite: 'screen' },
    ],
    vignette: 0.4,
    grain: 0.06,
    band: ['#0d0221', '#3b0f6e', '#ff2d78'],
    sun: ['#7df9ff', '#ff2d78', '#b537f2'],
    accent: '#7df9ff',
    shadow: '#b537f2',
  },
  noir: {
    filter: 'grayscale(1) contrast(1.32) brightness(1.06)',
    overlays: [],
    vignette: 0.45,
    grain: 0.09,
    band: ['#0a0a0a', '#2a2a2a', '#5a5a5a'],
    sun: ['#f5f5f5', '#c9c9c9', '#8a8a8a'],
    accent: '#e8e8e8',
    shadow: '#000000',
  },
};

export const SIZES = {
  '1080x1080': [1080, 1080],
  '1080x1350': [1080, 1350],
  '1920x1080': [1920, 1080],
};

// Default per-panel crops: a little zoomed in, each panel showing a different
// slice of the photo so one photo fills the whole poster without repeating.
const DEFAULT_CROPS = [
  { zoom: 1.12, dx: -0.05, dy: 0.27 },
  { zoom: 1.18, dx: 0.06, dy: 0.2 },
  { zoom: 1.2, dx: -0.05, dy: -0.05 },
  { zoom: 1.15, dx: 0.05, dy: 0.1 },
];

export function defaultPanels(layoutName, photoCount) {
  const count = LAYOUTS[layoutName].panels.length;
  const panels = [];
  for (let i = 0; i < count; i++) {
    const crop = layoutName === 'solo'
      ? { zoom: 1.1, dx: 0, dy: 0 }
      : DEFAULT_CROPS[i % DEFAULT_CROPS.length];
    panels.push({ photo: photoCount > 0 ? i % photoCount : -1, ...crop });
  }
  return panels;
}

// Panel rects in pixels for a cover of W x H under the named layout.
export function layoutPanelRects(layoutName, W, H) {
  return LAYOUTS[layoutName].panels.map(([fx, fy, fw, fh]) => ({
    x: fx * W, y: fy * H, w: fw * W, h: fh * H,
  }));
}

// Which panel, if any, holds the point (x, y) in cover coordinates.
export function panelAtPoint(layoutName, W, H, x, y) {
  const rects = layoutPanelRects(layoutName, W, H);
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Film grain, generated once and tiled over the finished cover.
let grainCanvas = null;
function getGrainCanvas() {
  if (grainCanvas) return grainCanvas;
  grainCanvas = document.createElement('canvas');
  grainCanvas.width = 160;
  grainCanvas.height = 160;
  const g = grainCanvas.getContext('2d');
  const data = g.createImageData(160, 160);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 28;
  }
  g.putImageData(data, 0, 0);
  return grainCanvas;
}

function drawPhotoCoverFit(ctx, img, rect, crop) {
  const base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
  const scale = base * crop.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const maxDx = Math.max(0, (dw - rect.w) / 2) / rect.w;
  const maxDy = Math.max(0, (dh - rect.h) / 2) / rect.h;
  const ox = clamp(crop.dx, -maxDx, maxDx) * rect.w;
  const oy = clamp(crop.dy, -maxDy, maxDy) * rect.h;
  ctx.drawImage(img, rect.x + (rect.w - dw) / 2 + ox, rect.y + (rect.h - dh) / 2 + oy, dw, dh);
}

function drawPanelPlaceholder(ctx, rect, W) {
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  grad.addColorStop(0, '#2b0a4a');
  grad.addColorStop(1, '#5c1049');
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `${Math.max(14, W * 0.016)}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ADD A PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
}

// One photo panel: the graded photo, a vignette, and the white poster border.
function drawGradedPanel(ctx, img, rect, crop, grade, W) {
  const radius = W * 0.008;
  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.clip();
  if (img) {
    ctx.filter = grade.filter;
    drawPhotoCoverFit(ctx, img, rect, crop);
    ctx.filter = 'none';
  } else {
    drawPanelPlaceholder(ctx, rect, W);
  }
  for (const overlay of grade.overlays) {
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    for (const [stop, color] of overlay.stops) grad.addColorStop(stop, color);
    ctx.globalCompositeOperation = overlay.composite;
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalCompositeOperation = 'source-over';
  }
  const vig = ctx.createRadialGradient(
    rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) * 0.35,
    rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(rect.w, rect.h) * 0.75,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(0,0,0,${grade.vignette})`);
  ctx.fillStyle = vig;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = Math.max(2, W * 0.004);
  ctx.stroke();
  ctx.restore();
}

// The retro sun: a gradient disc with horizontal slits widening toward the bottom.
function drawRetroSun(ctx, cx, cy, radius, colors) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  const grad = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.55, colors[1]);
  grad.addColorStop(1, colors[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.fillStyle = 'rgba(20,4,36,0.9)';
  const slits = 4;
  for (let i = 0; i < slits; i++) {
    const t = i / slits;
    const y = cy + radius * 0.1 + t * radius * 0.85;
    const h = radius * (0.045 + t * 0.075);
    ctx.fillRect(cx - radius, y, radius * 2, h);
  }
  ctx.restore();
}

function drawBirds(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.09);
  ctx.lineCap = 'round';
  const spots = [[0, 0, 1], [size * 1.9, -size * 0.55, 0.7], [size * 3.4, size * 0.15, 0.85]];
  for (const [bx, by, s] of spots) {
    ctx.beginPath();
    ctx.moveTo(x + bx - size * 0.5 * s, y + by);
    ctx.quadraticCurveTo(x + bx, y + by - size * 0.35 * s, x + bx, y + by);
    ctx.quadraticCurveTo(x + bx, y + by - size * 0.35 * s, x + bx + size * 0.5 * s, y + by);
    ctx.stroke();
  }
  ctx.restore();
}

// Largest font size (Anton) at which `text` fits inside maxWidth.
function fitFontSize(ctx, text, maxWidth, startSize, letterSpacing) {
  let size = startSize;
  ctx.font = `${size}px ${FONT_FAMILY}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing}px`;
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size *= 0.94;
    ctx.font = `${size}px ${FONT_FAMILY}`;
  }
  return size;
}

// Bold poster lettering: magenta offset shadow, dark outline, white face.
function drawCaptionBlock(ctx, x, y, maxWidth, caption, subtitle, grade, baseSize) {
  const title = caption.trim().toUpperCase();
  const sub = subtitle.trim().toUpperCase();
  if (!title && !sub) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.022);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  let cursorY = 0;
  if (title) {
    const size = fitFontSize(ctx, title, maxWidth, baseSize, baseSize * 0.02);
    ctx.font = `${size}px ${FONT_FAMILY}`;
    ctx.lineJoin = 'round';
    ctx.fillStyle = grade.shadow;
    ctx.fillText(title, size * 0.045, cursorY + size + size * 0.06);
    ctx.lineWidth = size * 0.09;
    ctx.strokeStyle = '#160428';
    ctx.strokeText(title, 0, cursorY + size);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, 0, cursorY + size);
    cursorY += size * 1.18;
  }
  if (sub) {
    const subSize = baseSize * 0.22;
    ctx.font = `${subSize}px ${FONT_FAMILY}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${subSize * 0.32}px`;
    ctx.fillStyle = grade.accent;
    ctx.fillText(sub, baseSize * 0.03, cursorY + subSize);
  }
  ctx.restore();
}

// The full poster. `state` holds layout, grade, caption, subtitle, photos and
// per-panel crops. `opts.selectedPanel` draws the editor's selection outline.
export function renderCover(ctx, W, H, state, opts = {}) {
  const grade = GRADES[state.grade] || GRADES.sunset;
  const layout = LAYOUTS[state.layout] || LAYOUTS.grid;

  ctx.save();
  ctx.fillStyle = grade.band[0];
  ctx.fillRect(0, 0, W, H);

  const rects = layoutPanelRects(state.layout, W, H);
  rects.forEach((rect, i) => {
    const panel = state.panels[i] || { photo: -1, zoom: 1.15, dx: 0, dy: 0 };
    const img = panel.photo >= 0 ? state.photos[panel.photo] : null;
    drawGradedPanel(ctx, img, rect, panel, grade, W);
  });

  if (layout.band) {
    const bandY = layout.band[0] * H;
    const bandH = layout.band[1] * H;
    const bandGrad = ctx.createLinearGradient(0, bandY, W, bandY);
    bandGrad.addColorStop(0, grade.band[0]);
    bandGrad.addColorStop(0.55, grade.band[1]);
    bandGrad.addColorStop(1, grade.band[2]);
    ctx.fillStyle = bandGrad;
    ctx.fillRect(0, bandY, W, H - bandY);
    ctx.fillStyle = grade.accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, bandY, W, Math.max(2, H * 0.0025));
    ctx.globalAlpha = 1;

    const sunR = bandH * 0.62;
    drawRetroSun(ctx, W * 0.87, bandY + bandH * 0.52, sunR, grade.sun);
    drawBirds(ctx, W * 0.68, bandY + bandH * 0.3, bandH * 0.16, 'rgba(255,255,255,0.75)');

    const baseSize = bandH * 0.44;
    const blockH = baseSize * 1.18 + baseSize * 0.22 * 1.4;
    const textY = bandY + (bandH - blockH) / 2;
    drawCaptionBlock(ctx, W * 0.035, textY, W * 0.62, state.caption, state.subtitle, grade, baseSize);
  } else {
    // Solo: a scrim over the photo's foot, caption on top of it.
    const scrim = ctx.createLinearGradient(0, H * 0.62, 0, H);
    scrim.addColorStop(0, 'rgba(8,3,18,0)');
    scrim.addColorStop(1, 'rgba(8,3,18,0.88)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.62, W, H * 0.38);

    const baseSize = H * 0.105;
    const blockH = baseSize * 1.18 + baseSize * 0.22 * 1.4;
    drawCaptionBlock(ctx, W * 0.04, H - blockH - H * 0.035, W * 0.92, state.caption, state.subtitle, grade, baseSize);

    ctx.font = `${Math.max(12, H * 0.016)}px ${FONT_FAMILY}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${H * 0.006}px`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText('EST. 2026 · SUNSET COUNTY', W * 0.04, H * 0.05);
  }

  // Film grain over the whole poster.
  const grain = ctx.createPattern(getGrainCanvas(), 'repeat');
  if (grain) {
    ctx.save();
    ctx.globalAlpha = grade.grain * 4;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (opts.selectedPanel != null && rects[opts.selectedPanel]) {
    const r = rects[opts.selectedPanel];
    ctx.save();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = Math.max(3, W * 0.005);
    ctx.setLineDash([W * 0.012, W * 0.008]);
    roundedRectPath(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, W * 0.008);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
