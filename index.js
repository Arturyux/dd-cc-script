import dotenv from 'dotenv';
import fetch from 'node-fetch';
import express from 'express';
import fs from 'fs';
import path from 'path';
import probe from 'probe-image-size';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import cors from 'cors';
import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder
} from 'discord.js';

/* =============================
   Load Environment Variables
============================= */
dotenv.config();
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

/* =============================
   Discord Client Setup
============================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

/* =============================
   Scheduled Messages Setup
============================= */
const scheduledMessagesFilePath = path.join(process.cwd(), 'assets', 'scheduledMessages.json');

// Default scheduled messages
const defaultScheduledMessages = [
  {
    "type": "weekly",
    "name": "example-weekly-1",
    "turnon": true,
    "channelId": "1329422830185742366",
    "responseChannelId": "1329422830185742366",
    "roleId": "example",
    "hour": "17",
    "minutes": "53",
    "seconds": "30",
    "dayoftheweek": "3",
    "timezone": "Europe/Stockholm",
    "messageContent": "example weekly message",
    "automaticResponses": [
      {
        "title": "example1",
        "content": "response1"
      },
      {
        "title": "example2",
        "content": "response2"
      },
      {
        "title": "example3",
        "content": "response3"
      }
    ]
  },
  {
    "type": "weekly",
    "name": "example-weekly-2",
    "turnon": true,
    "channelId": "1329422856819314708",
    "responseChannelId": "1329422856819314708",
    "roleId": "example",
    "hour": "17",
    "minutes": "52",
    "seconds": "40",
    "dayoftheweek": "3",
    "timezone": "Europe/Stockholm",
    "messageContent": "e1xample weekly message",
    "automaticResponses": [
      {
        "title": "example1",
        "content": "1response1"
      },
      {
        "title": "example2",
        "content": "1response2"
      },
      {
        "title": "example3",
        "content": "1response3"
      }
    ]
  },
  {
    "type": "weekly",
    "name": "example-weekly-3",
    "turnon": true,
    "channelId": "1329422856819314708",
    "responseChannelId": "1329422856819314708",
    "roleId": "example",
    "hour": "17",
    "minutes": "52",
    "seconds": "50",
    "dayoftheweek": "3",
    "timezone": "Europe/Stockholm",
    "messageContent": "e2xample weekly message",
    "automaticResponses": [
      {
        "title": "example1",
        "content": "2response1"
      },
      {
        "title": "example2",
        "content": "2response2"
      },
      {
        "title": "example3",
        "content": "2response3"
      }
    ]
  }
];

// Create file if it doesn't exist
if (!fs.existsSync(scheduledMessagesFilePath)) {
  console.log('scheduledMessages.json not found. Creating a default file...');
  fs.writeFileSync(
    scheduledMessagesFilePath,
    JSON.stringify(defaultScheduledMessages, null, 2),
    'utf8'
  );
  console.log('Default scheduledMessages.json file created.');
}

// Load scheduled messages into memory
let scheduledMessages = [];
try {
  const rawData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
  scheduledMessages = JSON.parse(rawData);
} catch (err) {
  console.error('Error reading scheduledMessages.json:', err);
  scheduledMessages = [];
}

// Keep references to cron jobs/timeouts for reloading
let cronJobs = [];

// Map to store messageID => scheduled config object
const messageIdToScheduledConfig = new Map();

/* =============================
   Helper: Send a Scheduled Message
============================= */
async function sendScheduledMessage(msg) {
  try {
    const channel = await client.channels.fetch(msg.channelId);
    if (!channel || !channel.isTextBased()) {
      console.error(`Channel not found or not text-based for ${msg.name}`);
      return;
    }

    let finalMessageContent = msg.messageContent;

    // Send the message
    const sentMessage = await channel.send(finalMessageContent);

    // Store the mapping here
    messageIdToScheduledConfig.set(sentMessage.id, msg);

    // React with ❤️
    await sentMessage.react('❤️');

    console.log(`[SENT] "${msg.name}" -> #${channel.name} at ${new Date().toLocaleString()}`);
  } catch (error) {
    console.error(`Error sending scheduled message for ${msg.name}:`, error);
  }
}

/* =============================
   scheduleAllMessages
   - type: "weekly" => Node-Cron
   - type: "date"   => setTimeout (+ daybefore)
============================= */
function scheduleAllMessages(messages) {
  // Stop existing tasks
  cronJobs.forEach(job => {
    if (job.stop) {
      job.stop(); // cron job
    } else if (job.timeoutId) {
      clearTimeout(job.timeoutId);
    }
  });
  cronJobs = [];

  messages.forEach(msg => {
    if (!msg.turnon) {
      console.log(`Skipping disabled task: ${msg.name}`);
      return;
    }

    if (msg.type === 'weekly') {
      const { hour, minutes, seconds, dayoftheweek } = msg;
      if (hour !== undefined && minutes !== undefined && seconds !== undefined && dayoftheweek !== undefined) {
        const cronStr = `${seconds} ${minutes} ${hour} * * ${dayoftheweek}`;
        const job = cron.schedule(
          cronStr,
          () => sendScheduledMessage(msg),
          { timezone: msg.timezone || 'Europe/Stockholm' }
        );
        cronJobs.push(job);
        console.log(`[WEEKLY] Scheduled: ${msg.name} => ${cronStr} (TZ: ${msg.timezone})`);
      } else {
        console.warn(`[WEEKLY] Missing fields for ${msg.name}, skipping.`);
      }
    }
    else if (msg.type === 'date') {
      const { year, month, day, time, daybefore } = msg;
      if (!year || !month || !day || !time) {
        console.warn(`[DATE] Missing fields for ${msg.name}, skipping.`);
        return;
      }
      // parse time "HH:MM:SS"
      const [HH, MM, SS] = time.split(':').map(Number);
      const dateObj = new Date(
        Number(year),
        Number(month) - 1, // zero-based
        Number(day),
        HH || 0,
        MM || 0,
        SS || 0
      );

      function scheduleOneTimeMessage(targetDate, label='') {
        const now = new Date();
        if (targetDate > now) {
          const diffMs = targetDate - now;
          const timeoutId = setTimeout(() => {
            sendScheduledMessage(msg);
            console.log(`[ONE-TIME] Fired: ${msg.name} ${label} at ${new Date().toLocaleString()}`);
          }, diffMs);

          cronJobs.push({ timeoutId });
          console.log(`[ONE-TIME] Scheduled: ${msg.name} ${label} => ${targetDate.toLocaleString()}`);
        } else {
          console.log(`[ONE-TIME] Skipping ${msg.name} ${label}, date is in the past => ${targetDate.toLocaleString()}`);
        }
      }

      // Schedule main date
      scheduleOneTimeMessage(dateObj);

      // If daybefore > 0, schedule that many days earlier
      const daysBefore = parseInt(daybefore, 10);
      if (daysBefore > 0) {
        const remindDate = new Date(dateObj.getTime() - daysBefore * 24 * 60 * 60 * 1000);
        scheduleOneTimeMessage(remindDate, `(daybefore: ${daysBefore})`);
      }
    }
    else {
      console.warn(`Unknown type "${msg.type}" for ${msg.name}, skipping.`);
    }
  });
}

fs.watchFile(scheduledMessagesFilePath, (curr, prev) => {
  if (curr.mtime > prev.mtime) {
    console.log('scheduledMessages.json changed on disk. Reloading...');
    try {
      const fileData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
      scheduledMessages = JSON.parse(fileData);
      scheduleAllMessages(scheduledMessages);
      console.log('Reload complete. New scheduled messages have been applied.');
    } catch (err) {
      console.error('Error reloading scheduledMessages.json:', err);
    }
  }
});

/* =============================
   Discord 'ready' event
============================= */
client.once('ready', () => {
  scheduleAllMessages(scheduledMessages);
  console.log(`Discord bot logged in as ${client.user.tag}!`);
});

/* =============================
   Reaction Handler
============================= */
const respondedMessages = new Set(); // To track already responded messages

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  // Handle partials
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Failed to fetch reaction:', error);
      return;
    }
  }
  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch (error) {
      console.error('Failed to fetch message:', error);
      return;
    }
  }

  // Must be the bot's own message
  if (reaction.message.author.id !== client.user.id) return;

  if (reaction.emoji.name === '❤️') {
    // Prevent multiple responses to the same message
    if (respondedMessages.has(reaction.message.id)) {
      console.log(`Already responded to message ID: ${reaction.message.id}`);
      return;
    }
    respondedMessages.add(reaction.message.id);

    // Use the Map to get the correct config
    const msgCfg = messageIdToScheduledConfig.get(reaction.message.id);
    if (!msgCfg) {
      console.log(`No stored config for message ID: ${reaction.message.id}`);
      return;
    }

    if (msgCfg.turnon) {
      if (Array.isArray(msgCfg.automaticResponses) && msgCfg.automaticResponses.length > 0) {
        // Pick a random response from THIS message's set
        const randomRespIndex = Math.floor(Math.random() * msgCfg.automaticResponses.length);
        const randomResp = msgCfg.automaticResponses[randomRespIndex];

        try {
          // Send the response in the specified response channel
          const responseChannel = await client.channels.fetch(msgCfg.responseChannelId);
          if (!responseChannel || !responseChannel.isTextBased()) {
            console.error(`Response channel invalid for ${msgCfg.name}`);
            return;
          }
          await responseChannel.send(randomResp.content);
          console.log(`Sent auto-response: "${randomResp.title}" to #${responseChannel.name}.`);
        } catch (error) {
          console.error(`Error sending auto-response for ${msgCfg.name}:`, error);
        }
      } else {
        console.error(`No automaticResponses defined for ${msgCfg.name}.`);
      }
    }
  }
});

/* =============================
   Welcome message for new members
============================= */
client.on('guildMemberAdd', async (member) => {
  try {
    if (!WELCOME_CHANNEL_ID) {
      console.error('WELCOME_CHANNEL_ID not set in .env');
      return;
    }
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      console.error('Welcome channel not found or is not a text channel.');
      return;
    }
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('Welcome!')
      .setDescription(`Hello ${member.user}, welcome to **${member.guild.name}**!`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor('#00FF00');
    await channel.send({ embeds: [welcomeEmbed] });
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
});

/* =============================
   Utility: sanitizeChannelName
============================= */
function sanitizeChannelName(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
}

/* =============================
   Utility: getChannelList, saveChannelList
   for config.json
============================= */
function getChannelList() {
  const configFilePath = path.join(process.cwd(), 'config.json');
  if (fs.existsSync(configFilePath)) {
    const configData = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    return configData.channelIds || [];
  } else {
    return [];
  }
}

function saveChannelList(channelIds) {
  const configFilePath = path.join(process.cwd(), 'config.json');
  const configData = { channelIds };
  fs.writeFileSync(configFilePath, JSON.stringify(configData, null, 2));
}

/* =============================
   Discord command handler
============================= */
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!pics ')) {
    await handleUpdateImagesCommand(message);
    return;
  }

  if (message.content.startsWith('!picsall')) {
    await handleUpdateAllImagesCommand(message);
    return;
  }

  if (message.content.startsWith('!cc-pic-channel-add')) {
    await handleAddChannelCommand(message);
    return;
  }

  if (message.content.startsWith('!cc-pic-channel-remove')) {
    await handleRemoveChannelCommand(message);
    return;
  }

  if (message.content === '!cc-pic-channel-ls') {
    await handleListChannelsCommand(message);
    return;
  }
});

/* =============================
   Channel commands
============================= */
async function handleAddChannelCommand(message) {
  if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    await message.reply('You do not have permission to use this command.');
    return;
  }
  try {
    const args = message.content.split(' ').slice(1);
    if (args.length === 0) {
      await message.reply('Please provide a channel ID.');
      return;
    }
    const channelId = args[0];
    const channel = await message.guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      await message.reply('Something went wrong: Channel not found or is not a text channel.');
      return;
    }
    const channelList = getChannelList();
    if (channelList.includes(channelId)) {
      await message.reply('Channel is already added.');
      return;
    }
    channelList.push(channelId);
    saveChannelList(channelList);
    await message.reply('Channel is successfully added.');
  } catch (error) {
    console.error('Error adding channel:', error);
    await message.reply('Something went wrong.');
  }
}

async function handleRemoveChannelCommand(message) {
  if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    await message.reply('You do not have permission to use this command.');
    return;
  }
  try {
    const args = message.content.split(' ').slice(1);
    if (args.length === 0) {
      await message.reply('Please provide a channel ID.');
      return;
    }
    const channelId = args[0];
    const channelList = getChannelList();
    if (!channelList.includes(channelId)) {
      await message.reply('Channel not found in the list.');
      return;
    }
    const updatedChannelList = channelList.filter(id => id !== channelId);
    saveChannelList(updatedChannelList);
    await message.reply('Channel successfully removed.');
  } catch (error) {
    console.error('Error removing channel:', error);
    await message.reply('Something went wrong.');
  }
}

async function handleListChannelsCommand(message) {
  if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    await message.reply('You do not have permission to use this command.');
    return;
  }
  try {
    const channelList = getChannelList();
    if (channelList.length === 0) {
      await message.reply('No channels have been added yet.');
      return;
    }
    let response = '**Channels added for image processing:**\n';
    for (const channelId of channelList) {
      try {
        const channel = await message.guild.channels.fetch(channelId);
        if (channel) {
          response += `- ${channel.name} (ID: ${channelId})\n`;
        } else {
          response += `- Unknown Channel (ID: ${channelId})\n`;
        }
      } catch (error) {
        response += `- Unknown Channel (ID: ${channelId})\n`;
      }
    }
    await message.reply(response);
  } catch (error) {
    console.error('Error listing channels:', error);
    await message.reply('Something went wrong.');
  }
}

/* =============================
   Image Processing Commands
============================= */
async function handleUpdateImagesCommand(message) {
  if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    await message.reply('You do not have permission to use this command.');
    console.log(`User ${message.author.tag} attempted to use !pics without permissions.`);
    return;
  }

  try {
    const args = message.content.trim().split(/\s+/).slice(1);
    if (args.length === 0) {
      await message.reply('Please provide a channel ID.');
      return;
    }
    const channelId = args[0];
    if (!/^\d+$/.test(channelId)) {
      await message.reply('Please provide a valid channel ID (numeric).');
      return;
    }
    const channelToProcess = await message.guild.channels.fetch(channelId).catch(err => {
      console.error(`Error fetching channel with ID ${channelId}:`, err);
      return null;
    });

    if (!channelToProcess) {
      await message.reply('Channel not found. Please ensure the channel ID is correct.');
      return;
    }
    if (!channelToProcess.isTextBased()) {
      await message.reply('The specified channel is not a text channel.');
      return;
    }

    const channelList = getChannelList();
    if (!channelList.includes(channelId)) {
      await message.reply(`The channel ${channelToProcess.name} is not added for image processing.`);
      return;
    }

    await message.reply(`Updating image URLs for channel: ${channelToProcess.name} (ID: ${channelId}), this may take a while...`);

    const allImageInfos = await fetchAllImageInfosFromChannel(channelToProcess);
    await saveImageInfos(channelToProcess, allImageInfos, true);

    await message.reply(`Image URLs have been updated for channel: ${channelToProcess.name} (ID: ${channelId}).`);
    console.log(`Successfully updated images for channel: ${channelToProcess.name} (ID: ${channelId})`);
  } catch (error) {
    console.error('Error updating image URLs:', error);
    await message.reply('An error occurred while updating image URLs. Please check the logs for details.');
  }
}

async function handleUpdateAllImagesCommand(message) {
  if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    await message.reply('You do not have permission to use this command.');
    return;
  }

  try {
    const args = message.content.trim().split(/\s+/).slice(1);
    let channelId;
    let channelToProcess = null;

    if (args.length > 0) {
      channelId = args[0];
      if (!/^\d+$/.test(channelId)) {
        await message.reply('Please provide a valid channel ID (numeric).');
        return;
      }
      channelToProcess = await message.guild.channels.fetch(channelId).catch(err => {
        console.error(`Error fetching channel with ID ${channelId}:`, err);
        return null;
      });

      if (!channelToProcess) {
        await message.reply('Channel not found. Please ensure the channel ID is correct.');
        return;
      }
      if (!channelToProcess.isTextBased()) {
        await message.reply('The specified channel is not a text channel.');
        return;
      }
    }

    const guild = message.guild;
    const botMember = await guild.members.fetchMe();
    const channelList = getChannelList();

    let channels = [];

    if (channelToProcess) {
      if (!channelList.includes(channelId)) {
        await message.reply(`The channel ${channelToProcess.name} is not added for image processing.`);
        return;
      }
      channels = [channelToProcess];
    } else {
      await message.channel.send('Updating image URLs for all added channels, this may take a while...');

      for (const id of channelList) {
        const ch = await guild.channels.fetch(id).catch(() => null);
        if (
          ch &&
          ch.isTextBased() &&
          ch.viewable &&
          ch.permissionsFor(botMember).has([
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory
          ])
        ) {
          channels.push(ch);
        }
      }

      if (channels.length === 0) {
        await message.channel.send('No channels are added for image processing.');
        return;
      }
    }

    for (const ch of channels) {
      console.log(`Processing channel: ${ch.name}`);
      try {
        const allImageInfos = await fetchAllImageInfosFromChannel(ch);
        await saveImageInfos(ch, allImageInfos, true);
        console.log(`Updated images for channel: ${ch.name}`);
      } catch (error) {
        console.error(`Error updating images for channel ${ch.name}:`, error);
      }
    }

    if (channelToProcess) {
      await message.reply(`Image URLs have been updated for channel: ${channelToProcess.name} (ID: ${channelId}).`);
    } else {
      await message.channel.send('Image URLs have been updated for all added channels.');
    }
  } catch (error) {
    console.error('Error updating image URLs:', error);
    await message.channel.send('An error occurred while updating image URLs.');
  }
}

/* =============================
   Image Processing Helpers
============================= */
async function fetchAllImageInfosFromChannel(channel) {
  let allImageInfos = [];
  let lastMessageId;

  while (true) {
    const options = { limit: 100 };
    if (lastMessageId) {
      options.before = lastMessageId;
    }

    try {
      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      for (const msg of messages.values()) {
        const imageInfos = await extractImageInfosFromMessage(msg, channel);
        allImageInfos.push(...imageInfos);
      }
      lastMessageId = messages.last().id;
    } catch (error) {
      console.error(`Error fetching messages from channel ${channel.name}:`, error);
      break;
    }
  }

  // deduplicate
  const uniqueImageInfos = [];
  const urls = new Set();
  for (const info of allImageInfos) {
    if (!urls.has(info.url)) {
      urls.add(info.url);
      uniqueImageInfos.push(info);
    }
  }
  return uniqueImageInfos;
}

async function extractImageInfosFromMessage(message, channel) {
  let imageInfos = [];
  const sanitizedChannelName = sanitizeChannelName(channel.name);
  const imagesDir = path.join(process.cwd(), 'assets', sanitizedChannelName);

  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // attachments
  if (message.attachments.size > 0) {
    const imageAttachments = message.attachments.filter(
      (att) => att.contentType && att.contentType.startsWith('image/')
    );
    if (imageAttachments.size > 0) {
      const infos = await Promise.all(
        imageAttachments.map(async (att) => {
          const orientation = await getImageOrientation(att.url);
          if (orientation) {
            const ext = path.extname(att.name) || '.jpg';
            const localFilename = `${message.id}_${att.id}${ext}`;
            const localFilePath = path.join(imagesDir, localFilename);
            await downloadImage(att.url, localFilePath);
            const serverUrl = `https://api2.cultureconnection.se/assets/${sanitizedChannelName}/${localFilename}`;
            return { url: serverUrl, orientation };
          }
          return null;
        })
      );
      imageInfos.push(...infos.filter(Boolean));
    }
  }

  // embeds
  if (message.embeds.length > 0) {
    const imageEmbeds = message.embeds.filter(e => e.image && e.image.url);
    if (imageEmbeds.length > 0) {
      const infos = await Promise.all(
        imageEmbeds.map(async (embed, index) => {
          const orientation = await getImageOrientation(embed.image.url);
          if (orientation) {
            const ext = path.extname(new URL(embed.image.url).pathname) || '.jpg';
            const localFilename = `${message.id}_embed_${index}${ext}`;
            const localFilePath = path.join(imagesDir, localFilename);
            await downloadImage(embed.image.url, localFilePath);
            const serverUrl = `https://api2.cultureconnection.se/assets/${sanitizedChannelName}/${localFilename}`;
            return { url: serverUrl, orientation };
          }
          return null;
        })
      );
      imageInfos.push(...infos.filter(Boolean));
    }
  }

  return imageInfos;
}

async function downloadImage(imageUrl, localPath) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const buffer = await response.buffer();
    fs.writeFileSync(localPath, buffer);
    console.log(`Image downloaded: ${localPath}`);
  } catch (error) {
    console.error(`Error downloading image from ${imageUrl}:`, error);
  }
}

async function getImageOrientation(imageUrl) {
  try {
    const result = await probe(imageUrl);
    const { width, height } = result;
    if (width > height) return 'horizontal';
    if (height > width) return 'vertical';
    return 'square';
  } catch (error) {
    console.error(`Error getting image dimensions for URL: ${imageUrl}`, error);
    return null;
  }
}

async function saveImageInfos(channel, newInfos, fullUpdate = false) {
  try {
    const sanitizedChannelName = sanitizeChannelName(channel.name);
    const imagesDir = path.join(process.cwd(), 'assets', sanitizedChannelName);

    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const dataFilePath = path.join(imagesDir, `${sanitizedChannelName}.json`);
    let existingData = [];

    if (fs.existsSync(dataFilePath)) {
      existingData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    }

    let updatedData;
    if (fullUpdate) {
      // remove images that are no longer in newInfos
      const newUrls = new Set(newInfos.map(info => info.url));
      const imagesToDelete = existingData.filter(info => !newUrls.has(info.url));

      for (const info of imagesToDelete) {
        try {
          const localFilename = path.basename(new URL(info.url).pathname);
          const localFilePath = path.join(imagesDir, localFilename);
          if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
            console.log(`Deleted image file: ${localFilePath}`);
          }
        } catch (err) {
          console.error('Error removing old file:', err);
        }
      }
      updatedData = newInfos;
    } else {
      // merge + deduplicate
      const combined = [...existingData, ...newInfos];
      const uniqueData = [];
      const urls = new Set();
      for (const info of combined) {
        if (!urls.has(info.url)) {
          urls.add(info.url);
          uniqueData.push(info);
        }
      }
      updatedData = uniqueData;
    }

    fs.writeFileSync(dataFilePath, JSON.stringify(updatedData, null, 2));
    console.log(`Image infos saved for channel '${channel.name}':`, newInfos);
  } catch (error) {
    console.error('Error saving image infos:', error);
  }
}

/* =============================
   EXPRESS SERVER
============================= */
const app = express();
const PORT = process.env.PORT || 4000;

// CORS + Rate limiting
app.use(cors());
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);
app.use(express.json());

// Serve static files from /assets
app.use('/assets', express.static(path.join(process.cwd(), 'assets')));

// Basic root route
app.get('/', (req, res) => {
  res.json({ hello: 'world2' });
});

// List directories in /assets
app.get('/assets', (req, res) => {
  const dataDir = path.join(process.cwd(), 'assets');
  fs.readdir(dataDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read data directory' });
    }
    const channels = files.filter(file => fs.lstatSync(path.join(dataDir, file)).isDirectory());
    res.json({ channels });
  });
});

// Return JSON for a single channel (if any)
app.get('/assets/:channelName', (req, res) => {
  const { channelName } = req.params;
  const sanitizedChannelName = sanitizeChannelName(channelName);
  const dataFilePath = path.join(process.cwd(), 'assets', sanitizedChannelName, `${sanitizedChannelName}.json`);

  fs.readFile(dataFilePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).json({ error: 'Channel data not found' });
    }
    res.json(JSON.parse(data));
  });
});

// Return all data from all channel JSON files
app.get('/all-data', (req, res) => {
  const dataDir = path.join(process.cwd(), 'assets');
  fs.readdir(dataDir, (err, directories) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read data directory' });
    }
    let allData = [];
    directories.forEach(dir => {
      const dataFilePath = path.join(dataDir, dir, `${dir}.json`);
      if (fs.existsSync(dataFilePath)) {
        const fileContents = fs.readFileSync(dataFilePath, 'utf8');
        allData = allData.concat(JSON.parse(fileContents));
      }
    });
    res.json(allData);
  });
});

/* =============================
   SCHEDULED MESSAGES CRUD
============================= */
app.get('/scheduledMessages', (req, res) => {
  try {
    const fileData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
    const parsed = JSON.parse(fileData);
    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to read scheduledMessages file' });
  }
});

app.post('/scheduledMessages', (req, res) => {
  const newMsg = req.body;
  try {
    const fileData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
    let parsed = JSON.parse(fileData);
    parsed.push(newMsg);
    fs.writeFileSync(scheduledMessagesFilePath, JSON.stringify(parsed, null, 2));
    res.status(201).json({ success: true, data: newMsg });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create new scheduled message' });
  }
});

app.put('/scheduledMessages/:index', (req, res) => {
  const index = parseInt(req.params.index, 10);
  const updatedMsg = req.body;
  try {
    const fileData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
    let parsed = JSON.parse(fileData);
    if (index >= 0 && index < parsed.length) {
      parsed[index] = updatedMsg;
      fs.writeFileSync(scheduledMessagesFilePath, JSON.stringify(parsed, null, 2));
      res.json({ success: true, data: updatedMsg });
    } else {
      res.status(404).json({ success: false, error: 'Scheduled message not found' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update scheduled message' });
  }
});

app.delete('/scheduledMessages/:index', (req, res) => {
  const index = parseInt(req.params.index, 10);
  try {
    const fileData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
    let parsed = JSON.parse(fileData);
    if (index >= 0 && index < parsed.length) {
      const removedItem = parsed.splice(index, 1)[0];
      fs.writeFileSync(scheduledMessagesFilePath, JSON.stringify(parsed, null, 2));
      res.json({ success: true, data: removedItem });
    } else {
      res.status(404).json({ success: false, error: 'Scheduled message not found' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete scheduled message' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Finally, login the Discord bot
client.login(DISCORD_TOKEN).catch(err => {
  console.error('Failed to login to Discord:', err);
});