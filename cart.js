// KarachiBites Demo — shared cart logic (runs on every page)
(function () {
  function getCart() {
    return JSON.parse(localStorage.getItem('kbCart') || '[]');
  }
  function saveCart(cart) {
    localStorage.setItem('kbCart', JSON.stringify(cart));
  }

  function updateBadge() {
    var countEl = document.getElementById('cartCount');
    if (!countEl) return;
    var cart = getCart();
    var totalQty = cart.reduce(function (s, i) { return s + i.qty; }, 0);
    countEl.textContent = totalQty;
  }

  function renderCart() {
    var cartItemsEl = document.getElementById('cartItems');
    var subtotalEl = document.getElementById('cartSubtotal');
    if (!cartItemsEl) return;
    var cart = getCart();
    updateBadge();

    if (cart.length === 0) {
      cartItemsEl.innerHTML = '<p class="cart-empty">Your cart is empty. Add something tasty!</p>';
      if (subtotalEl) subtotalEl.textContent = 'Rs. 0';
      return;
    }

    var subtotal = 0;
    var html = '';
    cart.forEach(function (item) {
      subtotal += item.price * item.qty;
      html +=
        '<div class="cart-line" data-id="' + item.id + '">' +
          '<div class="cart-line-info">' +
            '<p class="cart-line-name">' + item.name + '</p>' +
            '<span class="cart-line-price">Rs. ' + item.price + '</span>' +
          '</div>' +
          '<div class="cart-line-actions">' +
            '<button class="qty-btn" data-action="dec" data-id="' + item.id + '">-</button>' +
            '<span class="qty-value">' + item.qty + '</span>' +
            '<button class="qty-btn" data-action="inc" data-id="' + item.id + '">+</button>' +
          '</div>' +
        '</div>';
    });
    cartItemsEl.innerHTML = html;
    if (subtotalEl) subtotalEl.textContent = 'Rs. ' + subtotal;
  }

  function addToCart(id, name, price) {
    var cart = getCart();
    var existing = cart.find(function (i) { return i.id === id; });
    if (existing) { existing.qty += 1; } else { cart.push({ id: id, name: name, price: price, qty: 1 }); }
    saveCart(cart);
    renderCart();
    showToast(name + ' added to cart!');
  }

  function showToast(msg) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  document.addEventListener('DOMContentLoaded', function () {
    updateBadge();
    renderCart();

    // Add-to-cart buttons (present on home + menu pages)
    document.body.addEventListener('click', function (e) {
      var addBtn = e.target.closest('.add-btn');
      if (addBtn) {
        var card = addBtn.closest('[data-name]');
        if (card) {
          addToCart(addBtn.getAttribute('data-id'), card.getAttribute('data-name'), parseInt(card.getAttribute('data-price'), 10));
        }
      }

      var qtyBtn = e.target.closest('.qty-btn');
      if (qtyBtn) {
        var cart = getCart();
        var id = qtyBtn.getAttribute('data-id');
        var action = qtyBtn.getAttribute('data-action');
        var item = cart.find(function (i) { return i.id === id; });
        if (item) {
          if (action === 'inc') { item.qty += 1; }
          else { item.qty -= 1; if (item.qty <= 0) cart = cart.filter(function (i) { return i.id !== id; }); }
          saveCart(cart);
          renderCart();
        }
      }
    });

    // Cart drawer open/close
    var cartToggle = document.getElementById('cartToggle');
    var cartClose = document.getElementById('cartClose');
    var overlay = document.getElementById('cartOverlay');
    var drawer = document.getElementById('cartDrawer');
    if (cartToggle && drawer && overlay) {
      cartToggle.addEventListener('click', function () {
        drawer.classList.add('open');
        overlay.classList.add('show');
      });
      var closeCart = function () {
        drawer.classList.remove('open');
        overlay.classList.remove('show');
      };
      if (cartClose) cartClose.addEventListener('click', closeCart);
      overlay.addEventListener('click', closeCart);
    }

    // Checkout button — demo only
    var checkoutBtn = document.querySelector('.cart-checkout');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', function () {
        var cart = getCart();
        if (cart.length === 0) { showToast('Your cart is empty'); return; }
        showToast('Order placed! (demo only)');
        localStorage.removeItem('kbCart');
        setTimeout(renderCart, 300);
      });
    }

    // Menu page: search + category tabs
    var searchInput = document.getElementById('menuSearch');
    var tabBar = document.getElementById('tabBar');
    var itemGrid = document.getElementById('itemGrid');
    if (itemGrid) {
      var currentCat = 'all';
      var filterItems = function () {
        var term = (searchInput ? searchInput.value : '').toLowerCase().trim();
        var items = itemGrid.querySelectorAll('.item-card');
        var visibleCount = 0;
        items.forEach(function (card) {
          var cat = card.getAttribute('data-cat');
          var name = (card.getAttribute('data-name') || '').toLowerCase();
          var matchesCat = (currentCat === 'all' || cat === currentCat);
          var matchesSearch = (term === '' || name.indexOf(term) !== -1);
          var visible = matchesCat && matchesSearch;
          card.style.display = visible ? '' : 'none';
          if (visible) visibleCount++;
        });
        var existingMsg = itemGrid.querySelector('.no-results');
        if (visibleCount === 0) {
          if (!existingMsg) {
            var msg = document.createElement('p');
            msg.className = 'no-results';
            msg.textContent = 'No items match your search.';
            itemGrid.appendChild(msg);
          }
        } else if (existingMsg) {
          existingMsg.remove();
        }
      };

      if (tabBar) {
        tabBar.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-cat]');
          if (!btn) return;
          currentCat = btn.getAttribute('data-cat');
          tabBar.querySelectorAll('button').forEach(function (b) {
            b.className = (b === btn) ? 'tab-active' : 'tab-btn';
          });
          filterItems();
        });
      }
      if (searchInput) searchInput.addEventListener('input', filterItems);
      filterItems();
    }

    // Contact form — demo only
    var contactForm = document.getElementById('contactForm');
    if (contactForm) {
      contactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        showToast('Message sent! (demo only)');
        contactForm.reset();
      });
    }
  });
})();
