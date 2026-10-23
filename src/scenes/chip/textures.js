// Model-only procedural textures from DeepSeek V2 (69d8113).
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

  // A very quiet die-ring and edge routing sit below the brand type. At close
  // range they make the black carrier read as an engineered component; at the
  // hero distance they disappear into the glass.
  ctx.save()
  ctx.strokeStyle = 'rgba(120, 158, 181, 0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(512, 512, 338, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(146, 181, 199, 0.08)'
  for (let i = 0; i < 24; i += 1) {
    const a = i / 24 * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(512 + Math.cos(a) * 330, 512 + Math.sin(a) * 330)
    ctx.lineTo(512 + Math.cos(a) * (i % 3 === 0 ? 350 : 341), 512 + Math.sin(a) * (i % 3 === 0 ? 350 : 341))
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(127, 166, 188, 0.1)'
  for (const [x, y, sx, sy] of [[146, 146, 1, 1], [878, 146, -1, 1], [146, 878, 1, -1], [878, 878, -1, -1]]) {
    ctx.beginPath()
    ctx.moveTo(x + 110 * sx, y)
    ctx.lineTo(x + 54 * sx, y)
    ctx.lineTo(x + 54 * sx, y + 48 * sy)
    ctx.lineTo(x + 20 * sx, y + 48 * sy)
    ctx.stroke()
    ctx.fillStyle = 'rgba(151, 184, 201, 0.16)'
    ctx.fillRect(x + 12 * sx, y + 62 * sy, 5, 5)
  }
  ctx.restore()

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
 * A transparent circuit inlay for the four deep cover bays. At normal viewing
 * distance it reads as a thin layer of board art under the silver frame; up
 * close it supplies the small pads and routed traces the package silhouette
 * needs. It is deliberately pattern-only (no invented signal semantics).
 */
export function createInlayCircuitTexture() {
  const { canvas, ctx } = makeCanvas(1024, 512);
  ctx.clearRect(0, 0, 1024, 512);
  let state = 0x7a31c0de;
  const random = () => {
    state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x6d2b79f5) | 0;
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };

  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  for (let i = 0; i < 54; i++) {
    const x = 30 + random() * 960;
    const y = 26 + random() * 460;
    const length = 24 + random() * 120;
    const vertical = random() > .55;
    ctx.strokeStyle = i % 5 === 0
      ? `rgba(187, 159, 112, ${.08 + random() * .09})`
      : `rgba(112, 168, 194, ${.1 + random() * .12})`;
    ctx.lineWidth = i % 7 === 0 ? 2.2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (vertical) {
      ctx.lineTo(x, y + length);
      ctx.lineTo(x + (random() - .5) * 70, y + length);
    } else {
      ctx.lineTo(x + length, y);
      ctx.lineTo(x + length, y + (random() - .5) * 50);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(147, 178, 191, .16)';
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  // Sparse solder pads and passive outlines.
  for (let i = 0; i < 26; i++) {
    const x = 34 + random() * 956;
    const y = 30 + random() * 452;
    const w = 10 + random() * 24;
    const h = 6 + random() * 12;
    ctx.fillStyle = 'rgba(4, 9, 12, .7)';
    ctx.strokeStyle = 'rgba(174, 195, 200, .18)';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(188, 154, 105, .2)';
    ctx.fillRect(x + 2, y + 2, 2, h - 4);
  }

  ctx.strokeStyle = 'rgba(155, 191, 207, .13)';
  ctx.lineWidth = 1.5;
  for (const [x, y] of [[26, 26], [998, 26], [26, 486], [998, 486]]) {
    ctx.beginPath();
    ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y);
    ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9);
    ctx.stroke();
  }

  return makeTexture(canvas);
}
