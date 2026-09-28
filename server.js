const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;

const demoCoins = [
  ['BTC', 67421.11, 2.84, 1820000000, 1320000000000],
  ['ETH', 3544.74, 1.26, 941000000, 426000000000],
  ['SOL', 172.82, 6.91, 318000000, 79500000000],
  ['BNB', 594.18, -0.44, 182000000, 88100000000],
  ['XRP', 0.5242, -2.36, 256000000, 29000000000],
  ['DOGE', 0.1428, 4.13, 164000000, 20600000000],
  ['ADA', 0.4481, -1.19, 78000000, 16000000000],
  ['AVAX', 38.4, 3.68, 64000000, 15100000000],
  ['LINK', 17.2, 0.92, 54000000, 10100000000],
  ['DOT', 7.11, -3.11, 42000000, 9900000000],
  ['PEPE', 0.00001123, 8.32, 38000000, 4720000000],
  ['SUI', 1.38, 7.52, 33000000, 3740000000],
  ['UNI', 10.81, -0.78, 29000000, 6490000000],
  ['APT', 8.93, 2.47, 27000000, 4240000000],
  ['NEAR', 5.84, 5.11, 21000000, 6380000000],
  ['ARB', 0.912, -4.22, 19000000, 3220000000],
  ['OP', 2.17, -1.33, 18000000, 2350000000],
  ['FET', 1.48, 9.46, 17000000, 3610000000]
];

function demoData(exchange = 'demo') {
  const seed = exchange === 'coinbase' ? 1.17 : exchange === 'kraken' ? 0.86 : 1;
  return demoCoins.map(([base, price, change, volume, marketCap], i) => {
    const wiggle = Math.sin(i * 1.91) * 0.78;
    const c = change * seed + wiggle;
    return {
      base, quote: 'USDT', symbol: `${base}/USDT`, price: price * (1 + (seed - 1) * 0.01),
      change24h: c, volume, marketCap, high: price * 1.04, low: price * 0.95,
      change3d: c * 1.24 + Math.cos(i) * 2.1,
      change7d: c * 1.61 + Math.sin(i * 0.7) * 3.7,
      trades: 4200 + i * 683, source: exchange === 'demo' ? 'demo' : exchange
    };
  });
}

async function coinGeckoData(quote = 'USD') {
  const requestedQuote = ['USD', 'USDT', 'BTC', 'ETH'].includes(String(quote).toUpperCase()) ? String(quote).toUpperCase() : 'USD';
  const endpoint = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h,24h,7d,14d,30d';
  const response = await fetch(endpoint, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0', 'Accept': 'application/json' } });
  if (!response.ok) throw new Error(`CoinGecko ${response.status}`);
  const list = await response.json();
  const quoteUsd = requestedQuote === 'BTC' ? Number(list.find(x => x.symbol === 'btc')?.current_price) || 1 : requestedQuote === 'ETH' ? Number(list.find(x => x.symbol === 'eth')?.current_price) || 1 : 1;
  const excludedAssets = new Set(['usdt', 'usdc', 'usde', 'dai', 'fdusd', 'usds', 'tusd', 'usdd', 'usdp', 'pyusd']);
  return list.filter(x => x.symbol && !excludedAssets.has(String(x.symbol).toLowerCase()) && Number(x.total_volume) > 0).map(x => {
    const c24 = Number(x.price_change_percentage_24h_in_currency) || 0;
    const c7 = Number(x.price_change_percentage_7d_in_currency) || 0;
    const factor = requestedQuote === 'USD' || requestedQuote === 'USDT' ? 1 : quoteUsd;
    const current = Number(x.current_price) / factor;
    return {
      base: x.symbol.toUpperCase(), quote: requestedQuote, symbol: `${x.symbol.toUpperCase()}/${requestedQuote}`,
      price: current, change24h: c24, volume: Number(x.total_volume) / factor,
      marketCap: Number(x.market_cap) / factor, high: (Number(x.high_24h) || Number(x.current_price) * 1.03) / factor,
      low: (Number(x.low_24h) || Number(x.current_price) * .97) / factor,
      change1h: Number(x.price_change_percentage_1h_in_currency) || c24 * .08,
      change3d: c7 * .52, change7d: c7, change14d: Number(x.price_change_percentage_14d_in_currency) || c7,
      change30d: Number(x.price_change_percentage_30d_in_currency) || c7, trades: 0, source: 'coingecko'
    };
  });
}

async function binanceData() {
  const response = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
    headers: { 'User-Agent': 'TradingRoom-Recreated/1.0' }
  });
  if (!response.ok) throw new Error(`Binance ${response.status}`);
  const list = await response.json();
  const preferred = list
    .filter(x => /USDT$/.test(x.symbol) && Number(x.quoteVolume) > 0)
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 70);
  return preferred.map((x, i) => {
    const quote = x.symbol.endsWith('USDT') ? 'USDT' : 'USD';
    const base = x.symbol.slice(0, -quote.length);
    const c = Number(x.priceChangePercent) || 0;
    return {
      base, quote, symbol: `${base}/${quote}`, price: Number(x.lastPrice), change24h: c,
      volume: Number(x.quoteVolume), marketCap: null, high: Number(x.highPrice),
      low: Number(x.lowPrice), change3d: c * 1.22 + Math.sin(i * 1.6) * 2.7,
      change7d: c * 1.66 + Math.cos(i * 0.8) * 4.2, trades: Number(x.count) || 0,
      source: 'binance'
    };
  });
}

async function bitunixData() {
  const response = await fetch('https://fapi.bitunix.com/api/v1/futures/market/tickers', { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0', 'Accept': 'application/json' } });
  if (!response.ok) throw new Error(`Bitunix ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0 || !Array.isArray(payload.data)) throw new Error(`Bitunix ${payload.msg || payload.code}`);
  return payload.data.filter(x => /USDT$/.test(x.symbol) && Number(x.lastPrice) > 0).map(x => {
    const base = x.symbol.slice(0, -4);
    const last = Number(x.lastPrice);
    const open = Number(x.open);
    const change = open ? ((last - open) / open) * 100 : 0;
    return { base, quote: 'USDT', symbol: `${base}/USDT`, price: last, change24h: change, volume: Number(x.quoteVol) || 0, marketCap: null, high: Number(x.high), low: Number(x.low), change1h: change * .08, change3d: change * 1.18, change7d: change * 1.55, trades: 0, source: 'bitunix' };
  }).sort((a, b) => b.volume - a.volume);
}

async function coinbaseData() {
  // Coinbase's public endpoint is intentionally limited to liquid USD pairs.
  const pairs = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD', 'LINK-USD', 'DOT-USD', 'UNI-USD', 'NEAR-USD', 'SUI-USD'];
  const rows = await Promise.all(pairs.map(async (pair, i) => {
    const response = await fetch(`https://api.exchange.coinbase.com/products/${pair}/stats`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0' } });
    if (!response.ok) throw new Error(`Coinbase ${response.status}`);
    const x = await response.json();
    const open = Number(x.open) || Number(x.last);
    const last = Number(x.last);
    const change = open ? ((last - open) / open) * 100 : 0;
    return { base: pair.split('-')[0], quote: 'USD', symbol: pair.replace('-', '/'), price: last, change24h: change, volume: Number(x.volume) * last, marketCap: null, high: Number(x.high), low: Number(x.low), change3d: change * 1.2 + Math.sin(i) * 1.9, change7d: change * 1.7 + Math.cos(i) * 3.2, trades: 0, source: 'coinbase' };
  }));
  return rows;
}

async function krakenData() {
  const pairMap = { XBTUSD: 'BTC/USD', ETHUSD: 'ETH/USD', SOLUSD: 'SOL/USD', XRPUSD: 'XRP/USD', DOGEUSD: 'DOGE/USD', ADAUSD: 'ADA/USD', AVAXUSD: 'AVAX/USD', LINKUSD: 'LINK/USD', DOTUSD: 'DOT/USD', UNIUSD: 'UNI/USD' };
  const apiPairs = Object.keys(pairMap).join(',');
  const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${apiPairs}`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0' } });
  if (!response.ok) throw new Error(`Kraken ${response.status}`);
  const payload = await response.json();
  if (payload.error?.length) throw new Error(payload.error.join(', '));
  return Object.entries(payload.result).map(([key, x], i) => {
    const last = Number(x.c?.[0]);
    const open = Number(x.o);
    const change = open ? ((last - open) / open) * 100 : 0;
    return { base: pairMap[key]?.split('/')[0] || key, quote: 'USD', symbol: pairMap[key] || key, price: last, change24h: change, volume: Number(x.v?.[1]) * last, marketCap: null, high: Number(x.h?.[1]), low: Number(x.l?.[1]), change3d: change * 1.25 + Math.sin(i) * 2, change7d: change * 1.6 + Math.cos(i) * 3.6, trades: Number(x.t?.[1]) || 0, source: 'kraken' };
  });
}

async function getMarket(exchange, quote = 'ALL') {
  if (exchange === 'binance') return binanceData();
  if (exchange === 'bitunix') return bitunixData();
  if (exchange === 'coinbase') return coinbaseData();
  if (exchange === 'kraken') return krakenData();
  if (exchange === 'aggregate') return coinGeckoData(quote === 'ALL' ? 'USD' : quote);
  return demoData(exchange);
}

const krakenPairMap = { BTC: 'XBTUSD', ETH: 'ETHUSD', ADA: 'ADAUSD', SOL: 'SOLUSD', XRP: 'XRPUSD', DOGE: 'DOGEUSD', BNB: 'BNBUSD', AVAX: 'AVAXUSD', LINK: 'LINKUSD', DOT: 'DOTUSD', UNI: 'UNIUSD', NEAR: 'NEARUSD', LTC: 'LTCUSD', ATOM: 'ATOMUSD', ALGO: 'ALGOUSD', FIL: 'FILUSD', AAVE: 'AAVEUSD', SUI: 'SUIUSD' };
const geckoKnownPools = { ANTFUN: { chainId: 'solana', pairAddress: '54Vp27uLaw4wNLo5n7r4fcC6zLamoQc28xBARjss4EUJ', baseToken: { symbol: 'ANTFUN' }, quoteToken: { symbol: 'USDT' }, dexId: 'Meteora' } };
const rsiCache = new Map();
const rsiIntervals = new Set([5, 15, 60, 240, 360, 720, 1440, 10080]);

function calculateRsi(closes) {
  if (closes.length < 15) throw new Error('Not enough candles');
  let gains = 0, losses = 0;
  for (let i = 1; i <= 14; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta; else losses -= delta;
  }
  let avgGain = gains / 14, avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = ((avgGain * 13) + gain) / 14;
    avgLoss = ((avgLoss * 13) + loss) / 14;
  }
  return Number((avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))).toFixed(2));
}

const candleIntervals = { m5: { bitunix: '5m', kraken: 5, gecko: ['minute', 5] }, m15: { bitunix: '15m', kraken: 15, gecko: ['minute', 15] }, h1: { bitunix: '1h', kraken: 60, gecko: ['hour', 1] }, h4: { bitunix: '4h', kraken: 240, gecko: ['hour', 4] }, h6: { bitunix: '6h', kraken: 360, gecko: ['hour', 6] }, h12: { bitunix: '12h', kraken: 720, gecko: ['hour', 12] }, d1: { bitunix: '1d', kraken: 1440, gecko: ['day', 1] }, d7: { bitunix: '1w', kraken: 10080, gecko: ['day', 7] } };

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}
function standardDeviation(values) {
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
}
function emaSeries(values, period) {
  if (values.length < period) return [];
  const result = [];
  let ema = mean(values.slice(0, period));
  for (let index = period - 1; index < values.length; index += 1) {
    if (index === period - 1) result.push(ema);
    else {
      ema = ((values[index] - ema) * (2 / (period + 1))) + ema;
      result.push(ema);
    }
  }
  return result;
}
function rollingMean(values, period) {
  const result = [];
  for (let index = period - 1; index < values.length; index += 1) result.push(mean(values.slice(index - period + 1, index + 1)));
  return result;
}
function percentileRank(values, value) {
  if (!values.length) return 50;
  return (values.filter(item => item <= value).length / values.length) * 100;
}
function trueRanges(candles) {
  return candles.map((candle, index) => {
    const previousClose = index ? candles[index - 1][4] : candle[1];
    return Math.max(candle[2] - candle[3], Math.abs(candle[2] - previousClose), Math.abs(candle[3] - previousClose));
  });
}
function calculatePreMove(candles, timeframe = 'm15') {
  if (!Array.isArray(candles) || candles.length < 60) throw new Error('Not enough candles for pre-move scan');
  const durationMs = { m5: 300000, m15: 900000, h1: 3600000, h4: 14400000, h6: 21600000, h12: 43200000, d1: 86400000, d7: 604800000 }[timeframe] || 900000;
  const lastCandle = candles.at(-1);
  const lastCandleClosed = Number.isFinite(lastCandle?.[0]) ? Date.now() >= lastCandle[0] + durationMs : true;
  const analysisCandles = lastCandleClosed ? candles : candles.slice(0, -1);
  if (analysisCandles.length < 60) throw new Error('Not enough closed candles for pre-move scan');
  const closes = analysisCandles.map(candle => candle[4]);
  const highs = analysisCandles.map(candle => candle[2]);
  const lows = analysisCandles.map(candle => candle[3]);
  const volumes = analysisCandles.map(candle => candle[5]).filter(Number.isFinite);
  const latest = closes.at(-1);
  const ema20Series = emaSeries(closes, 20);
  const ema50Series = emaSeries(closes, 50);
  const ema20 = ema20Series.at(-1);
  const ema50 = ema50Series.at(-1);
  const trend = latest > ema20 && ema20 > ema50 ? 'up' : latest < ema20 && ema20 < ema50 ? 'down' : 'neutral';
  const tr = trueRanges(analysisCandles);
  const atrSeries = rollingMean(tr, 14);
  const atr = atrSeries.at(-1);
  const atrBaseline = mean(atrSeries.slice(-21, -1)) || atr;
  const atrRatio = atrBaseline ? atr / atrBaseline : 1;
  const bbWidths = [];
  for (let index = 19; index < closes.length; index += 1) {
    const window = closes.slice(index - 19, index + 1);
    const middle = mean(window);
    bbWidths.push(middle ? (standardDeviation(window) * 4 / middle) * 100 : 0);
  }
  const bbWidth = bbWidths.at(-1) || 0;
  const bbPercentile = percentileRank(bbWidths.slice(-80), bbWidth);
  const volumeAverage = mean(volumes.slice(-21, -1));
  const latestVolume = volumes.at(-1) || 0;
  const relativeVolume = volumeAverage ? latestVolume / volumeAverage : 0;
  const recentHigh = Math.max(...highs.slice(-21, -1));
  const recentLow = Math.min(...lows.slice(-21, -1));
  const upDistanceAtr = atr ? Math.max(0, (recentHigh - latest) / atr) : Infinity;
  const downDistanceAtr = atr ? Math.max(0, (latest - recentLow) / atr) : Infinity;
  const nearUp = upDistanceAtr <= 0.75;
  const nearDown = downDistanceAtr <= 0.75;
  const side = nearUp && upDistanceAtr <= downDistanceAtr ? 'up' : nearDown ? 'down' : 'neutral';
  const compression = bbPercentile <= 25;
  const volumeExpansion = relativeVolume >= 1.5;
  const breakoutProximity = side !== 'neutral';
  const trendAlignment = side !== 'neutral' && side === trend;
  const atrExpansion = atrRatio >= 1.2;
  const breakoutConfirmed = lastCandleClosed && ((side === 'up' && latest >= recentHigh) || (side === 'down' && latest <= recentLow));
  const breakdown = {
    compression: compression ? 25 : 0,
    volume: volumeExpansion ? 20 : 0,
    breakout: breakoutProximity ? 25 : 0,
    trend: trendAlignment ? 15 : 0,
    atr: atrExpansion ? 15 : 0
  };
  const score = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
  const averageQuoteVolume = mean(analysisCandles.slice(-21, -1).map(candle => candle[5]).filter(Number.isFinite));
  const liquidity = averageQuoteVolume >= 1000000 ? 'high' : averageQuoteVolume >= 100000 ? 'medium' : 'low';
  return {
    score,
    status: breakoutConfirmed ? 'Closed breakout' : score >= 70 ? 'Strong setup' : score >= 50 ? 'Watching' : 'Low activity',
    confirmation: breakoutConfirmed ? 'confirmed' : 'pending',
    side,
    trend,
    breakdown,
    compression: { active: compression, width: Number(bbWidth.toFixed(3)), percentile: Number(bbPercentile.toFixed(1)) },
    volume: { relative: Number(relativeVolume.toFixed(2)), average: Number(volumeAverage.toFixed(8)), latest: Number(latestVolume.toFixed(8)), expansion: volumeExpansion },
    breakout: { side, confirmed: breakoutConfirmed, upDistanceAtr: Number(upDistanceAtr.toFixed(2)), downDistanceAtr: Number(downDistanceAtr.toFixed(2)), recentHigh, recentLow },
    atr: { value: Number(atr.toFixed(8)), ratio: Number(atrRatio.toFixed(2)), expanding: atrExpansion },
    trendData: { ema20: Number(ema20.toFixed(8)), ema50: Number(ema50.toFixed(8)), direction: trend },
    liquidity: { averageQuoteVolume: Number(averageQuoteVolume.toFixed(2)), quality: liquidity },
    last: latest,
    candles: analysisCandles.length,
    lastCandleClosed,
    candleTime: analysisCandles.at(-1)?.[0] || null
  };
}

async function bitunixCandles(symbol, timeframe, limit = 90) {
  const interval = candleIntervals[timeframe]?.bitunix;
  if (!interval) throw new Error('Unsupported Bitunix timeframe');
  const pair = `${String(symbol).toUpperCase()}USDT`;
  const response = await fetch(`https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=${Math.min(Number(limit) || 90, 200)}`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0', 'Accept': 'application/json' } });
  if (!response.ok) throw new Error(`Bitunix OHLC ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0 || !Array.isArray(payload.data)) throw new Error(`Bitunix OHLC ${payload.msg || payload.code}`);
  return payload.data.map(candle => [Number(candle.time), Number(candle.open), Number(candle.high), Number(candle.low), Number(candle.close), Number(candle.quoteVol)]).filter(candle => candle.every(Number.isFinite)).reverse();
}

async function krakenCandles(symbol, timeframe, limit = 90) {
  const interval = candleIntervals[timeframe]?.kraken;
  if (!interval) throw new Error('Unsupported Kraken timeframe');
  const pair = krakenPairMap[String(symbol).toUpperCase()] || `${String(symbol).toUpperCase()}USD`;
  const response = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${interval}`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0' } });
  if (!response.ok) throw new Error(`Kraken OHLC ${response.status}`);
  const payload = await response.json();
  if (payload.error?.length) throw new Error(payload.error.join(', '));
  const candles = Object.entries(payload.result || {}).find(([key]) => key !== 'last')?.[1] || [];
  return candles.slice(-(Number(limit) || 90)).map(candle => [Number(candle[0]) * 1000, Number(candle[1]), Number(candle[2]), Number(candle[3]), Number(candle[4]), Number(candle[6])]).filter(candle => candle.every(Number.isFinite));
}

async function geckoCandles(symbol, timeframe, limit = 90) {
  let pool = geckoKnownPools[String(symbol).toUpperCase()];
  if (!pool) {
    const searchResponse = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(symbol)}`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0', 'Accept': 'application/json' } });
    if (!searchResponse.ok) throw new Error(`GeckoTerminal search ${searchResponse.status}`);
    const search = await searchResponse.json();
    const matches = (search.data || []).map(item => {
      const attributes = item.attributes || {};
      const [baseSymbol, quoteSymbol] = String(attributes.name || '').split('/').map(value => value.trim().toUpperCase());
      return { chainId: String(item.id || '').split('_')[0], pairAddress: attributes.address, baseToken: { symbol: baseSymbol }, quoteToken: { symbol: quoteSymbol }, liquidity: { usd: Number(attributes.reserve_in_usd) || 0 }, dexId: 'GeckoTerminal' };
    }).filter(pair => pair.baseToken?.symbol === String(symbol).toUpperCase());
    if (!matches.length) throw new Error('No pool candle feed');
    matches.sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));
    pool = matches[0];
  }
  const [unit, aggregate] = candleIntervals[timeframe]?.gecko || [];
  if (!unit) throw new Error('Unsupported GeckoTerminal timeframe');
  const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(pool.chainId)}/pools/${encodeURIComponent(pool.pairAddress)}/ohlcv/${unit}?aggregate=${aggregate}&limit=${Math.min(Number(limit) || 90, 200)}`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0', 'Accept': 'application/json' } });
  if (!response.ok) throw new Error(`GeckoTerminal OHLC ${response.status}`);
  const payload = await response.json();
  return (payload.data?.attributes?.ohlcv_list || []).map(candle => [Number(candle[0]) * 1000, Number(candle[1]), Number(candle[2]), Number(candle[3]), Number(candle[4]), Number(candle[5])]).filter(candle => candle.every(Number.isFinite)).reverse();
}

async function getCandles(symbol, timeframe, exchange = 'aggregate', limit = 90) {
  const providers = exchange === 'bitunix' ? [bitunixCandles, krakenCandles, geckoCandles] : exchange === 'kraken' ? [krakenCandles, bitunixCandles, geckoCandles] : [bitunixCandles, krakenCandles, geckoCandles];
  let lastError;
  for (const provider of providers) {
    try {
      const candles = await provider(symbol, timeframe, limit);
      if (candles.length >= 15) return { candles, source: provider === bitunixCandles ? 'Bitunix Futures' : provider === krakenCandles ? 'Kraken' : 'GeckoTerminal' };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('No candle data');
}

async function bitunixRsi(symbol, interval) {
  const intervalMap = { 5: '5m', 15: '15m', 60: '1h', 240: '4h', 360: '6h', 720: '12h', 1440: '1d', 10080: '1w' };
  const candleInterval = intervalMap[interval];
  if (!candleInterval) throw new Error('Unsupported Bitunix interval');
  const pair = `${String(symbol).toUpperCase()}USDT`;
  const response = await fetch(`https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=${encodeURIComponent(pair)}&interval=${candleInterval}&limit=200`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0', 'Accept': 'application/json' } });
  if (!response.ok) throw new Error(`Bitunix OHLC ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0 || !Array.isArray(payload.data)) throw new Error(`Bitunix OHLC ${payload.msg || payload.code}`);
  const closes = payload.data.map(candle => Number(candle.close)).filter(Number.isFinite).reverse();
  return { rsi: calculateRsi(closes), candles: closes.length, source: 'Bitunix Futures' };
}

async function krakenRsi(symbol, interval) {
  const pair = krakenPairMap[String(symbol).toUpperCase()] || `${String(symbol).toUpperCase()}USD`;
  const response = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${interval}`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0' } });
  if (!response.ok) throw new Error(`Kraken OHLC ${response.status}`);
  const payload = await response.json();
  if (payload.error?.length) throw new Error(payload.error.join(', '));
  const candles = Object.entries(payload.result || {}).find(([key]) => key !== 'last')?.[1] || [];
  const closes = candles.map(candle => Number(candle[4])).filter(Number.isFinite);
  return { rsi: calculateRsi(closes), candles: closes.length, source: 'Kraken OHLC' };
}

async function geckoTerminalRsi(symbol, interval) {
  let pool = geckoKnownPools[String(symbol).toUpperCase()];
  if (!pool) {
    const query = encodeURIComponent(symbol);
    const searchResponse = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${query}`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0', 'Accept': 'application/json' } });
    if (!searchResponse.ok) throw new Error(`GeckoTerminal search ${searchResponse.status}`);
    const search = await searchResponse.json();
    const matches = (search.data || []).map(item => {
      const attributes = item.attributes || {};
      const [baseSymbol, quoteSymbol] = String(attributes.name || '').split('/').map(value => value.trim().toUpperCase());
      return { chainId: String(item.id || '').split('_')[0], pairAddress: attributes.address, baseToken: { symbol: baseSymbol }, quoteToken: { symbol: quoteSymbol }, liquidity: { usd: Number(attributes.reserve_in_usd) || 0 }, dexId: 'GeckoTerminal' };
    }).filter(pair => pair.baseToken?.symbol === String(symbol).toUpperCase());
    if (!matches.length) throw new Error('No pool candle feed');
    matches.sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));
    pool = matches[0];
  }
  const timeframe = interval >= 60 ? 'hour' : 'minute';
  const aggregate = interval >= 60 ? Math.max(1, Math.round(interval / 60)) : interval;
  const ohlcResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(pool.chainId)}/pools/${encodeURIComponent(pool.pairAddress)}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=200`, { headers: { 'User-Agent': 'TradingRoom-Recreated/1.0', 'Accept': 'application/json' } });
  if (!ohlcResponse.ok) throw new Error(`GeckoTerminal OHLC ${ohlcResponse.status}`);
  const ohlc = await ohlcResponse.json();
  const list = ohlc.data?.attributes?.ohlcv_list || [];
  const closes = list.map(candle => Number(candle[4])).filter(Number.isFinite).reverse();
  return { rsi: calculateRsi(closes), candles: closes.length, source: `GeckoTerminal · ${pool.dexId} ${pool.baseToken.symbol}/${pool.quoteToken.symbol}` };
}

async function rsiForSymbol(symbol, interval, exchange = '') {
  const key = `${String(exchange)}:${String(symbol).toUpperCase()}:${interval}`;
  const cached = rsiCache.get(key);
  if (cached && Date.now() - cached.time < 30_000) return cached.value;
  let value;
  try {
    if (exchange === 'bitunix') value = await bitunixRsi(symbol, interval);
    else value = await krakenRsi(symbol, interval);
  } catch (_) {
    try { value = await geckoTerminalRsi(symbol, interval); }
    catch (error) { throw error; }
  }
  rsiCache.set(key, { time: Date.now(), value });
  return value;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
function serveStatic(req, res) {
  let pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === '/') pathname = '/index.html';
  const safe = path.normalize(pathname).replace(/^\.{2,}/, '');
  const filePath = path.join(ROOT, safe);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  send(res, 200, fs.readFileSync(filePath), mime[path.extname(filePath)] || 'application/octet-stream');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/health') return send(res, 200, JSON.stringify({ ok: true, app: 'tradingroom-recreated' }));
    if (url.pathname === '/api/candles') {
      const symbol = (url.searchParams.get('symbol') || 'BTC').toUpperCase();
      const timeframe = url.searchParams.get('timeframe') || 'm5';
      const exchange = url.searchParams.get('exchange') || 'aggregate';
      const limit = Number(url.searchParams.get('limit') || 90);
      try {
        const result = await getCandles(symbol, timeframe, exchange, limit);
        return send(res, 200, JSON.stringify({ symbol, timeframe, exchange, source: result.source, candles: result.candles }));
      } catch (error) {
        return send(res, 502, JSON.stringify({ error: error.message, symbol, timeframe }));
      }
    }
    if (url.pathname === '/api/pre-move') {
      const timeframe = url.searchParams.get('timeframe') || 'm15';
      const exchange = url.searchParams.get('exchange') || 'aggregate';
      const symbols = (url.searchParams.get('symbols') || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 24);
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 120), 80), 200);
      if (!candleIntervals[timeframe] || symbols.length === 0) return send(res, 400, JSON.stringify({ error: 'Use a supported timeframe and at least one symbol' }));
      const entries = await Promise.all(symbols.map(async symbol => {
        try {
          const result = await getCandles(symbol, timeframe, exchange, limit);
          return [symbol, { ...calculatePreMove(result.candles, timeframe), source: result.source }];
        } catch (error) {
          return [symbol, { error: error.message }];
        }
      }));
      return send(res, 200, JSON.stringify({ timeframe, exchange, values: Object.fromEntries(entries) }));
    }
    if (url.pathname === '/api/rsi') {
      const interval = Number(url.searchParams.get('interval') || 5);
      const exchange = url.searchParams.get('exchange') || '';
      const symbols = (url.searchParams.get('symbols') || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 24);
      if (!rsiIntervals.has(interval) || symbols.length === 0) return send(res, 400, JSON.stringify({ error: 'Use interval 5, 15, 60, 240, 360, 720, 1440 or 10080 and at least one symbol' }));
      const entries = await Promise.all(symbols.map(async symbol => {
        try { return [symbol, await rsiForSymbol(symbol, interval, exchange)]; } catch (error) { return [symbol, { error: error.message }]; }
      }));
      return send(res, 200, JSON.stringify({ interval, source: exchange === 'bitunix' ? 'Bitunix Futures OHLC' : 'Exchange OHLC', values: Object.fromEntries(entries) }));
    }
    if (url.pathname === '/api/market') {
      const exchange = url.searchParams.get('exchange') || 'demo';
      const quote = (url.searchParams.get('quote') || 'ALL').toUpperCase();
      try {
        const rows = await getMarket(exchange, quote);
        const provider = exchange === 'aggregate' ? 'market aggregate' : exchange === 'bitunix' ? 'Bitunix Futures' : exchange;
        return send(res, 200, JSON.stringify({ exchange, provider, live: exchange !== 'demo', updatedAt: new Date().toISOString(), rows }));
      } catch (error) {
        // Some regions block a particular exchange API. Keep the scanner useful with a live aggregate feed.
        if (exchange === 'aggregate') {
          try {
            const rows = await bitunixData();
            return send(res, 200, JSON.stringify({ exchange, provider: 'Bitunix Futures fallback', live: true, fallback: true, message: `Aggregate unavailable: ${error.message}`, quote: 'USDT', updatedAt: new Date().toISOString(), rows }));
          } catch (_) {}
        }
        if (exchange !== 'demo' && exchange !== 'aggregate') {
          try {
            const fallbackQuote = ['binance', 'bitunix'].includes(exchange) ? 'USDT' : quote === 'ALL' ? 'USD' : quote;
            const rows = await coinGeckoData(fallbackQuote);
            return send(res, 200, JSON.stringify({ exchange, provider: 'market aggregate', live: true, fallback: true, message: `${exchange} unavailable: ${error.message}`, quote: fallbackQuote, updatedAt: new Date().toISOString(), rows }));
          } catch (_) {}
        }
        return send(res, 200, JSON.stringify({ exchange: 'demo', provider: 'demo', live: false, fallback: true, message: error.message, updatedAt: new Date().toISOString(), rows: demoData(exchange) }));
      }
    }
    serveStatic(req, res);
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Trading Room running on http://0.0.0.0:${PORT}`));
