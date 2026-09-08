// Portrait crop maths, ported from dnd_multi-user (src/utils/framing.js).
// Pure on purpose — see framing.check.mjs, run with `node src/framing.check.mjs`.

export const DEFAULT_FRAMING = { zoom: 1, x: 50, y: 50 };

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function framingStyle(f) {
  return {
    objectFit: 'cover',
    objectPosition: `${f?.x ?? 50}% ${f?.y ?? 50}%`,
    transform: `scale(${f?.zoom ?? 1})`
  };
}

// Dragging moves the image, so the visible window moves the opposite way —
// hence the subtraction. Dividing by zoom keeps the drag feeling 1:1 with the
// cursor as you zoom in.
export function panFraming(start, dxPx, dyPx, box) {
  const dx = (dxPx / box.width) * 100;
  const dy = (dyPx / box.height) * 100;
  return {
    x: clamp(start.x - dx / start.zoom, 0, 100),
    y: clamp(start.y - dy / start.zoom, 0, 100)
  };
}
