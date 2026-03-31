type FaxTemplatePageProps = {
  searchParams?: {
    channel?: string;
  };
};
type FaxTemplateContent = {
  to: string;
  from: string;
  greeting: string;
  request: string;
  contact: string;
  propertyName: string;
  preferredDate: string;
  preferredTime: string;
  companyName: string;
  address: string;
  phoneAndFax: string;
};

const channelLabels: Record<string, string> = {
  fax: "FAX一括送信",
  gmail: "Gmail配信",
};
const faxTemplateContent: FaxTemplateContent = {
  to: "有限会社 栄商事 御中 / ご担当者様",
  from: "株式会社パワーウェイ / マイ",
  greeting: "貴社いよいよご清栄のこととお喜び申し上げます。",
  request: "さて、下記物件の内見申込をさせて頂きますので、宜しくお願いします。",
  contact: "090-6659-1306",
  propertyName: "杉並ハイツ 101",
  preferredDate: "2025/12/02",
  preferredTime: "18 時 30 〜",
  companyName: "株式会社パワーウェイ",
  address: "〒101-0041 東京都千代田区神田須田町2-23-1 老崎ビル 4F",
  phoneAndFax: "TEL: 03-5207-2378 FAX: 03-5207-2768",
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
           <strong>TO:</strong> {faxTemplateContent.to}
          </div>
          <div>
            <strong>FROM:</strong> {faxTemplateContent.from}
          </div>
        </section>

        <section className="fax-body">
          <p>{faxTemplateContent.greeting}</p>
          <p>{faxTemplateContent.request}</p>
          <p>連絡事項：{faxTemplateContent.contact}</p>
        </section>

        <table className="fax-table">
          <tbody>
            <tr>
              <th>物件名 / 室</th>
               <td>{faxTemplateContent.propertyName}</td>
            </tr>
            <tr>
              <th>内見希望日</th>
              <td>{faxTemplateContent.preferredDate}</td>
            </tr>
            <tr>
              <th>内見希望時間</th>
              <td>{faxTemplateContent.preferredTime}</td>
            </tr>
          </tbody>
        </table>

        <section className="fax-signature">
          <h2>{faxTemplateContent.companyName}</h2>
          <p>{faxTemplateContent.address}</p>
          <p>{faxTemplateContent.phoneAndFax}</p>
        </section>
      </article>
    </main>
  );
}
