const test = require('node:test');
const assert = require('node:assert/strict');
const { replyText } = require('../score/handle');

test('the reply ends with how many people were credited', () => {
  const text = replyText({
    credited: ['Nova', 'Edllexy', 'SlaveOfNova', 'G1DraponKa', 'Hades', 'Akita', 'Bookmaker'],
    replacements: [['L2026', 'Hades'], ['shytnik', 'Bookmaker']],
    missed: [],
    ignored: [],
  });
  assert.match(text, /Замены: L2026 → Hades, shytnik → Bookmaker/);
  assert.match(text, /Всего людей: 7$/);
});
