// ============================================================================
// Environment variable sanitizer
//
// Render's web UI sometimes preserves unwanted formatting when env vars are
// pasted in. This module normalizes any value before it's used, handling:
//   - Markdown link syntax: [text](url)  → url
//   - Quotes (single or double) wrapping the value
//   - Leading / trailing whitespace, newlines, tabs, zero-width chars
//   - Trailing slashes on URLs (caller decides if they want the slash back)
//
// It also exports a strict URL parser that throws a clear error if the
// resulting value isn't a valid absolute URL.
// ============================================================================

function cleanEnv(rawValue) {
  if (rawValue === undefined || rawValue === null) return '';
  let v = String(rawValue);

  // 1. Remove zero-width / invisible chars that copy-paste often inserts
  v = v.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 2. Trim outer whitespace (incl. newlines, tabs)
  v = v.trim();

  // 3. Strip wrapping quotes (single or double, smart quotes, backticks)
  //    Example:  "https://x.com"  →  https://x.com
  v = v.replace(/^[`'"\u2018\u2019\u201C\u201D]+/, '');
  v = v.replace(/[`'"\u2018\u2019\u201C\u201D]+$/, '');

  // 4. Markdown link extraction:  [label](url)  →  url
  //    Handles the most common copy-paste scenario where someone copied
  //    a hyperlink out of a chat / doc rather than the raw URL.
  const md = v.match(/^\[[^\]]*\]\(([^)]+)\)$/);
  if (md) v = md[1].trim();

  // 5. Sometimes the markdown gets mangled to:  https://x.com](https://x.com
  //    or  [https://x.com](https://x.com)  with no clear pattern.
  //    Greedy fallback: if "](" appears, take whatever's after it up to ")".
  if (v.includes('](')) {
    const after = v.split('](').pop();
    v = after.replace(/\)$/, '').trim();
  }

  // 6. Trim again after manipulations
  v = v.trim();

  return v;
}

function cleanUrlBase(rawValue) {
  let v = cleanEnv(rawValue);
  if (!v) return '';
  // Strip trailing slash so callers can append paths cleanly
  v = v.replace(/\/+$/, '');
  return v;
}

function requireValidUrl(rawValue, varName) {
  const v = cleanUrlBase(rawValue);
  if (!v) {
    throw new Error(`[env] ${varName} is empty or unset`);
  }
  try {
    const parsed = new URL(v);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`unsupported protocol "${parsed.protocol}"`);
    }
  } catch (err) {
    throw new Error(`[env] ${varName} is not a valid URL: "${v}" (${err.message})`);
  }
  return v;
}

module.exports = { cleanEnv, cleanUrlBase, requireValidUrl };
