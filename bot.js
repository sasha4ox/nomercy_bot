require('dotenv').config();
const fs = require('fs');
const path = require('path');

const {
  AttachmentBuilder,
  Client,
  GatewayIntentBits,
} = require('discord.js');

const EVENT_IMAGES = {
  GvG: path.join(__dirname, 'assets', 'gvg.jpg'),
  RB: path.join(__dirname, 'assets', 'rb.jpg'),
};
const BOSSES_DIR = path.join(__dirname, 'assets', 'bosses');
const BOSSES = {
  zaken: { file: 'zaken.jpg', name: 'Zaken' },
  zak: { file: 'zaken.jpg', name: 'Zaken' },
  core: { file: 'core.jpg', name: 'Core' },
  orfen: { file: 'orfen.jpg', name: 'Orfen' },
  valakas: { file: 'valakas.jpg', name: 'Valakas' },
  val: { file: 'valakas.jpg', name: 'Valakas' },
  antharas: { file: 'antharas.jpg', name: 'Antharas' },
  antaras: { file: 'antharas.jpg', name: 'Antharas' },
  ant: { file: 'antharas.jpg', name: 'Antharas' },
  baium: { file: 'baium.jpg', name: 'Baium' },
  bauim: { file: 'baium.jpg', name: 'Baium' },
  ba: { file: 'baium.jpg', name: 'Baium' },
  aq: { file: 'aq.jpg', name: 'Ant Queen' },
  qa: { file: 'aq.jpg', name: 'Ant Queen' },
  'queen-ant': { file: 'aq.jpg', name: 'Ant Queen' },
  'ant-queen': { file: 'aq.jpg', name: 'Ant Queen' },
  tezza: { file: 'tezza.jpg', name: 'Frintezza' },
  frintezza: { file: 'tezza.jpg', name: 'Frintezza' },
};
const BOSS_LIST = ['zaken', 'core', 'orfen', 'valakas', 'antharas', 'baium', 'aq', 'tezza'];

const ROLE_ID = '1517843561620443177';
const TEST_ROLE_ID = '1518028418476806234';
const VOICE_CHANNEL_ID = '1207352167565103214';
const OWNER_ID = '424559690320707584';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

function eventFromToken(token) {
  if (!token) return null;
  const lower = token.toLowerCase();
  if (lower === 'gvg') return 'GvG';
  if (lower === 'rb') return 'RB';
  return null;
}

function bossSlug(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function bossDisplayName(name) {
  const slug = bossSlug(name);
  if (BOSSES[slug]) return BOSSES[slug].name;
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function bossImagePath(name) {
  const slug = bossSlug(name);
  if (!slug) return null;
  const known = BOSSES[slug];
  const file = known
    ? path.join(BOSSES_DIR, known.file)
    : path.join(BOSSES_DIR, `${slug}.jpg`);
  return fs.existsSync(file) ? file : null;
}

function listBosses() {
  return BOSS_LIST.filter((name) => fs.existsSync(path.join(BOSSES_DIR, BOSSES[name].file)));
}

function parseCommand(content) {
  const text = content.trim();
  const match = text.match(/^!(test|gvg|rb)(?:\s+(.+))?$/i);
  if (!match) return null;

  const head = match[1].toLowerCase();
  const parts = match[2] ? match[2].trim().split(/\s+/) : [];

  if (head === 'test' && parts.length === 0) {
    return { isTest: true, eventName: 'Test', minutes: 0, bossName: null };
  }

  let isTest = false;
  let index = 0;
  let eventToken = head;

  if (head === 'test') {
    isTest = true;
    if (eventFromToken(parts[0])) {
      eventToken = parts[0];
      index = 1;
    } else if (/^\d+$/.test(parts[0]) && parts.length === 1) {
      return {
        isTest: true,
        eventName: 'Test',
        minutes: parseInt(parts[0], 10),
        bossName: null,
      };
    } else {
      return null;
    }
  }

  const eventName = eventFromToken(eventToken);
  if (!eventName) return null;

  let minutes = 0;
  let bossParts = parts.slice(index);
  if (bossParts[0] && /^\d+$/.test(bossParts[0])) {
    minutes = parseInt(bossParts[0], 10);
    bossParts = bossParts.slice(1);
  } else if (bossParts.length > 1 && /^\d+$/.test(bossParts[bossParts.length - 1])) {
    minutes = parseInt(bossParts[bossParts.length - 1], 10);
    bossParts = bossParts.slice(0, -1);
  }

  const bossName = bossParts.join(' ').trim() || null;
  return { isTest, eventName, minutes, bossName };
}

async function notifyRoleMembers(guild, channel, eventName, roleId, bossName, imagePath) {
  const role = guild.roles.cache.get(roleId);
  if (!role) {
    console.log(`Role not found: ${roleId}`);
    await channel.send(`❌ Role not found (\`${roleId}\`)`);
    return;
  }

  const isTest = roleId === TEST_ROLE_ID;
  console.log(`Role found: ${role.name}${isTest ? ' (test)' : ''}`);
  await guild.members.fetch();

  const members = guild.members.cache.filter((member) =>
    member.roles.cache.has(roleId)
  );

  console.log(`Guild members: ${guild.memberCount}`);
  console.log(`Role members: ${members.size}`);

  for (const member of members.values()) {
    console.log(`${member.user.username} -> ${member.id}`);
  }

  if (members.size === 0) {
    await channel.send(
      `❌ No members found with role **${role.name}**${isTest ? ' (test)' : ''}. Make sure the bot has **Server Members Intent** enabled.`
    );
    return;
  }

  const voiceChannel = guild.channels.cache.get(VOICE_CHANNEL_ID);
  if (!voiceChannel) {
    console.log('Voice channel not found');
    await channel.send('❌ Voice channel not found');
    return;
  }

  const invite = await voiceChannel.createInvite({
    maxAge: 3600,
    unique: true,
  });

  console.log(`Invite created: ${invite.url}`);

  const sent = [];
  const failed = [];
  const skipped = [];

  for (const member of members.values()) {
    if (member.voice.channelId === VOICE_CHANNEL_ID) {
      console.log(`Skipped ${member.user.username} — already in voice`);
      skipped.push(member.user.username);
      continue;
    }

    try {
      const headline = bossName
        ? `⚔️ **${bossDisplayName(bossName)}** started!`
        : `⚔️ ${eventName} started!`;
      if (imagePath) {
        await member.send({ files: [new AttachmentBuilder(imagePath)] });
      }
      await member.send(`${headline}\n\nJoin voice:\n${invite.url}`);

      console.log(`DM sent to ${member.user.username}`);
      sent.push(member.user.username);
    } catch (error) {
      const reason =
        error.code === 50007
          ? 'DMs disabled or bot blocked'
          : error.message || 'Unknown error';
      console.log(`Failed DM: ${member.user.username} — ${reason}`);
      failed.push({ name: member.user.username, reason });
    }
  }

  const formatList = (names) => names.map((name) => `\n• **${name}**`).join('');

  const label = bossName ? bossDisplayName(bossName) : eventName;
  let summary = `✅ ${label} notifications sent${isTest ? ' (test)' : ''}: ${sent.length}`;
  if (sent.length > 0) {
    summary += formatList(sent);
  }
  if (skipped.length > 0) {
    summary += `\n⏭️ Skipped (already in voice): ${skipped.length}`;
    summary += formatList(skipped);
  }
  if (failed.length > 0) {
    summary += `\n❌ Failed: ${failed.length}`;
    summary += failed
      .map(({ name, reason }) => `\n• **${name}** — ${reason}`)
      .join('');
  }
  await channel.send(summary);

  if (imagePath) {
    await channel.send({ files: [new AttachmentBuilder(imagePath)] });
    await channel.send(`⚔️ **${label}**`);
  }

  console.log(`Done. Sent=${sent.length}, Skipped=${skipped.length}, Failed=${failed.length}`);
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.author.id !== OWNER_ID) return;

  const parsed = parseCommand(message.content);
  if (!parsed) return;

  const { isTest, eventName, minutes, bossName } = parsed;
  const roleId = isTest ? TEST_ROLE_ID : ROLE_ID;

  if (Number.isNaN(minutes) || minutes < 0) {
    await message.reply('❌ Please provide a valid number of minutes, e.g. `!gvg 15`');
    return;
  }

  let imagePath = EVENT_IMAGES[eventName] || null;
  if (bossName) {
    imagePath = bossImagePath(bossName);
    if (!imagePath) {
      const known = listBosses();
      const knownText = known.length
        ? known.map((name) => `\`${name}\``).join(', ')
        : 'none yet';
      await message.reply(
        `❌ No image for boss **${bossDisplayName(bossName)}**. Known bosses: ${knownText}`
      );
      return;
    }
  }

  const testLabel = isTest ? ' (test)' : '';
  const subject = bossName ? bossDisplayName(bossName) : eventName;
  console.log(
    `Command received: ${message.content.trim()}${minutes > 0 ? ` (${minutes} min delay)` : ''}`
  );

  try {
    if (minutes > 0) {
      const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
      await message.reply(
        `⏰ My King, in **${minutes}** ${minuteLabel} I shall notify all your subjects about **${subject}**${testLabel}!`
      );

      setTimeout(() => {
        (async () => {
          await message.reply(
            `⚔️ Boss, I'm preparing your peasants for the ${subject}${testLabel}!`
          );
          await notifyRoleMembers(
            message.guild,
            message.channel,
            eventName,
            roleId,
            bossName,
            imagePath
          );
        })().catch(console.error);
      }, minutes * 60 * 1000);

      return;
    }

    await message.reply(`⚔️ Boss, I'm preparing your peasants for the ${subject}${testLabel}!`);
    await notifyRoleMembers(
      message.guild,
      message.channel,
      eventName,
      roleId,
      bossName,
      imagePath
    );
  } catch (error) {
    console.error(error);
    await message.reply('❌ Error occurred');
  }
});

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error(
    'Missing DISCORD_TOKEN. Set it in Railway → Variables (or in a local .env file).'
  );
  process.exit(1);
}

client.login(token);
