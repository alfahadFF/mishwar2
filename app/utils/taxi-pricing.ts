export type TaxiQuote = {
  fare_usd: number;
  fare_local: number;
  currency: string;
  country_code: string;
  exchange_rate: number;
  rounding_unit: number;
  commission_rate: number;
  commission_usd: number;
  commission_local: number;
  driver_net_usd: number;
  driver_net_local: number;
};

export type TaxiPriceQuotes = {
  country_code: string;
  currency: string;
  pricing_exchange_rate: number;
  rounding_unit: number;
  minimum_distance_km: number;
  minimum_fare_usd: number;
  base_fare_usd: number;
  rate_per_km_usd: number;
  rate_per_trip_minute_usd: number;
  commission_rate: number;
  quotes: Record<string, TaxiQuote>;
};

// تحتفظ مفاتيح قاعدة البيانات الخمسة بالتوافق؛ العادية هي Standard، والفانان لهما معامل واحد.
export const TAXI_CATEGORY_META: Record<string, { name: string; icon: string; multiplier: number }> = {
  ordinary: { name: 'قياسية', icon: '🚗', multiplier: 1.00 },
  economy: { name: 'اقتصادية', icon: '⚡', multiplier: 0.90 },
  luxury: { name: 'فاخرة', icon: '✨', multiplier: 1.20 },
  van_8: { name: 'فان 8', icon: '🚐', multiplier: 1.60 },
  van_11: { name: 'فان 11', icon: '🚐', multiplier: 1.60 },
};

const CURRENCY_LABEL: Record<string, string> = {
  SYP: 'ل.س. جديدة', IQD: 'د.ع', LBP: 'ل.ل', JOD: 'د.أ',
};

export const formatLocalFare = (amount: number | string | null | undefined, currency = 'SYP') => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  const digits = currency === 'JOD' ? 3 : 0;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits })} ${CURRENCY_LABEL[currency] || currency}`;
};

export const formatWalletUsd = (amount: number | string | null | undefined) => {
  const value = Number(amount);
  return Number.isFinite(value) ? `$${value.toFixed(2)} USD` : '—';
};
