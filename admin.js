// ============================================================================
// admin.js — small dashboard for viewing orders and contact submissions
// ----------------------------------------------------------------------------
// Runs on /admin.html. Reads the admin key from sessionStorage, calls the
// protected /api/stats, /api/orders, /api/contacts endpoints, and lets the
// admin update an order's status with a dropdown.
// ============================================================================

(function () {
  var SESSION_KEY = 'kbAdminKey';

  var els = {
    gate:        document.getElementById('gate'),
    loginForm:   document.getElementById('loginForm'),
    apiKey:      document.getElementById('apiKey'),
    loginErr:    document.getElementById('loginErr'),
    dashboard:   document.getElementById('dashboard'),
    status:      document.getElementById('statusIndicator'),
    now:         document.getElementById('now'),
    statsRow:    document.getElementById('statsRow'),
    ordersBadge: document.getElementById('ordersBadge'),
    contactsBadge: document.getElementById('contactsBadge'),
    statusFilter: document.getElementById('statusFilter'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn:  document.getElementById('refreshBtn'),
    ordersBody:  document.getElementById('ordersBody'),
    contactsBody: document.getElementById('contactsBody'),
    toast:       document.getElementById('toast')
  };

  // -------- Toast --------
  var toastTimer = null;
  function toast(msg, kind) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.className = 'toast show ' + (kind || '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, 2400);
  }

  // -------- Auth --------
  function getKey() { return sessionStorage.getItem(SESSION_KEY) || ''; }
  function setKey(k) { sessionStorage.setItem(SESSION_KEY, k); }
  function clearKey() { sessionStorage.removeItem(SESSION_KEY); }

  function showDashboard() {
    els.gate.style.display = 'none';
    els.dashboard.style.display = '';
  }
  function showGate(errorMsg) {
    els.dashboard.style.display = 'none';
    els.gate.style.display = '';
    if (errorMsg) {
      els.loginErr.textContent = errorMsg;
      els.loginErr.style.display = '';
    } else {
      els.loginErr.style.display = 'none';
    }
  }

  els.loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var key = els.apiKey.value.trim();
    if (!key) return;
    setKey(key);
    // Probe with a tiny request to verify the key is valid.
    fetch('/api/stats', { headers: { 'x-admin-key': key } })
      .then(function (r) {
        if (r.status === 401) throw new Error('Wrong key — try again.');
        if (r.status === 503) throw new Error('Server has no ADMIN_API_KEY configured.');
        if (!r.ok) throw new Error('Server returned ' + r.status);
        showDashboard();
        loadAll();
      })
      .catch(function (err) {
        clearKey();
        showGate(err.message);
      });
  });

  // -------- API --------
  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'x-admin-key': getKey() }, opts.headers || {});
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (r) {
      if (r.status === 401) {
        showGate('Session expired — please sign in again.');
        throw new Error('Unauthorized');
      }
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.error || ('Request failed: ' + r.status));
        });
      }
      return r.json();
    });
  }

  // -------- Render helpers --------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(n) {
    var v = Number(n) || 0;
    return 'Rs. ' + v.toLocaleString('en-US');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var pad = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function statusPill(status) {
    var label = (status || 'received').replace(/_/g, ' ');
    return '<span class="status status-' + escapeHtml(status || 'received') + '">' +
           escapeHtml(label) + '</span>';
  }

  // -------- Stats --------
  function renderStats(stats) {
    var o = stats.orders || {};
    var html = '';
    html += '<div class="stat"><div class="label">Total orders</div><div class="value">' +
            (o.total || 0) + '</div><div class="sub">all time</div></div>';
    html += '<div class="stat revenue"><div class="label">Revenue</div><div class="value">' +
            formatMoney(o.revenue || 0) + '</div><div class="sub">excl. cancelled</div></div>';
    var byStatus = o.byStatus || {};
    html += '<div class="stat"><div class="label">Received</div><div class="value">' +
            (byStatus.received || 0) + '</div><div class="sub">awaiting kitchen</div></div>';
    html += '<div class="stat"><div class="label">Preparing</div><div class="value">' +
            (byStatus.preparing || 0) + '</div><div class="sub">in the kitchen</div></div>';
    html += '<div class="stat"><div class="label">Out for delivery</div><div class="value">' +
            (byStatus.out_for_delivery || 0) + '</div><div class="sub">on the road</div></div>';
    html += '<div class="stat"><div class="label">Delivered</div><div class="value">' +
            (byStatus.delivered || 0) + '</div><div class="sub">completed</div></div>';
    els.statsRow.innerHTML = html;
  }

  // -------- Orders --------
  var allOrders = [];

  function renderOrders() {
    var statusFilter = els.statusFilter.value;
    var search = (els.searchInput.value || '').toLowerCase().trim();

    var rows = allOrders.filter(function (o) {
      if (statusFilter && o.status !== statusFilter) return false;
      if (search) {
        var hay = (o.orderId + ' ' + (o.customer && o.customer.name) + ' ' +
                   (o.customer && o.customer.email) + ' ' +
                   (o.customer && o.customer.phone)).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });

    if (rows.length === 0) {
      els.ordersBody.innerHTML = '<tr><td colspan="6" class="empty">No orders match.</td></tr>';
      return;
    }

    var html = rows.map(function (o) {
      var items = (o.items || []).map(function (it) {
        return '<span class="item-line">' + it.qty + '× ' + escapeHtml(it.name) + '</span>';
      }).join('');
      var c = o.customer || {};
      return '<tr data-id="' + escapeHtml(o.orderId) + '">' +
        '<td>' +
          '<div class="order-id">' + escapeHtml(o.orderId) + '</div>' +
          '<div class="customer-meta">' + formatDate(o.receivedAt) + '</div>' +
        '</td>' +
        '<td>' +
          '<div class="customer-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="customer-meta">' + escapeHtml(c.email) + '</div>' +
          '<div class="customer-meta">' + escapeHtml(c.phone) + '</div>' +
        '</td>' +
        '<td class="items-cell">' + items + '</td>' +
        '<td class="total">' + formatMoney(o.totals && o.totals.total) + '<br>' +
          '<span class="customer-meta">' + escapeHtml((o.payment && o.payment.methodLabel) || '') + '</span>' +
        '</td>' +
        '<td>' + statusPill(o.status) + '</td>' +
        '<td>' +
          '<div class="row-actions">' +
            '<select data-id="' + escapeHtml(o.orderId) + '">' +
              ['received','preparing','out_for_delivery','delivered','cancelled'].map(function (s) {
                return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' +
                       s.replace(/_/g, ' ') + '</option>';
              }).join('') +
            '</select>' +
            '<button data-save="' + escapeHtml(o.orderId) + '">Save</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');
    els.ordersBody.innerHTML = html;

    // Wire up save buttons
    Array.prototype.forEach.call(els.ordersBody.querySelectorAll('button[data-save]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-save');
        var sel = els.ordersBody.querySelector('select[data-id="' + id + '"]');
        var newStatus = sel ? sel.value : '';
        btn.disabled = true;
        btn.textContent = 'Saving…';
        api('/api/orders/' + encodeURIComponent(id) + '/status', {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus })
        }).then(function () {
          toast('Status updated for ' + id, 'success');
          return loadAll();
        }).catch(function (err) {
          toast(err.message, 'error');
        }).then(function () {
          btn.disabled = false;
          btn.textContent = 'Save';
        });
      });
    });
  }

  // -------- Contacts --------
  function renderContacts(contacts) {
    if (!contacts.length) {
      els.contactsBody.innerHTML = '<tr><td colspan="4" class="empty">No contact messages yet.</td></tr>';
      return;
    }
    var html = contacts.map(function (c) {
      return '<tr>' +
        '<td><div>' + formatDate(c.receivedAt) + '</div>' +
            '<div class="customer-meta">' + escapeHtml(c.contactId) + '</div></td>' +
        '<td>' +
          '<div class="customer-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="customer-meta">' + escapeHtml(c.email) + '</div>' +
          (c.phone ? '<div class="customer-meta">' + escapeHtml(c.phone) + '</div>' : '') +
        '</td>' +
        '<td><strong>' + escapeHtml(c.subject) + '</strong></td>' +
        '<td><div style="white-space:pre-wrap; max-width:520px;">' + escapeHtml(c.message) + '</div></td>' +
      '</tr>';
    }).join('');
    els.contactsBody.innerHTML = html;
  }

  // -------- Load everything --------
  function loadAll() {
    return Promise.all([
      api('/api/stats'),
      api('/api/orders'),
      api('/api/contacts')
    ]).then(function (results) {
      var stats = results[0];
      var orders = results[1];
      var contacts = results[2];

      renderStats(stats);
      allOrders = orders;
      renderOrders();
      renderContacts(contacts);

      // Update badges
      var newOrders = (stats.orders && stats.orders.byStatus && stats.orders.byStatus.received) || 0;
      if (newOrders > 0) {
        els.ordersBadge.textContent = newOrders;
        els.ordersBadge.style.display = '';
      } else {
        els.ordersBadge.style.display = 'none';
      }
      var cTotal = (stats.contacts && stats.contacts.total) || contacts.length;
      if (cTotal > 0) {
        els.contactsBadge.textContent = cTotal;
        els.contactsBadge.style.display = '';
      } else {
        els.contactsBadge.style.display = 'none';
      }

      els.status.textContent = '● Live';
      els.status.style.color = '#34d399';
    }).catch(function (err) {
      els.status.textContent = '● Error';
      els.status.style.color = '#fca5a5';
      // If it's an auth error, showGate was already called by api()
      if (err.message !== 'Unauthorized') toast(err.message, 'error');
    });
  }

  // -------- Wiring --------
  els.statusFilter.addEventListener('change', renderOrders);
  els.searchInput.addEventListener('input', renderOrders);
  els.refreshBtn.addEventListener('click', loadAll);

  // Tabs
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () {
      var which = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      document.getElementById('panel-orders').style.display = which === 'orders' ? '' : 'none';
      document.getElementById('panel-contacts').style.display = which === 'contacts' ? '' : 'none';
    });
  });

  // Live clock in the topbar
  function tickClock() {
    var d = new Date();
    var pad = function (x) { return String(x).padStart(2, '0'); };
    els.now.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  tickClock();
  setInterval(tickClock, 1000);

  // Auto-refresh every 15 seconds (orders/contacts only — stats are pulled in loadAll)
  setInterval(function () {
    if (els.dashboard.style.display === 'none') return;
    if (!getKey()) return;
    Promise.all([api('/api/orders'), api('/api/contacts')]).then(function (results) {
      allOrders = results[0];
      renderOrders();
      renderContacts(results[1]);
    }).catch(function () { /* api() will surface auth errors */ });
  }, 15000);

  // -------- Boot --------
  if (getKey()) {
    // We have a stored key — try it
    showDashboard();
    loadAll();
  } else {
    showGate();
  }
})();
