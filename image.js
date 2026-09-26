// Photo resizing shared by certify (db.js) and brick thumbnails (localdb.js).

// Longest side 1280px JPEG: a phone photo drops from ~4MB to ~200KB.
// createImageBitmap first; an <img> decode covers browsers (older iPhone Safari) where it fails.
export async function shrink(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    let img;
    try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
      img = new Image();
      img.src = url;
      try { await img.decode(); } catch { throw new Error('사진을 읽을 수 없어요 (JPG/PNG로 찍어주세요)'); }
    }
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('사진 변환 실패'))), 'image/jpeg', 0.8));
  } finally { URL.revokeObjectURL(url); }
}
