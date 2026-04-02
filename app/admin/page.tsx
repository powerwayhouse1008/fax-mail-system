"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type EmployeeSubAccount = {
  id: string;
  employeeName: string;
  email: string;
  department: string;
};

type MainAccount = {
  id: string;
  accountName: string;
  owner: string;
  storageKey: string;
  subAccounts: EmployeeSubAccount[];
};

const STORAGE_PREFIX = "admin_storage_";

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const defaultAccounts: MainAccount[] = [
  {
    id: "acc-sales",
    accountName: "営業本部",
    owner: "山田 太郎",
    storageKey: `${STORAGE_PREFIX}acc-sales`,
    subAccounts: [
      {
        id: "sub-sales-01",
         employeeName: "佐藤 花子",
        email: "hanako.sato@company.jp",
        department: "南部営業",
      },
    ],
  },
  {
    id: "acc-ops",
    accountName: "運用本部",
    owner: "鈴木 一郎",
    storageKey: `${STORAGE_PREFIX}acc-ops`,
    subAccounts: [],
  },
];

export default function AdminHomePage() {
  const [accounts, setAccounts] = useState<MainAccount[]>(defaultAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState(defaultAccounts[0].id);
  const [storageValue, setStorageValue] = useState("");

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0],
    [accounts, selectedAccountId],
  );

  useEffect(() => {
    if (!selectedAccount) return;
    const savedValue = localStorage.getItem(selectedAccount.storageKey) ?? "";
    setStorageValue(savedValue);
  }, [selectedAccount]);

  const handleCreateMainAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const accountName = String(formData.get("accountName") ?? "").trim();
    const owner = String(formData.get("owner") ?? "").trim();

    if (!accountName || !owner) return;

    const id = createId();
    const nextAccount: MainAccount = {
      id,
      accountName,
      owner,
      storageKey: `${STORAGE_PREFIX}${id}`,
      subAccounts: [],
    };

    setAccounts((prev) => [...prev, nextAccount]);
    setSelectedAccountId(id);
    event.currentTarget.reset();
  };

  const handleAddSubAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAccount) return;

    const formData = new FormData(event.currentTarget);
    const employeeName = String(formData.get("employeeName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const department = String(formData.get("department") ?? "").trim();

    if (!employeeName || !email) return;

    const nextSubAccount: EmployeeSubAccount = {
      id: createId(),
      employeeName,
      email,
      department,
    };

    setAccounts((prev) =>
      prev.map((account) =>
        account.id === selectedAccount.id
          ? { ...account, subAccounts: [...account.subAccounts, nextSubAccount] }
          : account,
      ),
    );

    event.currentTarget.reset();
  };
const handleDeleteSubAccount = (subAccountId: string) => {
    if (!selectedAccount) return;

    setAccounts((prev) =>
      prev.map((account) =>
        account.id === selectedAccount.id
          ? {
              ...account,
              subAccounts: account.subAccounts.filter((subAccount) => subAccount.id !== subAccountId),
            }
          : account,
      ),
    );
  };

  const handleSaveStorage = () => {
    if (!selectedAccount) return;
    localStorage.setItem(selectedAccount.storageKey, storageValue);
  };

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <header className="admin-header">
          <div>
            <p className="badge">Admin Portal</p>
            <h1>人事アカウント管理</h1>
            <p>
              メインアカウントを作成し、従業員ごとのサブアカウントを追加して、アカウントごとにデータ領域を分離できます。
            </p>
          </div>
          <Link href="/dashboard" className="btn btn-secondary">
               ダッシュボードに戻る
          </Link>
        </header>

        <div className="admin-grid">
          <article className="admin-panel">
             <h2>メインアカウント</h2>
            <form className="admin-form" onSubmit={handleCreateMainAccount}>
              <label className="field">
                <span>アカウント名</span>
                <input name="accountName" placeholder="例: マーケティング本部" required />
              </label>
              <label className="field">
                <span>担当者</span>
                <input name="owner" placeholder="管理者名" required />
              </label>
              <button className="btn btn-primary" type="submit">
                メインアカウントを追加
              </button>
            </form>

            <ul className="account-list">
              {accounts.map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    className={`account-item ${account.id === selectedAccount?.id ? "active" : ""}`}
                    onClick={() => setSelectedAccountId(account.id)}
                  >
                    <strong>{account.accountName}</strong>
                   <span>管理者: {account.owner}</span>
                    <small>ストレージキー: {account.storageKey}</small>
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="admin-panel">
             <h2>従業員サブアカウント</h2>
            <p>
                選択中のアカウント: <strong>{selectedAccount?.accountName}</strong>
            </p>

            <form className="admin-form" onSubmit={handleAddSubAccount}>
              <label className="field">
                 <span>従業員名</span>
                <input name="employeeName" placeholder="田中 太郎" required />
              </label>
              <label className="field">
                 <span>社内メール</span>
                <input name="email" type="email" placeholder="t.tanaka@company.jp" required />
              </label>
              <label className="field">
                <span>部署</span>
                <input name="department" placeholder="営業/人事/CS..." />
              </label>
              <button className="btn btn-primary" type="submit">
               サブアカウントを追加
              </button>
            </form>

            <div className="subaccount-table">
              {selectedAccount?.subAccounts.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>従業員</th>
                      <th>Email</th>
                      <th>部署</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAccount.subAccounts.map((subAccount) => (
                      <tr key={subAccount.id}>
                        <td>{subAccount.employeeName}</td>
                        <td>{subAccount.email}</td>
                        <td>{subAccount.department || "-"}</td>
                         <td>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => handleDeleteSubAccount(subAccount.id)}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
               <p>この部門にはまだサブアカウントがありません。</p>
              )}
            </div>
          </article>
        </div>

        <article className="admin-panel storage-panel">
            <h2>アカウントごとの独立データ</h2>
          <p>
            <p>この部門にはまだサブアカウントがありません。</p>
          </p>
          <label className="field">
            <span>プライベートメモ</span>
            <textarea
              rows={4}
              value={storageValue}
              onChange={(event) => setStorageValue(event.target.value)}
              placeholder="現在のアカウント専用データを入力..."
            />
          </label>
          <button className="btn btn-primary" type="button" onClick={handleSaveStorage}>
            個別データを保存
          </button>
        </article>
      </section>
    </main>
  );
}
