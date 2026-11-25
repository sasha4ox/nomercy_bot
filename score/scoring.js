const ALIAS = /^\s*([A-Za-z0-9_]+)\s*[-–—:]\s*([A-Za-z0-9_]+)\s*$/;
const TRANSFER = /^\s*([A-Za-z][A-Za-z0-9_]{2,15})\s*>\s*([A-Za-z][A-Za-z0-9_]{2,15})\s*$/;
const EXTRA = /^\s*\+\s*([A-Za-z][A-Za-z0-9_]{2,15})\s*$/;
const NAME = /^\s*([A-Za-z][A-Za-z0-9_]{2,15})\s*$/;

function parseCaption(text) {
  const aliases = [];
  const extras = [];
  const transfers = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    const alias = ALIAS.exec(trimmed);
    if (alias) {
      aliases.push([alias[1], alias[2]]);
      continue;
    }
    const transfer = TRANSFER.exec(trimmed);
    if (transfer) {
      transfers.push([transfer[1], transfer[2]]);
      continue;
    }
    const extra = EXTRA.exec(trimmed);
    if (extra) {
      extras.push(extra[1]);
      continue;
    }
    const name = NAME.exec(trimmed);
    if (name) extras.push(name[1]);
  }
  return { aliases, extras, transfers };
}

function parseAliases(text) {
  return parseCaption(text).aliases;
}

function matchName(name, names) {
  const [snapped, distance] = closest(name, names);
  return distance < 99 ? snapped : null;
}

function planTransfers(rows, transfers, roster) {
  const table = rows.map((row) => ({ nick: row.nick, points: Number(row.points) || 0 }));
  const moves = [];
  const failed = [];
  for (const [fromRaw, toRaw] of transfers) {
    const from = matchName(fromRaw, table.map((row) => row.nick));
    const source = from && table.find((row) => row.nick.toLowerCase() === from.toLowerCase());
    if (!source) {
      failed.push([fromRaw, toRaw, 'нет в таблице']);
      continue;
    }
    if (source.points < 1) {
      failed.push([source.nick, toRaw, 'нет очка']);
      continue;
    }
    const to = matchName(toRaw, roster) || matchName(toRaw, table.map((row) => row.nick)) || toRaw;
    if (to.toLowerCase() === source.nick.toLowerCase()) {
      failed.push([source.nick, to, 'это тот же ник']);
      continue;
    }
    source.points -= 1;
    let target = table.find((row) => row.nick.toLowerCase() === to.toLowerCase());
    if (!target) {
      target = { nick: to, points: 0 };
      table.push(target);
    }
    target.points += 1;
    moves.push([source.nick, target.nick]);
  }
  return { moves, failed, rows: table };
}

function scoreSlots(slots, aliases, roster, extras = []) {
  const picked = [];
  const ignored = [];
  for (const readings of slots) {
    if (!readings.length) continue;
    const name = pick(readings, roster);
    if (!name) {
      ignored.push(readings[0]);
      continue;
    }
    picked.push(name);
  }
  const onScreen = unique(picked);
  const replaced = new Map();
  const replacements = [];
  const missed = [];
  const claimed = new Set();
  for (const [source, target] of aliases) {
    const match = findName(source, onScreen);
    if (!match || claimed.has(match.toLowerCase())) {
      missed.push(source);
      continue;
    }
    claimed.add(match.toLowerCase());
    const credit = preferRoster(target, roster);
    replaced.set(match.toLowerCase(), credit);
    replacements.push([match, credit]);
  }
  const credited = unique(onScreen.map((name) => replaced.get(name.toLowerCase()) || name));
  const added = [];
  for (const extra of extras) {
    const credit = preferRoster(extra, roster);
    if (credited.some((name) => name.toLowerCase() === credit.toLowerCase())) continue;
    credited.push(credit);
    added.push(credit);
  }
  return { onScreen, credited, replacements, missed, ignored, added };
}

function pick(readings, roster) {
  if (!roster.length) return readings[0];
  let bestName = null;
  let bestRank = null;
  readings.forEach((reading, index) => {
    const [snapped, distance] = closest(reading, roster);
    if (distance >= 99) return;
    const rank = [distance, index];
    if (!bestRank || rank[0] < bestRank[0] || (rank[0] === bestRank[0] && rank[1] < bestRank[1])) {
      bestRank = rank;
      bestName = snapped;
    }
  });
  return bestName;
}

function preferRoster(name, roster) {
  const [snapped, distance] = closest(name, roster);
  return distance < 99 ? snapped : name;
}

function findName(source, names) {
  const exact = names.find((name) => name.toLowerCase() === source.toLowerCase());
  if (exact) return exact;
  const [snapped, distance] = closest(source, names);
  return distance < 99 ? snapped : null;
}

function closest(name, roster) {
  if (!name || !roster.length) return [name, 99];
  const folded = name.toLowerCase();
  const exact = roster.find((item) => item.toLowerCase() === folded);
  if (exact) return [exact, 0];
  const ranked = roster
    .map((item) => [distance(folded, item.toLowerCase()), item])
    .sort((a, b) => a[0] - b[0] || a[1].toLowerCase().localeCompare(b[1].toLowerCase()));
  const [bestDistance, best] = ranked[0];
  const second = ranked[1] ? ranked[1][0] : 99;
  if (bestDistance <= limit(name.length) && bestDistance < second) return [best, bestDistance];
  return [name, 99];
}

function limit(length) {
  if (length >= 8) return 3;
  if (length >= 5) return 2;
  if (length >= 4) return 1;
  return 0;
}

function unique(names) {
  const result = [];
  const seen = new Set();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

const CONFUSIONS = ['1li', '0o', 'vw', 'mn'];

function distance(left, right) {
  if (left === right) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current.push(Math.min(
        current[current.length - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitution(left[i - 1], right[j - 1]),
      ));
    }
    previous = current;
  }
  return previous[previous.length - 1];
}

function substitution(left, right) {
  if (left === right) return 0;
  for (const group of CONFUSIONS) {
    if (group.includes(left) && group.includes(right)) return 0;
  }
  return 1;
}

module.exports = { parseAliases, parseCaption, scoreSlots, planTransfers };
