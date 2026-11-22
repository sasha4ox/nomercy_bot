const fs = require('fs');
const path = require('path');
const { JWT } = require('google-auth-library');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const LOG_HEADER = ['time', 'message_id', 'author', 'on_screen', 'credited', 'note', 'link'];
const SCORE_HEADER = ['nick', 'points'];
const ROSTER_HEADER = ['nick'];

function credentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!file) return null;
  const full = path.isAbsolute(file) ? file : path.join(__dirname, '..', file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function configured() {
  return Boolean(process.env.GOOGLE_SHEET_ID && credentials());
}

async function openScoreSheet() {
  const creds = credentials();
  if (!creds || !process.env.GOOGLE_SHEET_ID) {
    throw new Error('В .env нет GOOGLE_SHEET_ID или ключа сервисного аккаунта.');
  }
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
  await doc.loadInfo();
  const log = await ensureSheet(doc, 'Log', LOG_HEADER, true);
  const score = await ensureSheet(doc, 'Score', SCORE_HEADER, false);
  const roster = await ensureSheet(doc, 'Roster', ROSTER_HEADER, false);
  return { log, score, roster };
}

async function ensureSheet(doc, title, header, renameBlankSheet1) {
  let sheet = doc.sheetsByTitle[title];
  if (!sheet && renameBlankSheet1 && doc.sheetsByTitle.Sheet1) {
    const sheet1 = doc.sheetsByTitle.Sheet1;
    const cells = await sheet1.getCellsInRange('A1:A1');
    const occupied = Array.isArray(cells) && cells.some((row) => row.some((cell) => String(cell || '').trim()));
    if (!occupied) {
      await sheet1.updateProperties({ title: 'Log' });
      sheet1.title = 'Log';
      sheet = sheet1;
    }
  }
  if (!sheet) return doc.addSheet({ title, headerValues: header });
  try {
    await sheet.loadHeaderRow();
  } catch {
    await sheet.setHeaderRow(header);
    return sheet;
  }
  if (!sheet.headerValues.some((cell) => String(cell || '').trim())) {
    await sheet.setHeaderRow(header);
  }
  return sheet;
}

async function rosterNames(roster) {
  await roster.loadHeaderRow();
  const rows = await roster.getRows();
  return rows.map((row) => String(row.get('nick') || '').trim()).filter(Boolean);
}

async function record(book, entry) {
  await book.log.loadHeaderRow();
  const existing = await book.log.getRows();
  if (existing.some((row) => String(row.get('message_id') || '') === entry.messageId)) return false;
  await book.log.addRow({
    time: entry.when,
    message_id: entry.messageId,
    author: entry.author,
    on_screen: entry.onScreen.join(', '),
    credited: entry.credited.join(', '),
    note: entry.note,
    link: entry.link,
  }, { raw: true });
  await addPoints(book.score, entry.credited);
  return true;
}

async function addPoints(score, nicks) {
  await score.loadHeaderRow();
  const rows = await score.getRows();
  const index = new Map();
  for (const row of rows) {
    const nick = String(row.get('nick') || '').trim();
    if (nick) index.set(nick.toLowerCase(), row);
  }
  for (const nick of nicks) {
    const row = index.get(nick.toLowerCase());
    if (!row) {
      const added = await score.addRow({ nick, points: 1 }, { raw: true });
      index.set(nick.toLowerCase(), added);
      continue;
    }
    const current = Number(row.get('points'));
    row.set('points', Number.isFinite(current) ? current + 1 : 1);
    await row.save();
  }
}

module.exports = {
  configured,
  openScoreSheet,
  rosterNames,
  record,
};
