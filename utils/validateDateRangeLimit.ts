export interface DateRangeValidationResult {
  valid: boolean;
  reason?: string;
  days: number;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function toStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function validateDateRangeLimit(
  startDate: Date,
  endDate: Date,
  maxDays = 7,
): DateRangeValidationResult {
  const start = toStartOfDay(startDate);
  const end = toStartOfDay(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      valid: false,
      reason: "Tanggal tidak valid.",
      days: 0,
    };
  }

  if (end < start) {
    return {
      valid: false,
      reason: "Tanggal akhir tidak boleh lebih awal dari tanggal mulai.",
      days: 0,
    };
  }

  const days = Math.floor((end.getTime() - start.getTime()) / DAY_IN_MS) + 1;
  if (days > maxDays) {
    return {
      valid: false,
      reason: `Rentang tanggal melebihi batas ${maxDays} hari.`,
      days,
    };
  }

  return {
    valid: true,
    days,
  };
}
