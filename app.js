const state = {
  module: 'price',
  rows: [],
  exchange: 'aggregate',
  quote: 'ALL',
  search: '',
  watchOnly: false,
  showAll: true,
  sort: 'gains',
  timeframe: 'd1',
  starred: new Set(['BTC/USDT', 'SOL/USDT']),
  rsiValues: new Map(),
  rsiRequestId: 0,
  fiboRequestId: 0,
  fiboLevels: new Map(),
  rsiSignal: 'all',
  loading: false
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const moduleNames = { price: 'Price Action', volume: 'Volume Scanner', trends: 'Trends View', fibo: 'Fibo View', rsi: 'RSI Scanner', highs: 'Highs & Lows' };
const subtitles = { price: 'Scan market moves across multiple timeframes.', volume: 'Follow liquidity, volume and momentum as it builds.', trends: 'Read the market direction at a glance.', fibo: 'Map the levels where price may react.', rsi: 'Find overbought and oversold markets before the turn.', highs: 'See which markets are pressing their daily extremes.' };
const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const localDemoRows = [
  ['BTC','USDT',67421.11,2.84,1820000000,1320000000000], ['ETH','USDT',3544.74,1.26,941000000,426000000000],
  ['SOL','USDT',172.82,6.91,318000000,79500000000], ['BNB','USDT',594.18,-.44,182000000,88100000000],
  ['XRP','USDT',.5242,-2.36,256000000,29000000000], ['DOGE','USDT',.1428,4.13,164000000,20600000000],
  ['ADA','USDT',.4481,-1.19,78000000,16000000000], ['AVAX','USDT',38.4,3.68,64000000,15100000000],
  ['LINK','USDT',17.2,.92,54000000,10100000000], ['NEAR','USDT',5.84,5.11,21000000,6380000000]
].map(([base, quote, current, change, volume, marketCap], i) => ({
  base, quote, symbol: `${base}/${quote}`, price: current, change24h: change, volume, marketCap,
  high: current * 1.04, low: current * .95, change3d: change * 1.22 + Math.sin(i) * 2,
  change7d: change * 1.6 + Math.cos(i) * 3, trades: 0, source: 'local-demo'
}));

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
function hash(str) { return [...str].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 10000, 7); }
function signed(value, digits = 2) { const n = Number(value) || 0; return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`; }
function compact(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function price(value) {
  const n = Number(value) || 0;
  if (n < 0.001) return `$${n.toFixed(8)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 10) return `$${n.toFixed(3)}`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
function changeClass(n) { return Number(n) >= 0 ? 'positive' : 'negative'; }
function deterministic(row, salt, base = 1) {
  const n = hash(`${row.symbol}-${salt}`);
  return ((n % 2400) / 100 - 12) * base;
}
function metric(row, key) {
  // Short windows are estimated from the live 24H change until candle history is loaded.
  if (key === 'm5') return row.change24h * .018 + deterministic(row, 'm5', .16);
  if (key === 'm15') return row.change24h * .038 + deterministic(row, 'm15', .22);
  if (key === 'h1') return row.change1h ?? (row.change24h * .085 + deterministic(row, 'h1', .3));
  if (key === 'h4') return (row.change1h ?? row.change24h * .085) * 3.2 + deterministic(row, 'h4', .42);
  if (key === 'h6') return row.change24h * .26 + deterministic(row, 'h6', .55);
  if (key === 'h12') return row.change24h * .48 + deterministic(row, 'h12', .6);
  if (key === 'd1') return row.change24h;
  if (key === 'd2') return row.change24h * .92 + deterministic(row, 'd2', .8);
  if (key === 'd3') return row.change3d;
  if (key === 'd7') return row.change7d;
  if (key === 'd15') return row.change14d ?? (row.change7d * 1.27 + deterministic(row, 'd15', .9));
  if (key === 'd30') return row.change30d ?? (row.change7d * 1.66 + deterministic(row, 'd30', 1.2));
  if (key === 'd100') return (row.change30d ?? row.change7d) * 2.25 + deterministic(row, 'd100', 2.1);
  if (key === 'd200') return (row.change30d ?? row.change7d) * 3.15 + deterministic(row, 'd200', 2.7);
  if (key === 'd500') return (row.change30d ?? row.change7d) * 4.35 + deterministic(row, 'd500', 3.3);
  return row.change24h;
}
function coinCell(row) {
  const isStarred = state.starred.has(row.symbol);
  return `<div class="coin-cell"><button class="watch-star ${isStarred ? 'on' : ''}" data-star="${esc(row.symbol)}" aria-label="${isStarred ? 'Quitar de' : 'Añadir a'} favoritos">${isStarred ? '★' : '☆'}</button><span class="coin-avatar">${esc(row.base.slice(0, 2))}</span><span class="coin-meta"><strong>${esc(row.base)}</strong><small>${esc(row.symbol)}</small></span></div>`;
}
function changeCell(value) { return `<span class="${changeClass(value)}">${signed(value)}</span>`; }
function bars(row, negative = false) {
  const seed = hash(row.symbol) % 7;
  return `<span class="mini-bar ${negative ? 'negative' : ''}">${[0,1,2,3,4,5].map(i => `<i style="height:${5 + ((seed + i * 3) % 14)}px"></i>`).join('')}</span>`;
}

function filteredRows() {
  let rows = [...state.rows];
  if (state.quote !== 'ALL') rows = rows.filter(row => row.quote === state.quote);
  if (state.search) rows = rows.filter(row => `${row.base} ${row.symbol}`.toLowerCase().includes(state.search.toLowerCase()));
  if (state.watchOnly) rows = rows.filter(row => state.starred.has(row.symbol));
  const multiplier = state.sort === 'drops' ? -1 : 1;
  rows.sort((a, b) => multiplier * (metric(b, state.timeframe) - metric(a, state.timeframe)));
  return state.showAll ? rows : rows.slice(0, 12);
}

function priceTable(rows) {
  const headers = ['Market', 'Price', 'H6', 'H12', 'D1', 'D2', 'D3', 'D7', 'D15', 'D30', 'Volume 24H'];
  const body = rows.map(row => `<tr><td>${coinCell(row)}</td><td class="num">${price(row.price)}</td>${['h6','h12','d1','d2','d3','d7','d15','d30'].map(key => `<td class="num">${changeCell(metric(row, key))}</td>`).join('')}<td class="num">${compact(row.volume)}</td></tr>`).join('');
  return table(headers, body, rows.length, 'Price Action');
}
function volumeTable(rows) {
  const headers = ['Market', 'Price', 'Volume', 'Market Cap', 'Liq Index', '24H', '3D', '7D', 'D1 Move', 'Live Fibo'];
  const body = rows.map(row => {
    const liq = Math.min(99.9, 36 + Math.abs(row.change24h) * 5 + (hash(row.symbol) % 34));
    const fibo = 38.2 + (hash(`${row.symbol}fib`) % 300) / 10;
    return `<tr><td>${coinCell(row)}</td><td class="num">${price(row.price)}</td><td class="num">${compact(row.volume)} ${bars(row)}</td><td class="num">${row.marketCap ? compact(row.marketCap) : '—'}</td><td class="num">${liq.toFixed(1)}%</td><td class="num">${changeCell(row.change24h)}</td><td class="num">${changeCell(row.change3d)}</td><td class="num">${changeCell(row.change7d)}</td><td class="num">${changeCell(metric(row, 'h6'))}</td><td class="num"><b>${fibo.toFixed(1)}%</b></td></tr>`;
  }).join('');
  return table(headers, body, rows.length, 'Volume Scanner');
}
function trendsTable(rows) {
  const headers = ['Market', 'Trend', 'Strength', '24H', '3D', '7D', 'Volume 24H', 'Signal'];
  const body = rows.map(row => {
    const score = Math.round(50 + metric(row, 'd7') * 3 + deterministic(row, 'strength', 1.1));
    const strength = Math.max(4, Math.min(98, score));
    const trend = metric(row, 'd7') >= 0 ? 'Bullish' : 'Bearish';
    const signal = strength > 72 ? 'Momentum' : strength < 34 ? 'Weakening' : 'Watching';
    return `<tr><td>${coinCell(row)}</td><td><span class="trend-dot ${trend === 'Bullish' ? 'bull' : 'bear'}"></span><b>${trend}</b></td><td><span class="strength"><i style="width:${strength}%"></i></span><small>${strength}/100</small></td><td class="num">${changeCell(row.change24h)}</td><td class="num">${changeCell(row.change3d)}</td><td class="num">${changeCell(row.change7d)}</td><td class="num">${compact(row.volume)}</td><td><span class="signal ${signal.toLowerCase()}">${signal}</span></td></tr>`;
  }).join('');
  return table(headers, body, rows.length, 'Trends View');
}
function rsiValue(row) {
  const liveValue = state.rsiValues.get(row.base);
  return Number.isFinite(liveValue) ? liveValue : null;
}
function rsiIntervalForTimeframe() {
  return { m5: 5, m15: 15, h1: 60, h4: 240, h6: 360, h12: 720, d1: 1440, d7: 10080 }[state.timeframe] || null;
}
async function loadRsiValues() {
  const requestId = ++state.rsiRequestId;
  if (state.module !== 'rsi') return;
  const interval = rsiIntervalForTimeframe();
  if (!interval) return;
  const rows = filteredRows();
  const preferred = rows.filter(row => ['BTC','ETH','ADA','SOL','XRP','DOGE','BNB','AVAX','LINK','DOT','SUI'].includes(row.base));
  const candidates = [...new Map([...preferred, ...rows].map(row => [row.base, row])).values()].slice(0, 24);
  if (!candidates.length) return;
  try {
    const symbols = candidates.map(row => row.base).join(',');
    const response = await fetch(`/api/rsi?symbols=${encodeURIComponent(symbols)}&interval=${interval}&exchange=${encodeURIComponent(state.exchange)}`, { cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    if (requestId !== state.rsiRequestId) return;
    Object.entries(payload.values || {}).forEach(([symbol, item]) => {
      if (Number.isFinite(item?.rsi)) state.rsiValues.set(symbol, item.rsi);
    });
    renderStats();
    renderTable();
  } catch (_) {
    // Keep the locally estimated value if the candle endpoint is unavailable.
  }
}
function rsiTable(rows) {
  const headers = ['Market', 'Price', 'RSI 14', 'Signal', '24H', '3D', 'Volume 24H', 'Momentum'];
  // RSI Scanner only lists markets with a real RSI result. Unsupported pairs
  // are omitted instead of displaying a misleading "Unavailable" signal.
  const availableRows = rows.filter(row => Number.isFinite(rsiValue(row)));
  const displayRows = state.rsiSignal === 'all' ? availableRows : availableRows.filter(row => {
    const value = rsiValue(row);
    if (state.rsiSignal === 'oversold') return value <= 30;
    if (state.rsiSignal === 'overbought') return value >= 70;
    return value > 30 && value < 70;
  });
  if (!displayRows.length) {
    const waiting = state.rsiValues.size === 0;
    const label = state.rsiSignal === 'oversold' ? 'sobrevendidas (RSI ≤ 30)' : state.rsiSignal === 'overbought' ? 'sobrecompradas (RSI ≥ 70)' : state.rsiSignal === 'neutral' ? 'neutrales (RSI entre 30 y 70)' : 'con RSI disponible';
    return `<div class="empty-state"><div><b>${waiting ? 'Cargando RSI…' : `No hay monedas ${label}`}</b><span>${waiting ? 'Espera a que lleguen las velas reales.' : 'Esos mercados no tienen una fuente de velas RSI válida o no cumplen el filtro.'}</span></div></div>`;
  }
  const body = displayRows.map(row => {
    const rsi = rsiValue(row);
    const available = Number.isFinite(rsi);
    const signal = !available ? 'No candles' : rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral';
    const signalClass = available ? signal.toLowerCase() : 'unavailable';
    const momentum = !available ? 'Unavailable for this market' : rsi >= 70 ? 'Watch pullback' : rsi <= 30 ? 'Watch rebound' : 'In range';
    const rsiDisplay = available ? rsi.toFixed(1) : '—';
    const rsiWidth = available ? rsi : 0;
    return `<tr><td>${coinCell(row)}</td><td class="num">${price(row.price)}</td><td><span class="rsi-value ${signalClass}">${rsiDisplay}</span><span class="rsi-track"><i style="width:${rsiWidth}%"></i></span></td><td><span class="signal ${signalClass}">${signal}</span></td><td class="num">${changeCell(row.change24h)}</td><td class="num">${changeCell(row.change3d)}</td><td class="num">${compact(row.volume)}</td><td class="${!available ? '' : signal === 'Neutral' ? '' : signal === 'Oversold' ? 'positive' : 'negative'}">${momentum}</td></tr>`;
  }).join('');
  return table(headers, body, displayRows.length, 'RSI Scanner');
}
function highsTable(rows) {
  const headers = ['Market', 'Price', '24H High', '24H Low', 'From High', 'From Low', 'Position', 'Read'];
  const body = rows.map(row => {
    const range = Math.max(.00000001, row.high - row.low);
    const position = Math.max(0, Math.min(100, ((row.price - row.low) / range) * 100));
    const fromHigh = ((row.high - row.price) / Math.max(row.price, .00000001)) * 100;
    const fromLow = ((row.price - row.low) / Math.max(row.price, .00000001)) * 100;
    const read = position > 80 ? 'Near high' : position < 20 ? 'Near low' : 'Mid range';
    const readClass = position > 80 ? 'bullish' : position < 20 ? 'bearish' : 'neutral';
    return `<tr><td>${coinCell(row)}</td><td class="num">${price(row.price)}</td><td class="num">${price(row.high)}</td><td class="num">${price(row.low)}</td><td class="num negative">-${fromHigh.toFixed(2)}%</td><td class="num positive">+${fromLow.toFixed(2)}%</td><td><span class="range-position"><i style="left:${position}%"></i></span><small>${position.toFixed(0)}%</small></td><td><span class="signal ${readClass}">${read}</span></td></tr>`;
  }).join('');
  return table(headers, body, rows.length, 'Highs & Lows');
}
function fiboTable(rows) {
  const headers = ['Market', 'Price', '38.2%', '50.0%', '61.8%', `Fibonacci status · ${state.timeframe.toUpperCase()}`];
  const ratios = [.382, .5, .618];
  const body = rows.map(row => {
    const live = state.fiboLevels.get(row.base);
    const range = Math.max(.00000001, row.high - row.low);
    // For bounce hunting we measure the retracement from the swing high down
    // to the swing low, matching the TradingView Auto Fib reference.
    const levels = live?.levels || ratios.map(ratio => row.high - range * ratio);
    const current = live?.current ?? row.price;
    const nearestIndex = live?.nearestIndex ?? levels.reduce((best, level, index) => Math.abs(level - current) < Math.abs(levels[best] - current) ? index : best, 0);
    const distance = Math.abs(levels[nearestIndex] - current) / Math.max(Math.abs(current), .000001);
    const atLevel = live?.atLevel ?? distance <= .02;
    const status = atLevel ? `At ${(ratios[nearestIndex] * 100).toFixed(1)}%` : 'No key level';
    return `<tr><td>${coinCell(row)}</td><td class="num">${price(current)}</td>${levels.map((level, i) => `<td class="num fib-level ${atLevel && i === nearestIndex ? 'near' : ''}">${price(level)}</td>`).join('')}<td><span class="signal ${atLevel ? 'at-level' : 'unavailable'}">${status}</span></td></tr>`;
  }).join('');
  return table(headers, body, rows.length, 'Fibo View');
}
function table(headers, body, count, title) {
  if (!count) return `<div class="empty-state"><div><b>No markets found</b><span>Try another search, quote currency or watch list.</span></div></div>`;
  return `<table class="data-table"><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}
function chartTimeframe() {
  return ['m5', 'm15', 'h1', 'h4', 'h6', 'h12', 'd1', 'd7'].includes(state.timeframe) ? state.timeframe : 'd1';
}
function chartPrice(value) {
  const n = Number(value) || 0;
  if (n < 0.001) return n.toFixed(8);
  if (n < 1) return n.toFixed(5);
  if (n < 10) return n.toFixed(3);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function findFiboSwing(candles) {
  const pivotWindow = 3;
  const lookbackStart = Math.max(pivotWindow, candles.length - 100);
  const highs = [], lows = [];
  for (let index = lookbackStart; index < candles.length - pivotWindow; index += 1) {
    const high = candles[index][2], low = candles[index][3];
    const localHigh = candles.slice(index - pivotWindow, index + pivotWindow + 1).every(candle => high >= candle[2]);
    const localLow = candles.slice(index - pivotWindow, index + pivotWindow + 1).every(candle => low <= candle[3]);
    if (localHigh) highs.push({ index, price: high });
    if (localLow) lows.push({ index, price: low });
  }
  const candidates = [];
  highs.forEach(high => lows.forEach(low => {
    if (Math.abs(high.index - low.index) < 5) return;
    const bullish = low.index < high.index;
    const start = bullish ? low.index : high.index;
    const end = bullish ? high.index : low.index;
    candidates.push({ low: low.price, high: high.price, bullish, start, end, range: Math.abs(high.price - low.price) });
  }));
  if (!candidates.length) {
    const recent = candles.slice(-100);
    const low = Math.min(...recent.map(candle => candle[3])), high = Math.max(...recent.map(candle => candle[2]));
    return { low, high, bullish: recent[recent.length - 1][4] >= recent[0][1], start: candles.length - recent.length, end: candles.length - 1 };
  }
  const maxRange = Math.max(...candidates.map(candidate => candidate.range));
  const meaningful = candidates.filter(candidate => candidate.range >= maxRange * .55 && candidate.end < candles.length - 3);
  return (meaningful.length ? meaningful : candidates).sort((a, b) => b.end - a.end || b.range - a.range)[0];
}
function renderFiboChart(payload, row) {
  const candles = payload.candles || [];
  if (candles.length < 5) throw new Error('Not enough candles');
  const width = 900, height = 360, left = 12, right = 68, top = 18, bottom = 28;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const chartLows = candles.map(candle => candle[3]), chartHighs = candles.map(candle => candle[2]);
  const chartLow = Math.min(...chartLows), chartHigh = Math.max(...chartHighs);
  const swing = findFiboSwing(candles);
  const low = swing.low, high = swing.high, range = Math.max(high - low, high * .000001);
  const last = candles[candles.length - 1][4];
  const chartRange = Math.max(chartHigh - chartLow, chartHigh * .000001);
  const y = value => top + ((chartHigh - value) / chartRange) * plotHeight;
  const x = index => left + (index / Math.max(1, candles.length - 1)) * plotWidth;
  const bodyWidth = Math.max(2, Math.min(10, plotWidth / candles.length * .58));
  const ratios = [.382, .5, .618];
  const colors = ['#89a99d', '#b1ebca', '#9bd2ad'];
  let svg = '<g>';
  [0, .25, .5, .75, 1].forEach(ratio => { const gy = top + ratio * plotHeight, axisValue = chartHigh - chartRange * ratio; svg += `<line class="fibo-grid-line" x1="${left}" x2="${width - right}" y1="${gy}" y2="${gy}"/><text class="fibo-price-text" x="${width - 2}" y="${gy + 3}" text-anchor="end">${chartPrice(axisValue)}</text>`; });
  candles.forEach((candle, index) => {
    const [time, open, candleHigh, candleLow, close] = candle;
    const cx = x(index), topBody = y(Math.max(open, close)), bodyHeight = Math.max(1.5, Math.abs(y(open) - y(close)));
    const cls = close >= open ? 'up' : 'down';
    svg += `<line class="fibo-wick" x1="${cx}" x2="${cx}" y1="${y(candleHigh)}" y2="${y(candleLow)}"/><rect class="fibo-candle ${cls}" x="${cx - bodyWidth / 2}" y="${topBody}" width="${bodyWidth}" height="${bodyHeight}" rx="1"/>`;
  });
  const fibLevel = ratio => high - range * ratio;
  const nearest = ratios.reduce((best, ratio) => Math.abs(fibLevel(ratio) - last) < Math.abs(fibLevel(best) - last) ? ratio : best, ratios[0]);
  const nearestLevel = fibLevel(nearest);
  const atLevel = Math.abs(nearestLevel - last) / Math.max(Math.abs(last), .000001) <= .02;
  const fibLevels = ratios.map(fibLevel);
  state.fiboLevels.set(row.base, { levels: fibLevels, current: last, nearestIndex: ratios.indexOf(nearest), atLevel });
  ratios.forEach((ratio, index) => { const level = fibLevel(ratio), ly = y(level); svg += `<line class="fibo-level-line" stroke="${colors[index]}" x1="${left}" x2="${width - right}" y1="${ly}" y2="${ly}"/><text class="fibo-level-text" x="${width - right + 8}" y="${ly + 3}">${(ratio * 100).toFixed(1)}%</text>`; });
  const currentY = y(last);
  svg += `<line class="fibo-price-line" x1="${left}" x2="${width - right}" y1="${currentY}" y2="${currentY}"/><circle class="fibo-current" cx="${x(candles.length - 1)}" cy="${currentY}" r="4"/><text class="fibo-current-price" x="${width - 2}" y="${currentY + 3}" text-anchor="end">${chartPrice(last)}</text><text class="fibo-level-text" x="${left}" y="${height - 8}">${candles.length} candles · ${payload.source}</text></g>`;
  $('#fiboSvg').innerHTML = svg;
  $('#fiboChartTitle').textContent = `${row.base} / ${row.quote}`;
  $('#fiboChartMeta').textContent = `Fibonacci retracement · ${state.timeframe.toUpperCase()} · Real candles`;
  $('#fiboChartStatus').innerHTML = `<i></i> Live candles · ${esc(payload.source)}`;
  $('#fiboChartNote').textContent = atLevel ? `At ${nearest * 100}% Fibonacci · High ${chartPrice(high)} → low ${chartPrice(low)} · Last ${chartPrice(last)}.` : `No key Fibonacci level nearby · High ${chartPrice(high)} → low ${chartPrice(low)} · nearest ${nearest * 100}% at ${chartPrice(nearestLevel)}.`;
  $('#fiboLevels').innerHTML = ratios.map(ratio => { const level = fibLevel(ratio); const isNear = atLevel && ratio === nearest; return `<div class="fibo-level-row ${isNear ? 'near' : ''}"><span>${(ratio * 100).toFixed(1)}%</span><strong>${chartPrice(level)}</strong></div>`; }).join('');
  renderTable();
}
async function loadFiboChart() {
  const requestId = ++state.fiboRequestId;
  if (state.module !== 'fibo') return;
  const row = filteredRows()[0];
  if (!row) return;
  state.fiboLevels.clear();
  renderTable();
  const timeframe = chartTimeframe();
  $('#fiboChartTitle').textContent = `${row.base} / ${row.quote}`;
  $('#fiboChartMeta').textContent = `Fibonacci retracement · ${state.timeframe.toUpperCase()}`;
  $('#fiboChartStatus').innerHTML = '<i></i> Loading candles…';
  try {
    const response = await fetch(`/api/candles?symbol=${encodeURIComponent(row.base)}&timeframe=${timeframe}&exchange=${encodeURIComponent(state.exchange)}&limit=200`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No candle feed for this market');
    const payload = await response.json();
    if (requestId !== state.fiboRequestId) return;
    renderFiboChart(payload, row);
  } catch (error) {
    if (requestId !== state.fiboRequestId) return;
    $('#fiboChartStatus').innerHTML = '<i></i> Candle data unavailable';
    $('#fiboChartNote').textContent = `${error.message}. Prueba Bitunix para pares USDT o busca otro mercado.`;
    $('#fiboSvg').innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#93a19b" font-size="14">No hay velas disponibles para este mercado</text>';
    $('#fiboLevels').innerHTML = '';
  }
}
function renderTable() {
  const rows = filteredRows();
  let markup = state.module === 'price' ? priceTable(rows) : state.module === 'volume' ? volumeTable(rows) : state.module === 'trends' ? trendsTable(rows) : state.module === 'fibo' ? fiboTable(rows) : state.module === 'rsi' ? rsiTable(rows) : highsTable(rows);
  $('#tableShell').innerHTML = markup;
  $$('#tableShell [data-star]').forEach(button => button.addEventListener('click', () => {
    const symbol = button.dataset.star;
    state.starred.has(symbol) ? state.starred.delete(symbol) : state.starred.add(symbol);
    renderTable();
  }));
}
function renderStats() {
  const rows = filteredRows();
  const totalVol = rows.reduce((total, row) => total + (Number(row.volume) || 0), 0);
  $('#marketsCount').textContent = rows.length;
  $('#gainersCount').textContent = rows.filter(row => metric(row, state.timeframe) >= 0).length;
  $('#losersCount').textContent = rows.filter(row => metric(row, state.timeframe) < 0).length;
  $('#volumeTotal').textContent = compact(totalVol);
  const d = new Date();
  $('#updatedAt').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${d.getDate()} ${month[d.getMonth()]}`;
}
function renderWorkspace() {
  $('#workspaceTitle').textContent = moduleNames[state.module];
  $('#workspaceSubtitle').textContent = subtitles[state.module];
  $$('.market-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.module === state.module));
  $('#rangeBar').classList.remove('hidden');
  $('#rsiFilterBar').classList.toggle('hidden', state.module !== 'rsi');
  $('#rsiFilterNote').textContent = 'Elige si quieres ver todas, sobrevendidas o sobrecompradas.';
  const fiboTimeframes = new Set(['m5', 'm15', 'h1', 'h4', 'h6', 'h12', 'd1', 'd7']);
  if (state.module === 'fibo' && !fiboTimeframes.has(state.timeframe)) {
    state.timeframe = 'd1';
    state.rsiValues.clear();
    state.fiboLevels.clear();
  }
  $$('#rangeBar > button[data-timeframe]').forEach(button => button.classList.toggle('hidden', state.module === 'fibo' && !fiboTimeframes.has(button.dataset.timeframe)));
  $('#timeframeLabel').textContent = state.timeframe.toUpperCase();
  $('#fiboLab').classList.toggle('hidden', state.module !== 'fibo');
  renderStats();
  renderTable();
  if (state.module === 'rsi') loadRsiValues();
  if (state.module === 'fibo') loadFiboChart();
}
async function loadData() {
  state.loading = true;
  $('#dataStatus').innerHTML = '<i></i> Loading data…';
  $('#dataStatus').classList.remove('live');
  try {
    const query = `/api/market?exchange=${encodeURIComponent(state.exchange)}&quote=${encodeURIComponent(state.quote)}`;
    const response = await fetch(query, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.rows) || payload.rows.length === 0) throw new Error('No market rows');
    state.rows = payload.rows;
    const providerLabel = payload.provider || state.exchange;
    $('#dataStatus').innerHTML = `<i></i> ${payload.live ? 'Live · ' + providerLabel : 'Demo / preview'}`;
    $('#dataStatus').classList.toggle('live', Boolean(payload.live));
  } catch (error) {
    // Never leave the scanner blank: keep a local snapshot available if the preview API is unreachable.
    state.rows = [...localDemoRows];
    $('#dataStatus').innerHTML = '<i></i> Offline snapshot';
    $('#dataStatus').classList.remove('live');
  } finally {
    state.loading = false;
    renderWorkspace();
  }
}
function showPage(page) {
  const home = $('#homeView');
  const panels = $('#homePanels');
  const workspace = $('#workspaceView');
  const info = $('#infoView');
  home.classList.toggle('hidden', page !== 'home');
  panels.classList.toggle('hidden', page !== 'home');
  workspace.classList.toggle('hidden', page !== 'workspace');
  info.classList.toggle('hidden', page !== 'info');
  if (page === 'workspace') { loadData(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openModule(module) {
  state.module = module;
  showPage('workspace');
  renderWorkspace();
}

$$('[data-view]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.view;
  if (['price','volume','trends','fibo','rsi','highs'].includes(view)) openModule(view);
  else if (view === 'markets') openModule('price');
  else if (view === 'about') showPage('info');
  else showPage('home');
  $('#main-nav')?.classList.remove('open');
}));
$$('.market-tab').forEach(tab => tab.addEventListener('click', () => { state.module = tab.dataset.module; renderWorkspace(); }));
$('#exchangeSelect').addEventListener('change', (event) => {
  state.exchange = event.target.value;
  state.rsiValues.clear();
  state.rsiRequestId += 1;
  state.fiboLevels.clear();
  if (['binance', 'bitunix'].includes(state.exchange) && !['ALL', 'USDT'].includes(state.quote)) state.quote = 'USDT';
  if (['coinbase', 'kraken'].includes(state.exchange) && !['ALL', 'USD'].includes(state.quote)) state.quote = 'USD';
  if (state.exchange === 'demo' && !['ALL', 'USDT'].includes(state.quote)) state.quote = 'USDT';
  $('#quoteSelect').value = state.quote;
  loadData();
});
$('#quoteSelect').addEventListener('change', (event) => {
  state.quote = event.target.value;
  state.rsiValues.clear();
  state.rsiRequestId += 1;
  state.fiboLevels.clear();
  // The aggregate feed can convert the same markets to USD, USDT, BTC or ETH.
  // Reload it when the quote changes instead of filtering away the current feed.
  if (state.exchange === 'aggregate') loadData();
  else renderWorkspace();
});
$('#searchInput').addEventListener('input', (event) => { state.search = event.target.value.trim(); renderWorkspace(); });
$('#watchToggle').addEventListener('click', (event) => { state.watchOnly = !state.watchOnly; event.currentTarget.classList.toggle('active', state.watchOnly); renderWorkspace(); });
$('#showAllBtn').addEventListener('click', (event) => { state.showAll = !state.showAll; event.currentTarget.textContent = state.showAll ? 'Show all' : 'Show top 12'; renderWorkspace(); });
$('#refreshBtn').addEventListener('click', () => loadData());
$('#rsiSignalFilter').addEventListener('change', (event) => {
  state.rsiSignal = event.target.value;
  renderTable();
});
$$('#rangeBar button').forEach(button => button.addEventListener('click', () => {
  if (button.classList.contains('direction')) {
    state.sort = button.textContent.includes('Drops') ? 'drops' : 'gains';
    $$('#rangeBar .direction').forEach(el => el.classList.toggle('active', el === button));
  } else {
    state.timeframe = button.dataset.timeframe || button.textContent.trim().toLowerCase();
    state.rsiValues.clear();
    state.rsiRequestId += 1;
    state.fiboLevels.clear();
    $$('#rangeBar > button:not(.direction)').forEach(el => el.classList.toggle('active', el === button));
  }
  renderWorkspace();
}));
$('#themeToggle').addEventListener('click', () => { document.body.classList.toggle('dark'); $('#themeToggle').textContent = document.body.classList.contains('dark') ? '☾' : '☼'; });
$('#mobileMenu').addEventListener('click', () => $('.main-nav').classList.toggle('open'));

// Keep the legacy-style landing screen quiet until a tool is selected.
showPage('home');
