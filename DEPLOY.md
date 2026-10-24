# Deploying Daily Board for free (Render + MongoDB Atlas)

Render is the best free option for a Node + MongoDB app right now. Fly.io has no free tier
for new accounts, and Koyeb no longer offers free web services. Render's free web service
sleeps after 15 idle minutes, so the first visit afterwards takes about a minute to wake up.

## 1. Put the code on GitHub
1. Create a new empty repository on github.com (private is fine).
2. In the project folder run:
   ```
   git init
   git add .
   git commit -m "Daily Board"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/daily-board.git
   git push -u origin main
   ```
   The `.gitignore` keeps your `.env` and `node_modules` out. Check on GitHub that `.env` is NOT there.

## 2. MongoDB Atlas
- **Network Access:** add `0.0.0.0/0` (Render's IPs change). Use a long, random database password.
- Make sure your connection string includes the database name (`.../daily-kanban?...`).

## 3. Create the service on Render
1. Sign up at render.com with GitHub.
2. **New +  >  Web Service**, pick your repository. (Or **New + > Blueprint** to use `render.yaml`.)
3. Settings: Runtime **Node**, Build Command `npm install`, Start Command `npm start`, Instance Type **Free**.
4. Under **Environment**, add:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = your Atlas connection string
   - `JWT_SECRET` = a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `GOOGLE_CLIENT_ID` = your Google client ID (optional)
5. Set **Health Check Path** to `/health`, then click **Create Web Service**.
6. When the deploy finishes, open your URL, e.g. `https://daily-board.onrender.com`.

## 4. Google sign-in for the live URL
1. Google Cloud Console > APIs & Services > Credentials > your OAuth client.
2. Under **Authorized JavaScript origins** add your Render URL (no trailing slash). Save.
3. Google Auth Platform > **Audience** > **Publish app** so anyone (not just test users) can sign in.
   Changes can take a few minutes to apply.

## 5. Optional: avoid the sleep delay
Create a free monitor at uptimerobot.com that requests `https://YOUR-URL/health` every 5 minutes.
A single free service can stay up all month within Render's 750 free hours.

## Troubleshooting
- **Deploy log says "Set MONGODB_URI..."**: an environment variable is missing in Render.
- **"MongoDB connection failed"**: check the password, and that Atlas allows `0.0.0.0/0`.
- **Can't stay logged in**: make sure `NODE_ENV=production` and you're on the https URL.
- **Google button missing or errors**: `GOOGLE_CLIENT_ID` not set, or the live URL isn't in Authorized JavaScript origins.
