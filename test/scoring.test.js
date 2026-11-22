const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAliases, scoreSlots } = require('../score/scoring');

const ROSTER = ['Nova', 'Edllexy', 'shytnik', 'G1DraponKa'];

test('alias sends the point to the player who was actually there', () => {
  const result = scoreSlots(
    [['Nova'], ['Edllexy'], ['shytnik'], ['G1DraponKa']],
    parseAliases('Edllexy - Ma3dai\nпросто текст'),
    ROSTER,
  );
  assert.deepEqual(result.credited, ['Nova', 'Ma3dai', 'shytnik', 'G1DraponKa']);
  assert.deepEqual(result.replacements, [['Edllexy', 'Ma3dai']]);
  assert.deepEqual(result.missed, []);
});

test('an unknown alias does not invent a point', () => {
  const result = scoreSlots([['Nova'], ['shytnik']], parseAliases('Edllexy - Ma3dai'), ROSTER);
  assert.deepEqual(result.credited, ['Nova', 'shytnik']);
  assert.deepEqual(result.missed, ['Edllexy']);
});

const PARTY = ['Nova', 'SlaveOfNova', 'G1DraponKa', 'L2026', 'Akita', 'shytnik', 'Edllexy'];

test('misreads from the party screenshot snap to the roster', () => {
  const result = scoreSlots(
    [
      ['Nova'],
      ['SlavelfMova'],
      ['Gllraponka'],
      ['L026'],
      ['Akita'],
      ['shtnik'],
      ['Edllexy'],
      ['Meowa'],
      ['SlavelfMoa'],
    ],
    [],
    PARTY,
  );
  assert.deepEqual(result.credited, ['Nova', 'SlaveOfNova', 'G1DraponKa', 'L2026', 'Akita', 'shytnik', 'Edllexy']);
  assert.deepEqual(result.ignored, []);
});

test('Nova read as Meowa still gets the point', () => {
  const result = scoreSlots(
    [['Meowa'], ['SlaveOfNova'], ['G1DraponKa'], ['L2026'], ['Akita'], ['shytnik'], ['Edllexy']],
    [],
    PARTY,
  );
  assert.deepEqual(result.credited, ['Nova', 'SlaveOfNova', 'G1DraponKa', 'L2026', 'Akita', 'shytnik', 'Edllexy']);
  assert.deepEqual(result.ignored, []);
});

test('a reading far from every roster name is dropped', () => {
  const result = scoreSlots([['Qwertyuiop']], [], PARTY);
  assert.deepEqual(result.credited, []);
  assert.deepEqual(result.ignored, ['Qwertyuiop']);
});

test('roster keeps the digit the small reading lost', () => {
  const result = scoreSlots(
    [['Nova'], ['Edllexy', 'Edilesc'], ['shytnik'], ['Gibrapenka', 'GlDraponka']],
    [],
    ROSTER,
  );
  assert.deepEqual(result.onScreen, ['Nova', 'Edllexy', 'shytnik', 'G1DraponKa']);
});
