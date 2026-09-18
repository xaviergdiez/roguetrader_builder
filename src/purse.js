// Throne Gelt: what the character has been granted, and what it has gone on.
//
// A LEDGER, NOT A RUNNING TOTAL. The stored balance is the grant; spending
// appends a line and the balance is derived. That way a purchase can be
// undone by deleting its line, and the sheet can show where the money went
// instead of a number that only ever shrinks for unexplained reasons.
//
// Rogue Trader buys through Profit Factor, not coin — this sits alongside
// that rather than replacing it. Thrones are for the itemised things the
// tables price in Thrones, bionics and power armour above all.

const num = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};

export const EMPTY = { thrones: 0, spends: [] };

// Merges a stored purse over the empty shape, so a sheet saved before the
// purse existed still loads.
export const read = (v) => ({
  thrones: num(v && v.thrones),
  spends: (Array.isArray(v && v.spends) ? v.spends : [])
    .filter((s) => s && s.label)
    .map((s) => ({ id: String(s.id || s.label), label: String(s.label), cost: num(s.cost) }))
});

export const spent = (purse) => read(purse).spends.reduce((n, s) => n + s.cost, 0);
export const balance = (purse) => read(purse).thrones - spent(purse);
export const canAfford = (purse, cost) => balance(purse) >= num(cost);

// Granting replaces the grant rather than adding to it: the field on the
// sheet is "Thrones granted", so typing 12,000 means twelve thousand, not
// twelve thousand more.
export const grant = (purse, thrones) => ({ ...read(purse), thrones: num(thrones) });

export function spend(purse, { id, label, cost }) {
  const p = read(purse);
  if (!label) return p;
  const line = { id: String(id || label), label: String(label), cost: num(cost) };
  // The same id twice is a double-click, not two purchases.
  if (p.spends.some((s) => s.id === line.id)) return p;
  return { ...p, spends: [...p.spends, line] };
}

export const refund = (purse, id) => {
  const p = read(purse);
  return { ...p, spends: p.spends.filter((s) => s.id !== String(id)) };
};

export const fmt = (n) => num(n).toLocaleString();
