"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "../../components/auth-guard";

type SpiderContact = {
  id: string;
  company_name: string | null;
  person_name: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website_url: string | null;
  source_url: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

type ExtractedData = {
  company_name: string;
  person_name: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website_url: string;
  source_url: string;
  memo: string;
  extracted_at: string;
};

export default function DataSpiderPage() {
  const [extractMode, setExtractMode] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ExtractedData | null>(null);
  const [draftItems, setDraftItems] = useState<ExtractedData[]>([]);
  const [contacts, setContacts] = useState<SpiderContact[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "fax" | "email" | "duplicate">("all");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const loadContacts = async () => {
    const response = await fetch("/api/data-spider/contacts", { cache: "no-store" });
    const data = (await response.json()) as { contacts?: SpiderContact[]; error?: string };
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "取得結果の読み込みに失敗しました。" });
      return;
    }
    setContacts(data.contacts ?? []);
  };

  const handleExtract = async () => {
    if (extractMode === "url" && !url.trim()) {
      setNotice({ type: "error", text: "URL入力は必須です。" });
      return;
    }
   if (extractMode === "file" && !file) {
      setNotice({ type: "error", text: "PDF / Excel / Word ファイルを選択してください。" });
      return;
    }

    setIsBusy(true);
    setNotice(null);
    setDraftItems([]);
    try {
      const response =
        extractMode === "url"
          ? await fetch("/api/data-spider/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: url.trim() }),
            })
          : await (() => {
              const form = new FormData();
              form.append("file", file as File);
              return fetch("/api/data-spider/extract", {
                method: "POST",
                body: form,
              });
            })();
       const payload = (await response.json()) as {
        data?: ExtractedData;
        items?: ExtractedData[];
        total?: number;
        error?: string;
      };
      if (!response.ok || !payload.data) {
        setNotice({ type: "error", text: payload.error ?? "解析に失敗しました。" });
        return;
      }
      setDraft(payload.data);
       setDraftItems(payload.items ?? [payload.data]);
      const total = payload.total ?? payload.items?.length ?? 1;
      setNotice({ type: "success", text: `解析完了（${total}件）。保存ボタンで連絡先を登録できます。` });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
     const saveItems = draftItems.length > 0 ? draftItems : draft ? [draft] : [];
    if (saveItems.length === 0) {
      setNotice({ type: "error", text: "保存する解析結果がありません。" });
      return;
    }

    const response = await fetch("/api/data-spider/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: saveItems }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice({ type: "error", text: payload.error ?? "保存に失敗しました。" });
      return;
    }

    setNotice({ type: "success", text: "保存しました。" });
    await loadContacts();
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;

    const response = await fetch("/api/data-spider/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice({ type: "error", text: payload.error ?? "削除に失敗しました。" });
      return;
    }

    setSelectedIds([]);
    setNotice({ type: "success", text: "削除しました。" });
    await loadContacts();
  };
const handleDeleteAll = async () => {
    const allIds = contacts.map((item) => item.id);
    if (allIds.length === 0) return;

    const response = await fetch("/api/data-spider/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: allIds }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice({ type: "error", text: payload.error ?? "全削除に失敗しました。" });
      return;
    }

    setSelectedIds([]);
    setNotice({ type: "success", text: "すべて削除しました。" });
    await loadContacts();
  };
  useEffect(() => {
    loadContacts();
  }, []);

  const duplicateIds = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    contacts.forEach((item) => {
      const faxKey = item.fax?.trim();
      const emailKey = item.email?.trim().toLowerCase();
      const key = faxKey || emailKey;
      if (!key) return;
      if (seen.has(key)) duplicates.add(item.id);
      seen.add(key);
    });
    return duplicates;
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return contacts.filter((item) => {
      const byKeyword =
        keyword.length === 0 ||
        [
          item.company_name,
          item.person_name,
          item.address,
          item.phone,
          item.fax,
          item.email,
          item.memo,
          item.source_url,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      if (!byKeyword) return false;
      if (filter === "fax") return Boolean(item.fax?.trim());
      if (filter === "email") return Boolean(item.email?.trim());
      if (filter === "duplicate") return duplicateIds.has(item.id);
      return true;
    });
  }, [contacts, duplicateIds, filter, search]);

  const addToFax = () => {
    const faxes = contacts
      .filter((item) => selectedIds.includes(item.id))
      .map((item) => item.fax?.trim())
      .filter((item): item is string => Boolean(item));

    const encoded = encodeURIComponent(faxes.join("\n"));
    window.location.href = `/recipient-list?channel=fax&faxList=${encoded}`;
  };

  const addToGmail = () => {
    const emails = contacts
      .filter((item) => selectedIds.includes(item.id))
      .map((item) => item.email?.trim())
      .filter((item): item is string => Boolean(item));

    const encoded = encodeURIComponent(emails.join("\n"));
    window.location.href = `/recipient-list?channel=gmail&gmailList=${encoded}`;
  };

  const handleDuplicateDelete = async () => {
    const idsToDelete = Array.from(duplicateIds);
    if (idsToDelete.length === 0) return;
    const response = await fetch("/api/data-spider/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: idsToDelete }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice({ type: "error", text: payload.error ?? "重複削除に失敗しました。" });
      return;
    }
    setNotice({ type: "success", text: "重複データを削除しました。" });
    setSelectedIds([]);
    await loadContacts();
  };

  return (
    <AuthGuard requiredRole="admin">
      <main className="dashboard-shell">
        <section className="dashboard-card" style={{ display: "grid", gap: "1rem" }}>
          <div className="history-header">
            <div>
              <p className="badge">データ収集</p>
              <h1>Powerway Data Spider</h1>
              <p>URL または PDF / Excel / Word ファイルを解析し、連絡先を保存・出力できます。</p>
            </div>
            <div className="actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-secondary" onClick={loadContacts}>
                取得結果
              </button>
              <Link href="/dashboard" className="btn btn-secondary">
                ダッシュボードへ
              </Link>
            </div>
          </div>

          <div className="admin-panel" style={{ display: "grid", gap: "0.8rem" }}>
            <label className="field">
              <span>抽出元</span>
              <select
                value={extractMode}
                onChange={(e) => setExtractMode(e.target.value as "url" | "file")}
                style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "0.6rem" }}
              >
                <option value="url">URL</option>
                <option value="file">File (PDF / Excel / Word)</option>
              </select>
            </label>
            {extractMode === "url" ? (
              <label className="field">
                <span>URL入力</span>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
              </label>
            ) : (
              <label className="field">
                <span>ファイル選択</span>
                <input
                  type="file"
                  accept=".pdf,.xls,.xlsx,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            <div className="actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-primary" disabled={isBusy} onClick={handleExtract}>
                解析開始
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleSave}>
                保存
              </button>
              <a className="btn btn-secondary" href="/api/data-spider/export/csv">
                CSV出力
              </a>
              <a className="btn btn-secondary" href="/api/data-spider/export/excel">
                Excel出力
              </a>
            </div>
            {draft ? (
              <div className="recipient-preview">
                <h2>取得結果</h2>
                <p>抽出件数: {draftItems.length || 1}</p>
                <p>会社名: {draft.company_name || "-"}</p>
                <p>電話番号: {draft.phone || "-"} / FAX番号: {draft.fax || "-"}</p>
                <p>メールアドレス: {draft.email || "-"}</p>
                <p>取得元URL: {draft.source_url}</p>
              </div>
            ) : null}
          </div>

          {notice ? (
            <p className={`send-notice ${notice.type === "success" ? "send-notice-success" : "send-notice-error"}`}>
              {notice.text}
            </p>
          ) : null}

          <div className="admin-panel" style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.6rem" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="検索"
                style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "0.5rem" }}
              />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as "all" | "fax" | "email" | "duplicate")}
                style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "0.5rem" }}
              >
                <option value="all">すべて</option>
                <option value="fax">FAXあり</option>
                <option value="email">Emailあり</option>
                <option value="duplicate">重複あり</option>
              </select>
              <button type="button" className="btn btn-secondary" onClick={handleDuplicateDelete}>
                重複削除
              </button>
            </div>

            <div className="actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-secondary" onClick={handleDeleteSelected}>
                削除
              </button>
               <button type="button" className="btn btn-secondary" onClick={handleDeleteAll}>
                全削除
              </button>
              <button type="button" className="btn btn-secondary" onClick={addToFax}>
                FAX送信へ追加
              </button>
              <button type="button" className="btn btn-secondary" onClick={addToGmail}>
                Gmail送信へ追加
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th />
                    <th>会社名</th>
                    <th>担当者名</th>
                    <th>電話番号</th>
                    <th>FAX番号</th>
                    <th>メールアドレス</th>
                    <th>取得日時</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((item) => (
                    <tr key={item.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                            )
                          }
                        />
                      </td>
                      <td>{item.company_name || "-"}</td>
                      <td>{item.person_name || "-"}</td>
                      <td>{item.phone || "-"}</td>
                      <td>{item.fax || "-"}</td>
                      <td>{item.email || "-"}</td>
                      <td>{new Date(item.created_at).toLocaleString("ja-JP")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
