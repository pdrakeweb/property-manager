# Google OAuth Setup

This app uses Google OAuth 2.0 with PKCE to authenticate users and access Google Drive and Google Photos. No backend server or client secret is required.

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** > **New Project**
3. Name it (e.g. "Property Manager") and click **Create**

## 2. Enable APIs

In your project, go to **APIs & Services > Library** and enable:

- **Google Drive API**
- **Photos Library API**

## 3. Configure OAuth Consent Screen

Go to **APIs & Services > OAuth consent screen**:

1. Select **External** user type
2. Fill in the app name (e.g. "Property Manager") and your email
3. Add scopes:
   - `openid`
   - `email`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/photoslibrary.readonly`
4. Add your Gmail address as a **Test user** (required while in Testing mode)
5. Save

## 4. Create OAuth Client ID

Go to **APIs & Services > Credentials**:

1. Click **Create Credentials > OAuth client ID**
2. Application type: **Web application**
3. Name: "Property Manager Web"
4. Authorized JavaScript origins:
   - `http://localhost:5173` (development)
   - Your production URL (e.g. `https://yourusername.github.io`)
5. Authorized redirect URIs:
   - `http://localhost:5173/` (development)
   - Your production URL with trailing slash
6. Click **Create** and copy the **Client ID**

## 5. Configure the App

Create a `.env` file in the project root:

```
VITE_GOOGLE_CLIENT_ID=your-client-id-here
VITE_AUTH_BYPASS=false
```

For CI/automated testing without Google credentials:

```
VITE_AUTH_BYPASS=true
```

## 6. Deploy with GitHub Actions

Add `GOOGLE_CLIENT_ID` as a repository secret, then reference it in your workflow:

```yaml
- run: npm run build
  env:
    VITE_GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
```

## Notes

- The app uses PKCE (Proof Key for Code Exchange), so no client secret is stored in the code
- Tokens are stored in `localStorage` on the user's device
- While the OAuth consent screen is in "Testing" mode, only added test users can sign in
- To allow any Google user, submit the consent screen for verification
