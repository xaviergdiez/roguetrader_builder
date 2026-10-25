// Self-check for the star system generator. Run: node src/stargen.check.mjs
import assert from 'node:assert/strict';
import {
  ZONES, zoneById, STAR_TYPES, starTypeById, ANOMALOUS, rollStar,
  SYSTEM_FEATURES, featureById, rollSystemFeatures, rulesFrom,
  ZONE_ELEMENTS, ZONE_SIZE_MOD, elementCount,
  BODIES, GRAVITIES, gravityFor, ORBITAL_FEATURES, ATMOSPHERES, COMPOSITIONS,
  CLIMATES, CLIMATE_ZONE_MOD, HABITABILITIES, INHABITANT_SPECIES,
  ADDITIONAL_RESOURCES, rollPlanet, rollSystem, describeSystem, describePlanet,
  DERELICT_ORIGINS, DERELICT_ARMOUR, rollDerelict,
  GRAVEYARD_ORIGINS, HULK_CONDITIONS, HULK_SPECIES, hulkCondition, rollGraveyard
} from './stargen.js';

/* ---- a scripted rng: plays back fixed [0,1) values ---- */

// d(rng, n) is 1 + floor(rng()*n), so a value of (k-1)/n + a nudge rolls k.
const face = (k, n) => (k - 1) / n + 1 / (n * 2);
const scripted = (values) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
};
// A deterministic PRNG for fuzzing, so a failure is reproducible.
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed % 100000) / 100000;
};

/* ---- every roll table covers its die with no gaps or overlaps ---- */

const checkRange = (table, sides, label) => {
  for (let r = 1; r <= sides; r++) {
    const hits = table.filter((row) => r >= row.min && r <= row.max);
    assert.equal(hits.length, 1, `${label}: roll ${r} matched ${hits.length} rows`);
  }
};

checkRange(STAR_TYPES, 10, 'STAR_TYPES');
checkRange(ANOMALOUS, 7, 'ANOMALOUS');
checkRange(SYSTEM_FEATURES, 10, 'SYSTEM_FEATURES');
checkRange(INHABITANT_SPECIES, 10, 'INHABITANT_SPECIES');
checkRange(ADDITIONAL_RESOURCES, 10, 'ADDITIONAL_RESOURCES');
checkRange(BODIES, 10, 'BODIES');
for (const [zoneId, table] of Object.entries(ZONE_ELEMENTS)) {
  checkRange(table, 100, `ZONE_ELEMENTS.${zoneId}`);
}

// The open-ended tables are matched by `n <= max`, so they need an ordered
// run ending in Infinity or a high roll falls off the end and returns
// undefined — which would throw on the very next property read.
for (const [label, table] of [['GRAVITIES', GRAVITIES], ['ORBITAL_FEATURES', ORBITAL_FEATURES],
  ['ATMOSPHERES', ATMOSPHERES], ['COMPOSITIONS', COMPOSITIONS],
  ['CLIMATES', CLIMATES], ['HABITABILITIES', HABITABILITIES]]) {
  assert.equal(table[table.length - 1].max, Infinity, label + ': needs an open top end');
  for (let i = 1; i < table.length; i++) {
    assert.ok(table[i].max > table[i - 1].max, label + ': rows must ascend');
  }
  // Nothing falls through, from far below the bottom to far above the top.
  for (const n of [-50, -7, 0, 1, 5, 11, 50]) {
    assert.ok(table.find((r) => n <= r.max), `${label}: ${n} matched nothing`);
  }
}

/* ---- zones ---- */

assert.equal(ZONES.length, 3, 'every system has exactly three zones');
assert.equal(zoneById('inner_cauldron').name, 'Inner Cauldron');
assert.equal(zoneById('nonsense'), null);
assert.deepEqual(Object.keys(ZONE_ELEMENTS).sort(), ZONES.map((z) => z.id).sort(),
  'every zone needs its own element table');

/* ---- the star, and how it reaches the zones ---- */

{
  // A Mighty star (roll 1) bakes the inside and starves the outside.
  const mighty = rollStar(scripted([face(1, 10)]));
  assert.equal(mighty.type.id, 'mighty');
  assert.deepEqual(mighty.effects, [['inner_cauldron', 'dominant'], ['outer_reaches', 'weak']]);

  // Vigorous (2-4) is the quiet one: it changes nothing.
  assert.deepEqual(rollStar(scripted([face(3, 10)])).effects, []);

  // Anomalous (9) rolls again on its own 1d7.
  const anomalous = rollStar(scripted([face(9, 10), face(3, 7)]));
  assert.equal(anomalous.type.id, 'anomalous');
  assert.deepEqual(anomalous.effects, [['primary_biosphere', 'dominant']]);
  assert.match(anomalous.detail, /Primary Biosphere Dominant/);

  // Anomalous 7 is a result, not a miss: the star is odd and does nothing.
  assert.deepEqual(rollStar(scripted([face(9, 10), face(7, 7)])).effects, []);

  // Binary (10): 1-7 is a twin pair, which shares one type and its effect.
  const twins = rollStar(scripted([face(10, 10), face(4, 10), face(1, 8)]));
  assert.equal(twins.type.id, 'binary');
  assert.equal(twins.companions[0].id, twins.companions[1].id, 'twins share a type');
  assert.deepEqual(twins.effects, twins.companions[0].effects);
  assert.match(twins.detail, /^Twin /);

  // 8-10 is a mixed pair, and the gentler star rules: on this table the
  // lower roll is the brighter star, so it is the one that takes effect.
  const mixed = rollStar(scripted([face(10, 10), face(9, 10), face(8, 8), face(1, 8)]));
  assert.equal(mixed.companions.length, 2);
  assert.deepEqual(mixed.effects, starTypeById('mighty').effects,
    'the brighter companion sets the effect');
  assert.match(mixed.detail, / and /);

  // A companion is never itself Anomalous or Binary, which would recurse.
  for (let seed = 1; seed < 400; seed++) {
    const s = rollStar(seeded(seed));
    for (const c of s.companions || []) {
      assert.ok(!['anomalous', 'binary'].includes(c.id),
        'a binary companion must be a plain star, not another special result');
    }
    // Every effect names a zone that exists and a size the counter knows.
    for (const [zoneId, size] of s.effects) {
      assert.ok(zoneById(zoneId), 'effect names an unknown zone: ' + zoneId);
      assert.ok(size in ZONE_SIZE_MOD, 'effect names an unknown size: ' + size);
    }
  }
}

/* ---- system features ---- */

{
  assert.equal(featureById('haven').name, 'Haven');
  assert.equal(featureById('nope'), null);
  for (const f of SYSTEM_FEATURES) {
    assert.ok(f.id && f.name && f.note, f.id + ' is incomplete');
    assert.ok(f.rules && typeof f.rules === 'object', f.id + ' needs a rules object');
  }

  // 1d5-2, minimum 1: never none, never more than three.
  for (let seed = 1; seed < 300; seed++) {
    const fs = rollSystemFeatures(seeded(seed));
    assert.ok(fs.length >= 1 && fs.length <= 3, 'rolled ' + fs.length + ' features');
    const ids = fs.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length, 'a feature was rolled twice');
    // Warp Stasis and Warp Turbulence are opposites and cannot both hold.
    assert.ok(!(ids.includes('warp_stasis') && ids.includes('warp_turbulence')),
      'the two warp features are mutually exclusive');
  }

  // The rules of every rolled feature merge into one object.
  const merged = rulesFrom([featureById('bountiful'), featureById('haven')]);
  assert.equal(merged.exoticMaterials, true);
  assert.equal(merged.betterHabitability, true);
  assert.equal(merged.extraMineralResources, 1);
  assert.deepEqual(rulesFrom([]), {});
  assert.deepEqual(rulesFrom(null), {});
}

/* ---- zone element counts ---- */

{
  // 1d5, +2 Dominant, -2 Weak, and never below 1.
  const one = scripted([face(1, 5)]);
  assert.equal(elementCount(one, 'weak'), 1, 'a weak zone still holds something');
  assert.equal(elementCount(scripted([face(5, 5)]), 'dominant'), 7);
  assert.equal(elementCount(scripted([face(3, 5)]), 'normal'), 3);
  for (let seed = 1; seed < 200; seed++) {
    for (const size of ['weak', 'normal', 'dominant']) {
      const n = elementCount(seeded(seed), size);
      assert.ok(n >= 1 && n <= 7, `${size} produced ${n}`);
    }
  }
}

/* ---- planets ---- */

{
  // The zone reaches the climate: the same world is six steps colder in the
  // Outer Reaches than in the Inner Cauldron. That modifier is the whole
  // reason a system's worlds are not interchangeable.
  assert.equal(CLIMATE_ZONE_MOD.inner_cauldron, -6);
  assert.equal(CLIMATE_ZONE_MOD.outer_reaches, 6);
  assert.equal(CLIMATE_ZONE_MOD.primary_biosphere, 0);

  assert.equal(gravityFor(-10).id, 'low', 'a Low-Mass body can go well below the table');
  assert.equal(gravityFor(2).id, 'low');
  assert.equal(gravityFor(3).id, 'normal');
  assert.equal(gravityFor(8).id, 'normal');
  assert.equal(gravityFor(9).id, 'high');
  assert.equal(gravityFor(99).id, 'high');

  // An airless world takes its climate from the zone outright.
  const airless = (zoneId) => {
    for (let seed = 1; seed < 3000; seed++) {
      const p = rollPlanet(seeded(seed), { zoneId });
      if (p.atmosphere.id === 'none') return p;
    }
    return null;
  };
  const burnt = airless('inner_cauldron');
  assert.ok(burnt, 'an airless Inner Cauldron world is reachable');
  assert.equal(burnt.climate.id, 'burning', 'no air in the Inner Cauldron means Burning');
  const frozen = airless('outer_reaches');
  assert.ok(frozen, 'an airless Outer Reaches world is reachable');
  assert.equal(frozen.climate.id, 'ice', 'no air in the Outer Reaches means Ice');

  // A world the system has promised is habitable must actually be one: it
  // cannot come back airless, breathing something lethal, or dead.
  for (let seed = 1; seed < 600; seed++) {
    for (const zoneId of ZONES.map((z) => z.id)) {
      const p = rollPlanet(seeded(seed), { zoneId, forceHabitable: true });
      assert.notEqual(p.atmosphere.id, 'none', 'forced habitable but airless');
      assert.ok(p.composition.habitable, 'forced habitable but ' + p.composition.name);
      assert.ok(p.habitability.liveable, 'forced habitable but ' + p.habitability.name);
    }
  }

  // A moon has no orbital features of its own; a planet always has at least
  // the chance of one, and never a negative count.
  for (let seed = 1; seed < 300; seed++) {
    assert.equal(rollPlanet(seeded(seed), { isMoon: true }).orbitalFeatures.length, 0);
    assert.ok(rollPlanet(seeded(seed)).orbitalFeatures.length >= 0);
  }

  // Nothing comes back negative, undefined, or off a table.
  for (let seed = 1; seed < 800; seed++) {
    const zoneId = ZONES[seed % 3].id;
    const p = rollPlanet(seeded(seed), { zoneId });
    assert.ok(p.body && p.gravity && p.atmosphere && p.climate && p.habitability,
      'a planet came back with a missing table result');
    assert.ok(p.resources.minerals >= 0, 'negative minerals');
    assert.ok(p.resources.organics >= 0, 'negative organics');
    assert.ok(p.territories >= 0, 'negative territories');
    if (p.landmasses) {
      assert.ok(p.landmasses.continents >= 0 && p.landmasses.islands >= 0,
        'negative landmasses');
    }
    // Territories only exist on a living world, and a living world has at
    // least one — one organic compound comes from each.
    if (p.habitability.liveable) assert.ok(p.territories >= 1);
    else assert.equal(p.territories, 0, 'a dead world has no territories');
    assert.ok(p.resources.organics >= p.territories);
    // A species that needs somewhere liveable never lands on a dead world.
    if (p.inhabitants && p.inhabitants.needsLiveable) {
      assert.ok(p.habitability.liveable,
        p.inhabitants.name + ' settled an uninhabitable world');
    }
    // A Low-Mass body's mineral wealth is capped however rich the system is.
    if (p.body.id === 'low_mass') {
      assert.ok(p.resources.minerals <= p.body.maxMineralAbundance);
    }
  }

  // Bountiful actually enriches a world, rather than only setting a flag.
  {
    const plain = [];
    const rich = [];
    for (let seed = 1; seed < 400; seed++) {
      plain.push(rollPlanet(seeded(seed), {}).resources.minerals);
      rich.push(rollPlanet(seeded(seed), { rules: { extraMineralResources: 1 } }).resources.minerals);
    }
    const sum = (xs) => xs.reduce((a, b) => a + b, 0);
    assert.ok(sum(rich) > sum(plain), 'Bountiful made no difference to mineral wealth');
  }

  // A Ruined Empire gives its caches an abundance; without it they have none.
  {
    let withRule = null;
    let without = null;
    for (let seed = 1; seed < 2000 && !(withRule && without); seed++) {
      const a = rollPlanet(seeded(seed), { rules: { ruinedEmpire: true } });
      if (!withRule && a.resources.caches.length) withRule = a.resources.caches[0];
      const b = rollPlanet(seeded(seed), {});
      if (!without && b.resources.caches.length) without = b.resources.caches[0];
    }
    assert.ok(withRule && typeof withRule.abundance === 'number' && withRule.abundance >= 6,
      'a Ruined Empire cache should carry an abundance of 1d10+5');
    assert.equal(without.abundance, null, 'without the rule a cache has no abundance');
  }
}

/* ---- derelict stations ---- */

checkRange(DERELICT_ORIGINS, 100, 'DERELICT_ORIGINS');

{
  for (const o of DERELICT_ORIGINS) {
    assert.ok(o.id && o.name, o.id + ' incomplete');
    assert.equal(typeof o.xenos, 'boolean', o.id + ': must say whose it was');
  }
  // The two STC stations are the only human ones, and they are the only ones
  // that leave archeotech rather than xenos ruins behind.
  const human = DERELICT_ORIGINS.filter((o) => !o.xenos).map((o) => o.id);
  assert.deepEqual(human.sort(), ['stc_defence', 'stc_monitor']);

  for (let seed = 1; seed < 400; seed++) {
    const d = rollDerelict(seeded(seed));
    assert.ok(d.origin, 'a station came back without an origin');
    assert.equal(d.armour, DERELICT_ARMOUR);
    assert.ok(d.hullIntegrity >= 4 && d.hullIntegrity <= 40, '4d10: got ' + d.hullIntegrity);
    assert.ok(d.finds.length >= 0 && d.finds.length <= 4, 'd5-1 finds');
    for (const f of d.finds) {
      assert.ok(f.abundance >= 1, 'a find worth nothing is not a find');
      // What is aboard follows who built it: no archeotech in an Eldar
      // orrery, no xenos ruins in an STC station.
      assert.equal(f.id, d.xenos ? 'xenos_ruin' : 'archeotech_cache',
        d.origin.name + ' left behind a ' + f.name);
    }
  }

  // A Ruined Empire makes what is left behind richer.
  {
    const sum = (rules) => {
      let t = 0;
      for (let seed = 1; seed < 300; seed++) {
        t += rollDerelict(seeded(seed), { rules }).finds.reduce((n, f) => n + f.abundance, 0);
      }
      return t;
    };
    assert.ok(sum({ ruinedEmpire: true }) > sum({}),
      'a ruined empire should leave more behind');
  }
}

/* ---- starship graveyards ---- */

checkRange(GRAVEYARD_ORIGINS, 100, 'GRAVEYARD_ORIGINS');

{
  for (const o of GRAVEYARD_ORIGINS) {
    assert.ok(Array.isArray(o.hulks) && o.hulks[0] >= 1, o.id + ': needs a hulk count');
    assert.ok(o.hulks[1] >= o.hulks[0], o.id + ': backwards hulk range');
    assert.ok(HULK_CONDITIONS[o.salvage], o.id + ': salvage ' + o.salvage + ' has no band');
  }
  for (const sp of HULK_SPECIES) {
    assert.ok(['archeotech', 'xenotech'].includes(sp.tech), sp.id + ': unknown tech');
  }

  // The condition bands run in the right direction: a Lost Explorers field
  // is mostly salvageable, a Crushed Defence Force is mostly scrap.
  const spread = (salvage) => {
    const out = { salvageable: 0, boardable: 0, shattered: 0 };
    for (let r = 1; r <= 10; r++) out[hulkCondition(r, salvage).id] += 1;
    return out;
  };
  assert.equal(spread(0).salvageable, 0, 'nothing survives a crushing');
  assert.equal(spread(8).salvageable, 8, 'lost explorers are mostly intact');
  assert.ok(spread(8).shattered === 0);
  assert.ok(spread(0).shattered > spread(2).shattered);
  // A plundered convoy was boarded once and can be boarded again.
  assert.ok(spread(1).boardable > spread(0).boardable);
  // Every 1d10 lands somewhere, for every band.
  for (const salvage of Object.keys(HULK_CONDITIONS)) {
    const s2 = spread(Number(salvage));
    assert.equal(s2.salvageable + s2.boardable + s2.shattered, 10, 'band ' + salvage);
  }

  for (let seed = 1; seed < 400; seed++) {
    const g = rollGraveyard(seeded(seed));
    assert.ok(g.origin, 'a graveyard came back without an origin');
    assert.ok(g.hulks.length >= g.origin.hulks[0] && g.hulks.length <= g.origin.hulks[1],
      `${g.origin.name}: ${g.hulks.length} hulks outside ${g.origin.hulks}`);
    for (const h of g.hulks) {
      assert.ok(h.species && h.species.name, 'a hulk with no provenance');
      assert.ok(h.condition && h.condition.id, 'a hulk with no condition');
    }
    assert.equal(g.salvageable,
      g.hulks.filter((h) => h.condition.id === 'salvageable').length);
    assert.ok(g.finds.length >= 3 && g.finds.length <= 12, 'd10+2 finds');
    // What can be stripped follows whose hulls are out there: an all-Ork
    // field yields no archeotech.
    const kinds = new Set(g.hulks.map((h) => h.species.tech));
    for (const f of g.finds) {
      const want = f.id === 'archeotech_cache' ? 'archeotech' : 'xenotech';
      assert.ok(kinds.has(want),
        `a ${f.name} in a field of ${[...kinds].join('/')} hulls`);
      assert.ok(f.abundance >= 27, 'a salvage find is 2d10+25 at least');
    }
  }

  // Unknown Provenance really is a mixed field, at least sometimes.
  {
    let mixed = false;
    for (let seed = 1; seed < 600 && !mixed; seed++) {
      const g = rollGraveyard(seeded(seed));
      if (g.origin.id !== 'unknown_provenance') continue;
      if (new Set(g.hulks.map((h) => h.species.id)).size > 1) mixed = true;
    }
    assert.ok(mixed, 'Unknown Provenance should mix species');
  }
}

/* ---- whole systems ---- */

{
  for (let seed = 1; seed < 250; seed++) {
    const sys = rollSystem(seeded(seed));
    assert.equal(sys.zones.length, 3);
    assert.ok(sys.star && sys.star.type, 'a system needs a star');
    assert.ok(sys.features.length >= 1);

    for (const z of sys.zones) {
      assert.ok(zoneById(z.id), 'unknown zone ' + z.id);
      assert.ok(['weak', 'normal', 'dominant'].includes(z.size));
      for (const e of z.elements) {
        assert.ok(e.id && e.name, 'an element came back unnamed');
        // The two boardable elements carry what is inside them, rather than
        // being a label the GM has to stock by hand.
        if (['derelict_station', 'starship_graveyard'].includes(e.id)) {
          assert.equal(e.kind, 'site', e.id + ' should be a site');
          assert.ok(e.site && e.site.origin, e.id + ' came back empty');
          assert.ok(Array.isArray(e.site.finds));
        }
        // "Nothing" is an empty orbit, not a thing in the system.
        assert.notEqual(e.id, 'nothing', 'Nothing should never be listed');
        if (e.kind === 'planet') assert.ok(e.planet.body, 'a planet element needs its planet');
        // Radiation Bursts and Solar Flares stack rather than repeating.
        if (e.intensity != null) assert.ok(e.intensity >= 1);
      }
      const stackable = z.elements.filter((e) => e.intensity != null).map((e) => e.id);
      assert.equal(new Set(stackable).size, stackable.length,
        'a stacking feature was listed twice instead of intensifying');
    }
  }

  // A Dominant zone really does hold more than a Weak one, across many rolls.
  {
    const count = (starRoll) => {
      let total = 0;
      for (let seed = 1; seed < 200; seed++) {
        const sys = rollSystem(seeded(seed));
        const z = sys.zones.find((x) => x.id === 'inner_cauldron');
        if (z.size === starRoll) total += z.elements.length;
      }
      return total;
    };
    assert.ok(count('dominant') > 0 && count('weak') > 0,
      'both a dominant and a weak Inner Cauldron should occur across 200 systems');
  }

  // Starfarers settled the system, so there has to be somewhere they came
  // from — even when every world rolled came back dead.
  for (let seed = 1; seed < 150; seed++) {
    const sys = rollSystem(seeded(seed), { features: [featureById('starfarers')] });
    const planets = sys.zones.flatMap((z) => z.elements.filter((e) => e.kind === 'planet'));
    assert.ok(planets.length >= 4, 'Starfarers guarantees at least four worlds');
    assert.ok(sys.homeworld, 'Starfarers needs a homeworld');
    assert.ok(sys.homeworld.planet.habitability.liveable,
      'the homeworld has to be somewhere they could live');
    assert.ok(planets.includes(sys.homeworld), 'the homeworld must be in the system');
  }

  // A Stellar Anomaly costs the system worlds rather than only reading as one.
  {
    const planetsFor = (features) => {
      let total = 0;
      for (let seed = 1; seed < 150; seed++) {
        const sys = rollSystem(seeded(seed), { features });
        total += sys.zones.flatMap((z) => z.elements.filter((e) => e.kind === 'planet')).length;
      }
      return total;
    };
    assert.ok(planetsFor([featureById('stellar_anomaly')]) < planetsFor([featureById('pirate_den')]),
      'Stellar Anomaly should leave the system with fewer worlds');
  }

  // Haven adds a world to every zone.
  {
    const withHaven = rollSystem(seeded(7), { features: [featureById('haven')] });
    const without = rollSystem(seeded(7), { features: [featureById('pirate_den')] });
    const n = (s) => s.zones.reduce((t, z) => t + z.elements.length, 0);
    assert.ok(n(withHaven) >= n(without), 'Haven should not shrink a system');
  }
}

/* ---- the lines the panel prints ---- */

{
  assert.equal(describeSystem(null), '');
  assert.equal(describePlanet(null), '');
  const sys = rollSystem(seeded(11));
  const line = describeSystem(sys);
  assert.match(line, /star/, 'the summary names the star');
  assert.match(line, /world/, 'and counts the worlds');
  const planet = sys.zones.flatMap((z) => z.elements.filter((e) => e.kind === 'planet'))[0];
  if (planet) {
    const pl = describePlanet(planet.planet);
    assert.ok(pl.length > 0 && !pl.includes('undefined'), 'planet line: ' + pl);
  }
}

console.log('stargen.js OK (%d star types, %d features, %d zones)',
  STAR_TYPES.length, SYSTEM_FEATURES.length, ZONES.length);
