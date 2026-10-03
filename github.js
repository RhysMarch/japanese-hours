// Shared GitHub storage: JSON files in this repo are the database.
// Anyone can read them; writing needs the owner's token (stored per-browser, shared by every page on this site).

const REPO = 'RhysMarch/japanese-hours';
const TOKEN_KEY = 'japanese-hours-token';

// localStorage can be unavailable (private mode etc.) — never let that break the page
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// UTF-8 safe base64, so Japanese text survives the round trip
const b64encode = s => {
  let bin = '';
  new TextEncoder().encode(s).forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
};
const b64decode = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));

const apiUrl = file => `https://api.github.com/repos/${REPO}/contents/${file}`;

// Returns { data, sha }. `empty` is what a missing file reads as.
async function ghRead(file, empty, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(apiUrl(file) + '?t=' + Date.now(), { headers, cache: 'no-store' });
  if (res.status === 404) return { data: empty, sha: null };
  if (!res.ok) {
    // API rate limit for anonymous visitors is 60/hr — fall back to the Pages copy
    const fallback = await fetch(file + '?t=' + Date.now(), { cache: 'no-store' });
    if (fallback.ok) return { data: await fallback.json(), sha: null };
    throw new Error('GitHub returned ' + res.status);
  }
  const json = await res.json();
  return { data: JSON.parse(b64decode(json.content) || JSON.stringify(empty)), sha: json.sha };
}

// Re-read the latest file, apply the change, write it back; returns the saved data.
// Retries once if something else committed in between. `normalize` tidies the data before writing.
async function ghWrite(file, mutate, message, token, { empty = {}, normalize = x => x } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const remote = await ghRead(file, empty, token);
    const next = normalize(mutate(remote.data) ?? remote.data);
    const res = await fetch(apiUrl(file), {
      method: 'PUT',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        message,
        content: b64encode(JSON.stringify(next, null, 2) + '\n'),
        ...(remote.sha && { sha: remote.sha }),
      }),
    });
    if (res.ok) return next;
    if (res.status === 409 && attempt === 0) continue;
    if (res.status === 401 || res.status === 403) throw new Error('Token rejected — sign in again');
    throw new Error('Save failed (' + res.status + ')');
  }
}

// True if the token can push to the repo
async function ghCanWrite(token) {
  try {
    const res = await fetch('https://api.github.com/repos/' + REPO, { headers: { Authorization: 'Bearer ' + token } });
    return res.ok && !!(await res.json()).permissions?.push;
  } catch { return false; }
}
