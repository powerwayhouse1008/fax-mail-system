export type SendChannel = "fax" | "gmail";
export type SendStatus = "success" | "failed" | "sending";

export type SendHistoryItem = {
  id: string;
  channel: SendChannel;
  recipient: string;
  subject: string;
  sentAt: string;
  status: SendStatus;
};

const STORAGE_KEY = "send-history-items";
const MAX_HISTORY_ITEMS = 200;
const HISTORY_RETENTION_MONTHS = 3;

const padTwoDigits = (value: number) => value.toString().padStart(2, "0");

const formatDateTime = (date: Date) =>
  `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())} ${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`;
const parseSentAt = (value: string): Date | null => {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!matched) {
    return null;
  }

  const [, year, month, day, hour, minute] = matched;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  );

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const createRetentionCutoff = () => {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - HISTORY_RETENTION_MONTHS);
  return cutoff;
};

const uniqueId = (channel: SendChannel, date: Date) => {
  const prefix = channel === "fax" ? "FAX" : "GMAIL";
  const yyyymmdd = `${date.getFullYear()}${padTwoDigits(date.getMonth() + 1)}${padTwoDigits(date.getDate())}`;
  const randomPart = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${prefix}-${yyyymmdd}-${randomPart}`;
};

export const loadSendHistory = (): SendHistoryItem[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as SendHistoryItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }
   const retentionCutoff = createRetentionCutoff();
    const sanitized = parsed.filter(
      (item) =>
        typeof item?.id === "string" &&
        (item.channel === "fax" || item.channel === "gmail") &&
        typeof item.recipient === "string" &&
        typeof item.subject === "string" &&
        typeof item.sentAt === "string" &&
        (item.status === "success" || item.status === "failed" || item.status === "sending") &&
        (() => {
          const sentAtDate = parseSentAt(item.sentAt);
          return sentAtDate !== null && sentAtDate >= retentionCutoff;
        })(),
    );

    if (sanitized.length !== parsed.length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    }

    return sanitized;
  } catch {
    return [];
  }
};

export const appendSendHistory = (
  entries: Array<{ channel: SendChannel; recipient: string; subject?: string; status: SendStatus }>,
) => {
  if (typeof window === "undefined" || entries.length === 0) {
    return;
  }

  const now = new Date();
  const sentAt = formatDateTime(now);
  const mappedEntries: SendHistoryItem[] = entries.map((entry) => ({
    id: uniqueId(entry.channel, now),
    channel: entry.channel,
    recipient: entry.recipient,
    subject: entry.subject?.trim() || "（件名なし）",
    sentAt,
    status: entry.status,
  }));

  const current = loadSendHistory();
  const next = [...mappedEntries, ...current].slice(0, MAX_HISTORY_ITEMS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};
