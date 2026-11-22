const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSlots } = require('../score/ocr');
const { parseAliases, scoreSlots } = require('../score/scoring');

const FIXTURE = path.join(__dirname, 'fixtures', 'party.png');
const ROSTER = ['Nova', 'Edllexy', 'shytnik', 'G1DraponKa'];

test('sample screenshot reads the party and applies a substitute', async () => {
  const slots = await extractSlots(FIXTURE);
  const result = scoreSlots(slots, parseAliases('Edllexy - Ma3dai'), ROSTER);
  assert.deepEqual(result.onScreen, ['Nova', 'Edllexy', 'shytnik', 'G1DraponKa']);
  assert.deepEqual(result.credited, ['Nova', 'Ma3dai', 'shytnik', 'G1DraponKa']);
});
