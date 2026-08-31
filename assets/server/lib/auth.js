// ============================================================================
// auth.js — simple API-key gate for admin-only endpoints
// ----------------------------------------------------------------------------
// The admin dashboard and the order-management endpoints aren't things the
// public should hit. We protect them with a shared secret that's compared
// in constant time so a timing-attack can't leak it character by character.
//
// How to use it:
//   1. Set ADMIN_API_KEY in your .env (any random long string).
//   2. Routes that need protection do:
//        app.get('/api/admin/...', requireAdmin, handler)
//   3. The browser sends the key via either:
//        - header  "x-admin-key: <key>"
//        - query   "?key=<key>"   (so the admin.html page can just include it)
//
// If ADMIN_API_KEY is empty in .env, admin endpoints refuse all requests
// (fail-closed). That way an empty config never accidentally opens them up.
// ============================================================================

const crypto = require('crypto');

function safeEqual(a, b) {
  // crypto.timingSafeEqual requires equal-length buffers; pad to the longer
  // one and always compare that length so a wrong-length key still takes
  // roughly the same time.
  const aBuf = Buffer.from(String(a), 'utf8');
  const bBuf = Buffer.from(String(b), 'utf8');
  const len = Math.max(aBuf.length, bBuf.length);
  const aPad = Buffer.alloc(len);
  const bPad = Buffer.alloc(len);
  aBuf.copy(aPad);
  bBuf.copy(bPad);
  return crypto.timingSafeEqual(aPad, bPad) && aBuf.length === bBuf.length;
}

function getProvidedKey(req) {
  const header = req.get('x-admin-key');
  if (header) return header;
  // The admin.html page includes the key as ?key=... so the same dashboard
  // can be opened as a normal link without a login screen.
  if (req.query && req.query.key) return String(req.query.key);
  return '';
}

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    return res.status(503).json({
      error: 'Admin endpoints are disabled — set ADMIN_API_KEY in .env to enable them.'
    });
  }

  const provided = getProvidedKey(req);
  if (!provided || !safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized — admin API key required.' });
  }

  next();
}

module.exports = { requireAdmin };
