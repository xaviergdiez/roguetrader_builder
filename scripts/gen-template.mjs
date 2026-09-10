// Generates the character-import CSV template straight from the app's own data,
// so the option lists in the Notes column cannot drift out of sync.
import fs from 'node:fs';
// the discipline list comes from the app's own psychic data, so the template's
// accepted values cannot drift from what the sheet will actually understand
import { DISCIPLINES } from '../src/psychic.js';

const src = fs.readFileSync('src/RogueTraderBuilder.jsx', 'utf8').split('const CSS =')[0];

const ARRAYS = {
  home: 'HOME_WORLDS', birthright: 'BIRTHRIGHTS', lure: 'LURES',
  trials: 'TRIALS', motivation: 'MOTIVATIONS', career: 'CAREERS'
};
const STEP_LABEL = {
  home: 'Home World', birthright: 'Birthright', lure: 'Lure of the Void',
  trials: 'Trials', motivation: 'Motivation', career: 'Career'
};

// slice out `const NAME = [ ... ];` by bracket depth so nested arrays survive
function sliceArray(name) {
  const start = src.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('[', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '[') depth++;
    else if (src[j] === ']') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced ' + name);
}

// top-level `{ id, name }` entries, and any choices nested under them
function parseEntries(body) {
  const out = [];
  const re = /\n {2}\{\s*\n?\s*id: '([a-z0-9_]+)',\s*\n?\s*name: '((?:[^'\\]|\\.)*)'/g;
  let m;
  const starts = [];
  while ((m = re.exec(body))) starts.push({ id: m[1], name: m[2], at: m.index });
  // one-liners: `{ id: 'x', name: 'Y', ... }`
  const re2 = /\{ id: '([a-z0-9_]+)', name: '((?:[^'\\]|\\.)*)'/g;
  while ((m = re2.exec(body))) {
    if (!starts.some((s) => Math.abs(s.at - m.index) < 4)) starts.push({ id: m[1], name: m[2], at: m.index });
  }
  starts.sort((a, b) => a.at - b.at);
  for (let k = 0; k < starts.length; k++) {
    const seg = body.slice(starts[k].at, k + 1 < starts.length ? starts[k + 1].at : body.length);
    const choices = [];
    const cre = /id: '([a-z0-9_]+)', label: '((?:[^'\\]|\\.)*)'/g;
    let c;
    while ((c = cre.exec(seg))) choices.push({ id: c[1], label: c[2] });
    // choices written with id and label on separate lines
    const cre2 = /id: '([a-z0-9_]+)',\s*\n\s*label: '((?:[^'\\]|\\.)*)'/g;
    while ((c = cre2.exec(seg))) {
      if (!choices.some((x) => x.id === c[1])) choices.push({ id: c[1], label: c[2] });
    }
    // choices built by the anyCharChoice() helper carry their id as an argument,
    // so they have no literal `id:` for the regexes above to find
    const cre3 = /anyCharChoice\('([a-z0-9_]+)',\s*(-?\d+)\)/g;
    while ((c = cre3.exec(seg))) {
      if (!choices.some((x) => x.id === c[1])) {
        choices.push({ id: c[1], label: `Apply +${c[2]} to one characteristic` });
      }
    }
    out.push({ id: starts[k].id, name: starts[k].name, choices, seg });
  }
  return out;
}

const steps = {};
for (const [step, arr] of Object.entries(ARRAYS)) steps[step] = parseEntries(sliceArray(arr));

// the worked example
const preset = {
  name: 'Magos Linus-Theta 7',
  home: 'forge', birthright: 'savant', lure: 'renegade',
  trials: 'calamity', motivation: 'endurance', career: 'explorator',
  choices: {
    fw_purpose: 'Intelligence',
    sv_a: 'Logic as a trained Basic Skill',
    sv_b: '+3 Intelligence',
    rn: 'Free-thinker (+3 Int)',
    cl: 'Hardy'
  }
};

const CHARS = [
  ['Weapon Skill', 'ws', 31], ['Ballistic Skill', 'bs', 28], ['Strength', 's', 30],
  ['Toughness', 't', 35], ['Agility', 'ag', 29], ['Intelligence', 'int', 42],
  ['Perception', 'per', 33], ['Willpower', 'wp', 30], ['Fellowship', 'fel', 27]
];

// 2d10+25 cannot fall outside this, so an example that does would teach the
// wrong thing to whoever fills the template in
const ROLL_MIN = 27, ROLL_MAX = 45;

const q = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const rows = [];
const row = (a, b, c) => rows.push([q(a), q(b), q(c)].join(','));

row('Field', 'Value', 'Notes / accepted values');
row('#', '', 'Rows beginning # are ignored on import. One tab per character.');

row('# — IDENTITY —', '', '');
row('Name', preset.name, 'Free text.');
row('Portrait URL', '', 'Optional. Direct link to an image, or leave blank.');

row('# — ORIGIN PATH —', '', 'Must match one of the listed values exactly.');
for (const step of Object.keys(ARRAYS)) {
  const chosen = steps[step].find((e) => e.id === preset[step]);
  row(STEP_LABEL[step], chosen ? chosen.name : '', steps[step].map((e) => e.name).join(' | '));
}

row('# — ORIGIN PATH CHOICES —', '', 'Only those belonging to the picks above apply. Leave the rest blank.');
const seen = new Set();
for (const step of Object.keys(ARRAYS)) {
  for (const entry of steps[step]) {
    for (const ch of entry.choices) {
      if (seen.has(ch.id)) continue;
      seen.add(ch.id);
      row(`${entry.name}: ${ch.label}`, preset.choices[ch.id] ?? '', `choice id: ${ch.id}`);
    }
  }
}

row('# — CHARACTERISTICS —', '', 'The 2d10+25 roll BEFORE origin modifiers. The app applies those itself.');
for (const [label, , val] of CHARS) {
  if (val < ROLL_MIN || val > ROLL_MAX) throw new Error(`${label} example ${val} is not a possible 2d10+25 roll`);
  row(label, val, `${ROLL_MIN}-${ROLL_MAX} from 2d10+25. Blank leaves the sheet unrolled.`);
}

row('# — DERIVED ROLLS —', '', '');
row('Wound roll', 3, 'The 1d5 (+0/1/2) your Home World calls for. Wounds = 2 x Toughness Bonus + this + origin bonuses.');
row('Fate roll', 2, '1d10, read against your Home World fate table.');

row('# — IN PLAY —', '', 'Leave blank for a fresh character.');
row('Damage taken', 4, 'Wounds lost so far. Current wounds = max - this.');
row('Wound bonus', 1, 'Extra maximum wounds from advances (Sound Constitution, level-ups).');

row('# — PROGRESSION —', '', 'Rank is derived from XP, not entered: 0-6,999 is Rank 1, 7,000-9,999 Rank 2, and so on.');
row('XP total', 5000, 'A starting Explorer is built on 4,500-5,000 XP.');
row('Psy rating', '', 'Blank or 0 for a non-psyker. 3 unlocks a second discipline.');
row('Psychic disciplines', '', DISCIPLINES.map((d) => d.name).join(' | '));
row('Psychic powers', '', 'Semicolon separated, e.g. ' + [DISCIPLINES[0].basic, DISCIPLINES[3].techniques[0]].join('; '));

row('# — GAINED AFTER CREATION —', '', 'Semicolon separated. Origin-path entries come across automatically; list only additions.');
row('Extra skills', 'Barter (Fel)', 'e.g. Awareness (Per); Dodge (Ag)');
row('Extra talents', 'Nerves of Steel', 'e.g. Quick Draw; Sound Constitution');
row('Extra traits', '', 'Free text. Use "Name: effect" so the sheet can explain it.');
row('Extra gear', 'best power sword', 'Craftsmanship prefixes work: poor / common / good / best.');
row('Dropped gear', '', 'Issued kit that has been lost, sold or spent.');
row('Notes', 'Owes the Navigator a favour', 'Anything to resolve at the table.');

fs.writeFileSync('character-template.csv', rows.join('\n') + '\n');
console.log('wrote character-template.csv — %d rows', rows.length);
console.log('choice ids captured: %d', seen.size);
for (const step of Object.keys(ARRAYS)) {
  console.log('  %-11s %d options', step, steps[step].length);
}
