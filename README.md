# Shareable Coding Problems

A simple web app inspired by Advent of Code where you and your friends can submit and solve coding problems together. Features GitHub OAuth authentication, no database required (data stored in memory and persisted to JSON), and works without JavaScript enabled.

## Features

- GitHub OAuth authentication
- Create coding problems with descriptions, optional input files, and answer validation
- Submit answers and track your progress
- Delete your own problems
- Problem statistics (attempts and solves)
- No database - data persisted to JSON file every 30 seconds
- Works without JavaScript (form-based interactions)
- Clean, minimalistic hacker-style interface

## Local Development

1. Create a GitHub OAuth App:
   - Go to https://github.com/settings/developers
   - Click "New OAuth App"
   - Application name: `Coding Problems (Dev)`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/auth/github/callback`
   - Copy your Client ID and Client Secret

2. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

3. Add your GitHub OAuth credentials to `.env`:
   ```
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
   BASE_URL=http://localhost:3000
   ```

4. Install dependencies:
   ```bash
   bun install
   ```

5. Run the server:
   ```bash
   bun run index.ts
   ```

6. Open http://localhost:3000 in your browser

## Deploy to Railway

Railway provides easy deployment with automatic HTTPS and persistent storage.

### 1. Prepare GitHub OAuth for Production

Create a **separate** GitHub OAuth App for production:
- Go to https://github.com/settings/developers
- Click "New OAuth App"
- Application name: `Coding Problems`
- Homepage URL: `https://your-app.up.railway.app` (you'll get this URL after deploying)
- Authorization callback URL: `https://your-app.up.railway.app/auth/github/callback`
- Copy your Client ID and Client Secret

### 2. Deploy to Railway

1. Push your code to GitHub

2. Go to [Railway](https://railway.app) and sign in

3. Click "New Project" → "Deploy from GitHub repo"

4. Select your repository

5. Railway will auto-detect and deploy your app

### 3. Add a Volume for Data Persistence

1. In your Railway project, click on your service
2. Go to "Volumes" tab
3. Click "New Volume"
4. Mount path: `/data`
5. Size: 1GB (more than enough)

### 4. Configure Environment Variables

In Railway, go to "Variables" tab and add:

```
GITHUB_CLIENT_ID=your_production_client_id
GITHUB_CLIENT_SECRET=your_production_client_secret
BASE_URL=https://your-app.up.railway.app
DATA_DIR=/data
ADMIN_USERS=your_github_username,friend_username
```

### 5. Update GitHub OAuth Callback URL

Once deployed, Railway gives you a URL like `https://your-app.up.railway.app`

Go back to your GitHub OAuth App settings and update:
- Homepage URL: `https://your-app.up.railway.app`
- Authorization callback URL: `https://your-app.up.railway.app/auth/github/callback`

### 6. Redeploy

Click "Deploy" in Railway to apply the environment variables.

Done! Your app is now live with HTTPS and persistent storage.

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | Yes | - |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | Yes | - |
| `BASE_URL` | Full URL where app is hosted | Yes | `http://localhost:3000` |
| `PORT` | Port to run server on | No | `3000` |
| `DATA_DIR` | Directory to store data.json | No | `.` (current dir) |
| `ADMIN_USERS` | Comma-separated GitHub usernames with admin access | No | - |

## Usage

- **Login**: Click "Login with GitHub" to authenticate
- **Create Problem**: Once logged in, click "new" to create a coding challenge
- **Solve Problems**: Click on any problem to view details and submit your answer
- **Track Progress**: See which problems you've solved on the homepage with ✓ badges
- **Delete Problems**: Problem authors can delete their own problems
- **Admin Panel**: Users listed in `ADMIN_USERS` can access `/admin` to view all data and delete users, problems, or submissions

## Data Persistence

The app stores all data in memory and automatically saves to `data.json` every 30 seconds. On startup, it loads the previous state from this file. No database required!

For Railway deployment, data is stored in `/data/data.json` on the persistent volume.

## Tech Stack

- [Bun](https://bun.com) - Fast all-in-one JavaScript runtime
- Bun.serve - Built-in HTTP server
- GitHub OAuth - Authentication
- No framework, no database, no JavaScript required on frontend

This project was created using `bun init` in bun v1.3.2.
