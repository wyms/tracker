export interface MarketPrice {
  id: string;
  symbol: string;
  price: number;
  change24h: number | null;
}

// CoinGecko free API — no key required, ~30 req/min rate limit
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true';

export async function fetchMarketPrices(): Promise<MarketPrice[]> {
  const response = await fetch(COINGECKO_URL);
  if (!response.ok) throw new Error(`CoinGecko fetch failed: ${response.status}`);

  const data = await response.json();
  const prices: MarketPrice[] = [];

  const coins: { id: string; symbol: string }[] = [
    { id: 'bitcoin', symbol: 'BTC' },
    { id: 'ethereum', symbol: 'ETH' },
    { id: 'solana', symbol: 'SOL' },
  ];

  for (const coin of coins) {
    const entry = data[coin.id];
    if (entry) {
      prices.push({
        id: coin.id,
        symbol: coin.symbol,
        price: entry.usd || 0,
        change24h: entry.usd_24h_change ?? null,
      });
    }
  }

  return prices;
}
