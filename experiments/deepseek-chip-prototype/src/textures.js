import * as THREE from 'three';

const FONT_SANS = '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
const FONT_DISPLAY = '"Bahnschrift", "DIN Alternate", "Segoe UI", sans-serif';
const FONT_MONO = '"Cascadia Mono", "SFMono-Regular", Consolas, monospace';

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

function makeTexture(canvas, { colorSpace = THREE.SRGBColorSpace, anisotropy = 8 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.anisotropy = anisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function drawTrackedText(ctx, text, x, y, tracking, align = 'left') {
  const chars = Array.from(text);
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, chars.length - 1);
  let cursor = x;
  if (align === 'center') cursor -= total / 2;
  if (align === 'right') cursor -= total;

  ctx.textAlign = 'left';
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, y);
    cursor += widths[index] + tracking;
  });

  return total;
}

function hexPath(ctx, cx, cy, radius) {
  for (let i = 0; i < 6; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI / 3) * i;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * The identity plate on the central die. Drawn at 2x for crisp text at close range.
 */
export function createBrandTexture() {
  const { canvas, ctx } = makeCanvas(1024, 1024);
  ctx.clearRect(0, 0, 1024, 1024);

  // Fine registration marks keep the plate feeling manufactured rather than like a decal.
  ctx.strokeStyle = 'rgba(178, 199, 214, 0.18)';
  ctx.lineWidth = 1.2;
  const corners = [
    [88, 88, 1, 1],
    [936, 88, -1, 1],
    [88, 936, 1, -1],
    [936, 936, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + 13 * sy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + 13 * sx, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(145, 168, 185, 0.54)';
  ctx.font = `500 16px ${FONT_MONO}`;
  drawTrackedText(ctx, 'SL / COMPUTE ENGINE', 512, 150, 5.2, 'center');

  ctx.fillStyle = 'rgba(244, 248, 251, 0.98)';
  ctx.font = `300 218px ${FONT_SANS}`;
  drawTrackedText(ctx, '芯生', 512, 444, 28, 'center');

  const dividerGradient = ctx.createLinearGradient(390, 0, 634, 0);
  dividerGradient.addColorStop(0, 'rgba(183, 203, 218, 0)');
  dividerGradient.addColorStop(0.5, 'rgba(183, 203, 218, 0.55)');
  dividerGradient.addColorStop(1, 'rgba(183, 203, 218, 0)');
  ctx.strokeStyle = dividerGradient;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(390, 500);
  ctx.lineTo(634, 500);
  ctx.stroke();

  ctx.fillStyle = 'rgba(231, 239, 245, 0.94)';
  ctx.font = `300 63px ${FONT_DISPLAY}`;
  drawTrackedText(ctx, 'Silicon Life', 512, 592, 7.6, 'center');

  ctx.fillStyle = 'rgba(179, 197, 210, 0.9)';
  ctx.font = `400 31px ${FONT_DISPLAY}`;
  drawTrackedText(ctx, 'RISC-V', 512, 664, 14.5, 'center');

  // The four-dot brand unit.
  ctx.save();
  ctx.translate(512, 755);
  const dotSize = 9;
  const gap = 8;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const isAccent = row === 1 && col === 1;
      ctx.fillStyle = isAccent ? 'rgba(90, 185, 255, 0.92)' : 'rgba(185, 203, 217, 0.72)';
      ctx.fillRect(
        (col - 0.5) * (dotSize + gap) - dotSize / 2,
        (row - 0.5) * (dotSize + gap) - dotSize / 2,
        dotSize,
        dotSize,
      );
    }
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(106, 126, 143, 0.5)';
  ctx.font = `400 14px ${FONT_MONO}`;
  drawTrackedText(ctx, 'SINGLE CYCLE ARCHITECTURE', 512, 844, 4.1, 'center');

  ctx.fillStyle = 'rgba(92, 114, 130, 0.42)';
  ctx.font = `400 12px ${FONT_MONO}`;
  drawTrackedText(ctx, 'SL-RV32I  ·  REV.A', 512, 898, 2.4, 'center');

  return makeTexture(canvas, { anisotropy: 12 });
}

/**
 * A small silkscreen label for each internal module's top face.
 */
export function createModuleLabelTexture(label, index) {
  const { canvas, ctx } = makeCanvas(640, 192);
  ctx.clearRect(0, 0, 640, 192);

  // Inset silkscreen plate: enough contrast to stay legible under cinematic light.
  const panelGradient = ctx.createLinearGradient(0, 0, 0, 192);
  panelGradient.addColorStop(0, 'rgba(4, 8, 12, 0.7)');
  panelGradient.addColorStop(1, 'rgba(2, 5, 8, 0.35)');
  ctx.fillStyle = panelGradient;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(8, 8, 624, 176, 15);
  } else {
    ctx.rect(8, 8, 624, 176);
  }
  ctx.fill();
  ctx.strokeStyle = 'rgba(154, 191, 214, 0.16)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = 'rgba(90, 185, 255, 0.9)';
  ctx.fillRect(28, 34, 22, 2);

  let fontSize = 64;
  ctx.font = `500 ${fontSize}px ${FONT_DISPLAY}`;
  const maxWidth = 468;
  while (ctx.measureText(label).width > maxWidth && fontSize > 38) {
    fontSize -= 2;
    ctx.font = `500 ${fontSize}px ${FONT_DISPLAY}`;
  }

  ctx.fillStyle = 'rgba(236, 246, 252, 0.98)';
  drawTrackedText(ctx, label, 28, 124, 1.6);

  ctx.fillStyle = 'rgba(137, 171, 193, 0.8)';
  ctx.font = `400 20px ${FONT_MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText(`M${String(index + 1).padStart(2, '0')}`, 606, 51);

  ctx.strokeStyle = 'rgba(148, 174, 191, 0.16)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(28, 151);
  ctx.lineTo(606, 151);
  ctx.stroke();

  return makeTexture(canvas, { anisotropy: 8 });
}

/**
 * Circuit silkscreen laid over the exposed internal deck.
 */
export function createDeckCircuitTexture() {
  const { canvas, ctx } = makeCanvas(1200, 840);
  const random = mulberry32(0x5eedc0de);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(98, 164, 205, 0.16)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  ctx.strokeStyle = 'rgba(127, 172, 199, 0.1)';
  ctx.setLineDash([4, 10]);
  ctx.strokeRect(42, 42, canvas.width - 84, canvas.height - 84);
  ctx.setLineDash([]);

  const traces = [
    [74, 690, 214, 690, 214, 704, 430, 704],
    [74, 732, 250, 732, 250, 772, 365, 772],
    [936, 96, 936, 210, 866, 210, 866, 270],
    [1110, 146, 1004, 146, 1004, 194, 926, 194],
    [156, 124, 156, 258, 232, 258, 232, 320],
    [1004, 662, 866, 662, 866, 618, 792, 618],
    [72, 396, 180, 396, 180, 352, 320, 352],
    [960, 706, 1080, 706, 1080, 614, 1112, 614],
  ];

  for (const points of traces) {
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      if (i === 0) ctx.moveTo(points[i], points[i + 1]);
      else ctx.lineTo(points[i], points[i + 1]);
    }
    ctx.strokeStyle = 'rgba(93, 163, 208, 0.22)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Fine random routing, kept sparse so the deck still reads as a surface.
  for (let i = 0; i < 26; i += 1) {
    const startX = 70 + random() * 1060;
    const startY = 70 + random() * 700;
    const first = random() > 0.5 ? 0 : startY;
    const second = random() > 0.5 ? 0 : startX;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    if (first === 0) {
      const midX = startX + (random() > 0.5 ? 1 : -1) * (24 + random() * 82);
      ctx.lineTo(midX, startY);
      ctx.lineTo(midX, startY + (random() > 0.5 ? 1 : -1) * (20 + random() * 56));
    } else {
      const midY = startY + (random() > 0.5 ? 1 : -1) * (20 + random() * 70);
      ctx.lineTo(startX, midY);
      ctx.lineTo(startX + (random() > 0.5 ? 1 : -1) * (26 + random() * 70), midY);
    }
    ctx.strokeStyle = `rgba(102, 169, 211, ${0.08 + random() * 0.08})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let i = 0; i < 28; i += 1) {
    const x = 56 + random() * 1088;
    const y = 56 + random() * 728;
    const size = random() > 0.84 ? 4.2 : 2.2;
    ctx.fillStyle = `rgba(158, 197, 221, ${0.08 + random() * 0.17})`;
    ctx.fillRect(x, y, size, size);
  }

  ctx.fillStyle = 'rgba(133, 166, 188, 0.32)';
  ctx.font = `400 15px ${FONT_MONO}`;
  drawTrackedText(ctx, 'SILICON LIFE  /  RV32I', 56, 800, 2.2);
  ctx.textAlign = 'right';
  ctx.fillText('DIE 01', 1144, 800);

  ctx.strokeStyle = 'rgba(136, 180, 208, 0.24)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 814);
  ctx.lineTo(200, 814);
  ctx.moveTo(1144, 814);
  ctx.lineTo(1040, 814);
  ctx.stroke();

  return makeTexture(canvas, { anisotropy: 8 });
}

/**
 * Large, low-contrast circuit geometry around the floating chip.
 */
export function createGroundCircuitTexture() {
  const size = 2048;
  const { canvas, ctx } = makeCanvas(size, size);
  const random = mulberry32(0x51c0ffee);
  const center = size / 2;
  ctx.clearRect(0, 0, size, size);

  // Hexagonal machinery, broken into segments rather than complete UI rings.
  const rings = [
    { radius: 490, width: 2, alpha: 0.23 },
    { radius: 720, width: 1.3, alpha: 0.15 },
    { radius: 960, width: 1.1, alpha: 0.1 },
  ];

  for (const ring of rings) {
    for (let side = 0; side < 6; side += 1) {
      if (random() < 0.22) continue;
      const startAngle = -Math.PI / 2 + (Math.PI / 3) * side + 0.04 + random() * 0.1;
      const endAngle = -Math.PI / 2 + (Math.PI / 3) * (side + 1) - 0.04 - random() * 0.12;
      ctx.beginPath();
      ctx.arc(center, center, ring.radius, startAngle, endAngle);
      ctx.strokeStyle = `rgba(53, 119, 170, ${ring.alpha * (0.7 + random() * 0.5)})`;
      ctx.lineWidth = ring.width;
      ctx.stroke();

      const nodeAngle = -Math.PI / 2 + (Math.PI / 3) * (side + 1);
      const nx = center + Math.cos(nodeAngle) * ring.radius;
      const ny = center + Math.sin(nodeAngle) * ring.radius;
      ctx.fillStyle = `rgba(63, 141, 194, ${ring.alpha * 0.85})`;
      ctx.fillRect(nx - 2.2, ny - 2.2, 4.4, 4.4);
    }
  }

  // Angled service lines and their faint blue glow channels.
  const routes = [
    [[250, 1690], [470, 1690], [780, 1380], [780, 1050]],
    [[1790, 380], [1580, 380], [1350, 610], [1350, 780]],
    [[215, 420], [410, 420], [560, 270], [830, 270]],
    [[1820, 1670], [1630, 1670], [1420, 1460], [1220, 1460]],
    [[1024, 1910], [1024, 1780], [1260, 1540], [1260, 1350]],
    [[1024, 128], [1024, 266], [820, 470], [820, 610]],
  ];

  for (const points of routes) {
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      if (i === 0) ctx.moveTo(points[i], points[i + 1]);
      else ctx.lineTo(points[i], points[i + 1]);
    }
    ctx.strokeStyle = 'rgba(53, 130, 186, 0.13)';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(93, 176, 232, 0.3)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const endpoint = points[points.length - 1];
    ctx.fillStyle = 'rgba(99, 186, 243, 0.42)';
    ctx.fillRect(endpoint[0] - 2.5, endpoint[1] - 2.5, 5, 5);
  }

  // A few short, brighter accents read as reflected edge light.
  const accents = [
    [280, 1510, 410, 1510],
    [1580, 470, 1706, 470],
    [690, 1830, 770, 1830],
  ];
  for (const [x1, y1, x2, y2] of accents) {
    const glow = ctx.createLinearGradient(x1, y1, x2, y2);
    glow.addColorStop(0, 'rgba(77, 172, 239, 0)');
    glow.addColorStop(0.5, 'rgba(116, 202, 255, 0.72)');
    glow.addColorStop(1, 'rgba(77, 172, 239, 0)');
    ctx.strokeStyle = glow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Dissolve the texture edge into the floor.
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createRadialGradient(center, center, size * 0.22, center, center, size * 0.51);
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(0.72, 'rgba(0, 0, 0, 0.68)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  return makeTexture(canvas, { anisotropy: 8 });
}

export function createGlowTexture() {
  const { canvas, ctx } = makeCanvas(512, 512);
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.82)');
  gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.43)');
  gradient.addColorStop(0.46, 'rgba(255, 255, 255, 0.13)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  return makeTexture(canvas, { colorSpace: THREE.NoColorSpace });
}

export function createStripGlowTexture() {
  const { canvas, ctx } = makeCanvas(512, 64);
  const gradient = ctx.createLinearGradient(0, 0, 512, 0);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.13)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.78)');
  gradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.13)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 64);

  ctx.globalCompositeOperation = 'destination-in';
  const vertical = ctx.createLinearGradient(0, 0, 0, 64);
  vertical.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vertical.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
  vertical.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, 512, 64);

  return makeTexture(canvas, { colorSpace: THREE.NoColorSpace });
}

/**
 * A tiny silkscreen strip used on the metal frame.
 */
export function createSerialTexture() {
  const { canvas, ctx } = makeCanvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(201, 218, 230, 0.32)';
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, 496, 112);

  ctx.fillStyle = 'rgba(206, 220, 230, 0.48)';
  ctx.font = `400 25px ${FONT_MONO}`;
  drawTrackedText(ctx, 'SL-RV32I', 32, 63, 2.7);

  ctx.fillStyle = 'rgba(154, 178, 195, 0.36)';
  ctx.font = `400 16px ${FONT_MONO}`;
  drawTrackedText(ctx, 'REV.A  /  01', 32, 93, 1.7);

  ctx.strokeStyle = 'rgba(177, 201, 217, 0.26)';
  ctx.beginPath();
  ctx.moveTo(394, 44);
  ctx.lineTo(460, 44);
  ctx.moveTo(394, 74);
  ctx.lineTo(436, 74);
  ctx.stroke();

  return makeTexture(canvas);
}

/**
 * Soft-box studio environment, baked to a small equirectangular texture.
 */
export function createStudioEnvironmentTexture() {
  const { canvas, ctx } = makeCanvas(2048, 1024);

  const base = ctx.createLinearGradient(0, 0, 0, 1024);
  base.addColorStop(0, '#182532');
  base.addColorStop(0.36, '#0a1118');
  base.addColorStop(0.62, '#03070b');
  base.addColorStop(1, '#010203');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 2048, 1024);

  const panels = [
    { x: 450, y: 190, rx: 500, ry: 270, color: [240, 247, 252], alpha: 0.96 },
    { x: 1330, y: 265, rx: 350, ry: 250, color: [215, 229, 240], alpha: 0.7 },
    { x: 840, y: 765, rx: 560, ry: 160, color: [78, 154, 232], alpha: 0.4 },
    { x: 1760, y: 700, rx: 300, ry: 130, color: [48, 116, 194], alpha: 0.24 },
    { x: 180, y: 690, rx: 260, ry: 120, color: [112, 154, 187], alpha: 0.24 },
    { x: 980, y: 540, rx: 660, ry: 110, color: [226, 235, 242], alpha: 0.28 },
  ];

  for (const panel of panels) {
    const gradient = ctx.createRadialGradient(panel.x, panel.y, 0, panel.x, panel.y, Math.max(panel.rx, panel.ry));
    const [r, g, b] = panel.color;
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${panel.alpha})`);
    gradient.addColorStop(0.28, `rgba(${r}, ${g}, ${b}, ${panel.alpha * 0.48})`);
    gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${panel.alpha * 0.08})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.save();
    ctx.translate(panel.x, panel.y);
    ctx.scale(panel.rx / Math.max(panel.rx, panel.ry), panel.ry / Math.max(panel.rx, panel.ry));
    ctx.translate(-panel.x, -panel.y);
    ctx.fillStyle = gradient;
    ctx.fillRect(panel.x - panel.rx, panel.y - panel.ry, panel.rx * 2, panel.ry * 2);
    ctx.restore();
  }

  // Narrow strip lights create the long specular lines on brushed metal.
  const strip = ctx.createLinearGradient(0, 402, 0, 438);
  strip.addColorStop(0, 'rgba(255, 255, 255, 0)');
  strip.addColorStop(0.5, 'rgba(227, 240, 250, 0.55)');
  strip.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = strip;
  ctx.fillRect(0, 402, 2048, 36);

  const sideStrip = ctx.createLinearGradient(120, 0, 250, 0);
  sideStrip.addColorStop(0, 'rgba(183, 215, 240, 0)');
  sideStrip.addColorStop(0.5, 'rgba(183, 215, 240, 0.42)');
  sideStrip.addColorStop(1, 'rgba(183, 215, 240, 0)');
  ctx.fillStyle = sideStrip;
  ctx.fillRect(130, 70, 70, 470);

  const texture = makeTexture(canvas, { colorSpace: THREE.SRGBColorSpace, anisotropy: 4 });
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
