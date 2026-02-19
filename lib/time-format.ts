function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function formatUtcOffset(date: Date): string {
  const minutesEastOfUtc = -date.getTimezoneOffset()
  const sign = minutesEastOfUtc >= 0 ? '+' : '-'
  const absMinutes = Math.abs(minutesEastOfUtc)
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0')
  const minutes = String(absMinutes % 60).padStart(2, '0')
  return `UTC${sign}${hours}:${minutes}`
}

const TIME_24_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const DATE_SHORT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: '2-digit',
})

const DATE_TIME_24_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatTime24(value: Date | number | string): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${TIME_24_FORMATTER.format(date)} ${formatUtcOffset(date)}`
}

export function formatDateShort(value: Date | number | string): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return '--'
  return DATE_SHORT_FORMATTER.format(date)
}

export function formatDateTime24(value: Date | number | string): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return '--'
  return `${DATE_TIME_24_FORMATTER.format(date)} ${formatUtcOffset(date)}`
}
