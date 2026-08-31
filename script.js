document.addEventListener('DOMContentLoaded', function () {

  // ---------- Dropdown menus (location / cart / options) ----------
  var dropdownConfigs = [
    { toggle: '#locationBtn', dropdown: '#locationDropdown' },
    { toggle: '#optionsBtn', dropdown: '#optionsDropdown' }
  ];

  function closeAllDropdowns(exceptDropdownSelector) {
    dropdownConfigs.forEach(function (cfg) {
      if (cfg.dropdown === exceptDropdownSelector) return;
      var dd = document.querySelector(cfg.dropdown);
      var btn = document.querySelector(cfg.toggle);
      if (dd) dd.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  dropdownConfigs.forEach(function (cfg) {
    var btn = document.querySelector(cfg.toggle);
    var dd = document.querySelector(cfg.dropdown);
    if (!btn || !dd) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !dd.classList.contains('open');
      closeAllDropdowns(cfg.dropdown);
      dd.classList.toggle('open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    });

    // Clicks inside a dropdown shouldn't bubble up and close it immediately
    dd.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  });

  document.addEventListener('click', function () {
    closeAllDropdowns(null);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllDropdowns(null);
  });

  // ---------- Location picker ----------
  var locationSub = document.querySelector('.location-sub');
  document.querySelectorAll('.location-option').forEach(function (opt) {
    opt.addEventListener('click', function () {
      if (locationSub) locationSub.textContent = opt.dataset.location;
      closeAllDropdowns(null);
    });
  });

  // ---------- Deals / category slider ----------
  var track = document.getElementById('dealsTrack');
  var prevBtn = document.getElementById('dealsPrev');
  var nextBtn = document.getElementById('dealsNext');

  function stepSize() {
    var card = track.querySelector('.deal-pill');
    var gap = 16;
    return card ? card.offsetWidth + gap : 240;
  }

  if (track && prevBtn && nextBtn) {
    prevBtn.addEventListener('click', function () {
      track.scrollBy({ left: -stepSize() * 2, behavior: 'smooth' });
    });
    nextBtn.addEventListener('click', function () {
      track.scrollBy({ left: stepSize() * 2, behavior: 'smooth' });
    });
  }

  // ---------- Deal banner carousel (autoplay every 5s) ----------
  var carousel = document.getElementById('dealCarousel');
  if (carousel) {
    var slides = Array.prototype.slice.call(carousel.querySelectorAll('.carousel-slide'));
    var dotsWrap = document.getElementById('carouselDots');
    var prevArrow = document.getElementById('carouselPrev');
    var nextArrow = document.getElementById('carouselNext');
    var current = 0;
    var intervalId = null;
    var AUTOPLAY_MS = 5000;

    slides.forEach(function (slide, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Go to deal ' + (i + 1));
      if (i === 0) dot.classList.add('active');
      dot.addEventListener('click', function () {
        goTo(i);
        restartAutoplay();
      });
      dotsWrap.appendChild(dot);
    });

    var dots = Array.prototype.slice.call(dotsWrap.children);

    function goTo(index) {
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('active');
      dots[current].classList.add('active');
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    function startAutoplay() {
      intervalId = window.setInterval(next, AUTOPLAY_MS);
    }
    function stopAutoplay() {
      if (intervalId) window.clearInterval(intervalId);
    }
    function restartAutoplay() {
      stopAutoplay();
      startAutoplay();
    }

    if (nextArrow) nextArrow.addEventListener('click', function () { next(); restartAutoplay(); });
    if (prevArrow) prevArrow.addEventListener('click', function () { prev(); restartAutoplay(); });

    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);
    carousel.addEventListener('focusin', stopAutoplay);
    carousel.addEventListener('focusout', startAutoplay);

    // Touch swipe support for mobile
    var touchStartX = 0;
    var touchEndX = 0;
    carousel.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].screenX;
      stopAutoplay();
    }, { passive: true });
    carousel.addEventListener('touchend', function (e) {
      touchEndX = e.changedTouches[0].screenX;
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) { next(); } else { prev(); }
      }
      startAutoplay();
    }, { passive: true });

    startAutoplay();
  }

  // ---------- Search bar + menu category tabs ----------
  var searchForm = document.getElementById('menuSearchForm');
  var searchInput = document.getElementById('menuSearchInput');
  var menuTabs = document.getElementById('menuTabs');
  var menuGrid = document.getElementById('menuGrid');
  var menuNoResults = document.getElementById('menuNoResults');

  if (menuTabs && menuGrid) {
    // ----- Menu page: category tabs + live search, combined -----
    var tabButtons = Array.prototype.slice.call(menuTabs.querySelectorAll('.menu-tab'));
    var cards = Array.prototype.slice.call(menuGrid.querySelectorAll('.menu-card'));

    var applyMenuFilters = function () {
      var activeTab = menuTabs.querySelector('.menu-tab.active');
      var filter = activeTab ? activeTab.dataset.filter : 'all';
      var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
      var visibleCount = 0;

      cards.forEach(function (card) {
        var matchesCategory = filter === 'all' || card.dataset.category === filter;
        var titleEl = card.querySelector('.menu-title');
        var descEl = card.querySelector('.menu-desc');
        var haystack = ((titleEl ? titleEl.textContent : '') + ' ' + (descEl ? descEl.textContent : '')).toLowerCase();
        var matchesQuery = query === '' || haystack.indexOf(query) !== -1;
        var show = matchesCategory && matchesQuery;
        card.style.display = show ? '' : 'none';
        if (show) visibleCount += 1;
      });

      if (menuNoResults) {
        menuNoResults.style.display = visibleCount === 0 ? '' : 'none';
      }
    };

    tabButtons.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabButtons.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        applyMenuFilters();
      });
    });

    if (searchInput) {
      var urlParams = new URLSearchParams(window.location.search);
      var qParam = urlParams.get('q');
      if (qParam) searchInput.value = qParam;
      searchInput.addEventListener('input', applyMenuFilters);
    }

    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
      });
    }

    applyMenuFilters();
  } else if (searchInput) {
    // ----- Other pages (e.g. homepage): animated placeholder, submit goes to the menu -----
    var searchSuggestions = [
      'Zinger Loaded Burger...',
      'BBQ Platter...',
      'Signature Beef Roll...',
      'Family Feast Combo...',
      'Loaded Cheese Fries...'
    ];
    var suggestionIndex = 0;
    window.setInterval(function () {
      if (document.activeElement === searchInput || searchInput.value) return;
      suggestionIndex = (suggestionIndex + 1) % searchSuggestions.length;
      searchInput.setAttribute('placeholder', 'Search for ' + searchSuggestions[suggestionIndex]);
    }, 2600);

    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = searchInput.value.trim();
        window.location.href = 'menu.html' + (q ? ('?q=' + encodeURIComponent(q)) : '');
      });
    }
  }

  // ---------- Contact form (now posts to /api/contact on the server) ----------
  var contactForm = document.getElementById('contactForm');
  var formStatus = document.getElementById('formStatus');
  if (contactForm && formStatus) {
    var contactSubmitBtn = contactForm.querySelector('button[type="submit"]');
    var originalBtnText = contactSubmitBtn ? contactSubmitBtn.textContent : '';
    var contactErrEl = document.getElementById('contactError');

    function showContactError(msg) {
      if (!contactErrEl) {
        // Fall back to the form status box if no dedicated error slot exists
        formStatus.textContent = msg;
        formStatus.classList.add('show', 'is-error');
        return;
      }
      contactErrEl.textContent = msg;
      contactErrEl.style.display = '';
    }
    function hideContactError() {
      if (!contactErrEl) {
        formStatus.classList.remove('is-error');
        return;
      }
      contactErrEl.style.display = 'none';
      contactErrEl.textContent = '';
    }

    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideContactError();
      formStatus.classList.remove('show');

      var payload = {
        name: (document.getElementById('cf-name')    || {}).value || '',
        email: (document.getElementById('cf-email')  || {}).value || '',
        phone: (document.getElementById('cf-phone')  || {}).value || '',
        subject: (document.getElementById('cf-subject') || {}).value || 'general',
        message: (document.getElementById('cf-message') || {}).value || ''
      };

      if (contactSubmitBtn) {
        contactSubmitBtn.disabled = true;
        contactSubmitBtn.textContent = 'Sending…';
      }

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          if (!r.ok) {
            return r.json().catch(function () { return {}; }).then(function (body) {
              throw new Error(body.error || ('Server responded with ' + r.status));
            });
          }
          return r.json();
        })
        .then(function () {
          formStatus.classList.add('show');
          formStatus.classList.remove('is-error');
          formStatus.textContent = "Thanks! Your message has been received — we'll be in touch soon.";
          contactForm.reset();
          formStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        })
        .catch(function (err) {
          showContactError(err.message || "We couldn't send your message — please try again.");
        })
        .then(function () {
          if (contactSubmitBtn) {
            contactSubmitBtn.disabled = false;
            contactSubmitBtn.textContent = originalBtnText || 'Send Message';
          }
        });
    });
  }

  // ---------- Cart ----------
  var CART_STORAGE_KEY = 'karachibites_cart';

  function loadCart() {
    try {
      var raw = window.localStorage.getItem(CART_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCart(cartObj) {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartObj));
    } catch (e) {
      /* storage unavailable, ignore */
    }
  }

  function parsePrice(text) {
    var match = String(text).match(/[\d,]+(\.\d+)?/);
    if (!match) return 0;
    var n = parseFloat(match[0].replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function formatPrice(n) {
    return 'Rs. ' + Number(n).toLocaleString('en-US');
  }

  var cart = loadCart();

  // Maps a cart item's name to its thumbnail image (falls back to a generic icon)
  var PRODUCT_IMAGES = {
    'Zinger Loaded Burger': 'assets/food-burger.png',
    'Double Cheese Beef Burger': 'assets/food-cheese-burger.png',
    'Spicy Peri Peri Burger': 'assets/food-spicy-burger.png',
    'Classic Chicken Burger': 'assets/food-classic-burger.png',
    'Signature Beef Roll': 'assets/food-roll.png',
    'Malai Boti Roll': 'assets/food-malai-roll.png',
    'Seekh Kebab Roll': 'assets/food-seekh-roll.png',
    'Family Feast Combo': 'assets/food-family-feast.png',
    'BBQ Platter': 'assets/food-bbq.png',
    'Pizza & Rolls Bundle': 'assets/food-pizza-bundle.png',
    'Loaded Cheese Fries': 'assets/food-fries.png',
    'Chilled Soft Drink 1.5L': 'assets/food-drink.png',
    'Garden Fresh Salad': 'assets/food-salad.png'
  };

  function productImage(name) {
    return PRODUCT_IMAGES[name] || 'assets/food-burger.png';
  }

  // Candidate items offered as cross-sell suggestions in the cart panel
  var UPSELL_ITEMS = [
    { name: 'Loaded Cheese Fries', price: 320 },
    { name: 'Chilled Soft Drink 1.5L', price: 220 },
    { name: 'Garden Fresh Salad', price: 280 },
    { name: 'Seekh Kebab Roll', price: 400 },
    { name: 'Malai Boti Roll', price: 380 },
    { name: 'Double Cheese Beef Burger', price: 780 }
  ];

  function cartTotals() {
    var count = 0;
    var total = 0;
    Object.keys(cart).forEach(function (key) {
      count += cart[key].qty;
      total += cart[key].qty * cart[key].price;
    });
    return { count: count, total: total };
  }

  function renderCartBadge() {
    var totals = cartTotals();
    document.querySelectorAll('.cart-wrap .badge').forEach(function (b) {
      b.textContent = totals.count;
    });
  }

  function renderCartPanel() {
    var itemsWrap = document.getElementById('cartPanelItems');
    if (!itemsWrap) return;

    var keys = Object.keys(cart);
    var totals = cartTotals();

    if (keys.length === 0) {
      itemsWrap.innerHTML = '<div class="cp-empty">' +
        '<img src="assets/icon-cart.png" alt="">' +
        '<p>Your cart is empty</p>' +
        '<a href="menu.html" class="btn btn-primary btn-sm">Browse Menu</a>' +
        '</div>';
    } else {
      var html = '';
      keys.forEach(function (key) {
        var item = cart[key];
        html += '<div class="cp-item">' +
          '<img class="cp-item-img" src="' + productImage(item.name) + '" alt="' + item.name + '">' +
          '<div class="cp-item-info">' +
            '<div class="cp-item-name">' + item.name + '</div>' +
            '<div class="cp-item-price">' + formatPrice(item.price) + '</div>' +
          '</div>' +
          '<div class="cp-item-qty">' +
            '<button type="button" class="cp-minus" data-key="' + key + '" aria-label="Remove one ' + item.name + '">&minus;</button>' +
            '<span class="cp-item-qty-value">' + item.qty + '</span>' +
            '<button type="button" class="cp-plus" data-key="' + key + '" aria-label="Add one more ' + item.name + '">&plus;</button>' +
          '</div>' +
          '</div>';
      });
      itemsWrap.innerHTML = html;

      itemsWrap.querySelectorAll('.cp-minus').forEach(function (btn) {
        btn.addEventListener('click', function () {
          decrementItem(btn.getAttribute('data-key'));
        });
      });
      itemsWrap.querySelectorAll('.cp-plus').forEach(function (btn) {
        btn.addEventListener('click', function () {
          incrementItem(btn.getAttribute('data-key'));
        });
      });
    }

    // ----- Upsell carousel: items not already in the cart -----
    var upsellSection = document.getElementById('cartPanelUpsell');
    var upsellTrack = document.getElementById('cartPanelUpsellTrack');
    if (upsellSection && upsellTrack) {
      var candidates = UPSELL_ITEMS.filter(function (u) { return !cart[u.name]; }).slice(0, 6);
      if (keys.length === 0 || candidates.length === 0) {
        upsellSection.style.display = 'none';
        upsellTrack.innerHTML = '';
      } else {
        upsellSection.style.display = '';
        var uHtml = '';
        candidates.forEach(function (u) {
          uHtml += '<div class="cp-upsell-card">' +
            '<div class="cp-upsell-img-wrap">' +
              '<img src="' + productImage(u.name) + '" alt="' + u.name + '">' +
              '<button type="button" class="cp-upsell-add" data-name="' + u.name + '" data-price="' + u.price + '" aria-label="Add ' + u.name + '">&plus;</button>' +
            '</div>' +
            '<div class="cp-upsell-price">' + formatPrice(u.price) + '</div>' +
            '<div class="cp-upsell-name">' + u.name + '</div>' +
            '</div>';
        });
        upsellTrack.innerHTML = uHtml;

        upsellTrack.querySelectorAll('.cp-upsell-add').forEach(function (btn) {
          btn.addEventListener('click', function () {
            addToCart(btn.getAttribute('data-name'), parseFloat(btn.getAttribute('data-price')));
          });
        });
      }
    }

    // ----- Summary: subtotal + tax + total -----
    var summaryWrap = document.getElementById('cartPanelSummary');
    if (summaryWrap) {
      if (keys.length === 0) {
        summaryWrap.innerHTML = '';
      } else {
        var gst = Math.round(totals.total * GST_RATE);
        var grandTotal = totals.total + gst;
        summaryWrap.innerHTML =
          '<div class="cp-summary-line">' +
            '<img class="cp-summary-icon" src="assets/icon-total.png" alt="">' +
            '<span class="cp-summary-label">Subtotal</span>' +
            '<span class="cp-summary-value">' + formatPrice(totals.total) + '</span>' +
          '</div>' +
          '<div class="cp-summary-line">' +
            '<img class="cp-summary-icon" src="assets/icon-tax.png" alt="">' +
            '<span class="cp-summary-label">Tax (18%)</span>' +
            '<span class="cp-summary-value">' + formatPrice(gst) + '</span>' +
          '</div>' +
          '<div class="cp-summary-line cp-summary-grand">' +
            '<img class="cp-summary-icon" src="assets/icon-total.png" alt="">' +
            '<span class="cp-summary-label">Total</span>' +
            '<span class="cp-summary-value">' + formatPrice(grandTotal) + '</span>' +
          '</div>';
      }
    }
  }

  // ---------- Cart side panel open/close ----------
  var cartPanel = document.getElementById('cartPanel');
  var cartPanelOverlay = document.getElementById('cartPanelOverlay');
  var cartPanelClose = document.getElementById('cartPanelClose');

  function openCartPanel() {
    if (!cartPanel || !cartPanelOverlay) return;
    cartPanel.classList.add('open');
    cartPanel.setAttribute('aria-hidden', 'false');
    cartPanelOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeCartPanel() {
    if (!cartPanel || !cartPanelOverlay) return;
    cartPanel.classList.remove('open');
    cartPanel.setAttribute('aria-hidden', 'true');
    cartPanelOverlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  var cartBtn = document.getElementById('cartBtn');
  if (cartBtn) {
    cartBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openCartPanel();
    });
  }
  if (cartPanelClose) cartPanelClose.addEventListener('click', closeCartPanel);
  if (cartPanelOverlay) cartPanelOverlay.addEventListener('click', closeCartPanel);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeCartPanel();
  });

  // Upsell carousel arrows
  var cpUpsellPrev = document.getElementById('cpUpsellPrev');
  var cpUpsellNext = document.getElementById('cpUpsellNext');
  var cpUpsellTrackEl = document.getElementById('cartPanelUpsellTrack');
  if (cpUpsellPrev && cpUpsellNext && cpUpsellTrackEl) {
    cpUpsellPrev.addEventListener('click', function () {
      cpUpsellTrackEl.scrollBy({ left: -220, behavior: 'smooth' });
    });
    cpUpsellNext.addEventListener('click', function () {
      cpUpsellTrackEl.scrollBy({ left: 220, behavior: 'smooth' });
    });
  }

  function renderFloatBar() {
    var bar = document.getElementById('cartFloatBar');
    if (!bar) return;
    var totals = cartTotals();

    if (totals.count === 0) {
      bar.classList.remove('show');
      return;
    }

    var countEl = bar.querySelector('.cfb-count');
    var priceEl = bar.querySelector('.cfb-price');
    if (countEl) countEl.textContent = totals.count;
    if (priceEl) priceEl.textContent = formatPrice(totals.total);
    bar.classList.add('show');
  }

  // ---------- Checkout page order summary ----------
  var GST_RATE = 0.18;
  var DELIVERY_CHARGE = 200;

  function renderCheckoutPage() {
    var emptyState = document.getElementById('checkoutEmpty');
    var content = document.getElementById('checkoutContent');
    var itemsWrap = document.getElementById('orderItems');
    if (!emptyState || !content || !itemsWrap) return;

    var keys = Object.keys(cart);

    if (keys.length === 0) {
      emptyState.style.display = '';
      content.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    content.style.display = 'grid';

    var html = '';
    keys.forEach(function (key) {
      var item = cart[key];
      html += '<div class="cart-line-item">' +
        '<span class="cli-name">' + item.name + '</span>' +
        '<div class="cli-qty-controls">' +
          '<button type="button" class="cli-qty-btn cli-minus" data-key="' + key + '" aria-label="Remove one ' + item.name + '">&minus;</button>' +
          '<span class="cli-qty-value">' + item.qty + '</span>' +
          '<button type="button" class="cli-qty-btn cli-plus" data-key="' + key + '" aria-label="Add one more ' + item.name + '">&plus;</button>' +
        '</div>' +
        '<span class="cli-price">' + formatPrice(item.price * item.qty) + '</span>' +
        '</div>';
    });
    itemsWrap.innerHTML = html;

    itemsWrap.querySelectorAll('.cli-minus').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        decrementItem(btn.getAttribute('data-key'));
      });
    });
    itemsWrap.querySelectorAll('.cli-plus').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        incrementItem(btn.getAttribute('data-key'));
      });
    });

    var totals = cartTotals();
    var gst = totals.total * GST_RATE;
    var grandTotal = totals.total + gst + DELIVERY_CHARGE;

    var subtotalEl = document.getElementById('ordSubtotal');
    var gstEl = document.getElementById('ordGst');
    var deliveryEl = document.getElementById('ordDelivery');
    var totalEl = document.getElementById('ordTotal');

    if (subtotalEl) subtotalEl.textContent = formatPrice(totals.total);
    if (gstEl) gstEl.textContent = formatPrice(Math.round(gst));
    if (deliveryEl) deliveryEl.textContent = formatPrice(DELIVERY_CHARGE);
    if (totalEl) totalEl.textContent = formatPrice(Math.round(grandTotal));
  }

  function renderCart() {
    renderCartBadge();
    renderCartPanel();
    renderFloatBar();
    renderCheckoutPage();
  }

  function addToCart(name, price) {
    if (cart[name]) {
      cart[name].qty += 1;
    } else {
      cart[name] = { name: name, price: price, qty: 1 };
    }
    saveCart(cart);
    renderCart();
  }

  function incrementItem(key) {
    if (!cart[key]) return;
    cart[key].qty += 1;
    saveCart(cart);
    renderCart();
  }

  function decrementItem(key) {
    if (!cart[key]) return;
    cart[key].qty -= 1;
    if (cart[key].qty <= 0) {
      delete cart[key];
    }
    saveCart(cart);
    renderCart();
  }

  // Wire up "Add +" buttons on the menu page
  document.querySelectorAll('.add-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.menu-card');
      if (!card) return;
      var titleEl = card.querySelector('.menu-title');
      var priceEl = card.querySelector('.price');
      var name = titleEl ? titleEl.textContent.trim() : 'Item';
      var price = priceEl ? parsePrice(priceEl.textContent) : 0;
      addToCart(name, price);
    });
  });

  // Floating bar opens the cart side panel
  var floatBar = document.getElementById('cartFloatBar');
  if (floatBar) {
    floatBar.addEventListener('click', function (e) {
      e.stopPropagation();
      openCartPanel();
    });
    floatBar.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCartPanel();
      }
    });
  }

  renderCart();

  // ---------- Checkout: payment method selection ----------
  var paymentOptions = document.getElementById('paymentOptions');
  var cardDetail = document.getElementById('cardDetail');
  var walletDetail = document.getElementById('walletDetail');
  var walletLabel = document.getElementById('walletLabel');
  var walletNote = document.getElementById('walletNote');
  var walletNumberInput = document.getElementById('co-wallet-number');
  var cardNumberInput = document.getElementById('co-card-number');
  var cardExpiryInput = document.getElementById('co-card-expiry');
  var cardCvvInput = document.getElementById('co-card-cvv');

  var paymentLabels = {
    cod: 'Cash on Delivery',
    card: 'Credit / Debit Card',
    jazzcash: 'JazzCash',
    easypaisa: 'EasyPaisa'
  };

  function setRequired(input, isRequired) {
    if (!input) return;
    if (isRequired) {
      input.setAttribute('required', 'required');
    } else {
      input.removeAttribute('required');
    }
  }

  function updatePaymentUI() {
    if (!paymentOptions) return;
    var selected = paymentOptions.querySelector('input[name="payment"]:checked');
    var value = selected ? selected.value : 'cod';

    paymentOptions.querySelectorAll('.payment-option').forEach(function (label) {
      var input = label.querySelector('input[type="radio"]');
      label.classList.toggle('is-selected', !!input && input.checked);
    });

    if (cardDetail) cardDetail.style.display = value === 'card' ? '' : 'none';
    setRequired(cardNumberInput, value === 'card');
    setRequired(cardExpiryInput, value === 'card');
    setRequired(cardCvvInput, value === 'card');

    var isWallet = value === 'jazzcash' || value === 'easypaisa';
    if (walletDetail) walletDetail.style.display = isWallet ? '' : 'none';
    setRequired(walletNumberInput, isWallet);

    if (isWallet && walletLabel && walletNote) {
      var walletName = paymentLabels[value];
      walletLabel.textContent = walletName + ' Mobile Number';
      walletNote.textContent = "You'll get a payment prompt on this number to confirm via " + walletName + '.';
    }
  }

  if (paymentOptions) {
    paymentOptions.querySelectorAll('input[name="payment"]').forEach(function (input) {
      input.addEventListener('change', updatePaymentUI);
    });
    updatePaymentUI();
  }

  // ---------- Checkout: place order ----------
  // CHANGED: this now sends the order to a real backend (POST /api/orders)
  // instead of just showing a fake success message. See server/server.js
  // for the Express endpoint that receives this data.
  var checkoutForm = document.getElementById('checkoutForm');
  var checkoutContent = document.getElementById('checkoutContent');
  var checkoutSuccess = document.getElementById('checkoutSuccess');
  var successMessage = document.getElementById('successMessage');
  var checkoutError = document.getElementById('checkoutError');
  var placeOrderBtn = document.getElementById('placeOrderBtn');

  // Where the backend is running. The Express server in /server serves the
  // whole site AND this API from the same origin, so a relative path works
  // with no CORS setup needed. Change this only if you host the API elsewhere.
  var ORDER_API_URL = '/api/orders';

  function showCheckoutError(message) {
    if (!checkoutError) return;
    checkoutError.textContent = message;
    checkoutError.style.display = '';
  }

  function hideCheckoutError() {
    if (!checkoutError) return;
    checkoutError.style.display = 'none';
    checkoutError.textContent = '';
  }

  function setPlaceOrderLoading(isLoading) {
    if (!placeOrderBtn) return;
    placeOrderBtn.classList.toggle('is-loading', isLoading);
    placeOrderBtn.textContent = isLoading ? 'Placing order…' : 'Place Order';
  }

  if (checkoutForm && checkoutContent && checkoutSuccess) {
    checkoutForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideCheckoutError();

      var totals = cartTotals();
      if (totals.count === 0) return;

      var gst = Math.round(totals.total * GST_RATE);
      var grandTotal = totals.total + gst + DELIVERY_CHARGE;

      var selected = paymentOptions ? paymentOptions.querySelector('input[name="payment"]:checked') : null;
      var paymentValue = selected ? selected.value : 'cod';
      var paymentName = paymentLabels[paymentValue] || 'Cash on Delivery';

      // ----- Build the JSON payload the backend will receive -----
      // (name, email, address come straight from the form fields the
      // user just filled in; items come from the cart object)
      var itemsPayload = Object.keys(cart).map(function (key) {
        var item = cart[key];
        return { name: item.name, price: item.price, qty: item.qty };
      });

      var orderPayload = {
        customer: {
          name: document.getElementById('co-name').value.trim(),
          email: document.getElementById('co-email').value.trim(),
          phone: document.getElementById('co-phone').value.trim(),
          address: document.getElementById('co-address').value.trim(),
          area: document.getElementById('co-area').value
        },
        items: itemsPayload,
        payment: {
          method: paymentValue,
          methodLabel: paymentName
        },
        totals: {
          subtotal: totals.total,
          gst: gst,
          deliveryCharge: DELIVERY_CHARGE,
          total: grandTotal
        }
      };

      // ----- Send it to the backend -----
      setPlaceOrderLoading(true);

      fetch(ORDER_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      })
        .then(function (response) {
          // Always read the body once so we can show the server's real
          // error message if the order fails — the generic "check your
          // connection" message isn't very helpful otherwise.
          return response.json().catch(function () { return {}; }).then(function (body) {
            return { ok: response.ok, status: response.status, body: body };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            var serverMsg = (result.body && (result.body.error ||
              (result.body.details && result.body.details.join('; ')))) || ('Server responded with ' + result.status);
            throw new Error(serverMsg);
          }

          var data = result.body || {};
          var orderId = data.orderId || ('KB-' + Math.floor(100000 + Math.random() * 900000));
          var payLine = paymentValue === 'cod'
            ? "You'll pay " + formatPrice(grandTotal) + ' in cash when your order arrives.'
            : 'Your payment of ' + formatPrice(grandTotal) + ' via ' + paymentName + ' is being confirmed.';

          if (successMessage) {
            successMessage.textContent = 'Order #' + orderId + ' placed! ' + payLine;
          }

          cart = {};
          saveCart(cart);
          renderCart();

          checkoutContent.style.display = 'none';
          checkoutSuccess.style.display = '';
          checkoutSuccess.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .catch(function (err) {
          // Network error (server down / wrong port / file://), non-2xx
          // response, or a thrown validation error from the server.
          // Keep the cart intact and surface the real reason so the user
          // can fix it instead of guessing.
          console.error('Order submission failed:', err);

          var hint;
          if (err instanceof TypeError) {
            // fetch() throws TypeError for network failures
            hint = "Couldn't reach the order server. " +
                   "Is it running? Open a terminal in the project's `assets/server` folder and run `npm start`, " +
                   "then reload this page from http://localhost:3000/checkout.html (not by double-clicking the file).";
          } else {
            hint = "Couldn't place your order: " + err.message;
          }
          showCheckoutError(hint);
        })
        .finally(function () {
          setPlaceOrderLoading(false);
        });
    });
  }

  // ---------- Highlight current page ----------
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.options-link, .footer-link').forEach(function (link) {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('w--current');
    }
  });

});
