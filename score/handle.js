const { extractSlots } = require('./ocr');
const { parseCaption, planTransfers, scoreSlots } = require('./scoring');
const sheets = require('./sheets');

async function scoreScreenshot(message) {
  const images = [...message.attachments.values()].filter(isImage);
  const caption = parseCaption(message.content);
  if (!images.length && !caption.extras.length && !caption.transfers.length) return;
  if (!sheets.configured()) {
    const seen = images.length ? 'Скрин вижу' : (caption.transfers.length ? 'Перенос вижу' : 'Список вижу');
    await reply(message, `${seen}, но в переменных нет таблицы или ключа Google.`);
    return;
  }
  if (!images.length && !caption.extras.length) {
    await transferPoints(message, caption.transfers);
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
  if (!wrote) return;
  const lines = [replyText(result)];
  if (caption.transfers.length) {
    const arrows = caption.transfers.map(([from, to]) => `${from} > ${to}`).join(', ');
    lines.push(`Перенос уже записанного очка отправь отдельным сообщением, без скрина: ${arrows}`);
  }
  await reply(message, lines.join('\n'));
}

async function transferPoints(message, transfers) {
  const book = await sheets.openScoreSheet();
  const roster = await sheets.rosterNames(book.roster);
  const planned = planTransfers(await sheets.scoreTable(book.score), transfers, roster);
  const wrote = await sheets.record(book, {
    when: timestamp(),
    messageId: message.id,
    author: message.member?.displayName || message.author.username,
    onScreen: planned.moves.map(([from]) => from),
    credited: planned.moves.map(([, to]) => to),
    points: [],
    note: transferNote(planned),
    link: message.url,
    moves: planned.moves,
  });
  if (wrote) await reply(message, transferText(planned));
}

function transferText(planned) {
  const lines = [];
  if (planned.moves.length) {
    lines.push(`Перенос: ${planned.moves.map(([from, to]) => `${from} → ${to}`).join(', ')}`);
  }
  if (planned.failed.length) {
    lines.push(`Не перенёс: ${planned.failed.map(([from, to, reason]) => `${from} → ${to} (${reason})`).join(', ')}`);
  }
  return lines.join('\n') || 'Нечего переносить.';
}

function transferNote(planned) {
  const parts = [];
  if (planned.moves.length) {
    parts.push(`перенос: ${planned.moves.map(([from, to]) => `${from} → ${to}`).join(', ')}`);
  }
  if (planned.failed.length) {
    parts.push(`не перенёс: ${planned.failed.map(([from, to, reason]) => `${from} → ${to} (${reason})`).join(', ')}`);
  }
  return parts.join('; ');
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
  const count = result.credited.length;
  lines.push(`В пачке было: ${count}`);
  if (count >= 9) lines.push('Ебать красавцы - фулкой пришли!');
  else lines.push('Это даже не пачка собралась!');
  if (count < 7) lines.push('Ну это уже позорище!');
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

module.exports = { scoreScreenshot, isImage, replyText, transferText };
