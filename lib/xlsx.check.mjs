// Self-check for the xlsx reader. Run: node lib/xlsx.check.mjs
//
// The zip half is exercised in production by /api/sheet?tabs=1; what is checked
// here is the XML half, which is where a sparse sheet or a shared string can
// quietly shift a value into the wrong column.
import assert from 'node:assert/strict';
import {
  parseSharedStrings, parseSheetXml, colToIndex, unescapeXml, toCsv
} from './xlsx.js';

/* ---- columns ---- */

assert.equal(colToIndex('A'), 1);
assert.equal(colToIndex('B'), 2);
assert.equal(colToIndex('Z'), 26);
assert.equal(colToIndex('AA'), 27);
assert.equal(colToIndex('BC'), 55);

/* ---- entities ---- */

assert.equal(unescapeXml('a &amp; b'), 'a & b');
assert.equal(unescapeXml('&lt;tag&gt;'), '<tag>');
assert.equal(unescapeXml('&quot;q&quot; &apos;a&apos;'), '"q" \'a\'');
assert.equal(unescapeXml('&#8212;'), '—');          // em dash, used in the section markers
assert.equal(unescapeXml('&#x2014;'), '—');
// &amp; is expanded last, so an escaped entity survives as text
assert.equal(unescapeXml('&amp;lt;'), '&lt;');

/* ---- shared strings, including rich-text runs ---- */

const shared = parseSharedStrings(
  '<sst><si><t>Name</t></si>'
  + '<si><t xml:space="preserve">Home World</t></si>'
  + '<si><r><t>Forge</t></r><r><t> World</t></r></si>'   // split across runs
  + '<si><t>a &amp; b</t></si></sst>'
);
assert.deepEqual(shared, ['Name', 'Home World', 'Forge World', 'a & b']);

/* ---- a sparse sheet keeps its columns ---- */
{
  // Row 2 has no B cell at all, and row 3 skips straight to C. Reading cells in
  // document order would pull those values left into column A.
  const xml = '<sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2" t="inlineStr"><is><t># — IDENTITY —</t></is></c></row>'
    + '<row r="3"><c r="C3" t="inlineStr"><is><t>third column</t></is></c></row>'
    + '<row r="4"><c r="A4" t="inlineStr"><is><t>Toughness</t></is></c>'
    + '<c r="B4"><v>34</v></c></row>'
    + '</sheetData>';
  const rows = parseSheetXml(xml, shared);

  assert.deepEqual(rows[0], ['Name', 'Home World']);
  assert.deepEqual(rows[1], ['# — IDENTITY —']);
  assert.deepEqual(rows[2], ['', '', 'third column']);
  assert.deepEqual(rows[3], ['Toughness', '34']);   // numbers come back as text
}

/* ---- Google writes whole numbers as "28.0" ---- */
{
  // Left as "28.0", a parser that strips non-digits reads 280 — which is
  // exactly how every imported characteristic came out ten times too large.
  const rows = parseSheetXml(
    '<sheetData>'
    + '<row r="1"><c r="A1" t="inlineStr"><is><t>Weapon Skill</t></is></c>'
    + '<c r="B1"><v>28.0</v></c></row>'
    + '<row r="2"><c r="A2" t="inlineStr"><is><t>Half</t></is></c>'
    + '<c r="B2"><v>28.5</v></c></row>'
    + '<row r="3"><c r="A3" t="inlineStr"><is><t>Negative</t></is></c>'
    + '<c r="B3"><v>-5.0</v></c></row>'
    + '<row r="4"><c r="A4" t="inlineStr"><is><t>Text that looks numeric</t></is></c>'
    + '<c r="B4" t="inlineStr"><is><t>5,000 XP</t></is></c></row>'
    + '</sheetData>'
  );
  assert.deepEqual(rows[0], ['Weapon Skill', '28']);
  assert.deepEqual(rows[1], ['Half', '28.5']);      // a real decimal is kept
  assert.deepEqual(rows[2], ['Negative', '-5']);
  assert.deepEqual(rows[3], ['Text that looks numeric', '5,000 XP']);  // text untouched
}

/* ---- gaps between rows are preserved ---- */
{
  const rows = parseSheetXml(
    '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>one</t></is></c></row>'
    + '<row r="4"><c r="A4" t="inlineStr"><is><t>four</t></is></c></row></sheetData>'
  );
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], ['one']);
  assert.deepEqual(rows[1], []);
  assert.deepEqual(rows[2], []);
  assert.deepEqual(rows[3], ['four']);
}

/* ---- Google's trailing padding is dropped ---- */
{
  // An exported sheet is padded out to 1000 rows; those are not data.
  let xml = '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>only</t></is></c></row>';
  for (let r = 2; r <= 1000; r++) xml += `<row r="${r}"><c r="A${r}"/></row>`;
  xml += '</sheetData>';
  const rows = parseSheetXml(xml);
  assert.equal(rows.length, 1, 'padding rows are trimmed');
  assert.deepEqual(rows[0], ['only']);
}

/* ---- self-closing and empty cells ---- */
{
  const rows = parseSheetXml(
    '<sheetData><row r="1"><c r="A1"/><c r="B1" t="inlineStr"><is><t>b</t></is></c></row></sheetData>'
  );
  assert.deepEqual(rows[0], ['', 'b']);
  assert.deepEqual(parseSheetXml(''), []);
  assert.deepEqual(parseSheetXml(null), []);
}

/* ---- a shared-string index with no entry does not become "undefined" ---- */
{
  // second cell present so the row is not trimmed as trailing padding
  const rows = parseSheetXml(
    '<sheetData><row r="1"><c r="A1" t="s"><v>99</v></c>'
    + '<c r="B1" t="inlineStr"><is><t>kept</t></is></c></row></sheetData>', shared
  );
  assert.deepEqual(rows[0], ['', 'kept']);
}

/* ---- CSV ---- */

assert.equal(toCsv([['a', 'b'], ['c', 'd']]), 'a,b\r\nc,d');
// the delimiter inside a value must survive the round trip
assert.equal(toCsv([['Common Lore (Imperium, Underworld)']]),
  '"Common Lore (Imperium, Underworld)"');
assert.equal(toCsv([['say "hi"']]), '"say ""hi"""');
assert.equal(toCsv([['two\nlines']]), '"two\nlines"');
assert.equal(toCsv([['', 'b']]), ',b');
assert.equal(toCsv([]), '');

/* ---- a sheet survives the trip out to CSV and back ---- */
{
  const { parseCsv } = await import('../src/sheet.js');
  const rows = parseSheetXml(
    '<sheetData>'
    + '<row r="1"><c r="A1" t="inlineStr"><is><t>Skills</t></is></c>'
    + '<c r="B1" t="inlineStr"><is><t>Common Lore (Imperium, Underworld), Literacy</t></is></c></row>'
    + '</sheetData>'
  );
  const back = parseCsv(toCsv(rows));
  assert.deepEqual(back[0], ['Skills', 'Common Lore (Imperium, Underworld), Literacy']);
}

console.log('xlsx: all checks passed');
