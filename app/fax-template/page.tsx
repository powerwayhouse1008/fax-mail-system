type FaxTemplatePageProps = {
  searchParams?: {
    channel?: string;
  };
};

const channelLabels: Record<string, string> = {
  fax: "FAX一括送信",
  gmail: "Gmail配信",
};

export default function FaxTemplatePage({ searchParams }: FaxTemplatePageProps) {
  const channel = searchParams?.channel ?? "fax";
  const channelLabel = channelLabels[channel] ?? "FAX一括送信";

  return (
    <main className="template-shell">
      <article className="fax-sheet">
        <header className="fax-header">
          <h1>見送付状</h1>
          <div className="meta">
            <p>送信日時：26/03/31</p>
            <p>送信枚数：1 枚</p>
            <p>配信種別：{channelLabel}</p>
          </div>
        </header>

        <section className="fax-party">
          <div>
            <strong>TO:</strong> 有限会社 栄商事 御中 / ご担当者様
          </div>
          <div>
            <strong>FROM:</strong> 株式会社パワーウェイ / マイ
          </div>
        </section>

        <section className="fax-body">
          <p>貴社いよいよご清栄のこととお喜び申し上げます。</p>
          <p>さて、下記物件の内見申込をさせて頂きますので、宜しくお願いします。</p>
          <p>連絡事項：090-6659-1306</p>
        </section>

        <table className="fax-table">
          <tbody>
            <tr>
              <th>物件名 / 室</th>
              <td>杉並ハイツ 101</td>
            </tr>
            <tr>
              <th>内見希望日</th>
              <td>2025/12/02</td>
            </tr>
            <tr>
              <th>内見希望時間</th>
              <td>18 時 30 〜</td>
            </tr>
          </tbody>
        </table>

        <section className="fax-signature">
          <h2>株式会社パワーウェイ</h2>
          <p>〒101-0041 東京都千代田区神田須田町2-23-1 老崎ビル 4F</p>
          <p>TEL: 03-5207-2378 FAX: 03-5207-2768</p>
        </section>
      </article>
    </main>
  );
}
