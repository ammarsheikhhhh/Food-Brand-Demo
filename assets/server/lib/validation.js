// ============================================================================
// validation.js — small helpers for checking incoming data
// ----------------------------------------------------------------------------
// Each helper returns either { ok: true, value } (with a cleaned/normalized
// version) or { ok: false, error } (with a human-readable reason). Routes
// collect errors and return 400 with a list of what's wrong.
// ============================================================================

const MAX_NAME = 100;
const MAX_EMAIL = 200;
const MAX_PHONE = 30;
const MAX_ADDRESS = 500;
const MAX_MESSAGE = 2000;
const MAX_QTY = 50;
const MIN_PRICE = 0;
const MAX_PRICE = 100000;

function isString(v) {
  return typeof v === 'string';
}

function nonEmpty(v) {
  return isString(v) && v.trim().length > 0;
}

// "  Ahsan Khan  " -> "Ahsan Khan"
function trim(v) {
  return isString(v) ? v.trim() : v;
}

function shortEnough(v, max) {
  return isString(v) && v.length <= max;
}

// Basic but practical email check: something@something.tld. Not RFC-perfect,
// but rejects the common garbage people submit by accident.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isEmail(v) {
  return isString(v) && EMAIL_RE.test(v.trim());
}

// Accepts common phone formats with optional +, spaces, dashes, parens.
// 10–20 visible digits. Pakistani numbers like 0334-3745379 / +92 333 1234567 fit.
const PHONE_RE = /^[+]?[\d\s().-]{10,20}$/;

function isPhone(v) {
  if (!isString(v)) return false;
  const digits = v.replace(/\D/g, '');
  return PHONE_RE.test(v.trim()) && digits.length >= 10 && digits.length <= 15;
}

// "650" -> 650, "Rs. 1,799" -> 1799, "Rs. 0" -> 0
function parsePrice(v) {
  if (typeof v === 'number') return v;
  if (!isString(v)) return NaN;
  const cleaned = v.replace(/[^0-9.]/g, '');
  if (!cleaned) return NaN;
  return parseFloat(cleaned);
}

function isValidQty(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_QTY;
}

// Returns a list of error messages for a given object and a list of field
// rules. Each rule is { key, label, check(value) } where check returns
// true if the value is OK.
function validateFields(body, rules) {
  const errors = [];
  for (const rule of rules) {
    const value = body ? body[rule.key] : undefined;
    if (!rule.check(value)) {
      errors.push(rule.label + (rule.detail ? ' — ' + rule.detail : ''));
    }
  }
  return errors;
}

// Common ruleset for the customer block of /api/orders and /api/contact
const customerRules = [
  { key: 'name',    label: 'name',    check: v => nonEmpty(trim(v)) && shortEnough(trim(v), MAX_NAME) },
  { key: 'email',   label: 'email',   check: v => isEmail(v) && shortEnough(trim(v), MAX_EMAIL) },
  { key: 'phone',   label: 'phone',   check: v => isPhone(v), detail: 'use 10–15 digits, dashes/spaces ok' },
  { key: 'address', label: 'address', check: v => nonEmpty(trim(v)) && shortEnough(trim(v), MAX_ADDRESS) }
];

// Common ruleset for the items array
function itemsRules() {
  return [
    {
      key: 'items',
      label: 'items',
      check: v => Array.isArray(v) && v.length > 0 && v.length <= 50,
      detail: 'must be a non-empty array (max 50 items)'
    },
    // The "items is valid" check is structural — we also check each item below.
  ];
}

function validateItem(item) {
  if (!item || typeof item !== 'object') return 'each item must be an object';
  if (!nonEmpty(item.name)) return 'each item needs a name';
  if (!isValidQty(item.qty)) return 'each item qty must be an integer between 1 and ' + MAX_QTY;
  const price = parsePrice(item.price);
  if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) {
    return 'each item price must be a number between ' + MIN_PRICE + ' and ' + MAX_PRICE;
  }
  return null;
}

module.exports = {
  trim,
  nonEmpty,
  isEmail,
  isPhone,
  parsePrice,
  isValidQty,
  validateFields,
  validateItem,
  customerRules,
  itemsRules,
  MAX_NAME,
  MAX_EMAIL,
  MAX_PHONE,
  MAX_ADDRESS,
  MAX_MESSAGE
};
