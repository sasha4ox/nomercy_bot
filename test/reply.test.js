const test = require('node:test');
const assert = require('node:assert/strict');
const { replyText } = require('../score/handle');

test('the reply ends with how many people were credited', () => {
  const text = replyText({
    credited: ['Nova', 'Edllexy', 'SlaveOfNova', 'G1DraponKa', 'Hades', 'Akita', 'Bookmaker', 'Happiness'],
    replacements: [['L2026', 'Hades'], ['shytnik', 'Bookmaker']],
    onScreen: ['Nova', 'Edllexy', 'SlaveOfNova', 'G1DraponKa', 'L2026', 'Akita', 'shytnik'],
    missed: [],
    added: ['Happiness'],
    ignored: [],
  });
  assert.match(text, /Замены: L2026 → Hades, shytnik → Bookmaker/);
  assert.match(text, /Дополнительно: Happiness/);
  assert.match(text, /Всего людей: 8$/);
});
