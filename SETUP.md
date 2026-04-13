# Property Manager — Setup Guide

## Prerequisites

- Node.js 20+
- A Google account
- A GitHub account (for deployment)

---

## 1. Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g., `property-manager`)
3. In the left menu: **APIs & Services → Library**
4. Enable **Google Drive API**

---

## 2. Create OAuth 2.0 Web Client

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `Property Manager`
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173`
   - `https://<your-github-username>.github.io`
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:5173`
   - `https://<your-github-username>.github.io/property-manager`
7. Click **Create** and copy the **Client ID**

---

## 3. Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. User type: **External** (or Internal if using Google Workspace)
3. Fill in App name, support email, developer email
4. Under **Scopes**, add:
   - `https://www.googleapis.com/auth/drive.file`
5. Add your Google account to **Test users**
6. Save and continue

---

## 4. Local Development

```bash
# Clone and install
npm install

# Create your local env file
cp .env.example .env
# Edit .env and paste your Client ID:
# VITE_GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com

# Start dev server
npm run dev
# Open http://localhost:5173
```

---

## 5. GitHub Actions Deployment

1. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
   - Name: `GOOGLE_CLIENT_ID`
   - Value: your OAuth Client ID
3. Push to `main` — the workflow in `.github/workflows/deploy.yml` will build and deploy to GitHub Pages automatically
4. In **Settings → Pages**, set source to `gh-pages` branch

---

## 6. First Launch

1. Open the app — you'll see a Google sign-in prompt
2. Authorize Drive access when prompted
3. The app will create a `Property Manager/` folder in your Google Drive root
4. Go to **Settings** to:
   - Add your OpenRouter API key (for AI features)
   - Configure Home Assistant URL and token (optional)
   - Set up your properties

---

## OpenRouter API Key

[OpenRouter](https://openrouter.ai) provides unified access to Claude, GPT-4o, Gemini, and other models.

1. Create an account at openrouter.ai
2. Generate an API key
3. Paste it in **Settings → OpenRouter AI → API Key**

The app defaults to Claude Sonnet 4.6 for nameplate extraction and Claude Opus 4.6 for advisory/analysis. Models can be changed per-task in Settings.
