const STORAGE_KEY = 'dp_my_drops';

export type StoredDrop = {
  dropId: string;
  token: string;
  title: string;
  createdAt: number;
  txHash?: string;
};

/** Generate a cryptographically random 32-char hex token (128-bit entropy). */
export function generateDropToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** A valid token is exactly 32 lowercase hex chars. */
export function isValidToken(token: string | undefined): boolean {
  return typeof token === 'string' && /^[0-9a-f]{32}$/.test(token);
}

/** Load all drops the current device/creator has created. */
export function loadMyDrops(): StoredDrop[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredDrop[];
  } catch {
    return [];
  }
}

/** Save a newly-created drop to localStorage. */
export function saveMyDrop(drop: StoredDrop): void {
  const existing = loadMyDrops();
  const updated = [drop, ...existing.filter(d => d.dropId !== drop.dropId)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/** Get the stored token for a given dropId (if this device created it). */
export function getTokenForDrop(dropId: string): string | null {
  const drops = loadMyDrops();
  return drops.find(d => d.dropId === dropId)?.token ?? null;
}
