// Token Radar's page. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable table, an inline detail view per protocol with the model's own
// inputs and the protocol's farm plan, and the live-token set. No network: every byte it shows is
// in data.js. The page recomputes each row's implied value from the snapshot figures, so the
// number on screen and the number board.json carries are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', set: 'all', tab: 'pre-token', sort: 'implied', dir: -1, expanded: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The radar-2 model, the same arithmetic main.ts runs: a category-calibrated ratio times TVL,
  // then growth, maturity and chain breadth. The page recomputes a row and checks it against the
  // board, so a stale dataset would show up as a mismatch instead of a silent wrong number.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity;
    if (age <= model.maturity_peak_days) {
      maturity = model.maturity_floor + (1 - model.maturity_floor) * (age / model.maturity_peak_days);
    } else {
      maturity = Math.max(model.maturity_late_floor, 1 - (1 - model.maturity_late_floor) * (Math.min(age - model.maturity_peak_days, model.maturity_decay_days) / model.maturity_decay_days));
    }
    var chainCount = row.chains ? row.chains.length : 0;
    var chainsMult = 1 + model.chain_step * Math.min(Math.max(chainCount - 1, 0), model.chain_max);
    return Math.max(1, Math.round(row.tvl_usd * row.ratio * growthMult * maturity * chainsMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('set')) state.set = params.get('set');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.expanded = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.set !== 'all') params.set('set', state.set);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.expanded) params.set('p', state.expanded);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.set === 'watchlist' && !r.on_watchlist) return false;
      if (state.set === 'early' && r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function mastheadStats() {
    var holder = document.getElementById('masthead-stats');
    if (!holder) return;
    var items = [
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
      ['Board rows', String(DATA.board_size)],
      ['Early finds', String(DATA.early_size)],
      ['Live set aside', String(DATA.live_size)],
    ];
    items.forEach(function (it) {
      holder.appendChild(el('div', null, el('dt', { text: it[0] }), el('dd', { text: it[1] })));
    });
    var src = document.getElementById('colophon-source');
    if (src) src.textContent = 'Snapshot ' + DATA.as_of + ' · DefiLlama protocol index · floor $' + Math.round(DATA.floor_usd / 1e6) + 'M · model ' + DATA.model_version + '.';
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    function setChip(value, label) {
      return el('button', { type: 'button', class: 'chip', 'aria-pressed': state.set === value ? 'true' : 'false', text: label, onclick: function () { state.set = value; writeHash(); render(); } });
    }
    function tabButton(value, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === value ? 'true' : 'false', text: label, onclick: function () { state.tab = value; writeHash(); render(); } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'Set' }),
        el('div', { class: 'tabs' }, setChip('all', 'All rows'), setChip('watchlist', 'Watchlist'), setChip('early', 'Early finds'))),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'Token status' }),
        el('div', { class: 'tabs' }, tabButton('pre-token', 'Pre-token'), tabButton('live', 'Live token'))),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? visibleRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function detailRow(r) {
    var recomputed = impliedOf(r, DATA.model);
    var agrees = recomputed === r.implied_value_usd;
    var steps = (r.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    });
    var cell = el('td', { colspan: 7 },
      el('div', { class: 'detail-grid' },
        el('div', null,
          el('h3', { text: 'Implied value — how the number is built' }),
          el('div', { class: 'equation' },
            el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(r.tvl_usd) })),
            el('div', null, el('span', { text: 'Category ratio (' + r.ratio_source + ')' }), el('b', { text: '× ' + r.ratio.toFixed(4) })),
            el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(r.change_7d) })),
            el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: '× ' + r.growth_multiplier })),
            el('div', null, el('span', { text: 'Age with no token on record' }), el('b', { text: fmtAge(r.age_days) })),
            el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: '× ' + r.maturity_multiplier })),
            el('div', null, el('span', { text: 'Chains (' + (r.chains || []).join(', ') + ')' }), el('b', { text: '× ' + r.chains_multiplier })),
            el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'total', text: fmtUsd(r.implied_value_usd) }))
          ),
          el('p', { class: 'sub', text: 'The page recomputes this row as ' + fmtUsd(recomputed) + (agrees ? ', the same number board.json carries.' : ' — that differs from the board, so this data is stale.') + ' This is an estimate, not a price.' })
        ),
        el('div', null,
          el('h3', { text: 'Farm plan — six steps' }),
          el('ol', { class: 'steps' }, steps)
        )
      )
    );
    return el('tr', { class: 'detail-row' }, cell);
  }

  function boardTable() {
    var list = sortedRows(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.set = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var open = state.expanded === r.slug;
      var tr = el('tr', {
        'aria-expanded': open ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { state.expanded = open ? null : r.slug; writeHash(); render(); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.expanded = open ? null : r.slug; writeHash(); render(); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'one chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })),
        el('td', null, el('span', { class: 'badge ' + (r.on_watchlist ? 'watch' : 'early'), text: r.on_watchlist ? 'Watchlist' : 'Early' }))
      );
      tbody.appendChild(tr);
      if (open) tbody.appendChild(detailRow(r));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row to open its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Set' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'badge live', text: 'Live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'one chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' : 'n/a' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Tokens that already trade: their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios are what calibrate it.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var calib = DATA.calibration;
    var formula = 'implied = round( tvl_usd × ratio × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × maturity(age) × (1 + ' + m.chain_step + ' × min(chains − 1, ' + m.chain_max + ')) )';
    var calRows = calib.by_category.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: '× ' + c.ratio.toFixed(4) }),
        el('td', { class: 'num', text: String(c.live_protocols) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every protocol. The ratio is not asserted: it is the median market-cap-to-TVL ratio of the live-token protocols in the same category, taken from this very snapshot — at least ' + m.category_min_live + ' live protocols per category, else the global median of × ' + calib.global_ratio.toFixed(4) + '. Ratios are clamped to × ' + m.ratio_min + ' … × ' + m.ratio_max + '.' }),
      el('div', { class: 'formula', text: formula }),
      el('p', { class: 'sub', text: 'Maturity is a hump: × ' + m.maturity_floor + ' at listing, rising to × 1.00 at ' + m.maturity_peak_days + ' days, then easing to × ' + m.maturity_late_floor + ' over the next ' + m.maturity_decay_days + ' days. A protocol that has run years with no token on record has proved it can last — and that a launch may never come. An unknown listing date counts as ' + m.unknown_age_days + ' days. Growth is clamped so one hot week cannot crown a protocol, and one bad week cannot bury it.' }),
      el('h2', { text: 'Calibration — what the market pays per dollar of TVL' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'calibration' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Ratio used' }), el('th', { scope: 'col', text: 'Live protocols' }))),
          el('tbody', null, calRows)
        )
      ),
      el('p', { class: 'sub', text: 'The early radar adds protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor that pass the watchlist’s own exclusion rules — no wrapped or staked product of a token that already trades, no exchange-name prefix, no versioned pool, no bridge, liquid-staking, restaking or CEX record. A protocol below the floor is no worse a launch candidate; the floor is never the whole board.' })
    );
  }

  function render() {
    app.textContent = '';
    app.setAttribute('aria-busy', 'false');
    app.appendChild(controls());
    app.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') app.appendChild(modelPanel());
  }

  mastheadStats();
  readHash();
  render();
})();
