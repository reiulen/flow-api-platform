/**
 * Cookie parser and normalizer for Playwright browser context.
 * Supports Cookie-Editor JSON format, raw cookie headers, and key-value objects.
 */

export function parseCookieInput(input) {
  if (!input) return [];

  // If input is string, determine whether it's JSON or raw header
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseCookieInput(parsed);
      } catch (err) {
        // Fall back to treating as raw cookie header
      }
    }

    // Treat as raw cookie header string: "key1=val1; key2=val2"
    return parseCookieHeader(trimmed);
  }

  // If input is object with cookies property
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    if (Array.isArray(input.cookies)) {
      return parseCookieInput(input.cookies);
    }
    // Key-value pair object: { "cookieName": "cookieVal" }
    return Object.entries(input).map(([name, value]) => ({
      name,
      value: String(value),
      domain: '.google.com',
      path: '/',
      secure: true,
      sameSite: 'Lax',
    }));
  }

  // If input is array of cookie objects
  if (Array.isArray(input)) {
    return input.map(normalizeSingleCookie).filter(Boolean);
  }

  return [];
}

function parseCookieHeader(headerStr) {
  const cookies = [];
  const parts = headerStr.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (name && value) {
      cookies.push({
        name,
        value,
        domain: '.google.com',
        path: '/',
        secure: true,
        sameSite: 'Lax',
      });
    }
  }
  return cookies;
}

function normalizeSingleCookie(c) {
  if (!c || typeof c !== 'object') return null;
  const name = String(c.name || '').trim();
  const value = String(c.value ?? '').trim();
  if (!name) return null;

  let domain = c.domain ? String(c.domain).trim() : '.google.com';
  // Standardize Google domains
  if (domain === 'flow.google.com' || domain === 'google.com' || domain.includes('google')) {
    if (!domain.startsWith('.') && domain !== 'flow.google.com') {
      domain = `.${domain}`;
    }
  }

  const path = c.path ? String(c.path).trim() : '/';
  const secure = c.secure !== undefined ? Boolean(c.secure) : true;
  const httpOnly = c.httpOnly !== undefined ? Boolean(c.httpOnly) : false;

  // Sanitize sameSite for Playwright ("Strict" | "Lax" | "None")
  let sameSite = 'Lax';
  const rawSameSite = String(c.sameSite || '').toLowerCase();
  if (rawSameSite === 'no_restriction' || rawSameSite === 'none') {
    sameSite = 'None';
  } else if (rawSameSite === 'strict') {
    sameSite = 'Strict';
  } else {
    sameSite = 'Lax';
  }

  const cookie = {
    name,
    value,
    domain,
    path,
    secure,
    httpOnly,
    sameSite,
  };

  // Convert expirationDate (seconds) to expires
  if (typeof c.expirationDate === 'number') {
    cookie.expires = Math.round(c.expirationDate);
  } else if (typeof c.expires === 'number') {
    cookie.expires = Math.round(c.expires);
  }

  return cookie;
}
