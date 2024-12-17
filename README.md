# Culture Connection Discord Bot

A Discord bot for scheduling reminders, automating messages, managing image uploads, and exposing image data through a REST API. Built using Node.js, Express, and Discord.js.

##  **Features**
1. **Scheduled Messages**: Automatically sends scheduled reminders in specific Discord channels.
2. **Automatic Reactions**: Responds to emoji reactions and sends follow-up messages.
3. **Image Processing**: Fetches and processes images from messages.
4. **API Endpoints**: Serves JSON data of uploaded images.
5. **Admin Commands**:
   - Add or remove channels for image processing.
   - Fetch and update images using commands.

## **Commands**
Commands for Discord Admins (requires Board Member role):
- `!cc-pic-channel-add <channelID>`: Add a channel for image processing.
- `!cc-pic-channel-remove <channelID>`: Remove a channel.
- `!cc-pic-channel-ls`: List all added channels.
- `!pics <channelID>`: Update image data for a specific channel.
- `!picsall`: Update image data for all added channels.
