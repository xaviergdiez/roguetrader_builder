import React from 'react';
import { savedWork, savedWorkName, errorLine } from './recovery.js';

/* A screen that fails to draw must not take the rest of the app with it.

   Without a boundary, one error while rendering (a hand-edited or imported
   character with a field of the wrong type, say) unmounts the whole tree and
   leaves a blank page. This catches it where it happens: a pane shows a short
   message with Try again (and Close, for a dialog), the rest of the app keeps
   working, and "Keep my saved work" downloads everything the browser holds so
   nothing is stranded. `full` is the last resort around the whole app.

   Self-contained on purpose: its styles are inline, because the app's own
   stylesheet is added by the component that may be the one that failed. It
   resets by itself when `resetKey` changes (opening another character), so a
   bad one does not keep the next one's screen broken. */

const C = { bg: '#0a0e0b', panel: '#132019', text: '#cfdcd2', bone: '#eef4ec', brass: '#c9a961', dim: '#8fa596', bad: '#e8998b', rust: '#c0552a' };

const keepWork = () => {
  try {
    const blob = new Blob([JSON.stringify(savedWork(window.localStorage), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = savedWorkName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch { /* nothing more can be done from here */ }
};

const btn = {
  cursor: 'pointer', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, padding: '7px 12px',
  color: C.text, background: 'transparent', border: `1px solid ${C.brass}`
};

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label || 'app'}]`, error, info && info.componentStack);
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { label = 'this screen', full = false, onClose } = this.props;
    const box = full
      ? { minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.bg, color: C.text, padding: 24 }
      : { margin: '12px 0', background: C.panel, color: C.text, border: `1px solid ${C.rust}`, borderLeft: `3px solid ${C.rust}`, padding: '14px 16px' };
    const inner = (
      <div role="alert" style={full ? { maxWidth: 520, border: `1px solid ${C.rust}`, background: C.panel, padding: '22px 24px' } : null}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: full ? 20 : 16, color: C.bone, marginBottom: 6 }}>
          {full ? 'Something went wrong drawing this page' : `Something went wrong drawing ${label}`}
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.5 }}>
          Nothing you saved has been lost. {full ? 'Reload to carry on, or' : 'The rest of the app is still working. Try again, or'} keep a copy of your saved work first.
        </p>
        <p style={{ margin: '0 0 14px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: C.dim }}>
          {errorLine(error)}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {full
            ? <button style={btn} onClick={() => window.location.reload()}>Reload</button>
            : <button style={btn} onClick={() => { if (this.props.onRetry) this.props.onRetry(); this.setState({ error: null }); }}>Try again</button>}
          {onClose && <button style={btn} onClick={() => { this.setState({ error: null }); onClose(); }}>Close</button>}
          <button style={{ ...btn, color: C.brass }} onClick={keepWork}>Keep my saved work</button>
        </div>
      </div>
    );
    return full ? <div style={box}>{inner}</div> : <div style={box}>{inner}</div>;
  }
}

/* A component wrapped in a boundary of its own, under the same name and props.
   `resetKey` (a prop the caller may pass) and `onClose` are read for the boundary
   and still passed on. Made once, at module level, so the component's identity is
   stable across renders. */
export function guarded(Inner, label) {
  function Guarded(props) {
    return (
      <ErrorBoundary label={label} resetKey={props.resetKey} onClose={props.onClose}>
        <Inner {...props} />
      </ErrorBoundary>
    );
  }
  Guarded.displayName = `Guarded(${Inner.displayName || Inner.name || 'Component'})`;
  return Guarded;
}

/* The same, for a screen that is only needed once it is opened: its code is
   fetched the first time it is drawn instead of with the page, so someone who
   only opens a character sheet does not download the battle map, the void map
   and the Lore pages. While it loads a line says so; if the fetch itself fails
   (offline, or a new version replaced the file), the boundary offers Try again,
   which asks for it afresh. The loaded component is kept at module level, so
   opening the same screen again does not flash the loading line. */
export function lazyGuarded(load, label) {
  let Inner = React.lazy(load);
  function LazyPane(props) {
    const [, again] = React.useReducer((n) => n + 1, 0);
    return (
      <ErrorBoundary
        label={label} resetKey={props.resetKey} onClose={props.onClose}
        onRetry={() => { Inner = React.lazy(load); again(); }}
      >
        <React.Suspense
          fallback={<div role="status" style={{ padding: '12px 16px', color: C.dim, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>Loading {label}…</div>}
        >
          <Inner {...props} />
        </React.Suspense>
      </ErrorBoundary>
    );
  }
  LazyPane.displayName = `LazyGuarded(${label})`;
  return LazyPane;
}
