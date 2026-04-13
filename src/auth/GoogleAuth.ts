/**
 * Google OAuth 2.0 with PKCE — no client secret required for public SPAs.
 * Tokens are stored in localStorage on the user's trusted personal device.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string
const REDIRECT_URI = window.location.origin + window.location.pathname
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/photoslibrary.readonly openid email'

const STORAGE_KEYS = {
  accessToken: 'gauth_access_token',
  refreshToken: 'gauth_refresh_token',
  expiry: 'gauth_expiry',
  verifier: 'pkce_verifier',
  email: 'gauth_email',
} as const

// ─── PKCE helpers ──────────────────────────────────────────────────────────────

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const byte of bytes) {
    str += String.fromCharCode(byte)
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64))
  const verifier = base64urlEncode(verifierBytes.buffer as ArrayBuffer)

  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const challenge = base64urlEncode(hashBuffer)

  return { verifier, challenge }
}

// ─── Auth initiation ───────────────────────────────────────────────────────────

export async function initiateAuth(): Promise<void> {
  const { verifier, challenge } = await generatePKCE()
  localStorage.setItem(STORAGE_KEYS.verifier, verifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  })

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// ─── Token exchange ────────────────────────────────────────────────────────────

export async function handleCallback(code: string): Promise<void> {
  const verifier = localStorage.getItem(STORAGE_KEYS.verifier)
  if (!verifier) {
    throw new Error('PKCE verifier missing — auth flow may have been interrupted')
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    grant_type: 'authorization_code',
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Token exchange failed: ${err}`)
  }

  const data: TokenResponse = await response.json()
  storeTokens(data)
  localStorage.removeItem(STORAGE_KEYS.verifier)
}

// ─── Token refresh ─────────────────────────────────────────────────────────────

export async function refreshAccessToken(): Promise<void> {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken)
  if (!refreshToken) {
    throw new Error('No refresh token available — user must sign in again')
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Token refresh failed: ${err}`)
  }

  const data: Partial<TokenResponse> = await response.json()

  localStorage.setItem(STORAGE_KEYS.accessToken, data.access_token!)
  localStorage.setItem(
    STORAGE_KEYS.expiry,
    String(Date.now() + (data.expires_in ?? 3600) * 1000),
  )
  // refresh_token is not always returned on refresh — keep existing if absent
  if (data.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.refreshToken, data.refresh_token)
  }
}

// ─── Token validity ────────────────────────────────────────────────────────────

/** Returns a valid access token or null. Attempts refresh transparently. */
export async function getValidToken(): Promise<string | null> {
  const token = localStorage.getItem(STORAGE_KEYS.accessToken)
  const expiry = Number(localStorage.getItem(STORAGE_KEYS.expiry) ?? '0')

  // 5-minute buffer before expiry
  if (token && expiry > Date.now() + 5 * 60 * 1000) {
    return token
  }

  // Token missing or near-expired — try refresh
  try {
    await refreshAccessToken()
    return localStorage.getItem(STORAGE_KEYS.accessToken)
  } catch {
    return null
  }
}

// ─── Sign-out ──────────────────────────────────────────────────────────────────

export function signOut(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    localStorage.removeItem(key)
  }
}

// ─── Identity helpers ──────────────────────────────────────────────────────────

export function getStoredEmail(): string | null {
  return localStorage.getItem(STORAGE_KEYS.email)
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
  token_type: string
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const payload = jwt.split('.')[1]
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    return JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

function storeTokens(data: TokenResponse): void {
  localStorage.setItem(STORAGE_KEYS.accessToken, data.access_token)
  localStorage.setItem(
    STORAGE_KEYS.expiry,
    String(Date.now() + data.expires_in * 1000),
  )
  if (data.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.refreshToken, data.refresh_token)
  }
  if (data.id_token) {
    const payload = decodeJwtPayload(data.id_token)
    if (typeof payload.email === 'string') {
      localStorage.setItem(STORAGE_KEYS.email, payload.email)
    }
  }
}
