const { extractSlots } = require('./ocr');
const { parseCaption, scoreSlots } = require('./scoring');
const sheets = require('./sheets');

async function scoreScreenshot(message) {
  const images = [...message.attachments.values()].filter(isImage);
  const caption = parseCaption(message.content);
  if (!images.length && !caption.extras.length) return;
  if (!sheets.configured()) {
    const seen = images.length ? 'Скрин вижу' : 'Список вижу';
    await reply(message, `${seen}, но в переменных нет таблицы или ключа Google.`);
    return;
  }

  const slots = [];
  for (const attachment of images) {
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error(`Не скачал скрин (${response.status})`);
    slots.push(...await extractSlots(Buffer.from(await response.arrayBuffer())));
  }
  const book = await sheets.openScoreSheet();
  const roster = await sheets.rosterNames(book.roster);
  const result = scoreSlots(slots, caption.aliases, roster, caption.extras);
  if (!result.credited.length) {
    await reply(message, 'Не разобрал ники на скрине.');
    return;
  }
  const wrote = await sheets.record(book, {
    when: timestamp(),
    messageId: message.id,
    author: message.member?.displayName || message.author.username,
    onScreen: result.onScreen,
    credited: result.credited,
    note: note(result),
    link: message.url,
  });
  if (wrote) await reply(message, replyText(result));
}

function isImage(attachment) {
  if ((attachment.contentType || '').startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|bmp)$/i.test(attachment.name || '');
}

function replyText(result) {
  const lines = [`Засчитано: ${result.credited.join(', ')}`];
  if (result.replacements.length) {
    lines.push(`Замены: ${result.replacements.map(([from, to]) => `${from} → ${to}`).join(', ')}`);
  }
  if (result.missed.length) lines.push(`Не нашёл на скрине: ${result.missed.join(', ')}`);
  if (result.onScreen.length && result.added && result.added.length) {
    lines.push(`Дополнительно: ${result.added.join(', ')}`);
  }
  if (result.ignored.length) lines.push(`Не из списка: ${result.ignored.join(', ')}`);
  lines.push(`Всего людей: ${result.credited.length}`);
  return lines.join('\n');
}

function note(result) {
  const parts = result.replacements.map(([from, to]) => `${from} → ${to}`);
  if (result.missed.length) parts.push(`не найдены: ${result.missed.join(', ')}`);
  if (result.added && result.added.length) parts.push(`дополнительно: ${result.added.join(', ')}`);
  if (result.ignored.length) parts.push(`не из списка: ${result.ignored.join(', ')}`);
  return parts.join('; ');
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function reply(message, text) {
  return message.reply({ content: text.slice(0, 1800), allowedMentions: { parse: [] } });
}

module.exports = { scoreScreenshot, isImage, replyText };
