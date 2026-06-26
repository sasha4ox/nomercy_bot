require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
} = require('discord.js');

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

function parseCommand(content) {
  const text = content.trim();

  const testStandalone = text.match(/^!test$/i);
  if (testStandalone) {
    return { isTest: true, eventName: 'Test', minutes: 0 };
  }

  const testDelayed = text.match(/^!test\s+(\d+)$/i);
  if (testDelayed) {
    return {
      isTest: true,
      eventName: 'Test',
      minutes: parseInt(testDelayed[1], 10),
    };
  }

  const testWithEvent = text.match(/^!test\s+(gvg|rb)(?:\s+(\d+))?$/i);
  if (testWithEvent) {
    return {
      isTest: true,
      eventName: testWithEvent[1].toLowerCase() === 'gvg' ? 'GvG' : 'RB',
      minutes: testWithEvent[2] ? parseInt(testWithEvent[2], 10) : 0,
    };
  }

  const normal = text.match(/^!(gvg|rb)(?:\s+(\d+))?$/i);
  if (normal) {
    return {
      isTest: false,
      eventName: normal[1].toLowerCase() === 'gvg' ? 'GvG' : 'RB',
      minutes: normal[2] ? parseInt(normal[2], 10) : 0,
    };
  }

  return null;
}

async function notifyRoleMembers(guild, channel, eventName, roleId) {
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
      await member.send(
        `⚔️ ${eventName} started!\n\nJoin voice:\n${invite.url}`
      );

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

  let summary = `✅ ${eventName} notifications sent${isTest ? ' (test)' : ''}: ${sent.length}`;
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
  console.log(`Done. Sent=${sent.length}, Skipped=${skipped.length}, Failed=${failed.length}`);
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.author.id !== OWNER_ID) return;

  const parsed = parseCommand(message.content);
  if (!parsed) return;

  const { isTest, eventName, minutes } = parsed;
  const roleId = isTest ? TEST_ROLE_ID : ROLE_ID;

  if (Number.isNaN(minutes) || minutes < 0) {
    await message.reply('❌ Please provide a valid number of minutes, e.g. `!gvg 15`');
    return;
  }

  const testLabel = isTest ? ' (test)' : '';
  console.log(
    `Command received: ${message.content.trim()}${minutes > 0 ? ` (${minutes} min delay)` : ''}`
  );

  try {
    if (minutes > 0) {
      const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
      await message.reply(
        `⏰ My King, in **${minutes}** ${minuteLabel} I shall notify all your subjects about **${eventName}**${testLabel}!`
      );

      setTimeout(() => {
        notifyRoleMembers(message.guild, message.channel, eventName, roleId).catch(console.error);
      }, minutes * 60 * 1000);

      return;
    }

    await message.reply(`⚔️ Boss, I'm preparing your peasants for the ${eventName}${testLabel}!`);
    await notifyRoleMembers(message.guild, message.channel, eventName, roleId);
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
