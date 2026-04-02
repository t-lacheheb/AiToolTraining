export function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function parseApiDate(value: string) {
  // Backend may return naive timestamps (without timezone). Treat them as UTC.
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    return new Date(`${value}Z`)
  }
  return new Date(value)
}

export function formatLocalTime(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatLocalDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

