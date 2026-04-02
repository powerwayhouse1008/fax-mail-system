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
    accountName: "Khối Kinh Doanh",
    owner: "Nguyễn Trọng Minh",
    storageKey: `${STORAGE_PREFIX}acc-sales`,
    subAccounts: [
      {
        id: "sub-sales-01",
        employeeName: "Lê Hoàng Yến",
        email: "yen.le@company.vn",
        department: "Sales miền Nam",
      },
    ],
  },
  {
    id: "acc-ops",
    accountName: "Khối Vận Hành",
    owner: "Trần Đức Nam",
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
            <h1>Quản lý tài khoản nhân sự</h1>
            <p>
              Tạo tài khoản chính, thêm tài khoản phụ cho từng nhân viên và tách biệt vùng dữ liệu
              cho từng tài khoản.
            </p>
          </div>
          <Link href="/dashboard" className="btn btn-secondary">
            Quay lại dashboard
          </Link>
        </header>

        <div className="admin-grid">
          <article className="admin-panel">
            <h2>Tài khoản chính</h2>
            <form className="admin-form" onSubmit={handleCreateMainAccount}>
              <label className="field">
                <span>Tên tài khoản</span>
                <input name="accountName" placeholder="VD: Khối Marketing" required />
              </label>
              <label className="field">
                <span>Người phụ trách</span>
                <input name="owner" placeholder="Họ tên quản lý" required />
              </label>
              <button className="btn btn-primary" type="submit">
                Thêm tài khoản chính
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
                    <span>Owner: {account.owner}</span>
                    <small>Kho dữ liệu: {account.storageKey}</small>
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="admin-panel">
            <h2>Tài khoản phụ nhân viên</h2>
            <p>
              Tài khoản đang chọn: <strong>{selectedAccount?.accountName}</strong>
            </p>

            <form className="admin-form" onSubmit={handleAddSubAccount}>
              <label className="field">
                <span>Tên nhân viên</span>
                <input name="employeeName" placeholder="Nguyễn Văn A" required />
              </label>
              <label className="field">
                <span>Email nội bộ</span>
                <input name="email" type="email" placeholder="a.nguyen@company.vn" required />
              </label>
              <label className="field">
                <span>Phòng ban</span>
                <input name="department" placeholder="Sales/HR/CS..." />
              </label>
              <button className="btn btn-primary" type="submit">
                Thêm tài khoản phụ
              </button>
            </form>

            <div className="subaccount-table">
              {selectedAccount?.subAccounts.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Email</th>
                      <th>Phòng ban</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAccount.subAccounts.map((subAccount) => (
                      <tr key={subAccount.id}>
                        <td>{subAccount.employeeName}</td>
                        <td>{subAccount.email}</td>
                        <td>{subAccount.department || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>Chưa có tài khoản phụ cho đơn vị này.</p>
              )}
            </div>
          </article>
        </div>

        <article className="admin-panel storage-panel">
          <h2>Dữ liệu độc lập theo tài khoản</h2>
          <p>
            Nội dung bên dưới chỉ lưu cho tài khoản đang chọn. Chuyển sang tài khoản khác sẽ thấy dữ
            liệu khác hoàn toàn.
          </p>
          <label className="field">
            <span>Ghi chú riêng tư</span>
            <textarea
              rows={4}
              value={storageValue}
              onChange={(event) => setStorageValue(event.target.value)}
              placeholder="Nhập dữ liệu riêng của tài khoản hiện tại..."
            />
          </label>
          <button className="btn btn-primary" type="button" onClick={handleSaveStorage}>
            Lưu dữ liệu riêng
          </button>
        </article>
      </section>
    </main>
  );
}
