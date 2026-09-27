// Finished-tower collage: one tower's photos on a 1080px-wide JPEG to save or share.
// 5 columns, floor 1 top-left, each photo framed in its floor's brick color; a couple floor is two photos side by side.
import { photoUrl } from './db.js';
import { brickColor } from './ui/scene.js';

const COLS = 5, CELL = 192, GAP = 12, PAD = 36, HEAD = 150, FOOT = 64;
const W = PAD * 2 + COLS * CELL + (COLS - 1) * GAP; // 1080

const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

// Fill (x, y, w, h) with img, cropping to the center.
function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

// keys: the tower's days, floor 1 first. days: day docs ({assetId, partnerAssetId?}). brick: brick skin id or null.
export async function makeCollage({ keys, days, title, sub, brick }) {
  await document.fonts.load('32px Galmuri11');
  const rows = Math.ceil(keys.length / COLS);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = HEAD + rows * CELL + (rows - 1) * GAP + FOOT;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1d2a44';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2c230';
  ctx.font = '50px Galmuri11';
  ctx.fillText(title, W / 2, 76);
  ctx.fillStyle = '#e6eef5';
  ctx.font = '28px Galmuri11';
  ctx.fillText(sub, W / 2, 122);

  // Thumbnails (360px) are plenty for 192px cells. A photo that won't load leaves its cell dark.
  const ids = keys.flatMap((k) => [days[k]?.assetId, days[k]?.partnerAssetId]).filter(Boolean);
  const imgs = new Map(await Promise.all(ids.map((id) => load(photoUrl(id, true)).then((i) => [id, i], () => [id, null]))));
  keys.forEach((k, i) => {
    const x = PAD + (i % COLS) * (CELL + GAP), y = HEAD + Math.floor(i / COLS) * (CELL + GAP);
    const d = days[k] ?? {}, a = imgs.get(d.assetId), b = imgs.get(d.partnerAssetId);
    ctx.fillStyle = brickColor(brick, i);
    ctx.fillRect(x - 5, y - 5, CELL + 10, CELL + 10);
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, CELL, CELL);
    if (d.partnerAssetId) {
      if (a) cover(ctx, a, x, y, CELL / 2, CELL);
      if (b) cover(ctx, b, x + CELL / 2, y, CELL / 2, CELL);
    } else if (a) cover(ctx, a, x, y, CELL, CELL);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x, y + CELL - 34, 52, 34);
    ctx.fillStyle = '#fff';
    ctx.font = '22px Galmuri11';
    ctx.fillText(String(i + 1), x + 26, y + CELL - 10);
  });
  ctx.fillStyle = '#8fa3c7';
  ctx.font = '22px Galmuri11';
  ctx.fillText('해빗 타워', W / 2, c.height - 24);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('콜라주를 만들지 못했어요'))), 'image/jpeg', 0.9));
}
