export type SendChannel = "fax" | "gmail";
export type SendStatus = "success" | "failed" | "sending";

export type SendHistoryItem = {
  id: string;
  channel: SendChannel;
  recipient: string;
  subject: string;
  sentAt: string;
  notifiedAt: string;
  status: SendStatus;
};

const STORAGE_KEY = "send-history-items";
const MAX_HISTORY_ITEMS = 200;
const HISTORY_RETENTION_MONTHS = 3;
const FAX_NOTIFICATION_DELAY_MS = 2 * 60 * 1000;

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
    const parsed = JSON.parse(raw) as Array<SendHistoryItem & { notifiedAt?: string }>;
    if (!Array.isArray(parsed)) {
      return [];
    }
   const retentionCutoff = createRetentionCutoff();
    const sanitized = parsed
      .map((item) => ({
        ...item,
        notifiedAt: typeof item?.notifiedAt === "string" ? item.notifiedAt : item.sentAt,
      }))
      .filter(
      (item) =>
        typeof item?.id === "string" &&
        (item.channel === "fax" || item.channel === "gmail") &&
        typeof item.recipient === "string" &&
        typeof item.subject === "string" &&
        typeof item.sentAt === "string" &&
        typeof item.notifiedAt === "string" &&
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
    notifiedAt: entry.channel === "fax" && entry.status === "sending" ? "--" : sentAt,
    status: entry.status,
  }));

  const current = loadSendHistory();
  const next = [...mappedEntries, ...current].slice(0, MAX_HISTORY_ITEMS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

export const syncFaxNotificationStatus = (referenceDate: Date = new Date()): SendHistoryItem[] => {
  const items = loadSendHistory();
  if (items.length === 0 || typeof window === "undefined") {
    return items;
  }

  let changed = false;
  const updated: SendHistoryItem[] = items.map((item) => {
    if (!(item.channel === "fax" && item.status === "sending")) {
      return item;
    }

    const sentAtDate = parseSentAt(item.sentAt);
    if (!sentAtDate) {
      return item;
    }

    if (referenceDate.getTime() - sentAtDate.getTime() < FAX_NOTIFICATION_DELAY_MS) {
      return item;
    }

    changed = true;
    return {
      ...item,
       status: "success" as SendStatus,
      notifiedAt: formatDateTime(referenceDate),
    };
  });

  if (changed) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  return updated;
};
