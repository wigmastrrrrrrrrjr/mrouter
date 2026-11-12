const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface UserRecord {
  email: string;
  salt: string;
  hash: string;
  created: number;
}

interface KeyRecord {
  email: string;
  created: number;
}

export function userKey(email: string): string {
  return `user:${email.toLowerCase().trim()}`;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function registerUser(
  kv: KVNamespace,
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  email = email.toLowerCase().trim();
  if (!isValidEmail(email)) return { ok: false, error: "Invalid email" };
  if (!password || password.length < 6)
    return { ok: false, error: "Password must be at least 6 characters" };

  const existing = await kv.get(userKey(email));
  if (existing) return { ok: false, error: "Account already exists. Log in instead." };

  const salt = randomHex(16);
  const hash = await sha256Hex(salt + password);
  const user: UserRecord = { email, salt, hash, created: Date.now() };
  await kv.put(userKey(email), JSON.stringify(user));
  return { ok: true };
}

export async function loginUser(
  kv: KVNamespace,
  email: string,
  password: string
): Promise<{ ok: boolean; apiKey?: string; error?: string }> {
  email = email.toLowerCase().trim();
  const raw = await kv.get(userKey(email));
  if (!raw) return { ok: false, error: "No account with that email. Register first." };

  const user = JSON.parse(raw) as UserRecord;
  const hash = await sha256Hex(user.salt + password);
  if (hash !== user.hash) return { ok: false, error: "Wrong password" };

  const existingKey = await kv.get(`key:${email}`);
  if (existingKey) {
    const rec = JSON.parse(existingKey) as KeyRecord & { apiKey?: string };
    if (rec.apiKey) {
      await kv.put(`keyval:${rec.apiKey}`, email);
      return { ok: true, apiKey: rec.apiKey };
    }
  }

  const apiKey = `mk_${randomHex(24)}`;
  await kv.put(`key:${email}`, JSON.stringify({ apiKey, created: Date.now() }));
  await kv.put(`keyval:${apiKey}`, email);
  return { ok: true, apiKey };
}

export async function ensureKeyBackref(kv: KVNamespace, email: string): Promise<string | null> {
  const raw = await kv.get(`key:${email}`);
  if (!raw) return null;
  const rec = JSON.parse(raw) as KeyRecord & { apiKey: string };
  if (rec.apiKey) {
    await kv.put(`keyval:${rec.apiKey}`, email);
    return rec.apiKey;
  }
  return null;
}

export async function authenticate(
  kv: KVNamespace,
  authHeader: string | null
): Promise<string | null> {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const key = m[1].trim();
  const email = await kv.get(`keyval:${key}`);
  return email || null;
}
