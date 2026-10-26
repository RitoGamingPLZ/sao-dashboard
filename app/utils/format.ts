// Number/time formatting for the dashboard (auto-imported).

export const formatNumber = (value: number | null | undefined) => (value == null ? '—' : Number(value).toLocaleString())
export const formatCompact = (value: number | null | undefined) =>
  (value == null ? '—' : Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value))
export const formatTime = (ts: number) => new Date(ts).toLocaleTimeString()
