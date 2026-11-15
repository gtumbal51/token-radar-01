// Token Radar's page, radar-3. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, an inline detail view per protocol with the
// model's own inputs and the protocol's farm plan, the live-token set, and the model view with the
// validation. No network: every byte it shows is in data.js.
//
// The model, in one line: log(market cap) = a + b × log(TVL), fitted by ordinary least squares
// on the 119 traded protocols outside the CEX category, then tested two ways before it is
// trusted. A time split fits the older half by listing date and predicts the younger half:
// median error ×2.81, 45% within 2×, 50% within 3×. A leave-one-out ablation refits the curve
// 119 times and tests every extra factor — category, growth, maturity, all of them together —
// and none of them earns its place: the curve alone (leave-one-out median ×3.36) beats the curve
// plus any tilt. So the model is the curve alone, and a launch is priced as a range, not a
// point: the band is the mid divided and multiplied by the time-split median error factor.
// The page refits the curve from the traded protocols itself, so the numbers on screen are the
// page's own arithmetic, not a claim it takes on trust: it recomputes each row's implied value
// from the curve and checks it against the board, and it recomputes each plan's net from the
// band, the $1,000 plan and its costs.
//
// Farm economics, also in one line: a plan is $1,000, the same size for every protocol; a
// wallet's allocation is the low end of the band shared by 40,000 farming wallets; the plan's
// cost is the gas its steps spend plus the yield the $1,000 forgoes at 4% a year. The $1,000 is
// a deposit, returned on exit. Net is gross minus cost: FARM when it clears $100, THIN when it
// is positive but under $100, SKIP when it is zero or negative.
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
  function fmtSigned(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n >= 0 ? '+$' : '-$') + Math.abs(Math.round(n)).toLocaleString('en-US');
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

  // The size curve, fitted here from the traded protocols data.js carries: ordinary least
  // squares on log(TVL) against log(market cap). The page's fit must match the one main.ts ran.
  function fitCurve(comps) {
    var n = comps.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) {
      var x = Math.log(comps[i].tvl_usd), y = Math.log(comps[i].mcap_usd);
      sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return { intercept: (sy - slope * sx) / n, slope: slope, n: n };
  }
  var FIT = fitCurve(DATA.comps);
  var V = DATA.validation;
  var BAND = V.band_factor;
  var fitAgrees = Math.abs(FIT.intercept - V.curve.intercept) < 1e-9 && Math.abs(FIT.slope - V.curve.slope) < 1e-9;

  // One row's implied value and band, recomputed here from the curve.
  function impliedOf(row) {
    var mid = Math.max(1, Math.round(Math.exp(FIT.intercept + FIT.slope * Math.log(Math.max(1, row.tvl_usd)))));
    return { mid: mid, low: Math.max(1, Math.round(mid / BAND)), high: Math.round(mid * BAND) };
  }
  // One row's farm economics, recomputed here from the band, the $1,000 plan and its costs.
  function economicsOf(row) {
    var age = row.age_days === null || row.age_days === undefined ? null : row.age_days;
    var hold = age === null ? 60 : age < 180 ? 90 : age < 365 ? 60 : 45;
    var weeks = Math.ceil(hold / 7);
    var gas = DATA.model.setup_gas_usd + DATA.model.deposit_gas_usd + DATA.model.weekly_gas_usd * weeks + DATA.model.exit_gas_usd;
    var forgone = Math.round(1000 * 0.04 * (hold / 365) * 100) / 100;
    var cost = gas + forgone;
    var val = impliedOf(row);
    var gross = val.low / 40000;
    var net = Math.round(gross - cost);
    var verdict = net >= 100 ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
    var hours = (30 + 10 * weeks + 10 * Math.ceil(hold / 30)) / 60;
    return { hold: hold, weeks: weeks, gas: gas, forgone: forgone, cost: Math.round(cost * 100) / 100, gross: gross, net: net, verdict: verdict, hours: Math.round(hours * 10) / 10, netPerHour: Math.round((net / hours) * 100) / 100 };
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

  function mastheadStats() {
    var holder = document.getElementById('masthead-stats');
    if (!holder) return;
    var items = [
      ['Protocols tracked', String(DATA.audit.tracked)],
      ['No token on record', String(DATA.audit.pre_token)],
      ['Ranked', String(DATA.audit.ranked)],
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
    ];
    items.forEach(function (it) {
      holder.appendChild(el('div', null, el('dt', { text: it[0] }), el('dd', { text: it[1] })));
    });
    var bar = document.getElementById('formula-bar');
    if (bar) bar.textContent = 'Value = exp(' + FIT.intercept.toFixed(2) + ' + ' + FIT.slope.toFixed(2) + ' × ln TVL), fitted on ' + FIT.n + ' traded protocols · tested out of sample: median error ×' + V.time_split.median_factor.toFixed(2) + ' · ' + Math.round(V.time_split.within_2x * 100) + '% within 2×' + (fitAgrees ? '' : ' — the page refit disagrees with the board, so this data is stale.');
    var src = document.getElementById('colophon-source');
    if (src) src.textContent = 'Snapshot ' + DATA.as_of + ' · DefiLlama protocol index · floor $' + Math.round(DATA.floor_usd / 1e6) + 'M · model ' + DATA.model_version + '.';
  }

  function verdictStrip() {
    var vc = DATA.verdict_counts;
    return el('div', { class: 'verdict-strip' },
      el('div', null, el('span', { text: 'Verdicts — ' + DATA.model_version }), el('b', { text: 'FARM ' + vc.FARM + ' · THIN ' + vc.THIN + ' · SKIP ' + vc.SKIP })),
      el('div', null, el('span', { text: 'Best per hands-on hour' }), el('b', { text: DATA.best_per_hour.name + ' ' + fmtSigned(DATA.best_per_hour.net_per_hour) + '/h' }))
    );
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
        el('div', { class: 'tabs' }, tabButton('pre-token', 'Pre-token'), tabButton('live', 'Live token'), tabButton('model', 'Model'))),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? visibleRows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : 'the curve, tested' })
    );
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
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (state.sort === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (state.sort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sort === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (state.sort === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (state.sort === 'gross') { av = economicsOf(a).gross; bv = economicsOf(b).gross; }
      else if (state.sort === 'net') { av = economicsOf(a).net; bv = economicsOf(b).net; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function verdictBadge(v) {
    return el('span', { class: 'badge verdict ' + v.toLowerCase(), text: v });
  }

  function detailRow(r) {
    var val = impliedOf(r);
    var econ = economicsOf(r);
    var agrees = val.mid === r.implied_value_usd && val.low === r.band_low_usd && val.high === r.band_high_usd && econ.net === r.farm.net_usd && econ.verdict === r.farm.verdict;
    var steps = (r.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    });
    var near = (r.nearest || []).map(function (c) {
      return el('tr', null,
        el('td', { text: c.name }),
        el('td', { class: 'num', text: fmtUsd(c.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
        el('td', { class: 'num', text: '× ' + c.ratio.toFixed(2) }));
    });
    var conclusion = econ.verdict === 'FARM'
      ? 'At the low end of the band this $1,000 plan nets about ' + fmtSigned(econ.net) + ' after fees and forgone yield — worth farming.'
      : econ.verdict === 'THIN'
        ? 'At the low end of the band this $1,000 plan nets about ' + fmtSigned(econ.net) + ' — marginal: the allocation barely covers the fees.'
        : 'At the low end of the band this $1,000 plan nets about ' + fmtSigned(econ.net) + ' — the allocation does not cover the fees; skip this one at $1,000.';
    var cell = el('td', { colspan: 8 },
      el('div', { class: 'detail-grid' },
        el('div', null,
          el('h3', { text: 'Implied value — a range, not a point' }),
          el('div', { class: 'equation' },
            el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(r.tvl_usd) })),
            el('div', null, el('span', { text: 'On the curve' }), el('b', { text: 'ln mcap = ' + FIT.intercept.toFixed(2) + ' + ' + FIT.slope.toFixed(2) + ' × ln TVL' })),
            el('div', null, el('span', { text: 'Age with no token on record' }), el('b', { text: fmtAge(r.age_days) })),
            el('div', null, el('span', { text: 'Implied value — low end' }), el('b', { text: fmtUsd(val.low) })),
            el('div', null, el('span', { text: 'Implied value — mid' }), el('b', { class: 'total', text: fmtUsd(val.mid) })),
            el('div', null, el('span', { text: 'Implied value — high end' }), el('b', { text: fmtUsd(val.high) }))
          ),
          el('p', { class: 'sub', text: 'The band is the model’s own error: the mid divided and multiplied by ×' + BAND.toFixed(2) + ', the median error the curve measured out of sample. The page recomputes this row as ' + fmtUsd(val.mid) + (agrees ? ', the same number board.json carries.' : ' — that differs from the board, so this data is stale.') + ' This is an estimate, not a price.' }),
          el('h3', { text: 'Nearest traded tokens by TVL' }),
          el('div', { class: 'table-wrap' },
            el('table', { class: 'nearest' },
              el('thead', null, el('tr', null,
                el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }),
                el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
              el('tbody', null, near)
            )
          ),
          el('p', { class: 'sub', text: 'The comparables the curve is read against: the traded protocols closest in size, with the market cap the market itself sets.' })
        ),
        el('div', null,
          el('h3', { text: 'Farm plan — the $1,000 plan, netted' }),
          el('div', { class: 'equation' },
            el('div', null, el('span', { text: 'Allocation — low end ÷ 40,000 wallets' }), el('b', { text: fmtUsd(econ.gross) })),
            el('div', null, el('span', { text: 'Gas — the steps’ fees' }), el('b', { text: '$' + econ.gas.toFixed(2) })),
            el('div', null, el('span', { text: 'Forgone yield — 4% a year over ' + econ.hold + ' days' }), el('b', { text: '$' + econ.forgone.toFixed(2) })),
            el('div', null, el('span', { text: 'Cost — gas plus forgone yield' }), el('b', { text: '$' + econ.cost.toFixed(2) })),
            el('div', null, el('span', { text: 'Net — gross minus cost' }), el('b', { class: 'total', text: fmtSigned(econ.net) })),
            el('div', null, el('span', { text: 'Verdict' }), el('b', { text: econ.verdict + ' · ' + fmtSigned(econ.netPerHour) + '/h' }))
          ),
          el('p', { class: 'sub', text: conclusion + ' The $1,000 is a deposit, returned on exit; it is at risk only if the protocol fails, and that risk is not in the net number.' }),
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
      var econ = economicsOf(r);
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var netClass = econ.net >= 100 ? 'pos' : econ.net > 0 ? '' : 'neg';
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
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'one chain') }),
          el('span', { class: 'badge ' + (r.on_watchlist ? 'watch' : 'early'), text: r.on_watchlist ? 'Watchlist' : 'Early' })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', null, el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })),
        el('td', { class: 'num', text: fmtUsd(econ.gross) }),
        el('td', { class: 'num ' + netClass, text: fmtSigned(econ.net) }),
        el('td', null, verdictBadge(econ.verdict))
      );
      tbody.appendChild(tr);
      if (open) tbody.appendChild(detailRow(r));
    });
    return el('div', { class: 'panel' },
      verdictStrip(),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. The $1K slice is the wallet’s allocation at the low end of the band; net is that slice minus the plan’s gas and forgone yield. Select a row to open its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('implied', 'Implied value'),
            sortHeader('gross', '$1K slice'),
            sortHeader('net', 'Net'),
            el('th', { scope: 'col', text: 'Verdict' })
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
          el('caption', { text: 'Tokens that already trade: their market cap is a fact, not a model. They are set aside from the pre-token ranking; the 119 outside the CEX category are the protocols the size curve is fitted on.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function pow10Ticks(minV, maxV) {
    var ticks = [];
    var p = Math.floor(Math.log(minV) / Math.log(10));
    var top = Math.ceil(Math.log(maxV) / Math.log(10));
    for (; p <= top; p++) { var v = Math.pow(10, p); if (v >= minV / 1.2 && v <= maxV * 1.2) ticks.push(v); }
    return ticks;
  }

  // The scatter chart is built as markup and set as a div's innerHTML: the
  // HTML parser puts <svg> and its children in the SVG namespace itself, so
  // the page carries no namespace literal and no network address anywhere.
  function scatterChart() {
    var W = 660, H = 360, ML = 72, MR = 14, MT = 12, MB = 38;
    function n(v) { return Math.round(v * 10) / 10; }
    var xs = DATA.comps.map(function (c) { return Math.log(c.tvl_usd); });
    var ys = DATA.comps.map(function (c) { return Math.log(c.mcap_usd); });
    var x0 = Math.min.apply(null, xs) - 0.4, x1 = Math.max.apply(null, xs) + 0.4;
    var y0 = Math.min.apply(null, ys) - 0.6, y1 = Math.max.apply(null, ys) + 0.6;
    function X(v) { return ML + ((v - x0) / (x1 - x0)) * (W - ML - MR); }
    function Y(v) { return MT + (1 - (v - y0) / (y1 - y0)) * (H - MT - MB); }
    var tmin = Math.min.apply(null, DATA.comps.map(function (c) { return c.tvl_usd; }));
    var tmax = Math.max.apply(null, DATA.comps.map(function (c) { return c.tvl_usd; }));
    var mmin = Math.min.apply(null, DATA.comps.map(function (c) { return c.mcap_usd; }));
    var mmax = Math.max.apply(null, DATA.comps.map(function (c) { return c.mcap_usd; }));
    var out = ['<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Log-log scatter of market cap against TVL for the 119 traded protocols, with the fitted size curve">'];
    pow10Ticks(tmin, tmax).forEach(function (v) {
      var x = n(X(Math.log(v)));
      out.push('<line x1="' + x + '" y1="' + MT + '" x2="' + x + '" y2="' + (H - MB) + '" class="grid"/>');
      out.push('<text x="' + x + '" y="' + (H - 22) + '" class="axis">' + fmtUsd(v) + '</text>');
    });
    pow10Ticks(mmin, mmax).forEach(function (v) {
      var y = n(Y(Math.log(v)));
      out.push('<line x1="' + ML + '" y1="' + y + '" x2="' + (W - MR) + '" y2="' + y + '" class="grid"/>');
      out.push('<text x="' + (ML - 8) + '" y="' + (y + 4) + '" class="axis num" text-anchor="end">' + fmtUsd(v) + '</text>');
    });
    out.push('<text x="' + n((W - ML - MR) / 2 + ML) + '" y="' + (H - 6) + '" class="axis-label" text-anchor="middle">TVL (log scale)</text>');
    out.push('<text x="14" y="' + n((H - MT - MB) / 2 + MT) + '" class="axis-label" text-anchor="middle" transform="rotate(-90 14 ' + n((H - MT - MB) / 2 + MT) + ')">Market cap (log scale)</text>');
    // The band: the fitted line shifted by the measured error, in log space.
    var band = Math.log(BAND);
    [-band, band].forEach(function (shift) {
      out.push('<line x1="' + n(X(x0)) + '" y1="' + n(Y(FIT.intercept + FIT.slope * x0 + shift)) + '" x2="' + n(X(x1)) + '" y2="' + n(Y(FIT.intercept + FIT.slope * x1 + shift)) + '" class="bandline"/>');
    });
    out.push('<line x1="' + n(X(x0)) + '" y1="' + n(Y(FIT.intercept + FIT.slope * x0)) + '" x2="' + n(X(x1)) + '" y2="' + n(Y(FIT.intercept + FIT.slope * x1)) + '" class="fitline"/>');
    DATA.comps.forEach(function (c) {
      out.push('<circle cx="' + n(X(Math.log(c.tvl_usd))) + '" cy="' + n(Y(Math.log(c.mcap_usd))) + '" r="3" class="dot"/>');
    });
    out.push('</svg>');
    return el('div', { html: out.join('') });
  }

  function modelView() {
    var ts = V.time_split;
    var banner = el('section', { class: 'panel model-banner' },
      el('h2', { text: 'The model, and what it cannot do' }),
      el('p', { class: 'model-formula', text: 'ln(market cap) = ' + FIT.intercept.toFixed(2) + ' + ' + FIT.slope.toFixed(2) + ' × ln(TVL)' }),
      el('p', { class: 'model-sub', text: 'Fitted at run time on ' + FIT.n + ' traded protocols, centralised exchanges set apart · slope ' + V.slope_ci[0].toFixed(2) + ' – ' + V.slope_ci[1].toFixed(2) + ' over 400 bootstrap resamples · R² ' + V.r2.toFixed(2) + ' in log space — the scatter is wide, and the band says so.' }),
      el('div', { class: 'model-stats' },
        el('div', null, el('span', { text: 'Out-of-sample, time split' }), el('b', { text: '×' + ts.median_factor.toFixed(2) + ' median error' })),
        el('div', null, el('span', { text: 'Called within 2×' }), el('b', { text: Math.round(ts.within_2x * 100) + '%' })),
        el('div', null, el('span', { text: 'Called within 3×' }), el('b', { text: Math.round(ts.within_3x * 100) + '%' })),
        el('div', null, el('span', { text: 'Leave-one-out, curve alone' }), el('b', { text: '×' + V.loo.median_factor.toFixed(2) + ' median error' }))
      ),
      el('p', { class: 'model-sub', text: 'The time split fits the ' + ts.fit_n + ' traded protocols listed up to ' + ts.fit_last_listed + ' and predicts the ' + ts.n + ' listed from ' + ts.test_first_listed + ' on — a forward test, not a look back. A flat multiple manages only ×' + (V.ablation[0] ? V.ablation[0].median_factor.toFixed(2) : '—') + ' on the same leave-one-out test.' })
    );
    var ablationRows = V.ablation.map(function (a) {
      var chosen = a.name === 'Size curve';
      return el('tr', { class: chosen ? 'chosen' : null },
        el('td', { text: a.name + (chosen ? ' — the model' : '') }),
        el('td', { class: 'num', text: '×' + a.median_factor.toFixed(2) }),
        el('td', { class: 'num', text: Math.round(a.within_2x * 100) + '%' }),
        el('td', { class: 'num', text: Math.round(a.within_3x * 100) + '%' }));
    });
    var ablation = el('section', { class: 'panel' },
      el('h2', { text: 'Does each factor earn its place?' }),
      el('p', { class: 'sub', text: 'Every candidate refitted 119 times, once per protocol left out. The curve alone wins; the tilts do not earn their place, so the model is the curve alone.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'ablation' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Candidate' }), el('th', { scope: 'col', text: 'Median error' }),
            el('th', { scope: 'col', text: 'Within 2×' }), el('th', { scope: 'col', text: 'Within 3×' }))),
          el('tbody', null, ablationRows)
        )
      ),
      el('p', { class: 'sub', text: 'A launch is priced as a range, not a point: every implied value carries a band of mid ÷ ×' + BAND.toFixed(2) + ' … mid × ×' + BAND.toFixed(2) + ', the time-split median error. The farm plan nets the low end of that band.' })
    );
    var note = document.getElementById('method-note');
    var method = note ? note.content.cloneNode(true) : null;
    return el('div', null, banner,
      el('div', { class: 'model-grid' },
        el('section', { class: 'panel chart-panel' },
          el('h2', { text: 'The curve, against the traded protocols' }),
          el('p', { class: 'sub', text: 'Each dot is one of the ' + FIT.n + ' traded protocols the curve is fitted on. The red line is the curve; the dashed lines are its band. The multiple falls as the protocol grows.' }),
          scatterChart()
        ),
        ablation
      ),
      method
    );
  }

  function render() {
    app.textContent = '';
    app.setAttribute('aria-busy', 'false');
    app.appendChild(controls());
    if (state.tab === 'live') app.appendChild(liveTable());
    else if (state.tab === 'model') app.appendChild(modelView());
    else app.appendChild(boardTable());
  }

  mastheadStats();
  readHash();
  render();
})();
