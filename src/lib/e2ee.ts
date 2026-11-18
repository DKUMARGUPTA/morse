// Morse Messenger — E2EE (BETA)
//
// WebCrypto ECDH P-256 key agreement + AES-GCM-256 message encryption.
// Each device generates a keypair on first load; the private key stays in this
// browser's localStorage and the public key is published to the server.
// A 1:1 conversation derives a shared AES key from both public keys (ECDH).
//
// BETA LIMITATIONS (honest scope, no security claims until a full review):
// - private key is extractable and stored in localStorage (no multi-device sync yet)
// - no forward secrecy / no double ratchet
// - server-side search does not cover encrypted conversations

const LEGACY_PRIV_KEY = 'mm_e2ee_priv_jwk'
const KEY_CACHE = new Map<string, CryptoKey>() // peerPubJwk -> derived AES key

// The stored keypair is namespaced per account so a second person signing in
// on the same browser can never inherit (and re-publish) the first user's
// private key. The un-namespaced legacy key is claimed once by the first
// account that logs in after this upgrade, then removed.
let currentUserId: string | null = null

/** Bind the E2EE module to the signed-in account (null on sign-out). Clears derived-key cache. */
export function setE2eeUser(userId: string | null): void {
  if (currentUserId === userId) return
  currentUserId = userId
  KEY_CACHE.clear()
}

function storageKey(): string {
  return currentUserId ? `${LEGACY_PRIV_KEY}:${currentUserId}` : LEGACY_PRIV_KEY
}

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const buf = new ArrayBuffer(bin.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function supported(): boolean {
  return typeof window !== 'undefined' && !!window.crypto?.subtle
}

/** Read (or lazily create) this device's ECDH keypair. Returns the private CryptoKey. */
export async function ensureKeypair(): Promise<{ privateKey: CryptoKey; publicKeyJwk: string } | null> {
  if (!supported()) return null
  try {
    const key = storageKey()
    let stored = localStorage.getItem(key)
    if (!stored && currentUserId) {
      // one-time migration: the first account to sign in on this browser
      // claims the browser's legacy key (it belonged to whoever used it last)
      const legacy = localStorage.getItem(LEGACY_PRIV_KEY)
      if (legacy) {
        localStorage.setItem(key, legacy)
        localStorage.removeItem(LEGACY_PRIV_KEY)
        stored = legacy
      }
    }
    if (stored) {
      const privJwk = JSON.parse(stored)
      const privateKey = await crypto.subtle.importKey('jwk', privJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [
        'deriveKey',
      ])
      const { d: _d, ...pubJwk } = privJwk
      return { privateKey, publicKeyJwk: JSON.stringify(pubJwk) }
    }
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
    const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    localStorage.setItem(key, JSON.stringify(privJwk))
    const { d: _d, ...pubJwk } = privJwk
    return { privateKey: pair.privateKey, publicKeyJwk: JSON.stringify(pubJwk) }
  } catch {
    return null
  }
}

/** Publish my public key to the server. 'conflict' = a different key is already
 *  published for this account and the caller did not pass confirm. */
export type PublishResult = 'ok' | 'conflict' | 'fail'

export async function publishPublicKey(opts?: { confirm?: boolean }): Promise<PublishResult> {
  const pair = await ensureKeypair()
  if (!pair) return 'fail'
  try {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: pair.publicKeyJwk, confirm: opts?.confirm === true }),
    })
    if (res.status === 409) return 'conflict'
    return res.ok ? 'ok' : 'fail'
  } catch {
    return 'fail'
  }
}

/** Does this device hold a usable keypair? */
export function hasLocalKeypair(): boolean {
  if (!supported()) return false
  try {
    return !!(localStorage.getItem(storageKey()) || localStorage.getItem(LEGACY_PRIV_KEY))
  } catch {
    return false
  }
}

/** Wipe the local keypair (settings action; re-publishes a fresh one on next use). */
export function resetLocalKeypair() {
  try {
    localStorage.removeItem(storageKey())
    localStorage.removeItem(LEGACY_PRIV_KEY)
  } catch {
    /* noop */
  }
  KEY_CACHE.clear()
}

async function sharedKeyFor(peerPublicKeyJwk: string): Promise<CryptoKey | null> {
  const cached = KEY_CACHE.get(peerPublicKeyJwk)
  if (cached) return cached
  try {
    const pair = await ensureKeypair()
    if (!pair) return null
    const peerKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(peerPublicKeyJwk),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    )
    const aes = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: peerKey },
      pair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
    KEY_CACHE.set(peerPublicKeyJwk, aes)
    return aes
  } catch {
    return null
  }
}

/** Encrypt plaintext for a peer. Output: base64(12-byte IV || ciphertext). */
export async function encryptText(peerPublicKeyJwk: string, plaintext: string): Promise<string | null> {
  const aes = await sharedKeyFor(peerPublicKeyJwk)
  if (!aes) return null
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(plaintext))
    return b64(iv.buffer.slice(0) as ArrayBuffer) + '.' + b64(ct)
  } catch {
    return null
  }
}

/** Decrypt a payload produced by encryptText. Throws on failure — callers must handle. */
export async function decryptText(peerPublicKeyJwk: string, payload: string): Promise<string> {
  const aes = await sharedKeyFor(peerPublicKeyJwk)
  if (!aes) throw new Error('no-key')
  const dot = payload.indexOf('.')
  if (dot <= 0) throw new Error('bad-payload')
  const iv = unb64(payload.slice(0, dot))
  const ct = unb64(payload.slice(dot + 1))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, ct)
  return new TextDecoder().decode(pt)
}

/** Short human-checkable fingerprint of a public key (first 16 hex chars, grouped). */
export async function keyFingerprint(publicKeyJwk: string): Promise<string | null> {
  if (!supported()) return null
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicKeyJwk))
    const hex = Array.from(new Uint8Array(digest))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return hex.replace(/(.{4})/g, '$1 ').trim()
  } catch {
    return null
  }
}
