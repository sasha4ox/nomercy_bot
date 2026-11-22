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

test('Nova is read when the target HP bar is almost empty', async () => {
  const slots = await extractSlots(path.join(__dirname, 'fixtures', 'nova-low-hp.png'));
  const roster = ['Nova', 'Akita', 'Edllexy', 'L2026', 'G1DraponKa'];
  const result = scoreSlots(slots, [], roster);
  assert.deepEqual(result.credited, ['Nova', 'Akita', 'Edllexy', 'L2026', 'G1DraponKa']);
});

test('a short mana bar does not swallow the next party row', async () => {
  const slots = await extractSlots(path.join(__dirname, 'fixtures', 'party-tight.png'));
  const roster = ['Nova', 'SlaveOfNova', 'Akita', 'shytnik', 'Edllexy', 'Aleph', 'L2026', 'G1DraponKa', 'Hades'];
  const result = scoreSlots(slots, parseAliases('Akita - Hades'), roster);
  assert.deepEqual(result.credited, ['Nova', 'SlaveOfNova', 'Hades', 'shytnik', 'Edllexy', 'Aleph', 'L2026', 'G1DraponKa']);
});
