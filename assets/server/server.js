// ============================================================================
// KarachiBites — Backend
// ----------------------------------------------------------------------------
// A small Express server that:
//   1. Serves your existing site (index.html, menu.html, checkout.html, ...)
//   2. Handles orders  (POST /api/orders, GET /api/orders, GET /api/orders/:id,
//                       PATCH /api/orders/:id/status)
//   3. Handles contact (POST /api/contact)
//   4. Exposes the menu (GET /api/menu, GET /api/menu/:id)
//   5. Exposes basic stats for the admin dashboard (GET /api/stats)
//   6. Serves an admin dashboard at /admin.html
//   7. Sends you an email notification for every new order
//   8. Has a /health endpoint for uptime checks
//
// By default orders + contacts are saved to JSON files in data/ and "emails"
// are printed to this terminal. Set EMAIL_PROVIDER + credentials in .env to
// turn on real email sending.
// ============================================================================

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const storage = require('./lib/storage');
const validation = require('./lib/validation');
const { requireAdmin } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// The frontend files (index.html, menu.html, checkout.html, admin.html,
// style.css, script.js, admin.js, assets/) live TWO folders up from this
// server/ folder — at the top of the project, with assets/ as a sibling.
const SITE_ROOT = path.join(__dirname, '..', '..');
const MENU_FILE = path.join(__dirname, 'data', 'menu.json');
const ORDERS_KEY = 'orders';
const CONTACTS_KEY = 'contacts';

// Brand logo for the customer email. We load it once at startup and embed
// it in the email as a base64 data URL so the image works in any email
// client without needing a public host. Looks for evora-logo.png first,
// then falls back to logo.png, then to nothing (email just gets a wordmark).
let brandLogoDataUrl = null;
(function loadBrandLogo() {
  const candidates = ['evora-logo.png', 'logo.png'];
  for (const name of candidates) {
    const p = path.join(SITE_ROOT, 'assets', name);
    if (fs.existsSync(p)) {
      try {
        const buf = fs.readFileSync(p);
        brandLogoDataUrl = 'data:image/png;base64,' + buf.toString('base64');
        console.log('📧  Brand logo loaded: ' + name + ' (' + buf.length + ' bytes)');
        return;
      } catch (err) {
        console.error('Could not read brand logo ' + name + ':', err.message);
      }
    }
  }
  console.log('📧  No brand logo found in assets/ — email will use text wordmark only.');
})();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
// helmet sets a bunch of sensible security headers on every response. The
// crossOriginEmbed config lets the page keep loading images and scripts the
// way it already does.
app.use(
  helmet({
    contentSecurityPolicy: false, // the static site sets its own meta rules
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors());          // see note in original file
app.use(express.json());  // parses incoming JSON bodies (req.body)
app.use(express.static(SITE_ROOT)); // serves your existing HTML/CSS/JS/assets

// A simple request logger so you can see traffic as it happens. Skips the
// static asset noise so the log stays readable.
app.use(function (req, res, next) {
  if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/admin.html') {
    res.on('finish', function () {
      console.log(
        new Date().toISOString(),
        req.method,
        req.path,
        '->',
        res.statusCode
      );
    });
  }
  next();
});

// Rate limits — protect the write endpoints (orders, contact, status updates)
// from being flooded. Read endpoints aren't rate-limited because the dashboard
// polls them.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                  // 30 submissions per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a few minutes and try again.' }
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                   // 5 contact messages per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages — please try again later.' }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Quick unique-enough order id like "KB-20260830-9F3A1C". Uses the current
// date + a short random suffix so it's easy to read and very unlikely to
// collide, even with multiple orders in the same second.
function makeOrderId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
  return 'KB-' + yyyy + mm + dd + '-' + rand;
}

// Allowed order statuses a kitchen/admin can set.
const ORDER_STATUSES = ['received', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

// ---------------------------------------------------------------------------
// Email (Nodemailer)
// ---------------------------------------------------------------------------
function buildOrderEmailText(order) {
  const lines = [];
  lines.push('New order: ' + order.orderId);
  lines.push('Status:    ' + (order.status || 'received'));
  lines.push('');
  lines.push('Customer: ' + order.customer.name);
  lines.push('Email:    ' + order.customer.email);
  lines.push('Phone:    ' + order.customer.phone);
  lines.push('Address:  ' + order.customer.address + ' (' + order.customer.area + ')');
  lines.push('');
  lines.push('Items:');
  order.items.forEach(function (item) {
    lines.push('  - ' + item.qty + ' x ' + item.name + ' (Rs. ' + item.price + ' each)');
  });
  lines.push('');
  lines.push('Subtotal: Rs. ' + order.totals.subtotal);
  lines.push('Tax:      Rs. ' + order.totals.gst);
  lines.push('Delivery: Rs. ' + order.totals.deliveryCharge);
  lines.push('Total:    Rs. ' + order.totals.total);
  lines.push('');
  lines.push('Payment method: ' + order.payment.methodLabel);
  return lines.join('\n');
}

function buildContactEmailText(contact) {
  return [
    'New contact submission: ' + contact.contactId,
    '',
    'From:    ' + contact.name + ' <' + contact.email + '>',
    'Phone:   ' + (contact.phone || '—'),
    'Subject: ' + contact.subject,
    '',
    'Message:',
    contact.message
  ].join('\n');
}

// Customer-facing order confirmation. Different tone from the store's
// internal notification: friendly, organized with a clear summary, and tells
// the customer what happens next.
function buildCustomerOrderEmailText(order) {
  const c = order.customer;
  const placed = new Date(order.receivedAt);
  const placedStr = isNaN(placed.getTime())
    ? order.receivedAt
    : placed.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  // Pad the item lines so the prices line up nicely:
  //   2x Zinger Loaded Burger ............ Rs. 1,300
  const lines = [];
  const labelWidth = 36;
  order.items.forEach(function (it) {
    const label = it.qty + ' x ' + it.name;
    const padded = (label + ' ' + '.'.repeat(labelWidth)).slice(0, labelWidth);
    const lineTotal = it.qty * it.price;
    lines.push(padded + ' Rs. ' + lineTotal.toLocaleString('en-US'));
  });
  const itemsBlock = lines.join('\n');

  const isCOD = (order.payment && order.payment.method === 'cod');
  const payLine = isCOD
    ? 'You\'ll pay Rs. ' + Number(order.totals.total).toLocaleString('en-US') +
      ' in cash when your order arrives.'
    : 'Your payment of Rs. ' + Number(order.totals.total).toLocaleString('en-US') +
      ' via ' + (order.payment.methodLabel || 'your selected method') + ' is being confirmed.';

  return [
    'Hi ' + c.name + ',',
    '',
    'Thanks for ordering from KarachiBites! We\'ve received your order and it\'s being prepared.',
    '',
    'ORDER #' + order.orderId,
    'Placed on ' + placedStr,
    '',
    'YOUR ITEMS',
    '----------------------------------------',
    itemsBlock,
    '----------------------------------------',
    '',
    'Subtotal .............. Rs. ' + Number(order.totals.subtotal).toLocaleString('en-US'),
    'GST (18%) .............. Rs. ' + Number(order.totals.gst).toLocaleString('en-US'),
    'Delivery .............. Rs. ' + Number(order.totals.deliveryCharge).toLocaleString('en-US'),
    '----------------------------------------',
    'TOTAL ................. Rs. ' + Number(order.totals.total).toLocaleString('en-US'),
    '',
    'PAYMENT',
    'Method: ' + (order.payment.methodLabel || 'Cash on Delivery'),
    payLine,
    '',
    'DELIVERING TO',
    c.name,
    c.address,
    c.area,
    'Phone: ' + c.phone,
    '',
    'WHAT HAPPENS NEXT',
    '1. Our kitchen confirms and starts cooking.',
    '2. A rider picks up your order and heads to you.',
    '3. ' + (isCOD ? 'You hand over the cash on arrival.' : 'You\'ll get a payment prompt on your phone.'),
    '',
    'Need to change something? Call us at 0334-3745379 or reply to this email with your order number.',
    '',
    '— KarachiBites',
    '  Karachi\'s favorite fast food, delivered fast.',
    '  (This is a portfolio demo — no real food is dispatched.)'
  ].join('\n');
}

// Small helpers so the HTML template stays readable.
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad = function (x) { return String(x).padStart(2, '0'); };
  const hour12 = ((d.getHours() + 11) % 12) + 1;
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return d.getDate() + ' ' + months[d.getMonth()] + ', ' + d.getFullYear() +
         ' - ' + hour12 + ':' + pad(d.getMinutes()) + ' ' + ampm;
}

// HTML version of the customer confirmation email. Built with table-based
// layout + inline CSS because most email clients (Gmail, Outlook, etc.)
// don't support modern layout tools. This mirrors the Kababjees-style
// template: header → greeting → green "Order Received" pill → icon rows
// for order details → items table → dark "Total Paid" bar → CTA button →
// branded footer.
function buildCustomerOrderEmailHtml(order) {
  const c = order.customer;
  const baseUrl = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const orderId = escHtml(order.orderId);

  // Build the brand header — image if we have one, text wordmark as fallback
  let brandHeader;
  if (brandLogoDataUrl) {
    brandHeader =
'              <img src="' + brandLogoDataUrl + '" alt="Evora" width="120" height="40" style="display:block; height:40px; width:auto; max-width:160px; border:0;">';
  } else {
    brandHeader =
'              <div style="font-size:22px; font-weight:700; color:#1f2937; line-height:1;">Evora<span style="color:#e4002b;">.</span></div>';
  }
  const name = escHtml(c.name);
  const placed = escHtml(fmtDateTime(order.receivedAt));
  const address = escHtml(c.address + ', ' + c.area);
  const phone = escHtml(c.phone);
  const isCOD = (order.payment && order.payment.method === 'cod');

  // Items table rows
  const itemsRows = order.items.map(function (it) {
    return '<tr>' +
      '<td style="padding:10px 0; font-size:14px; color:#1f2937; border-bottom:1px solid #f1f2f4;">' +
        '<div style="font-weight:600;">' + escHtml(it.name) + '</div>' +
        '<div style="font-size:12px; color:#9ca3af;">Qty ' + escHtml(it.qty) + '</div>' +
      '</td>' +
      '<td align="right" style="padding:10px 0; font-size:14px; color:#1f2937; font-weight:600; border-bottom:1px solid #f1f2f4;">' +
        'Rs. ' + fmtMoney(it.qty * it.price) +
      '</td>' +
    '</tr>';
  }).join('');

  return [
'<!DOCTYPE html>',
'<html lang="en">',
'<head>',
'<meta charset="UTF-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<title>Order Confirmation</title>',
'</head>',
'<body style="margin:0; padding:0; background:#f4f4f5; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Arial, sans-serif; color:#1f2937;">',
'  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5; padding:32px 16px;">',
'    <tr><td align="center">',
'      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06);">',

'        <!-- Header -->',
'        <tr><td style="padding:28px 28px 0 28px;">',
'          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>',
'            <td style="vertical-align:middle;">',
              brandHeader,
'              <div style="font-size:11px; color:#9ca3af; letter-spacing:0.5px; margin-top:6px; text-transform:uppercase;">Order Confirmation</div>',
'            </td>',
'            <td align="right" style="vertical-align:middle; font-size:28px; line-height:1;">🍔</td>',
'          </tr></table>',
'        </td></tr>',

'        <!-- Greeting -->',
'        <tr><td style="padding:28px 28px 8px 28px;">',
'          <h1 style="margin:0; font-size:26px; font-weight:700; color:#111827;">Hey ' + name + ',</h1>',
'          <p style="margin:8px 0 0 0; color:#6b7280; font-size:14px; line-height:1.5;">Thanks for your order! We\'ve received it at KarachiBites and our kitchen is on it.</p>',
'        </td></tr>',

'        <!-- Green status pill -->',
'        <tr><td style="padding:16px 28px;">',
'          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ecfdf5; border-radius:8px;"><tr>',
'            <td style="padding:14px 18px;">',
'              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
'                <td style="width:28px; height:28px; background:#10b981; border-radius:50%; text-align:center; vertical-align:middle; color:#ffffff; font-weight:700; font-size:14px; line-height:28px;">&#10003;</td>',
'                <td style="padding-left:12px; color:#065f46; font-weight:600; font-size:15px;">Order Received</td>',
'              </tr></table>',
'            </td>',
'          </tr></table>',
'        </td></tr>',

'        <!-- Order details with icons -->',
'        <tr><td style="padding:8px 28px 4px 28px;">',
'          <div style="font-size:11px; color:#9ca3af; letter-spacing:1.2px; font-weight:600; padding:12px 0 8px 0;">ORDER DETAILS</div>',
'          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
'            <tr>',
'              <td style="padding:8px 0; font-size:16px; color:#6b7280; width:24px; vertical-align:top; line-height:1.4;">📋</td>',
'              <td style="padding:8px 0; font-size:13px; color:#1f2937; vertical-align:top;">',
'                <div style="color:#9ca3af; font-size:10px; letter-spacing:0.8px; font-weight:600; text-transform:uppercase;">Order ID</div>',
'                <div style="font-weight:600; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:14px;">' + orderId + '</div>',
'              </td>',
'            </tr>',
'            <tr>',
'              <td style="padding:8px 0; font-size:16px; color:#6b7280; width:24px; vertical-align:top; line-height:1.4;">🕐</td>',
'              <td style="padding:8px 0; font-size:13px; color:#1f2937; vertical-align:top;">',
'                <div style="color:#9ca3af; font-size:10px; letter-spacing:0.8px; font-weight:600; text-transform:uppercase;">Order Placed</div>',
'                <div style="font-weight:600;">' + placed + '</div>',
'              </td>',
'            </tr>',
'            <tr>',
'              <td style="padding:8px 0; font-size:16px; color:#6b7280; width:24px; vertical-align:top; line-height:1.4;">📍</td>',
'              <td style="padding:8px 0; font-size:13px; color:#1f2937; vertical-align:top;">',
'                <div style="color:#9ca3af; font-size:10px; letter-spacing:0.8px; font-weight:600; text-transform:uppercase;">Delivery Address</div>',
'                <div style="font-weight:600;">' + address + '</div>',
'              </td>',
'            </tr>',
'          </table>',
'        </td></tr>',

'        <!-- Items table -->',
'        <tr><td style="padding:16px 28px 8px 28px;">',
'          <div style="font-size:11px; color:#9ca3af; letter-spacing:1.2px; font-weight:600; padding:8px 0 4px 0;">YOUR ORDER</div>',
'          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
'            <thead>',
'              <tr>',
'                <th align="left" style="padding:6px 0; font-size:11px; color:#9ca3af; letter-spacing:0.5px; font-weight:600; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Item</th>',
'                <th align="right" style="padding:6px 0; font-size:11px; color:#9ca3af; letter-spacing:0.5px; font-weight:600; text-transform:uppercase; border-bottom:1px solid #e5e7eb;">Price</th>',
'              </tr>',
'            </thead>',
'            <tbody>',
              itemsRows,
'            </tbody>',
'          </table>',
'        </td></tr>',

'        <!-- Totals -->',
'        <tr><td style="padding:8px 28px 24px 28px;">',
'          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
'            <tr>',
'              <td style="padding:5px 0; color:#6b7280; font-size:13px;">Subtotal</td>',
'              <td align="right" style="padding:5px 0; color:#1f2937; font-size:13px;">Rs. ' + fmtMoney(order.totals.subtotal) + '</td>',
'            </tr>',
'            <tr>',
'              <td style="padding:5px 0; color:#6b7280; font-size:13px;">GST (18%)</td>',
'              <td align="right" style="padding:5px 0; color:#1f2937; font-size:13px;">Rs. ' + fmtMoney(order.totals.gst) + '</td>',
'            </tr>',
'            <tr>',
'              <td style="padding:5px 0; color:#6b7280; font-size:13px;">Delivery Fee</td>',
'              <td align="right" style="padding:5px 0; color:#1f2937; font-size:13px;">Rs. ' + fmtMoney(order.totals.deliveryCharge) + '</td>',
'            </tr>',
'          </table>',
'          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px; background:#1f2937; border-radius:8px;">',
'            <tr>',
'              <td style="padding:14px 18px; color:#ffffff; font-weight:600; font-size:14px;">Total Paid</td>',
'              <td align="right" style="padding:14px 18px; color:#ffffff; font-weight:700; font-size:18px;">Rs. ' + fmtMoney(order.totals.total) + '</td>',
'            </tr>',
'          </table>',
'          <p style="margin:10px 0 0 0; font-size:12px; color:#9ca3af;">' +
            (isCOD
              ? 'You\'ll pay Rs. ' + fmtMoney(order.totals.total) + ' in cash when your order arrives.'
              : 'Your ' + escHtml(order.payment.methodLabel || 'payment') + ' payment of Rs. ' + fmtMoney(order.totals.total) + ' is being confirmed.') +
'          </p>',
'        </td></tr>',

'        <!-- CTA button -->',
'        <tr><td style="padding:0 28px 20px 28px;" align="center">',
'          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
'            <td align="center" bgcolor="#1f2937" style="border-radius:8px;">',
'              <a href="' + baseUrl + '/?order=' + orderId + '" target="_blank" style="display:inline-block; padding:14px 36px; color:#ffffff; text-decoration:none; font-weight:600; font-size:14px; border-radius:8px;">Track Your Order</a>',
'            </td>',
'          </tr></table>',
'          <p style="margin:14px 0 0 0; color:#9ca3af; font-size:12px;">Questions? Call us at <a href="tel:0334-3745379" style="color:#e4002b; text-decoration:none; font-weight:600;">0334-3745379</a></p>',
'        </td></tr>',

'        <!-- Footer -->',
'        <tr><td style="padding:0 28px 28px 28px; text-align:center;">',
'          <p style="margin:0; color:#9ca3af; font-size:12px;">Until next time,</p>',
'          <p style="margin:4px 0 0 0; color:#e4002b; font-size:16px; font-weight:700;">Evora Team</p>',
'          <p style="margin:14px 0 0 0; color:#cbd5e1; font-size:11px;">This is a portfolio demo — no real food is dispatched.</p>',
'        </td></tr>',

'      </table>',
'    </td></tr>',
'  </table>',
'</body>',
'</html>'
  ].join('\n');
}

function createEmailTransport() {
  const provider = process.env.EMAIL_PROVIDER;
  if (provider === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }
  if (provider === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  }
  return null;
}

// Send an email to an arbitrary recipient. If no transport is configured,
// the email is just printed to the terminal so you can still see the flow.
// Either way, a failure here never throws back to the caller — a failed
// email must never break the order/contact that triggered it.
//
// `html` is optional. If provided, the email is sent as text/html with the
// `text` part as a fallback for clients that don't render HTML.
async function sendEmailTo(to, subject, text, html) {
  if (!to) {
    console.log('📧  No recipient given, skipping email: ' + subject);
    return;
  }

  const transporter = createEmailTransport();
  if (!transporter) {
    console.log('\n📧  EMAIL_PROVIDER not set — printing the email instead of sending it:');
    console.log('To: ' + to);
    console.log('----------------------------------------------------------------');
    console.log(subject);
    console.log('--- text ---');
    console.log(text);
    if (html) {
      // Save the HTML to a file in the server folder so the user can open
      // it in a browser and see what the customer would actually receive.
      const previewPath = path.join(__dirname, 'data', 'last-customer-email.html');
      try {
        fs.writeFileSync(previewPath, html, 'utf8');
        console.log('--- html (also saved to ' + previewPath + ') ---');
      } catch (e) {
        console.log('--- html ---');
      }
    }
    console.log('----------------------------------------------------------------\n');
    return;
  }

  const fromAddress = process.env.EMAIL_PROVIDER === 'sendgrid'
    ? process.env.SENDGRID_FROM_EMAIL
    : process.env.GMAIL_USER;

  try {
    const mail = {
      from: fromAddress,
      to: to,
      subject: subject,
      text: text
    };
    if (html) mail.html = html;
    await transporter.sendMail(mail);
    console.log('📧  Email sent to ' + to + ': ' + subject);
  } catch (err) {
    console.error('Failed to send email to ' + to + ':', err.message);
  }
}

// Thin wrapper kept for the existing "store notification" callers —
// sends to NOTIFY_EMAIL from .env.
async function sendNotificationEmail(subject, text) {
  return sendEmailTo(process.env.NOTIFY_EMAIL, subject, text);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', function (req, res) {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
app.get('/api/menu', function (req, res) {
  fs.readFile(MENU_FILE, 'utf8', function (err, raw) {
    if (err) {
      console.error('Could not read menu.json:', err.message);
      return res.status(500).json({ error: 'Menu is currently unavailable.' });
    }
    try {
      const menu = JSON.parse(raw);
      // ?category=burgers filter
      const filter = (req.query.category || '').toLowerCase();
      if (filter && filter !== 'all') {
        menu.items = menu.items.filter(function (it) { return it.category === filter; });
      }
      res.json(menu);
    } catch (parseErr) {
      res.status(500).json({ error: 'Menu file is corrupted.' });
    }
  });
});

app.get('/api/menu/:id', function (req, res) {
  fs.readFile(MENU_FILE, 'utf8', function (err, raw) {
    if (err) return res.status(500).json({ error: 'Menu is currently unavailable.' });
    try {
      const menu = JSON.parse(raw);
      const item = menu.items.find(function (it) { return it.id === req.params.id; });
      if (!item) return res.status(404).json({ error: 'Menu item not found.' });
      res.json(item);
    } catch (parseErr) {
      res.status(500).json({ error: 'Menu file is corrupted.' });
    }
  });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

// Place a new order (called by checkout.html)
app.post('/api/orders', writeLimiter, async function (req, res) {
  const body = req.body || {};
  const customer = body.customer || {};
  const items = body.items || [];
  const payment = body.payment || {};
  const totals = body.totals || {};

  // ----- Validation -----
  const fieldErrors = validation.validateFields(customer, validation.customerRules);
  fieldErrors.push(...validation.validateFields({ items: items }, validation.itemsRules()));

  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const itemError = validation.validateItem(items[i]);
      if (itemError) fieldErrors.push('items[' + i + ']: ' + itemError);
    }
  }

  // Sanity-check the totals the client sent. We trust the prices/qty from
  // each item (since the client computed the subtotal), but we cap the
  // total so a tampered client can't ship a "free" or absurdly negative order.
  const numericTotal = Number(totals.total);
  if (!Number.isFinite(numericTotal) || numericTotal < 0 || numericTotal > 500000) {
    fieldErrors.push('totals.total must be a number between 0 and 500000');
  }

  if (fieldErrors.length > 0) {
    return res.status(400).json({ error: 'Invalid order', details: fieldErrors });
  }

  // Normalize the customer fields so what's stored is consistent.
  const cleanCustomer = {
    name: validation.trim(customer.name),
    email: validation.trim(customer.email).toLowerCase(),
    phone: validation.trim(customer.phone),
    address: validation.trim(customer.address),
    area: validation.trim(customer.area) || 'Karachi'
  };

  const cleanItems = items.map(function (it) {
    return {
      name: validation.trim(it.name),
      qty: Number(it.qty),
      price: validation.parsePrice(it.price)
    };
  });

  const order = {
    orderId: makeOrderId(),
    status: 'received',
    receivedAt: new Date().toISOString(),
    customer: cleanCustomer,
    items: cleanItems,
    payment: {
      method: payment.method || 'cod',
      methodLabel: payment.methodLabel || 'Cash on Delivery'
    },
    totals: {
      subtotal: Number(totals.subtotal) || 0,
      gst: Number(totals.gst) || 0,
      deliveryCharge: Number(totals.deliveryCharge) || 0,
      total: numericTotal
    }
  };

  try {
    await storage.append(ORDERS_KEY, order);
    // Fire-and-forget emails — the order is already saved. Both the store
    // (NOTIFY_EMAIL) and the customer get a copy; a failure on either
    // never affects the order response.
    sendNotificationEmail(
      'New KarachiBites order — ' + order.orderId,
      buildOrderEmailText(order)
    );
    sendEmailTo(
      order.customer.email,
      'Your KarachiBites order #' + order.orderId + ' is confirmed',
      buildCustomerOrderEmailText(order),
      buildCustomerOrderEmailHtml(order)
    );

    res.status(201).json({
      success: true,
      orderId: order.orderId,
      status: order.status
    });
  } catch (err) {
    console.error('Error saving order:', err);
    res.status(500).json({ error: 'Something went wrong saving your order. Please try again.' });
  }
});

// Look up one order by its id (e.g. "KB-20260830-9F3A1C"). Public so a
// customer can check their order status from a confirmation page later.
app.get('/api/orders/:id', function (req, res) {
  storage.read(ORDERS_KEY).then(function (orders) {
    const order = orders.find(function (o) { return o.orderId === req.params.id; });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json(order);
  }).catch(function (err) {
    console.error('Error reading orders:', err);
    res.status(500).json({ error: 'Could not read orders.' });
  });
});

// List all orders. Kept public for the demo's convenience; in production
// you'd want this behind requireAdmin.
app.get('/api/orders', function (req, res) {
  storage.read(ORDERS_KEY).then(function (orders) {
    // Newest first
    const sorted = orders.slice().sort(function (a, b) {
      return (b.receivedAt || '').localeCompare(a.receivedAt || '');
    });
    // ?status= filter (e.g. status=preparing)
    const filter = req.query.status;
    const filtered = filter ? sorted.filter(function (o) { return o.status === filter; }) : sorted;
    res.json(filtered);
  }).catch(function (err) {
    console.error('Error reading orders:', err);
    res.status(500).json({ error: 'Could not read orders.' });
  });
});

// Update an order's status (kitchen / admin). Admin-only.
app.patch('/api/orders/:id/status', requireAdmin, writeLimiter, function (req, res) {
  const newStatus = (req.body && req.body.status) || '';
  if (!ORDER_STATUSES.includes(newStatus)) {
    return res.status(400).json({
      error: 'Invalid status. Allowed: ' + ORDER_STATUSES.join(', ')
    });
  }

  storage.update(ORDERS_KEY, function (orders) {
    const idx = orders.findIndex(function (o) { return o.orderId === req.params.id; });
    if (idx === -1) return orders; // unchanged
    orders[idx].status = newStatus;
    orders[idx].statusUpdatedAt = new Date().toISOString();
    return orders;
  }).then(function (orders) {
    const updated = orders.find(function (o) { return o.orderId === req.params.id; });
    if (!updated) return res.status(404).json({ error: 'Order not found.' });
    res.json({ success: true, order: updated });
  }).catch(function (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ error: 'Could not update order status.' });
  });
});

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------
app.post('/api/contact', contactLimiter, function (req, res) {
  const body = req.body || {};

  // Required fields
  const fieldErrors = validation.validateFields(body, [
    { key: 'name',    label: 'name',    check: v => validation.nonEmpty(validation.trim(v)) && validation.trim(v).length <= validation.MAX_NAME },
    { key: 'email',   label: 'email',   check: v => validation.isEmail(v) },
    { key: 'message', label: 'message', check: v => validation.nonEmpty(validation.trim(v)) && validation.trim(v).length <= validation.MAX_MESSAGE }
  ]);
  // Phone is optional for the contact form
  if (body.phone && !validation.isPhone(body.phone)) {
    fieldErrors.push('phone — use 10–15 digits, dashes/spaces ok');
  }
  // Subject is optional (default: "general")
  const subject = validation.trim(body.subject) || 'general';

  if (fieldErrors.length > 0) {
    return res.status(400).json({ error: 'Invalid submission', details: fieldErrors });
  }

  const contact = {
    contactId: 'CT-' + Date.now().toString(36).toUpperCase() + '-' +
               Math.random().toString(16).slice(2, 6).toUpperCase(),
    receivedAt: new Date().toISOString(),
    name: validation.trim(body.name),
    email: validation.trim(body.email).toLowerCase(),
    phone: body.phone ? validation.trim(body.phone) : '',
    subject: subject,
    message: validation.trim(body.message)
  };

  storage.append(CONTACTS_KEY, contact).then(function () {
    sendNotificationEmail(
      'New contact message — ' + contact.subject,
      buildContactEmailText(contact)
    );
    res.status(201).json({ success: true, contactId: contact.contactId });
  }).catch(function (err) {
    console.error('Error saving contact:', err);
    res.status(500).json({ error: 'Could not save your message. Please try again.' });
  });
});

// Admin-only: list contact submissions
app.get('/api/contacts', requireAdmin, function (req, res) {
  storage.read(CONTACTS_KEY).then(function (contacts) {
    const sorted = contacts.slice().sort(function (a, b) {
      return (b.receivedAt || '').localeCompare(a.receivedAt || '');
    });
    res.json(sorted);
  }).catch(function (err) {
    console.error('Error reading contacts:', err);
    res.status(500).json({ error: 'Could not read contacts.' });
  });
});

// ---------------------------------------------------------------------------
// Stats (admin) — basic numbers for the dashboard
// ---------------------------------------------------------------------------
app.get('/api/stats', requireAdmin, function (req, res) {
  Promise.all([storage.read(ORDERS_KEY), storage.read(CONTACTS_KEY)]).then(function (results) {
    const orders = results[0];
    const contacts = results[1];

    const counts = ORDER_STATUSES.reduce(function (acc, s) {
      acc[s] = 0;
      return acc;
    }, {});
    let revenue = 0;
    const itemCounts = {};

    orders.forEach(function (o) {
      counts[o.status] = (counts[o.status] || 0) + 1;
      if (o.status !== 'cancelled') {
        revenue += Number(o.totals && o.totals.total) || 0;
      }
      (o.items || []).forEach(function (it) {
        itemCounts[it.name] = (itemCounts[it.name] || 0) + Number(it.qty || 0);
      });
    });

    const topItems = Object.keys(itemCounts)
      .map(function (k) { return { name: k, qty: itemCounts[k] }; })
      .sort(function (a, b) { return b.qty - a.qty; })
      .slice(0, 10);

    res.json({
      orders: {
        total: orders.length,
        byStatus: counts,
        revenue: Math.round(revenue)
      },
      contacts: {
        total: contacts.length
      },
      topItems: topItems
    });
  }).catch(function (err) {
    console.error('Error computing stats:', err);
    res.status(500).json({ error: 'Could not compute stats.' });
  });
});

// ---------------------------------------------------------------------------
// 404 for unknown /api routes
// ---------------------------------------------------------------------------
app.use('/api', function (req, res) {
  res.status(404).json({ error: 'Not found: ' + req.method + ' ' + req.path });
});

// ---------------------------------------------------------------------------
// Start server + graceful shutdown
// ---------------------------------------------------------------------------
const server = app.listen(PORT, function () {
  console.log('KarachiBites server running at http://localhost:' + PORT);
  console.log('  Home:        http://localhost:' + PORT + '/');
  console.log('  Menu:        http://localhost:' + PORT + '/menu.html');
  console.log('  Checkout:    http://localhost:' + PORT + '/checkout.html');
  console.log('  Admin:       http://localhost:' + PORT + '/admin.html');
  console.log('  Health:      http://localhost:' + PORT + '/health');
  console.log('  Orders JSON: http://localhost:' + PORT + '/api/orders');
  console.log('  Menu JSON:   http://localhost:' + PORT + '/api/menu');
});

function shutdown(signal) {
  console.log('\n' + signal + ' received — closing server...');
  server.close(function () {
    console.log('Server closed. Bye 👋');
    process.exit(0);
  });
  // If it takes more than 5 seconds, just exit.
  setTimeout(function () { process.exit(1); }, 5000).unref();
}

process.on('SIGINT',  function () { shutdown('SIGINT'); });
process.on('SIGTERM', function () { shutdown('SIGTERM'); });
