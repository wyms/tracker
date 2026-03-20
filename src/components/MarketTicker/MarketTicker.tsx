import { useState, useEffect } from 'react';
import { fetchMarketPrices, type MarketPrice } from '../../services/markets';

export function MarketTicker() {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await fetchMarketPrices();
        if (!cancelled) {
          setPrices(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    poll();
    const interval = setInterval(poll, 60_000); // 1 min
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error || prices.length === 0) return null;

  return (
    <div
      className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex gap-4 px-4 py-1.5 rounded-lg border backdrop-blur-sm"
      style={{
        background: 'rgba(13,27,42,0.85)',
        borderColor: 'rgba(0,229,255,0.15)',
      }}
    >
      {prices.map((p) => {
        const changeColor =
          p.change24h == null
            ? '#9CA3AF'
            : p.change24h >= 0
              ? '#00FF88'
              : '#FF5252';
        const changeStr =
          p.change24h != null
            ? `${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(1)}%`
            : '';

        return (
          <div key={p.id} className="flex items-center gap-2 text-xs font-mono">
            <span style={{ color: '#9CA3AF' }}>{p.symbol}</span>
            <span className="text-white">
              ${p.price >= 1000 ? p.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.price.toFixed(2)}
            </span>
            {changeStr && (
              <span style={{ color: changeColor }}>{changeStr}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
