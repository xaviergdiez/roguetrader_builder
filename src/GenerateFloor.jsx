import React, { useRef, useState } from 'react';
import { getLocalFile } from './localfiles.js';
import { generatePicture, animatePicture } from './genai.js';
import { ENVIRONMENTS, MAX_DESCRIBE } from '../lib/mapprompt.js';

/* "Generate one" for the picture under a map: the deck's Picture floor panel
   and the void chart's Picture card both carry it (genai.js does the work).

   Two steps, each its own button, because each costs and the second needs
   the first: a picture in the map's shape, laid down the way a chosen file
   is; then, once there is a picture down, that picture brought to life as a
   loop. The clip is made from the picture ON the map, so a picture the GM
   chose from disk can be brought to life as well as a generated one.

   The callbacks are read through a ref when the work finishes, not when it
   starts: a clip takes a minute, the GM may close this panel or change the
   map meanwhile, and what it lands on has to be the map as it is then. The
   parent's callbacks must therefore read their own latest map. */
/* `planMask`, given for a deck, makes the deck's plan to send with the
   request (genai.js), so the picture follows the deck's walls; `has()` says
   whether the deck has floor to follow yet. */
export default function GenerateFloor({ target, cols, rows, backdrop, mediaReady, onPicture, onVideo, hintClass = 'rt-vm-sub', planMask = null }) {
  const [describe, setDescribe] = useState('');
  const [motion, setMotion] = useState('');
  const [environment, setEnvironment] = useState('ship');
  const [followWalls, setFollowWalls] = useState(true);
  const canFollow = Boolean(planMask && planMask.has());
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const cb = useRef({});
  cb.current = { onPicture, onVideo };
  const alive = useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const say = (fn) => (v) => { if (alive.current) fn(v); };

  const isVoid = target === 'void';
  const canAnimate = Boolean(backdrop && backdrop.kind === 'image' && mediaReady) && !busy;

  const picture = async () => {
    setErr(''); setBusy('picture'); setStatus('Generating the picture… about twenty seconds');
    try {
      const mask = canFollow && followWalls ? planMask.make() : null;
      const file = await generatePicture({ target, describe, environment: isVoid ? '' : environment, cols, rows, mask });
      await cb.current.onPicture(file);
      say(setStatus)('');
    } catch (e) {
      say(setErr)(e.message || 'Generation failed'); say(setStatus)('');
    } finally { say(setBusy)(null); }
  };

  const animate = async () => {
    setErr(''); setBusy('video');
    try {
      const rec = backdrop ? await getLocalFile(backdrop.id) : null;
      if (!rec || !rec.blob) throw new Error('The picture is not on this computer.');
      const { file, crop } = await animatePicture({ blob: rec.blob, target, describe: motion, onStatus: say(setStatus) });
      await cb.current.onVideo(file, crop, backdrop);
      say(setStatus)('');
    } catch (e) {
      say(setErr)(e.message || 'The clip could not be made'); say(setStatus)('');
    } finally { say(setBusy)(null); }
  };

  return (
    <div className="rt-genfloor">
      <div className="rt-genfloor-h">Generate one</div>
      {!isVoid && (
        <label className="rt-genfloor-row">Place
          <select className="rt-sel" value={environment} onChange={(e) => setEnvironment(e.target.value)} aria-label="What kind of place">
            {ENVIRONMENTS.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
        </label>
      )}
      <textarea className="rt-field" rows={2} maxLength={MAX_DESCRIBE} value={describe}
        aria-label={isVoid ? 'What the sky is' : 'What the place is'}
        placeholder={isVoid
          ? 'What the sky is: a red nebula like an open wound, the limb of a gas giant along the bottom… (blank for a starfield)'
          : 'What the place is, in your words: a flooded reactor hall, a chapel nave with toppled pews… (blank for the place above)'}
        onChange={(e) => setDescribe(e.target.value)} />
      {canFollow && (
        <label className="rt-genfloor-row" title="The deck's plan goes with the request, so its rooms and corridors are painted where the deck has floor">
          <input type="checkbox" checked={followWalls} onChange={(e) => setFollowWalls(e.target.checked)} />
          Follow the deck{'\u2019'}s walls
        </label>
      )}
      <div className="rt-genfloor-row">
        <button type="button" className="rt-btn" disabled={Boolean(busy)} onClick={picture}>
          {busy === 'picture' ? 'Generating…' : 'Generate a picture'}
        </button>
        <span className={hintClass}>In the {isVoid ? 'chart’s' : 'grid’s'} shape, laid to cover it. One of the day{'’'}s images.</span>
      </div>
      <input className="rt-field" value={motion} maxLength={MAX_DESCRIBE} aria-label="What moves in the clip"
        placeholder={isVoid ? 'What moves (blank: the gas drifts, the stars glint)' : 'What moves (blank: lamps flicker, steam drifts, sparks fall)'}
        onChange={(e) => setMotion(e.target.value)} />
      <div className="rt-genfloor-row">
        <button type="button" className="rt-btn" disabled={!canAnimate} onClick={animate}
          title={canAnimate ? 'An eight-second loop made from the picture on the map' : 'Put a picture down first'}>
          {busy === 'video' ? 'Bringing it to life…' : 'Bring the picture to life'}
        </button>
        <span className={hintClass}>An 8-second loop of the picture on the map, the camera still. A minute or so; about $0.56, from a smaller daily allowance.</span>
      </div>
      {status && <p className={hintClass} role="status">{status}</p>}
      {err && <p className="rt-warn" role="alert">{err}</p>}
    </div>
  );
}
