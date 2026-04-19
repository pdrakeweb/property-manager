// Google OAuth 2.0 PKCE — no client secret, runs entirely in the browser

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar openid email profile'

/** Client ID: set VITE_GOOGLE_CLIENT_ID in .env, or store in localStorage for zero-rebuild config */
export function getClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)
    ?? localStorage.getItem('google_client_id')
    ?? ''
}

/** Client secret: only needed for "Web application" client type (not SPA) */
function getClientSecret(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined) ?? ''
}

/** The redirect URI must exactly match what's registered in Google Cloud Console */
function getRedirectUri(): string {
  return window.location.origin + window.location.pathname
}

// ── PKCE helpers ────────────────────────────────────────────────────────────

async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data   = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Redirect the browser to Google's OAuth consent screen */
export async function startOAuthFlow(): Promise<void> {
  const verifier   = await generateCodeVerifier()
  const challenge  = await generateCodeChallenge(verifier)
  const state      = crypto.randomUUID()

  sessionStorage.setItem('pkce_verifier', verifier)
  sessionStorage.setItem('oauth_state',   state)

  const params = new URLSearchParams({
    client_id:             getClientId(),
    redirect_uri:          getRedirectUri(),
    response_type:         'code',
    scope:                 SCOPES,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state,
    access_type:           'offline',
    prompt:                'consent',
  })

  window.location.href = `${GOOGLE_AUTH_URL}?${params}`
}

export interface TokenResponse {
  access_token:  string
  refresh_token?: string
  expires_in:    number
  token_type:    string
  id_token?:     string
}

/** Exchange the OAuth code for tokens. Call on app mount when ?code= is present. */
export async function handleOAuthCallback(code: string, state: string): Promise<TokenResponse> {
  const storedState = sessionStorage.getItem('oauth_state')
  if (state !== storedState) throw new Error('OAuth state mismatch — possible CSRF')

  const verifier = sessionStorage.getItem('pkce_verifier')
  if (!verifier) throw new Error('PKCE verifier missing from session')

  const tokenParams: Record<string, string> = {
    client_id:     getClientId(),
    code,
    redirect_uri:  getRedirectUri(),
    grant_type:    'authorization_code',
    code_verifier: verifier,
  }
  const secret = getClientSecret()
  if (secret) tokenParams.client_secret = secret

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams(tokenParams),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token exchange failed (${resp.status}): ${text}`)
  }

  const tokens = await resp.json() as TokenResponse

  sessionStorage.removeItem('pkce_verifier')
  sessionStorage.removeItem('oauth_state')

  _persistTokens(tokens)
  return tokens
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('google_refresh_token')
  if (!refreshToken) throw new Error('No refresh token stored')

  const refreshParams: Record<string, string> = {
    client_id:     getClientId(),
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  }
  const secret = getClientSecret()
  if (secret) refreshParams.client_secret = secret

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams(refreshParams),
  })

  if (!resp.ok) throw new Error(`Token refresh failed: ${resp.status}`)

  const tokens = await resp.json() as TokenResponse
  _persistTokens(tokens)
  return tokens.access_token
}

function _persistTokens(tokens: TokenResponse): void {
  const expiresAt = Date.now() + tokens.expires_in * 1000
  localStorage.setItem('google_access_token',    tokens.access_token)
  localStorage.setItem('google_token_expires_at', String(expiresAt))

  if (tokens.refresh_token) {
    localStorage.setItem('google_refresh_token', tokens.refresh_token)
  }

  if (tokens.id_token) {
    try {
      // JWT payload is base64url-encoded JSON; no library needed
      const payload = JSON.parse(atob(tokens.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
      localStorage.setItem('google_user_email', String(payload['email'] ?? ''))
      localStorage.setItem('google_user_name',  String(payload['name']  ?? ''))
    } catch {
      // Non-fatal: user info is display-only
    }
  }
}

/** Returns a valid access token, refreshing if needed. Returns null if not authenticated. */
export async function getValidToken(): Promise<string | null> {
  const token     = localStorage.getItem('google_access_token')
  const expiresAt = Number(localStorage.getItem('google_token_expires_at') ?? 0)

  if (!token) return null

  // Dev bypass token never expires — skip refresh entirely
  if (token === 'dev_token') return token

  // Refresh proactively if expiring within 5 minutes
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    try {
      return await refreshAccessToken()
    } catch {
      signOut()
      return null
    }
  }

  return token
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('google_access_token')
}

/** True when the dev bypass token is in use (not a real Google OAuth token) */
export function isDev(): boolean {
  return localStorage.getItem('google_access_token') === 'dev_token'
}

export function getUserEmail(): string {
  return localStorage.getItem('google_user_email') ?? ''
}

export function getUserName(): string {
  return localStorage.getItem('google_user_name') ?? ''
}

export function signOut(): void {
  for (const key of ['google_access_token', 'google_token_expires_at', 'google_refresh_token', 'google_user_email', 'google_user_name']) {
    localStorage.removeItem(key)
  }
}
