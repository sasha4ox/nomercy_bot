require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
} = require('discord.js');

const ROLE_ID = '1517843561620443177';
const VOICE_CHANNEL_ID = '1207352167565103214';
const OWNER_ID = '424559690320707584';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

async function notifyRoleMembers(guild, channel, eventName) {
  const role = guild.roles.cache.get(ROLE_ID);
  if (!role) {
    console.log('Role not found');
    await channel.send('❌ Role not found');
    return;
  }

  console.log(`Role found: ${role.name}`);
  await guild.members.fetch();

  console.log(`Guild members: ${guild.memberCount}`);
  console.log(`Role members: ${role.members.size}`);

  for (const member of role.members.values()) {
    console.log(`${member.user.username} -> ${member.id}`);
  }
  console.log(`Members count: ${role.members.size}`);

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

  let sent = 0;
  let failed = 0;

  for (const member of role.members.values()) {
    try {
      await member.send(
        `⚔️ ${eventName} started!\n\nJoin voice:\n${invite.url}`
      );

      console.log(`DM sent to ${member.user.username}`);
      sent++;
    } catch (error) {
      console.log(`Failed DM: ${member.user.username}`);
      failed++;
    }
  }

  await channel.send(`✅ ${eventName} notifications sent: ${sent}\n❌ Failed: ${failed}`);
  console.log(`Done. Sent=${sent}, Failed=${failed}`);
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.author.id !== OWNER_ID) return;

  const match = message.content.trim().match(/^!(gvg|rb)(?:\s+(\d+))?$/i);
  if (!match) return;

  const eventName = match[1].toLowerCase() === 'gvg' ? 'GvG' : 'RB';
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (match[2] && (Number.isNaN(minutes) || minutes <= 0)) {
    await message.reply('❌ Please provide a valid number of minutes, e.g. `!gvg 15`');
    return;
  }

  console.log(`!${match[1]} command received${minutes > 0 ? ` (${minutes} min delay)` : ''}`);

  try {
    if (minutes > 0) {
      const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
      await message.reply(
        `⏰ Boss, in **${minutes}** ${minuteLabel} I will notify everyone for **${eventName}**!`
      );

      setTimeout(() => {
        notifyRoleMembers(message.guild, message.channel, eventName).catch(console.error);
      }, minutes * 60 * 1000);

      return;
    }

    await message.reply(`⚔️ Boss, I'm preparing your peasants for the ${eventName}!`);
    await notifyRoleMembers(message.guild, message.channel, eventName);
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
