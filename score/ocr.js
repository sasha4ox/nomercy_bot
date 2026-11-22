const { spawnSync } = require('child_process');
const fs = require('fs');
const sharp = require('sharp');

const TOKEN = /^[A-Za-z][A-Za-z0-9]{2,15}$/;
const UI_WORDS = new Set(['lineage', 'lineageii', 'lineageil', 'cp', 'hp', 'mp', 'ii']);
const WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function tesseractBin() {
  if (process.env.TESSERACT_CMD && fs.existsSync(process.env.TESSERACT_CMD)) {
    return process.env.TESSERACT_CMD;
  }
  const windows = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
  if (fs.existsSync(windows)) return windows;
  return 'tesseract';
}

function recognize(png) {
  const result = spawnSync(tesseractBin(), [
    'stdin',
    'stdout',
    '--oem', '1',
    '--psm', '13',
    '-c', `tessedit_char_whitelist=${WHITELIST}`,
  ], { input: png, encoding: 'utf8', windowsHide: true });
  if (result.error) {
    throw new Error('Tesseract не найден. На сервере нужен пакет tesseract.');
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || 'tesseract failed').trim());
  }
  return result.stdout || '';
}

async function loadRgb(input) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function extractSlots(input) {
  const rgb = await loadRgb(input);
  const white = whiteMask(rgb);
  const slots = [];
  const seen = new Set();
  for (const stack of stacks(bars(rgb))) {
    if (!stack.some((bar) => bar.color === 'gold')) continue;
    const readings = await candidatesAbove(rgb, white, stack);
    if (!readings.length) continue;
    const key = readings[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push(readings);
  }
  return slots;
}

function whiteMask(rgb) {
  const mask = new Uint8Array(rgb.width * rgb.height);
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 3) {
    const r = rgb.data[i];
    const g = rgb.data[i + 1];
    const b = rgb.data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    mask[p] = r > 165 && g > 165 && b > 150 && max - min < 45 ? 1 : 0;
  }
  return mask;
}

function colorMasks(rgb) {
  const gold = new Uint8Array(rgb.width * rgb.height);
  const red = new Uint8Array(rgb.width * rgb.height);
  const blue = new Uint8Array(rgb.width * rgb.height);
  for (let p = 0, i = 0; p < gold.length; p += 1, i += 3) {
    const r = rgb.data[i];
    const g = rgb.data[i + 1];
    const b = rgb.data[i + 2];
    const isGold = r > 125 && g > 65 && b < 110 && r > b + 35 && g > b + 15;
    gold[p] = isGold ? 1 : 0;
    red[p] = !isGold && r > 115 && g < 105 && b < 105 && r > g + 35 && r > b + 35 ? 1 : 0;
    blue[p] = b > 105 && b > r + 25 && b > g - 10 && r < 190 ? 1 : 0;
  }
  return { gold, red, blue };
}

function bars(rgb) {
  const { width, height } = rgb;
  let kernelW = Math.max(11, Math.floor(width * 0.09));
  if (kernelW % 2 === 0) kernelW += 1;
  const minLen = Math.max(24, Math.floor(width * 0.08));
  const masks = colorMasks(rgb);
  const segments = [];
  for (const color of ['gold', 'red', 'blue']) {
    const closed = closeHorizontal(masks[color], width, height, kernelW);
    for (let y = 0; y < height; y += 1) {
      let start = null;
      for (let x = 0; x <= width; x += 1) {
        const on = x < width && closed[y * width + x];
        if (on && start === null) start = x;
        else if (!on && start !== null) {
          if (x - start >= minLen && dense(masks[color], width, y, start, x)) {
            segments.push({ y, x0: start, x1: x - 1, color });
          }
          start = null;
        }
      }
    }
  }
  return mergeSegments(longestFamily(segments), Math.max(3, Math.floor(height / 80)));
}

function closeHorizontal(mask, width, height, kernelW) {
  const radius = (kernelW - 1) >> 1;
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const off = y * width;
    const dil = new Uint8Array(width);
    for (let x = 0; x < width; x += 1) {
      for (let k = x - radius; k <= x + radius; k += 1) {
        if (k >= 0 && k < width && mask[off + k]) {
          dil[x] = 1;
          break;
        }
      }
    }
    for (let x = 0; x < width; x += 1) {
      let on = 1;
      for (let k = x - radius; k <= x + radius; k += 1) {
        if (k < 0 || k >= width || !dil[k]) {
          on = 0;
          break;
        }
      }
      out[off + x] = on;
    }
  }
  return out;
}

function dense(mask, width, y, start, end) {
  if (end <= start) return false;
  let count = 0;
  const off = y * width;
  for (let x = start; x < end; x += 1) count += mask[off + x];
  return count / (end - start) >= 0.35;
}

function longestFamily(segments) {
  if (!segments.length) return [];
  const longest = Math.max(...segments.map((segment) => segment.x1 - segment.x0 + 1));
  const floor = longest * 0.55;
  return segments.filter((segment) => segment.x1 - segment.x0 + 1 >= floor);
}

function mergeSegments(segments, verticalGap) {
  const grouped = { gold: [], red: [], blue: [] };
  for (const segment of segments) grouped[segment.color].push(segment);
  const barsOut = [];
  for (const color of ['gold', 'red', 'blue']) {
    const rows = grouped[color].sort((a, b) => a.y - b.y || a.x0 - b.x0);
    let current = [];
    for (const row of rows) {
      if (!current.length) {
        current = [row];
        continue;
      }
      const previous = current[current.length - 1];
      const same = row.y - previous.y <= verticalGap && overlap(previous.x0, previous.x1, row.x0, row.x1) > 0.45;
      if (same) current.push(row);
      else {
        barsOut.push(barFromRows(current, color));
        current = [row];
      }
    }
    if (current.length) barsOut.push(barFromRows(current, color));
  }
  barsOut.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return barsOut;
}

function barFromRows(rows, color) {
  return {
    x0: Math.min(...rows.map((row) => row.x0)),
    y0: Math.min(...rows.map((row) => row.y)),
    x1: Math.max(...rows.map((row) => row.x1)),
    y1: Math.max(...rows.map((row) => row.y)),
    color,
  };
}

function overlap(a0, a1, b0, b1) {
  const common = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0) + 1);
  const base = Math.max(1, Math.min(a1 - a0 + 1, b1 - b0 + 1));
  return common / base;
}

function stacks(barList) {
  const groups = [];
  let current = [];
  for (const bar of barList) {
    if (!current.length) {
      current = [bar];
      continue;
    }
    const previous = current[current.length - 1];
    const gap = bar.y0 - previous.y1;
    const pitch = Math.max(6, (previous.y1 - previous.y0 + 1) * 2);
    const aligned = overlap(previous.x0, previous.x1, bar.x0, bar.x1) > 0.5;
    if (gap <= pitch && aligned) current.push(bar);
    else {
      groups.push(current);
      current = [bar];
    }
  }
  if (current.length) groups.push(current);
  return groups.filter((group) => group.length >= 2);
}

async function candidatesAbove(rgb, white, stack) {
  const top = stack.reduce((best, bar) => (bar.y0 < best.y0 ? bar : best));
  const lookUp = Math.max(28, Math.floor((top.x1 - top.x0 + 1) / 4));
  const y1 = Math.max(0, top.y0 - 1);
  const y0 = Math.max(0, y1 - lookUp);
  const x0 = top.x0;
  const x1 = Math.min(rgb.width - 1, top.x0 + Math.floor((top.x1 - top.x0 + 1) * 0.78));
  if (y1 <= y0 || x1 <= x0) return [];
  const region = sliceMask(white, rgb.width, x0, y0, x1, y1);
  for (const [bandTop, bandBottom] of textBands(region).reverse()) {
    const gap = (y1 - y0) - bandBottom;
    const bandHeight = bandBottom - bandTop + 1;
    const topHeight = top.y1 - top.y0 + 1;
    if (gap <= Math.max(2, topHeight) && bandHeight <= Math.max(6, topHeight * 2)) continue;
    const mask = sliceMask(region.data, region.width, 0, bandTop, region.width - 1, bandBottom);
    dropClassIcon(mask);
    const cleaned = [];
    const seen = new Set();
    for (const raw of await readLine(mask)) {
      const token = cleanToken(raw);
      if (token && !seen.has(token.toLowerCase())) {
        seen.add(token.toLowerCase());
        cleaned.push(token);
      }
    }
    if (cleaned.length) return cleaned;
  }
  return [];
}

function sliceMask(mask, width, x0, y0, x1, y1) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) data[y * w + x] = mask[(y0 + y) * width + (x0 + x)];
  }
  return { data, width: w, height: h };
}

function textBands(region) {
  const counts = new Array(region.height).fill(0);
  for (let y = 0; y < region.height; y += 1) {
    let count = 0;
    for (let x = 0; x < region.width; x += 1) count += region.data[y * region.width + x];
    counts[y] = count;
  }
  const bands = [];
  let start = null;
  let empty = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index];
    if (count >= 2 || (start !== null && count >= 1)) {
      if (start === null) start = index;
      empty = 0;
    } else if (start !== null) {
      empty += 1;
      if (empty > 1) {
        bands.push([start, index - empty]);
        start = null;
        empty = 0;
      }
    }
  }
  if (start !== null) bands.push([start, counts.length - 1 - empty]);
  return bands.filter(([top, bottom]) => bottom - top >= 3);
}

function dropClassIcon(mask) {
  const gapNeed = Math.max(3, Math.round(mask.height * 0.4));
  const segments = [];
  let start = null;
  let empty = 0;
  for (let x = 0; x <= mask.width; x += 1) {
    let on = false;
    if (x < mask.width) {
      for (let y = 0; y < mask.height; y += 1) {
        if (mask.data[y * mask.width + x]) {
          on = true;
          break;
        }
      }
    }
    if (on) {
      if (start === null) start = x;
      empty = 0;
    } else if (start !== null) {
      empty += 1;
      if (empty >= gapNeed) {
        segments.push([start, x - empty]);
        start = null;
      }
    }
  }
  if (segments.length < 2) return;
  const iconWidth = segments[0][1] - segments[0][0] + 1;
  if (iconWidth <= mask.height * 1.6) {
    const cut = segments[1][0];
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < cut; x += 1) mask.data[y * mask.width + x] = 0;
    }
  }
}

async function readLine(mask) {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.data[y * mask.width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return [];
  const crop = sliceMask(mask.data, mask.width, minX, minY, maxX, maxY);
  if (crop.height < 4 || crop.width < 6) return [];
  const tuned = toTunedSize(crop);
  const readings = [];
  for (const targetHeight of [54, 96]) {
    const scale = Math.max(4, Math.round(targetHeight / tuned.height));
    const big = resizeNearest(tuned, scale);
    const png = await toPng(big);
    readings.push(recognize(png));
  }
  return readings;
}

function toTunedSize(crop) {
  if (crop.height <= 14) return crop;
  const target = 10;
  const width = Math.max(1, Math.round(crop.width * target / crop.height));
  const data = new Uint8Array(width * target);
  for (let y = 0; y < target; y += 1) {
    const y0 = Math.floor(y * crop.height / target);
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * crop.height / target));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * crop.width / width);
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * crop.width / width));
      let on = 0;
      for (let yy = y0; yy < Math.min(crop.height, y1); yy += 1) {
        for (let xx = x0; xx < Math.min(crop.width, x1); xx += 1) on += crop.data[yy * crop.width + xx];
      }
      data[y * width + x] = on > 0 ? 1 : 0;
    }
  }
  return { data, width, height: target };
}

function resizeNearest(crop, scale) {
  const width = crop.width * scale;
  const height = crop.height * scale;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = crop.data[sy * crop.width + Math.floor(x / scale)];
    }
  }
  return { data, width, height };
}

async function toPng(binary) {
  const border = 20;
  const width = binary.width + border * 2;
  const height = binary.height + border * 2;
  const raw = Buffer.alloc(width * height, 255);
  for (let y = 0; y < binary.height; y += 1) {
    for (let x = 0; x < binary.width; x += 1) {
      if (binary.data[y * binary.width + x]) raw[(y + border) * width + (x + border)] = 0;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

function cleanToken(raw) {
  let compact = String(raw).replace(/[^A-Za-z0-9]/g, '').replace(/^[0-9]+/, '');
  if (!TOKEN.test(compact) || UI_WORDS.has(compact.toLowerCase())) return null;
  return compact;
}

module.exports = { extractSlots };
