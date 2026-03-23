# Run TikTok notifier 24/7 on Railway

Your PC does **not** need to stay on. Railway runs `npm start` in the cloud.

## One-time setup

1. **Push this folder to GitHub** (create a new repo, e.g. `tiktok-live-notifier`).  
   - Do **not** commit `.env` (it is gitignored). Secrets go only in Railway.

2. **[railway.app](https://railway.app)** → Login with GitHub → **New Project** → **Deploy from GitHub repo** → pick this repo.

3. Wait for the first deploy. If it fails, open **Logs** — the start command is `npm start` (runs `ts-node`).

4. Click your **service** → **Variables** → add **each** line from your local `.env` as a separate variable (same names, same values):

   | Variable | Example |
   |----------|---------|
   | `TIKTOK_PROFILE_URLS` | `https://www.tiktok.com/@a,https://www.tiktok.com/@b` |
   | `DISCORD_TOKEN` | (bot token) |
   | `DISCORD_CHANNEL_ID` | (channel id) |
   | `DISCORD_ROLE_ID` | `1485140538704396400` |
   | `DISCORD_MESSAGE` | Your text |
   | `DISCORD_EMBED_TITLE` | Optional custom title |
   | `DEFAULT_INTERVAL_IN_SECONDS` | `120` |
   | `ENABLE_LOGS` | `true` |
   | `MINIMUM_VIEWERS_TO_SEND_NOTIFICATION` | `0` |

5. **Save.** Railway restarts the service.

6. **Logs** should show: `Monitoring N account(s): @...` and `Logged in as YourBot#1234`.

## When you change settings

Edit variables in Railway (or edit local `.env` and copy values over). No need to upload `.env` as a file.

## Cost

Same as any Railway project — use trial/credits or a paid plan so the service stays **running** (not sleeping), or notifications will stop.
