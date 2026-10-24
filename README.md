# Task Manager Board

A minimal daily kanban board with real authentication. Plan your day across **To do**, **In progress** and **Done**, with every task saved to your own account in MongoDB.

## Features

- **Real authentication**
  - Email and password sign-up and login, with passwords hashed using bcrypt
  - Optional "Continue with Google" sign-in, with the Google token verified on the server
  - Sessions stored in an httpOnly cookie (signed JWT, 7-day expiry)
  - Rate limiting on all auth routes
- **Kanban board**
  - Three columns: To do, In progress, Done
  - Drag and drop between columns, or use the arrow buttons
  - Priority levels (High, Medium, Low)
  - Optional task descriptions
  - Progress bar and live task counts
- **Per-user data:** every account only ever sees its own tasks
- **Responsive UI** with a light/dark theme toggle

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Plain HTML, CSS and JavaScript (single file, no build step) |
| Backend | Node.js and Express |
| Database | MongoDB (Atlas or local) with Mongoose |
| Auth | bcryptjs, jsonwebtoken, cookie-parser, google-auth-library |
| Security | helmet, express-rate-limit |
| Hosting | Render |

## Project structure

```
.
├── public/
│   └── index.html        # The whole frontend (UI, styles and client logic)
├── server.js             # Express app: auth, tasks API, security, static files
├── package.json          # Dependencies and scripts
├── render.yaml           # Render blueprint for one-click deploys
├── .env.example          # Template for environment variables
├── .gitignore            # Keeps .env and node_modules out of Git
└── README.md             # This file
```

## Getting started locally

### Prerequisites

- [Node.js](https://nodejs.org) 18 or newer
- A MongoDB database: a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster, or MongoDB Community Server running locally

### Setup

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
   cd YOUR-REPO
   npm install
   ```
2. Create your environment file:
   ```bash
   cp .env.example .env
   ```
3. Fill in `.env` (see the table below).
4. Start the server:
   ```bash
   npm start
   ```
5. Open <http://localhost:3000>, create an account and add a task.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string, including the database name, e.g. `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/daily-kanban?retryWrites=true&w=majority` |
| `JWT_SECRET` | Yes | Long random string used to sign login cookies (16+ characters) |
| `PORT` | No | Port to listen on. Defaults to `3000` |
| `NODE_ENV` | No | Set to `production` on your host so cookies are marked `secure` |
| `GOOGLE_CLIENT_ID` | No | Enables Google sign-in. The button stays hidden if this is empty |

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Enabling Google sign-in (optional)

1. In the [Google Cloud Console](https://console.cloud.google.com), create a project and set up the OAuth consent screen (External).
2. Create an **OAuth client ID** of type **Web application**.
3. Add `http://localhost:3000` (and your live URL when you deploy) under **Authorized JavaScript origins**.
4. Copy the client ID into `GOOGLE_CLIENT_ID` in your `.env` and restart the server.

While the consent screen is in Testing mode, only emails listed as test users can sign in. Publish the app to open it to everyone.

## API reference

All routes are under `/api`. Task routes and `/api/me` require a valid session cookie.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/config` | Public config (the Google client ID) |
| `POST` | `/auth/signup` | Create an account (`email`, `password`, optional `name`) |
| `POST` | `/auth/login` | Log in (`email`, `password`) |
| `POST` | `/auth/google` | Log in with a Google ID token (`credential`) |
| `POST` | `/auth/logout` | Clear the session |
| `GET` | `/me` | Current user |
| `GET` | `/tasks` | List your tasks |
| `POST` | `/tasks` | Create a task (`t`, optional `d`, `p`) |
| `PATCH` | `/tasks/:id` | Move a task (`c`: `todo`, `doing` or `done`) |
| `DELETE` | `/tasks/:id` | Delete a task |
| `POST` | `/tasks/clear-done` | Delete all your completed tasks |

There is also a `GET /health` route (outside `/api`) that returns `200` when the database is connected. Hosting platforms use it to check the app is running.
