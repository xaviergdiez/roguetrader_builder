/* A picture's or a video's size in pixels, read before it is laid: its size
   on a map or a chart comes from it. Null when the file will not open. */
export function measureMedia(file, kind, win = null) {
  const w = win || window;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const finish = (width, height) => {
      URL.revokeObjectURL(url);
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    if (kind === 'image') {
      const img = new w.Image();
      img.onload = () => finish(img.naturalWidth, img.naturalHeight);
      img.onerror = () => finish(0, 0);
      img.src = url;
      return;
    }
    const v = w.document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => finish(v.videoWidth, v.videoHeight);
    v.onerror = () => finish(0, 0);
    v.src = url;
  });
}
