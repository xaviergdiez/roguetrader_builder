/* ============================== GLOSSARY ==============================
   Plain-language summaries of Rogue Trader (FFG, 2009) skills and talents,
   written for this builder. They are a table reference, NOT the rulebook's
   own wording — check the core book before ruling on an edge case.
   Traits are not here: the data already stores them as "Name: effect".

   Split into SKILLS and TALENTS rather than one flat map so the "add" picker
   can offer the right catalogue for the tab you are on. */

export const SKILLS = {
  'Awareness': 'Notice what others miss — a hidden figure, a wrong sound, a detail out of place. Basic Skill, so anyone may attempt it.',
  'Barter': 'Haggle. Talk a seller down or a buyer up on the price of goods.',
  'Charm': 'Win people over with warmth, flattery and presence.',
  'Command': 'Give orders that are actually obeyed, and rally those who follow you.',
  'Commerce': 'Read markets, cargo values and trade routes — the working knowledge of a voidfaring merchant. Advanced Skill.',
  'Common Lore': 'The everyday knowledge an insider of a given group or place would have. Advanced Skill, taken once per specialisation.',
  'Concealment': 'Hide yourself or an object from sight.',
  'Deceive': 'Lie well. Pass off a falsehood as truth, or a forgery as genuine.',
  'Dodge': 'Throw yourself clear of an incoming attack or hazard, as a Reaction.',
  'Evaluate': 'Judge what a thing is worth, and whether it is what it claims to be.',
  'Forbidden Lore': 'Knowledge the Imperium would rather you did not hold — xenos, the warp, heresy. Advanced Skill; simply having it can draw the wrong attention.',
  'Inquiry': 'Gather information by asking the right people the right questions.',
  'Intimidate': 'Get compliance through threat, menace or sheer physical presence.',
  'Invocation': 'Channel psychic power through rite and prayer. Advanced Skill.',
  'Literacy': 'Read and write. Advanced Skill — and rarer than outsiders assume; most Imperial citizens are illiterate.',
  'Logic': 'Reason a problem through, run the numbers, and spot what does not add up. Advanced Skill.',
  'Medicae': 'Treat wounds, poison and disease. Advanced Skill.',
  'Navigation': 'Plot a course and hold to it — across a surface, between stars, or through the warp. Advanced Skill.',
  'One Skill of the GM’s choosing': 'A deliberate blank. Agree with your GM which skill this becomes before play.',
  'Pilot': 'Fly or drive a craft or vehicle of the relevant class.',
  'Psyniscience': 'Perceive the warp directly — psychic presences, and where reality has worn thin. Advanced Skill, for psykers.',
  'Scholastic Lore': 'Formal, schooled learning of the sort taught rather than picked up. Advanced Skill.',
  'Secret Tongue': 'A restricted cant used within one organisation, opaque to outsiders. Advanced Skill.',
  'Sleight of Hand': 'Palm, plant, pick and conceal without being seen doing it.',
  'Speak Language': 'Speak and understand a given tongue. Advanced Skill, taken once per language.',
  'Survival': 'Stay alive away from civilisation — forage, shelter, read weather and track.',
  'Tech-Use': 'Operate, repair and appease machines, with the proper rites observed. Advanced Skill.',
  'Trade': 'A practical craft or profession, learned properly. Advanced Skill, taken once per trade.'
};

export const TALENTS = {
  'Air of Authority': 'You carry the assumption of command, and can bend far more ordinary people to your will when you give orders.',
  'Armour of Contempt': 'Practised disdain for the warp and its works hardens you against the corruption such things leave behind.',
  'Basic Weapon Training': 'You are trained with that class of basic weapon, and no longer suffer the heavy penalty for firing it untrained.',
  'Dark Soul': 'Something in you has already turned toward the dark, and it changes how further corruption takes hold.',
  'Decadence': 'A lifetime of excess — you hold your drink and your indulgences far better than you should.',
  'Die Hard': 'You do not go quietly. You resist being put down and keep acting when others would drop.',
  'Enemy': 'A faction actively holds you in contempt. Expect worse treatment and active obstruction whenever they are involved.',
  'Foresight': 'You think before you act, taking time to plan a task rather than committing to it blind.',
  'Hardy': 'You heal as though lightly wounded even when badly hurt.',
  'Heightened Senses': 'One of your senses is unusually sharp, sharpening perception through it.',
  'Jaded': 'You have seen too much. Mundane horrors — corpses, carnage, the everyday brutality of the Imperium — no longer shake you.',
  'Leap Up': 'You get back on your feet fast, standing without it costing you your action.',
  'Light Sleeper': 'You wake instantly and completely, and are never caught truly asleep.',
  'Logis Implant': 'A cogitator woven into your mind, feeding you probabilities and letting you read a situation with machine precision.',
  'Melee Weapon Training': 'You are trained with that class of melee weapon, and no longer suffer the penalty for wielding it untrained.',
  'Navigator': 'You bear the Navigator gene and its third eye, and can read the Astronomican to steer a ship through the warp.',
  'Nerves of Steel': 'You hold together under fire, resisting being pinned down and shrugging off terror that would break others.',
  'Paranoia': 'You assume threat everywhere, and are correspondingly hard to catch unready.',
  'Peer': 'A faction thinks well of you. Dealing with its members goes markedly easier.',
  'Pistol Weapon Training': 'You are trained with that class of pistol, and no longer suffer the penalty for firing it untrained.',
  'Psy Rating 2': 'Your psychic strength, rated. It sets how much power you can safely push through a psychic discipline.',
  'Pure Faith': 'Genuine, unfeigned belief in the Emperor — a shield against the warp that cynics cannot raise.',
  'Quick Draw': 'You bring a weapon to hand fast enough that drawing it costs you nothing.',
  'Resistance': 'You are unusually hard to affect by one particular kind of threat — cold, poison, psychic assault, or similar.',
  'Rival': 'Someone with standing wants you to fail, and will spend effort to see it happen.',
  'Sound Constitution': 'You are simply harder to kill. Each time you take this, you gain another Wound.',
  'Talented': 'One skill is a natural gift, and you perform it markedly better than your training alone would explain.',
  'Technical Knock': 'You can clear a jammed weapon with a well-placed strike, in the time it takes to swing.',
  'Thrown Weapon Training': 'You are trained with that class of thrown weapon, and no longer suffer the penalty for using it untrained.',
  'Unremarkable': 'Nothing about you sticks in the memory. Witnesses struggle to describe you and crowds swallow you whole.',
  'Unshakeable Faith': 'Your belief holds where reason fails, letting you face the warp and its servants without breaking.',
  'Weapon Training': 'You are trained with the named weapon class, and no longer suffer the penalty for using it untrained.'
};

// Reached as a bare trait with no inline text of its own.
export const MISC = {
  'Mechanicus Implants': 'The standard augmetics of the Machine Cult — the potentia coil and its attendant implants that mark you as more machine than most.'
};

export const GLOSSARY = { ...SKILLS, ...TALENTS, ...MISC };

export const CHAR_GROUP = {
  ws: 'phys', s: 'phys', t: 'phys', ag: 'phys',
  bs: 'mind', int: 'mind', per: 'mind', wp: 'mind', fel: 'mind'
};
export const charGroup = (k) => CHAR_GROUP[String(k || '').toLowerCase()] || null;

export const CHAR_TAG = /\s*\((WS|BS|S|T|Ag|Int|Per|WP|Fel)\)\s*$/;

/* Splits a list entry into something explainable.
   "Caves of Steel: Tech-Use counts as a Basic Skill." -> title + its own body
   "Common Lore (Machine Cult, Tech) (Int)" -> Common Lore, spec, Int
   Returns body:null when nothing is known, so the caller can render it flat. */
export function explainEntry(entry) {
  const colon = entry.indexOf(': ');
  if (colon > 0) {
    return { title: entry.slice(0, colon), body: entry.slice(colon + 2), char: null, spec: null };
  }
  const charMatch = entry.match(CHAR_TAG);
  const stripped = entry.replace(CHAR_TAG, '').trim();
  const paren = stripped.match(/^([^(]+)\((.*)\)$/);
  const baseName = (paren ? paren[1] : stripped).trim();
  return {
    title: stripped,
    body: GLOSSARY[baseName] || null,
    char: charMatch ? charMatch[1] : null,
    spec: paren ? paren[2].trim() : null
  };
}
