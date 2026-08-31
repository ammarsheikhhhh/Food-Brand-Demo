# KarachiBites — Backend

This is the backend for the KarachiBites site. It serves the static site
itself (HTML / CSS / JS / images) **and** a small JSON API the frontend uses
to place orders, save contact messages, and show the menu.

It runs entirely on Node.js — no database server, no paid services required
to try it out. Orders, contact submissions, and a tiny admin dashboard are
all built in.

---

## Folder layout

```
your-site/
├── index.html
├── menu.html
├── checkout.html
├── contact.html
├── about.html
├── style.css
├── script.js
├── cart.js
├── admin.html          <- NEW: small admin dashboard
├── admin.js            <- NEW: dashboard logic
├── assets/
└── server/             <- everything below is the backend
    ├── server.js         (the Express app)
    ├── package.json
    ├── .env.example      (copy to .env and fill in)
    ├── .gitignore
    ├── lib/              <- NEW: small helpers
    │   ├── storage.js    (async JSON file store)
    │   ├── validation.js (input validators)
    │   └── auth.js       (admin API-key middleware)
    └── data/             <- runtime data (auto-created)
        ├── .gitkeep
        ├── menu.json      (menu items — edit me to add/change items)
        ├── orders.json    (created on first order)
        └── contacts.json  (created on first contact submission)
```

---

## 1. Install Node.js

If you don't already have it: download from https://nodejs.org (the LTS
version). To check it's installed, run:

```
node --version
```

## 2. Install the dependencies

Open a terminal **inside the `server` folder** and run:

```
cd server
npm install
```

This downloads Express, Nodemailer, Helmet, express-rate-limit, dotenv and
cors into a `node_modules` folder (only needs to be done once).

## 3. Run the server

Still inside `server/`:

```
npm start
```

You should see something like:

```
KarachiBites server running at http://localhost:3000
  Home:        http://localhost:3000/
  Menu:        http://localhost:3000/menu.html
  Checkout:    http://localhost:3000/checkout.html
  Admin:       http://localhost:3000/admin.html
  Health:      http://localhost:3000/health
  Orders JSON: http://localhost:3000/api/orders
  Menu JSON:   http://localhost:3000/api/menu
```

Open **http://localhost:3000** in your browser — that's your whole site,
served by this server. Add something to your cart, go to checkout, fill in
the form, and click **Place Order**. You should see the order confirmation
screen, and in the terminal you'll see the order details (and an email
notification if you configured one — see step 5).

## 4. Use the admin dashboard

The admin dashboard at `/admin.html` lets you see all orders, change their
status (received → preparing → out for delivery → delivered), view contact
submissions, and see basic stats.

1. Copy `.env.example` to `.env` (you'll do this in step 5 anyway).
2. Set `ADMIN_API_KEY` in `.env` to a long random string. Easiest way:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Restart the server.
4. Open http://localhost:3000/admin.html and paste the key in. The dashboard
   stores the key in `sessionStorage` (so it disappears when you close the
   tab) and polls for new orders every 15 seconds.

The admin key is required for these endpoints:
- `GET  /api/stats`         — revenue, order counts, top items
- `GET  /api/contacts`      — contact form submissions
- `PATCH /api/orders/:id/status` — change an order's status

It can be sent either as the `x-admin-key` HTTP header or as a `?key=…`
query string (the dashboard uses the header).

## 5. (Optional) Turn on real email notifications

By default, the server just *prints* what each email would say instead of
sending it, so you can test everything without setting up email first.

When you're ready for real emails:

1. Copy `.env.example` to `.env` in the `server` folder.
2. Open `.env` and fill in `ADMIN_API_KEY` (above) **and** the values for
   one of these email options:

   **Option A — Gmail** (quickest for personal testing)
   - Turn on 2-Step Verification on the Gmail account:
     https://myaccount.google.com/security
   - Create an "App Password" (search "App Passwords" in your Google
     Account settings) — use that, not your normal password.
   - Set `EMAIL_PROVIDER=gmail`, `GMAIL_USER`, and `GMAIL_APP_PASSWORD`.

   **Option B — SendGrid** (better if you'll actually run a store)
   - Create a free account: https://signup.sendgrid.com/
   - Create an API key: Settings → API Keys → Create API Key.
   - Verify a sender email: Settings → Sender Authentication.
   - Set `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY`, and
     `SENDGRID_FROM_EMAIL`.

3. Either way, set `NOTIFY_EMAIL` to the address that should receive
   notifications.
4. Restart the server (`Ctrl+C`, then `npm start` again).

Place a test order — you should get a real email this time instead of a
console printout.

> **Two emails go out per order.** The store owner gets the short
> "new order" alert at `NOTIFY_EMAIL`, and the **customer** gets a
> polished confirmation with their order ID, items, totals, delivery
> address, and "what happens next" — sent to the email they typed in
> the checkout form. The customer email is sent as both **HTML**
> (Kababjees-style template with a green "Order Received" pill, an
> items table, a dark "Total Paid" bar, and a "Track Your Order"
> button) and a plain-text fallback for clients that don't render
> HTML. If the customer email fails to send, the order is still
> saved and the API still responds successfully; only the terminal
> will log the failure.
>
> When `EMAIL_PROVIDER` is not set, the server prints the email to
> the terminal and also saves the HTML version to
> `server/data/last-customer-email.html` so you can open it in a
> browser and see exactly what the customer would receive.

---

## API reference

### Public

| Method | Path                       | What it does |
|--------|----------------------------|--------------|
| GET    | `/health`                  | uptime / liveness check |
| GET    | `/api/menu`                | list menu items (optional `?category=burgers`) |
| GET    | `/api/menu/:id`            | get a single menu item |
| GET    | `/api/orders`              | list all orders (newest first; optional `?status=preparing`) |
| GET    | `/api/orders/:id`          | look up one order by id |
| POST   | `/api/orders`              | place a new order (rate-limited: 30 / 15 min per IP) |
| POST   | `/api/contact`             | save a contact-form submission (rate-limited: 5 / hour per IP) |

### Admin only (require `x-admin-key` header or `?key=`)

| Method | Path                                | What it does |
|--------|-------------------------------------|--------------|
| GET    | `/api/stats`                        | totals, revenue, top items |
| GET    | `/api/contacts`                     | list contact submissions |
| PATCH  | `/api/orders/:id/status`            | change an order's status |

### Order payload (POST /api/orders)

```json
{
  "customer": {
    "name": "Ahsan Khan",
    "email": "ahsan@example.com",
    "phone": "0334-3745379",
    "address": "House 12, Street 5, Block 4",
    "area": "Clifton"
  },
  "items": [
    { "name": "Zinger Loaded Burger", "qty": 2, "price": 650 }
  ],
  "payment": {
    "method": "cod",
    "methodLabel": "Cash on Delivery"
  },
  "totals": {
    "subtotal": 1300,
    "gst": 234,
    "deliveryCharge": 200,
    "total": 1734
  }
}
```

The server responds with `{ success: true, orderId: "KB-...", status: "received" }`.

### Order status values

`received` → `preparing` → `out_for_delivery` → `delivered`
(plus `cancelled` from any state)

---

## Notes

- Orders and contact submissions are stored in plain JSON files. That's fine
  for learning and small-scale testing; a real store should use a database
  (e.g. PostgreSQL, MongoDB) — to swap one in, only `lib/storage.js` would
  need to change.
- There is no real payment processing here — "Cash on Delivery", "Card",
  "JazzCash", and "EasyPaisa" are recorded as the customer's chosen method,
  but no money actually moves. Wiring up Stripe / a local Pakistani gateway
  would be a separate step.
- `.env` holds real secrets once you fill it in — it's already listed in
  `.gitignore` so it won't be committed if you put this in Git.
- Rate limits live in `server.js` (look for `writeLimiter` / `contactLimiter`).
  Adjust the numbers if you need to.
- To change the menu, edit `data/menu.json`. The menu API reads it on every
  request, so changes are picked up live (no server restart needed).
