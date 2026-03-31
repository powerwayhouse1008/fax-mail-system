export default function BusinessCardUploadPage() {
  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <h1>名刺アップロード</h1>
        <p>送信先として利用する名刺画像をアップロードしてください。</p>

        <form className="dashboard-item" style={{ marginTop: "1rem" }}>
          <label className="field" htmlFor="business-card-file">
            <span>名刺ファイル（画像/PDF）</span>
            <input id="business-card-file" type="file" accept="image/*,.pdf" />
          </label>

          <button type="button" className="btn btn-primary" style={{ width: "fit-content" }}>
            アップロード
          </button>
        </form>
      </section>
    </main>
  );
}
