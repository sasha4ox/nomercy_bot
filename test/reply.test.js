const test = require('node:test');
const assert = require('node:assert/strict');
const { replyText } = require('../score/handle');

function result(count) {
  return {
    credited: Array.from({ length: count }, (_, index) => `Nick${index}`),
    replacements: [],
    onScreen: Array.from({ length: count }, (_, index) => `Nick${index}`),
    missed: [],
    added: [],
    ignored: [],
  };
}

test('eight people is not a full party', () => {
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
  assert.match(text, /В пачке было: 8\nЭто даже не пачка собралась!$/);
});

test('seven people still only gets the first remark', () => {
  const text = replyText(result(7));
  assert.match(text, /В пачке было: 7\nЭто даже не пачка собралась!$/);
});

test('six people gets both remarks', () => {
  const text = replyText(result(6));
  assert.match(text, /В пачке было: 6\nЭто даже не пачка собралась!\nНу это уже позорище!$/);
});

test('nine people is a full party', () => {
  const text = replyText(result(9));
  assert.match(text, /В пачке было: 9$/);
  assert.doesNotMatch(text, /пачка собралась/);
});
