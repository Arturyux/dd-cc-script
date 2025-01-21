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

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

// =========== DISCORD CLIENT ===========
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

// =========== FILE PATHS ===========
const scheduledMessagesFilePath = path.join(process.cwd(), 'assets', 'scheduledMessages.json');

// Default content if the file doesn't exist
const defaultScheduledMessages = [
  {
    "name": "example",
    "turnon": true,
    "channelId": "example",
    "responseChannelId": "example",
    "roleId": "example",
    "hour": "00",
    "minutes": "42",
    "seconds": "0",
    "dayoftheweek": "2",
    "timezone": "Europe/Stockholm",
    "messageContent": "example",
    "automaticResponses": [
      {
        "title": "example",
        "content": "example"
      },
      {
        "title": "example",
        "content": "example"
      }
    ]
  }
];

// If scheduledMessages.json doesn't exist, create it with default content
if (!fs.existsSync(scheduledMessagesFilePath)) {
  console.log('scheduledMessages.json not found. Creating a default file...');
  fs.writeFileSync(
    scheduledMessagesFilePath,
    JSON.stringify(defaultScheduledMessages, null, 2),
    'utf8'
  );
  console.log('Default scheduledMessages.json file created.');
}

// ========== LOAD SCHEDULED MESSAGES INTO MEMORY ==========
let scheduledMessages = [];
try {
  const rawData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
  scheduledMessages = JSON.parse(rawData);
} catch (err) {
  console.error('Error reading scheduledMessages.json:', err);
  scheduledMessages = [];
}

// We'll store all cron jobs in this array so we can stop/reload them
let cronJobs = [];

// ========== FUNCTION: CREATE CRON JOBS FOR MESSAGES ==========
function scheduleAllMessages(messages) {
  // Stop existing cron jobs
  cronJobs.forEach(job => job.stop());
  cronJobs = [];

  messages.forEach((messageData) => {
    if (!messageData.turnon) {
      console.log(`Skipping disabled task: ${messageData.name}`);
      return;
    }

    // Construct cron schedule string: second minute hour * * dayOfWeek
    const cronSchedule = `${messageData.seconds} ${messageData.minutes} ${messageData.hour} * * ${messageData.dayoftheweek}`;

    // Create a new cron job
    const job = cron.schedule(
      cronSchedule,
      async () => {
        try {
          const channel = await client.channels.fetch(messageData.channelId);
          if (!channel || !channel.isTextBased()) {
            console.error(`Channel not found or not text-based for ${messageData.name}`);
            return;
          }
          const sentMessage = await channel.send(messageData.messageContent);
          await sentMessage.react('❤️');
          console.log(`Scheduled message sent to #${channel.name} at ${new Date().toLocaleString()}`);
        } catch (error) {
          console.error(`Error sending scheduled message for ${messageData.name}:`, error);
        }
      },
      { timezone: messageData.timezone }
    );

    // Keep track of this cron job
    cronJobs.push(job);
  });
}

// ========== INITIAL SCHEDULE SETUP ==========
client.once('ready', () => {
  // Setup cron jobs based on current scheduledMessages array
  scheduleAllMessages(scheduledMessages);
  console.log(`Logged in as ${client.user.tag}!`);
});

// ========== WATCH FILE FOR CHANGES ==========
fs.watchFile(scheduledMessagesFilePath, (curr, prev) => {
  // If modification time is different, reload scheduled messages
  if (curr.mtime > prev.mtime) {
    console.log('scheduledMessages.json has changed on disk. Reloading...');
    try {
      const fileData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
      const parsed = JSON.parse(fileData);
      scheduledMessages = parsed; // update in-memory array
      // Re-schedule all tasks
      scheduleAllMessages(scheduledMessages);
      console.log('Reload complete. New scheduled messages have been applied.');
    } catch (err) {
      console.error('Error reloading scheduledMessages.json:', err);
    }
  }
});

// ========== REACTION LISTENER LOGIC ==========
const respondedMessages = new Set(); // track messages that got an auto-response

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  // Handle partial fetches
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

  // Ensure it's our bot's message
  if (reaction.message.author.id !== client.user.id) return;

  // Check if the emoji is ❤️
  if (reaction.emoji.name === '❤️') {
    // Prevent duplicate auto-responses
    if (respondedMessages.has(reaction.message.id)) {
      console.log(`Already responded to message ID: ${reaction.message.id}`);
      return;
    }
    respondedMessages.add(reaction.message.id);

    // Find the scheduled message that matches this channel
    const messageData = scheduledMessages.find(
      (msg) => msg.channelId === reaction.message.channel.id
    );

    if (messageData && messageData.turnon) {
      if (messageData.automaticResponses && messageData.automaticResponses.length > 0) {
        // pick a random response
        const randomResponse =
          messageData.automaticResponses[
            Math.floor(Math.random() * messageData.automaticResponses.length)
          ];

        try {
          const responseChannel = await client.channels.fetch(messageData.responseChannelId);
          if (!responseChannel || !responseChannel.isTextBased()) {
            console.error(`Response channel not found or not text-based for ${messageData.name}`);
            return;
          }
          await responseChannel.send(randomResponse.content);
          console.log(
            `Sent automatic response: "${randomResponse.title}" to #${responseChannel.name}.`
          );
        } catch (error) {
          console.error(`Error sending automatic response for ${messageData.name}:`, error);
        }
      } else {
        console.error(`No automatic responses defined for ${messageData.name}.`);
      }
    }
  }
});

// ========== WELCOME MESSAGE EXAMPLE ==========
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
      .setDescription(`Hello ${member.user}, welcome to **${member.guild.name}**!`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor('#00FF00');
    await channel.send({ embeds: [welcomeEmbed] });
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
});

// ========== IMAGE PROCESSING COMMANDS (etc.) ==========
// (Omitted for brevity, same as in your code)
// ...

// ========== EXPRESS SERVER SETUP ==========
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);
app.use(express.json());

// Example route
app.get('/', (req, res) => {
  res.json({ hello: 'world2' });
});

// Serve static files, etc.
// ...

// ========== SCHEDULED MESSAGES ROUTES ==========
// Same CRUD logic, returning success/data, etc.
app.get('/scheduledMessages', (req, res) => {
  try {
    const fileData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
    const parsed = JSON.parse(fileData);
    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to read or parse scheduledMessages file' });
  }
});

app.post('/scheduledMessages', (req, res) => {
  const newMessage = req.body;
  try {
    const fileData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
    let parsed = JSON.parse(fileData);
    parsed.push(newMessage);
    fs.writeFileSync(scheduledMessagesFilePath, JSON.stringify(parsed, null, 2));
    res.status(201).json({ success: true, data: newMessage });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add new scheduled message' });
  }
});

app.put('/scheduledMessages/:index', (req, res) => {
  const index = parseInt(req.params.index, 10);
  const updatedMessage = req.body;
  try {
    const fileData = fs.readFileSync(scheduledMessagesFilePath, 'utf8');
    let parsed = JSON.parse(fileData);

    if (index >= 0 && index < parsed.length) {
      parsed[index] = updatedMessage;
      fs.writeFileSync(scheduledMessagesFilePath, JSON.stringify(parsed, null, 2));
      res.json({ success: true, data: updatedMessage });
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

// Start server + login Discord
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('Failed to login to Discord:', err);
});