type ReviewableAccount = {
  createdAt: string;
  lastReviewAt: string | null;
};

const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

export function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCnpj(value: string) {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14) return value;
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

function localDateValue(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function saoPauloClock(now: Date) {
  return new Date(now.getTime() - SAO_PAULO_OFFSET_MS);
}

export function reviewWeek(now = new Date()) {
  const date = saoPauloClock(now);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return localDateValue(date);
}

export function latestReviewDeadline(now = new Date()) {
  const localNow = saoPauloClock(now);
  const deadlineClock = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    8,
  ));
  const daysSinceFriday = (localNow.getUTCDay() + 2) % 7;
  deadlineClock.setUTCDate(deadlineClock.getUTCDate() - daysSinceFriday);
  if (daysSinceFriday === 0 && localNow.getTime() < deadlineClock.getTime()) {
    deadlineClock.setUTCDate(deadlineClock.getUTCDate() - 7);
  }
  return new Date(deadlineClock.getTime() + SAO_PAULO_OFFSET_MS);
}

export function isWeeklyReviewPending(account: ReviewableAccount, now = new Date()) {
  const deadline = latestReviewDeadline(now);
  const createdAt = new Date(account.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.getTime() > deadline.getTime()) {
    return false;
  }

  const reviewCycleStart = new Date(deadline);
  reviewCycleStart.setUTCDate(reviewCycleStart.getUTCDate() - 4);
  reviewCycleStart.setUTCHours(3, 0, 0, 0);
  const lastReviewAt = account.lastReviewAt ? new Date(account.lastReviewAt) : null;

  return !lastReviewAt ||
    Number.isNaN(lastReviewAt.getTime()) ||
    lastReviewAt.getTime() < reviewCycleStart.getTime();
}

export function isCurrentFridayReminder(now = new Date()) {
  const localNow = saoPauloClock(now);
  return localNow.getUTCDay() === 5 && localNow.getUTCHours() >= 8;
}
