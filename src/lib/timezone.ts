import { fromZonedTime } from 'date-fns-tz';

/**
 * Convert a local date/time string from a specific timezone to a UTC Date object.
 *
 * @param dateStr - Date string like "2026-01-15" (YYYY-MM-DD)
 * @param timeStr - Optional time string like "14:30:00" (HH:MM:SS)
 * @param timezone - IANA timezone identifier like "Asia/Kathmandu"
 * @returns Date object in UTC
 *
 * @example
 * // 2:30 PM Nepal Time -> 8:45 AM UTC
 * localToUtc('2026-01-15', '14:30:00', 'Asia/Kathmandu')
 */
export function localToUtc(dateStr: string, timeStr: string | null, timezone: string): Date {
  const dateTimeStr = timeStr ? `${dateStr}T${timeStr}` : `${dateStr}T00:00:00`;
  return fromZonedTime(dateTimeStr, timezone);
}

/**
 * Convert a UTC ISO datetime string to UTC, interpreting it as local time
 * in the given timezone first.
 *
 * Use this when the client sends filter dates as local datetimes
 * (e.g., "start of today in my timezone") that need to be converted to UTC
 * for database comparison.
 *
 * @param isoDateStr - ISO datetime string (e.g., "2026-01-15T00:00:00")
 * @param timezone - IANA timezone identifier
 * @returns Date object in UTC
 */
export function filterDateToUtc(isoDateStr: string, timezone: string): Date {
  // If the date string already has a Z or offset, it's already in UTC/absolute
  // In that case, just parse it directly
  if (isoDateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoDateStr)) {
    return new Date(isoDateStr);
  }
  // Otherwise, interpret as local time in the given timezone
  return fromZonedTime(isoDateStr, timezone);
}
