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

test('roster keeps the digit the small reading lost', () => {
  const result = scoreSlots(
    [['Nova'], ['Edllexy', 'Edilesc'], ['shytnik'], ['Gibrapenka', 'GlDraponka']],
    [],
    ROSTER,
  );
  assert.deepEqual(result.onScreen, ['Nova', 'Edllexy', 'shytnik', 'G1DraponKa']);
});
