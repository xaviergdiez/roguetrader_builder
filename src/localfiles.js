/* Files kept in THIS browser: a deck's picture or moving floor, the sounds on
   the ambience board.

   They are too big for anywhere else. A looping map is tens or hundreds of
   megabytes, and the shared stores take a record of one; the file is wanted
   on one computer only, the one wired to the screen and the speakers at the
   table. So it is kept here, in IndexedDB, under an id the deck or the board
   remembers, and a deck opened on another computer finds no file under that
   id and asks for it again.

   Not pure, and not checked by a node script: there is no IndexedDB in node.
   The browser tests exercise it. */

const DB_NAME = 'rt-local';
const STORE = 'files';

let opening = null;
function openDb() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no_indexeddb')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // A failed open is not remembered: a private window that refused once may be
  // asked again after the GM changes a setting.
  opening.catch(() => { opening = null; });
  return opening;
}

function run(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/* Asked once: a browser may clear a site's storage when the disk runs low,
   unless the site has asked to keep it. A refusal changes nothing here. */
let askedToKeep = false;
const askToKeep = () => {
  if (askedToKeep) return;
  askedToKeep = true;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* not offered */ }
};

export function putLocalFile(id, blob, { name = '' } = {}) {
  askToKeep();
  return run('readwrite', (s) => s.put({
    blob, name: String(name || (blob && blob.name) || '').slice(0, 200),
    type: (blob && blob.type) || '', size: (blob && blob.size) || 0, savedAt: Date.now()
  }, id));
}

// { blob, name, type, size, savedAt }, or null when this browser has no file
// under that id.
export const getLocalFile = (id) => run('readonly', (s) => s.get(id)).then((v) => v || null);

export const deleteLocalFile = (id) => run('readwrite', (s) => s.delete(id));
