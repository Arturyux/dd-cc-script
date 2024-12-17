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
  PermissionsBitField,
  EmbedBuilder,
  Partials
} from 'discord.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

// Scheduled message channel IDs
const SCHEDULED_MESSAGE_CLIMBING_CHANNEL_ID = process.env.SCHEDULED_MESSAGE_CLIMBING_CHANNEL_ID;
const SCHEDULED_MESSAGE_BOARDGAME_CHANNEL_ID = process.env.SCHEDULED_MESSAGE_BOARDGAME_CHANNEL_ID;
const SCHEDULED_MESSAGE_SWEDISH_CHANNEL_ID = process.env.SCHEDULED_MESSAGE_SWEDISH_CHANNEL_ID;
const SCHEDULED_MESSAGE_CRAFTS_CHANNEL_ID = process.env.SCHEDULED_MESSAGE_CRAFTS_CHANNEL_ID;

// Response channel IDs
const RESPONSE_CHANNEL_CLIMBING_ID = process.env.RESPONSE_CHANNEL_CLIMBING_ID;
const RESPONSE_CHANNEL_BOARDGAME_ID = process.env.RESPONSE_CHANNEL_BOARDGAME_ID;
const RESPONSE_CHANNEL_SWEDISH_ID = process.env.RESPONSE_CHANNEL_SWEDISH_ID;
const RESPONSE_CHANNEL_CRAFTS_ID = process.env.RESPONSE_CHANNEL_CRAFTS_ID;

function sanitizeChannelName(channelName) {
  return channelName.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
}

// Set to keep track of messages that have already triggered an automatic response
const respondedMessages = new Set();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Schedule the message to be sent in CLIMBING every Sunday at 17:30 Stockholm time
  cron.schedule('30 41 2 * * 2', async () => {
    try {
      const channelId = SCHEDULED_MESSAGE_CLIMBING_CHANNEL_ID;
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error('Channel not found or is not a text channel.');
        return;
      }
      const messageContent = `Sup all <@&1263260259087028324>,

**Friendly reminder:** Need to make a post on social media!

React to this message  
❤️ - Automatically send a message in Discord

*Not necessary to react; you can send message manually.*`;

      const sentMessage = await channel.send(messageContent);
      await sentMessage.react('❤️');
      console.log(`Scheduled message sent to ${channel.name} at ${new Date().toLocaleString()}`);
    } catch (error) {
      console.error('Error sending scheduled message:', error);
    }
  }, {
    timezone: 'Europe/Stockholm'
  });

  // Schedule the message to be sent in BOARDGAME every Monday at 17:30
  cron.schedule('0 30 17 * * 1', async () => {
    try {
      const channelId = SCHEDULED_MESSAGE_BOARDGAME_CHANNEL_ID;
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error('Channel not found or is not a text channel.');
        return;
      }
      const messageContent = `Sup all <@&1263260051158732952>,

**Friendly reminder:** Need to make a post on social media!

React to this message  
❤️ - Automatically send a message via Discord bot

*Not necessary to react; you can send message manually.*`;

      const sentMessage = await channel.send(messageContent);
      await sentMessage.react('❤️');
      console.log(`Scheduled message sent to ${channel.name} at ${new Date().toLocaleString()}`);
    } catch (error) {
      console.error('Error sending scheduled message:', error);
    }
  }, {
    timezone: 'Europe/Stockholm'
  });

  // Schedule the message to be sent in SWEDISH every Wednesday at 20:00
  cron.schedule('0 00 20 * * 3', async () => {
    try {
      const channelId = SCHEDULED_MESSAGE_SWEDISH_CHANNEL_ID;
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error('Channel not found or is not a text channel.');
        return;
      }
      const messageContent = `Sup all <@&1290657070953136128>,

**Friendly reminder:** Need to make a post on social media!

React to this message  
❤️ - Automatically send a message in Discord

*Not necessary to react; you can send message manually.*`;

      const sentMessage = await channel.send(messageContent);
      await sentMessage.react('❤️');
      console.log(`Scheduled message sent to ${channel.name} at ${new Date().toLocaleString()}`);
    } catch (error) {
      console.error('Error sending scheduled message:', error);
    }
  }, {
    timezone: 'Europe/Stockholm'
  });

  // Schedule the message to be sent in CRAFTS every
  cron.schedule('0 30 17 * * 4', async () => {
    try {
      const channelId = SCHEDULED_MESSAGE_CRAFTS_CHANNEL_ID;
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error('Channel not found or is not a text channel.');
        return;
      }
      const messageContent = `Sup all <@&1263260321200607285>,

**Friendly reminder:** Need to make a post on social media!

React to this message  
❤️ - Automatically send a message in Discord

*Not necessary to react; you can send message manually.*`;

      const sentMessage = await channel.send(messageContent);
      await sentMessage.react('❤️');
      console.log(`Scheduled message sent to ${channel.name} at ${new Date().toLocaleString()}`);
    } catch (error) {
      console.error('Error sending scheduled message:', error);
    }
  }, {
    timezone: 'Europe/Stockholm'
  });
});

// Event listener for reactions
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  // Fetch partials if needed
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

  // Check if the message was sent by the bot
  if (reaction.message.author.id !== client.user.id) return;

  // Check if the reaction is a heart emoji
  if (reaction.emoji.name === '❤️') {

    // Check if the bot has already responded to this message
    if (respondedMessages.has(reaction.message.id)) return;

    const scheduledChannelId = reaction.message.channel.id;

    let responseChannelId = null;
    let automaticMessage = '';

    if (scheduledChannelId === SCHEDULED_MESSAGE_CLIMBING_CHANNEL_ID) {
      responseChannelId = RESPONSE_CHANNEL_CLIMBING_ID;
      const nextMonday = (() => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const daysUntilNextMonday = (8 - dayOfWeek) % 7 || 7;
        const nextMondayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysUntilNextMonday);
        return nextMondayDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'numeric' });
      })();

      automaticMessage = `Hi <@&1150784194973274242>,
Join us, every Monday, for our climbing event! If you arrive earlier or late, please go to the counter, and the staff will guide you to the waiting area.

**Event Details:**

**Date:** ${nextMonday}
**Time:** 17:30
**Location:** Idrottshuset (Address: Bollgatan 1)

Big thanks to Idrottshuset for their partnership! We're excited to offer a 50% discount on entry fees.

We'll provide all the gear, so just bring yourself! 😊 Whether you're new or experienced in climbing!

Grab a towel if you would like enjoy Idrottshuset sauna!`;
    } else if (scheduledChannelId === SCHEDULED_MESSAGE_BOARDGAME_CHANNEL_ID) {
      responseChannelId = RESPONSE_CHANNEL_BOARDGAME_ID;
      automaticMessage = `<@&1150783727035756654>
Board Game Night

Board Game Night is happening every Tuesday at 18:00! Come and enjoy a fun evening; entry is free as always! We’ll be meeting in Building F.

We have an exciting selection of games, sponsored by the Nexus Game Store in town and Sensus.

Feel free to bring your own games to share with others!

Whether you’re a beginner or a veteran gamer, everyone is welcome. We look forward to seeing you there!`;
    } else if (scheduledChannelId === SCHEDULED_MESSAGE_SWEDISH_CHANNEL_ID) {
      responseChannelId = RESPONSE_CHANNEL_SWEDISH_ID;
      automaticMessage = `YOU NEED TO SEND ME A TEXT TO PUT HERE! DELETE THIS MESSAGE NOW, NOOOOOOOW, hahahaha`;
    } else if (scheduledChannelId === SCHEDULED_MESSAGE_CRAFTS_CHANNEL_ID) {
      responseChannelId = RESPONSE_CHANNEL_CRAFTS_ID;
      automaticMessage = `<@&1150784132511711262>
**Datum/Date:** Friday/Fredag
**Tid/Time:** 18-22, drop in
**Plats/Location:** B hus/ building, rum/room B1009
**Pris/Cost:** Gratis/Free

**Tonight is craft night again!**
If you have your own projects you are working on, please bring them along.
If you are interested in trying something new, Sensus has contributed craft materials such as beads, materials for crocheting and cross-stitching as well as watercolor paints.
Not sure what to do?
If so, we will be happy to help you get started, we explain this in English.
**Everyone from beginners to craft professionals is welcome!**

If you can only spare 15 minutes or an hour, it doesn't matter, we look forward to seeing you here!


**Inatt är det craft night igen!**
Har ni egna projekt ni arbetar på får ni gärna ta med dem.
Är ni intresserade av att testa något nytt så har Sensus bidragit med pysselmaterial som pärlor, material till virkning och korsstygn samt akvarellfärger.
Är du inte säker på hur du ska göra?
Isåfall hjälper vi gärna dig komma igång, vi förklarar detta på Engelska.
**Alla från nybörjare till pysselproffs är välkomna!**

Kan ni bara 15 minuter eller en timme spelar det ingen roll, vi ser fram emot att se er här!`;
    } else {
      automaticMessage = '❤️';
    }

    if (responseChannelId) {
      try {
        const responseChannel = await client.channels.fetch(responseChannelId);
        if (!responseChannel || !responseChannel.isTextBased()) {
          console.error('Response channel not found or is not a text channel.');
          return;
        }
        await responseChannel.send(automaticMessage);
        console.log(`Automatic message sent to ${responseChannel.name} in response to reaction in ${reaction.message.channel.name}`);
      } catch (error) {
        console.error('Error sending automatic message:', error);
      }
    } 
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
    if (!welcomeChannelId) {
      console.error('WELCOME_CHANNEL_ID is not set in the .env file.');
      return;
    }
    const channel = await member.guild.channels.fetch(welcomeChannelId);
    if (!channel || !channel.isTextBased()) {
      console.error('Welcome channel not found or is not a text channel.');
      return;
    }
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('Welcome!')
      .setDescription(`Hello ${member.user}, welcome to **${member.guild.name}**! We're happy to have you.`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor('#00FF00');
    await channel.send({ embeds: [welcomeEmbed] });
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
});

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

async function handleUpdateImagesCommand(message) {
  if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    await message.reply('You do not have permission to use this command.');
    console.log(`User ${message.author.tag} attempted to use !pics without permissions.`);
    return;
  }

  try {
    const args = message.content.trim().split(/\s+/).slice(1);
    let channelId;
    let channelToProcess;

    if (args.length > 0) {
      channelId = args[0];
      console.log(`Received channel ID: ${channelId}`);
      if (!/^\d+$/.test(channelId)) {
        await message.reply('Please provide a valid channel ID (numeric).');
        console.log(`Invalid channel ID format provided: ${channelId}`);
        return;
      }
      channelToProcess = await message.guild.channels.fetch(channelId).catch(err => {
        console.error(`Error fetching channel with ID ${channelId}:`, err);
        return null;
      });

      if (!channelToProcess) {
        await message.reply('Channel not found. Please ensure the channel ID is correct.');
        console.log(`Channel with ID ${channelId} not found.`);
        return;
      }

      if (!channelToProcess.isTextBased()) {
        await message.reply('The specified channel is not a text channel.');
        console.log(`Channel with ID ${channelId} is not a text channel.`);
        return;
      }
    } else {
      await message.reply('Please provide a channel ID.');
      return;
    }

    const channelList = getChannelList();
    if (!channelList.includes(channelId)) {
      await message.reply(`The channel ${channelToProcess.name} is not added for image processing.`);
      console.log(`Channel ${channelToProcess.name} (ID: ${channelId}) is not in channelList.`);
      return;
    }

    await message.reply(`Updating image URLs for channel: ${channelToProcess.name} (ID: ${channelId}), this may take a while...`);
    console.log(`Starting image processing for channel: ${channelToProcess.name} (ID: ${channelId})`);

    const allImageInfos = await fetchAllImageInfosFromChannel(channelToProcess);

    await saveImageInfos(channelToProcess, allImageInfos, true);

    await message.reply(`Image URLs have been updated for channel: ${channelToProcess.name} (ID: ${channelId}).`);
    console.log(`Successfully updated images for channel: ${channelToProcess.name} (ID: ${channelId})`);
  } catch (error) {
    console.error('Error updating image URLs:', error);
    await message.reply('An error occurred while updating image URLs. Please check the logs for more details.');
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
      console.log(`Received channel ID: ${channelId}`);
      if (!/^\d+$/.test(channelId)) {
        await message.reply('Please provide a valid channel ID (numeric).');
        console.log(`Invalid channel ID format provided: ${channelId}`);
        return;
      }
      channelToProcess = await message.guild.channels.fetch(channelId).catch(err => {
        console.error(`Error fetching channel with ID ${channelId}:`, err);
        return null;
      });

      if (!channelToProcess) {
        await message.reply('Channel not found. Please ensure the channel ID is correct.');
        console.log(`Channel with ID ${channelId} not found.`);
        return;
      }

      if (!channelToProcess.isTextBased()) {
        await message.reply('The specified channel is not a text channel.');
        console.log(`Channel with ID ${channelId} is not a text channel.`);
        return;
      }
    }

    const guild = message.guild;
    const botMember = await guild.members.fetchMe();
    const channelList = getChannelList();

    let channels = [];

    if (channelToProcess) {
      // Check if the channel is in the list
      if (!channelList.includes(channelId)) {
        await message.reply(`The channel ${channelToProcess.name} is not added for image processing.`);
        console.log(`Channel ${channelToProcess.name} (ID: ${channelId}) is not in channelList.`);
        return;
      }

      channels = [channelToProcess];
    } else {
      await message.channel.send('Updating image URLs for all added channels, this may take a while...');

      for (const id of channelList) {
        const channel = await guild.channels.fetch(id).catch(() => null);
        if (
          channel &&
          channel.isTextBased() &&
          channel.viewable &&
          channel.permissionsFor(botMember).has([
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory
          ])
        ) {
          channels.push(channel);
        }
      }

      if (channels.length === 0) {
        await message.channel.send('No channels are added for image processing.');
        return;
      }
    }

    console.log('Channels to process:', channels.map(channel => channel.name).join(', '));

    for (const channel of channels) {
      console.log(`Processing channel: ${channel.name}`);
      try {
        const allImageInfos = await fetchAllImageInfosFromChannel(channel);
        await saveImageInfos(channel, allImageInfos, true);
        console.log(`Updated images for channel: ${channel.name}`);
      } catch (error) {
        console.error(`Error updating images for channel ${channel.name}:`, error);
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
      if (messages.size === 0) {
        break;
      }

      for (const message of messages.values()) {
        const imageInfos = await extractImageInfosFromMessage(message, channel);
        allImageInfos.push(...imageInfos);
      }

      lastMessageId = messages.last().id;
    } catch (error) {
      console.error(`Error fetching messages from channel ${channel.name}:`, error);
      break;
    }
  }

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

async function processMessageForImages(message) {
  const imageInfos = await extractImageInfosFromMessage(message, message.channel);
  if (imageInfos.length > 0) {
    await saveImageInfos(message.channel, imageInfos);
  }
}

async function extractImageInfosFromMessage(message, channel) {
  let imageInfos = [];

  const sanitizedChannelName = sanitizeChannelName(channel.name);
  const imagesDir = path.join(process.cwd(), 'assets', sanitizedChannelName);

  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  if (message.attachments.size > 0) {
    const imageAttachments = message.attachments.filter((attachment) =>
      attachment.contentType && attachment.contentType.startsWith('image/')
    );

    if (imageAttachments.size > 0) {
      const infos = await Promise.all(
        imageAttachments.map(async (attachment) => {
          const orientation = await getImageOrientation(attachment.url);
          if (orientation) {
            const ext = path.extname(attachment.name) || '.jpg';
            const localFilename = `${message.id}_${attachment.id}${ext}`;
            const localFilePath = path.join(imagesDir, localFilename);

            await downloadImage(attachment.url, localFilePath);

            const serverUrl = `https://api2.cultureconnection.se/assets/${sanitizedChannelName}/${localFilename}`;

            return {
              url: serverUrl,
              orientation,
            };
          } else {
            return null;
          }
        })
      );
      imageInfos.push(...infos.filter((info) => info !== null));
    }
  }

  if (message.embeds.length > 0) {
    const imageEmbeds = message.embeds.filter((embed) => embed.image && embed.image.url);
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

            return {
              url: serverUrl,
              orientation,
            };
          } else {
            return null;
          }
        })
      );
      imageInfos.push(...infos.filter((info) => info !== null));
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
    if (width > height) {
      return 'horizontal';
    } else if (height > width) {
      return 'vertical';
    } else {
      return 'square';
    }
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

    let updatedData;
    let existingData = [];

    if (fs.existsSync(dataFilePath)) {
      existingData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    }

    if (fullUpdate) {
      const newUrls = new Set(newInfos.map(info => info.url));
      const imagesToDelete = existingData.filter(info => !newUrls.has(info.url));

      for (const info of imagesToDelete) {
        const localFilename = path.basename(new URL(info.url).pathname);
        const localFilePath = path.join(imagesDir, localFilename);
        if (fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
          console.log(`Deleted image file: ${localFilePath}`);
        }
      }

      updatedData = newInfos;
    } else {
      const combinedData = [...existingData, ...newInfos];
      const uniqueData = [];
      const urls = new Set();
      for (const info of combinedData) {
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
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

app.use('/assets', express.static(path.join(process.cwd(), 'assets')));

app.get('/', (req, res) => {
  res.json({ hello: 'world2' });
});

app.get('/assets', (req, res) => {
  const dataDir = path.join(process.cwd(), 'assets');

  fs.readdir(dataDir, (err, files) => {
    if (err) {
      res.status(500).json({ error: 'Failed to read data directory' });
    } else {
      const channels = files.filter(file => fs.lstatSync(path.join(dataDir, file)).isDirectory());
      res.json({ channels });
    }
  });
});

app.get('/assets/:channelName', (req, res) => {
  const { channelName } = req.params;
  const sanitizedChannelName = sanitizeChannelName(channelName);
  const dataFilePath = path.join(process.cwd(), 'assets', sanitizedChannelName, `${sanitizedChannelName}.json`);

  fs.readFile(dataFilePath, 'utf8', (err, data) => {
    if (err) {
      res.status(404).json({ error: 'Channel data not found' });
    } else {
      res.json(JSON.parse(data));
    }
  });
});

app.get('/all-data', (req, res) => {
  const dataDir = path.join(process.cwd(), 'assets');

  fs.readdir(dataDir, (err, directories) => {
    if (err) {
      res.status(500).json({ error: 'Failed to read data directory' });
    } else {
      let allData = [];

      directories.forEach(dir => {
        const dataFilePath = path.join(dataDir, dir, `${dir}.json`);
        if (fs.existsSync(dataFilePath)) {
          const data = fs.readFileSync(dataFilePath, 'utf8');
          allData = allData.concat(JSON.parse(data));
        }
      });

      res.json(allData);
    }
  });
});

app.listen(PORT, () => {
  console.log(`API server is running on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);