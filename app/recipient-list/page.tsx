"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type RecipientListPageProps = {
  searchParams?: {
    channel?: string;
  };
};

const cleanList = (value: string) =>
  value
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);

export default function RecipientListPage({ searchParams }: RecipientListPageProps) {
  const channel = searchParams?.channel ?? "fax";
  const [faxListInput, setFaxListInput] = useState("");
  const [gmailListInput, setGmailListInput] = useState("");

  const faxNumbers = useMemo(() => cleanList(faxListInput), [faxListInput]);
  const gmailAddresses = useMemo(() => cleanList(gmailListInput), [gmailListInput]);
  const maxLength = Math.max(faxNumbers.length, gmailAddresses.length);

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <h1>Danh sách gửi lần lượt</h1>
        <p>Nhập danh sách số fax và Gmail. Hệ thống sẽ ghép theo thứ tự từ trên xuống dưới.</p>

        <div className="recipient-grid">
          <label className="field">
            <span>Danh sách số fax (mỗi dòng 1 số)</span>
            <textarea
              rows={8}
              value={faxListInput}
              onChange={(event) => setFaxListInput(event.target.value)}
              placeholder={"03-1234-5678\n03-9876-5432"}
            />
          </label>

          <label className="field">
            <span>Danh sách Gmail (mỗi dòng 1 email)</span>
            <textarea
              rows={8}
              value={gmailListInput}
              onChange={(event) => setGmailListInput(event.target.value)}
              placeholder={"first@gmail.com\nsecond@gmail.com"}
            />
          </label>
        </div>

        <section className="recipient-preview">
          <h2>Xem trước thứ tự gửi</h2>
          {maxLength === 0 ? (
            <p>Chưa có dữ liệu để hiển thị.</p>
          ) : (
            <ol>
              {Array.from({ length: maxLength }).map((_, index) => (
                <li key={`${faxNumbers[index] ?? "fax-empty"}-${gmailAddresses[index] ?? "gmail-empty"}-${index}`}>
                  <strong>FAX:</strong> {faxNumbers[index] ?? "(trống)"} | <strong>Gmail:</strong>{" "}
                  {gmailAddresses[index] ?? "(trống)"}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="actions">
          <Link href={`/fax-template?channel=${channel}`} className="btn btn-secondary">
            Quay lại mẫu gửi
          </Link>
          <button type="button" className="btn btn-primary">
            Bắt đầu gửi theo danh sách
          </button>
        </div>
      </section>
    </main>
  );
}
