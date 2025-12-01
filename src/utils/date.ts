import { DateTime } from "luxon";

interface DateConversionResult {
  localDateTime: string;
  utcDateTime: string;
}

/**
 * Converts a given date + time in a specific timezone into:
 * - Correct local ISO string
 * - Correct UTC ISO string
 */
export function convertToUTCAndLocal(
  date: string,        // e.g. "2033-11-28"
  time: string,        // e.g. "13:22"
  timezone: string     // e.g. "America/Los_Angeles"
): DateConversionResult {

  // Combine date & time in the *provided* timezone (not server timezone)
  const local = DateTime.fromISO(`${date}T${time}`, { zone: timezone });

  if (!local.isValid) {
    throw new Error("Invalid date/time/timezone input");
  }

  return {
    // Local time with offset (correct)
    localDateTime: local.toISO(), 

    // Correct UTC conversion
    utcDateTime: local.toUTC().toISO()
  };
}