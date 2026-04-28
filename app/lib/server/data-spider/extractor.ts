export type ExtractResult = {
  company_name: string;
  person_name: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website_url: string;
  source_url: string;
  memo: string;
  title: string;
  links: string[];
  extracted_at: string;
};

const stripTags = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const uniq = (values: string[]) => [...new Set(values.filter(Boolean))];

export async function extractFromUrl(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "FaxMailSystem-DataSpider/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`対象URLの取得に失敗しました (HTTP ${response.status})`);
    }

    const html = await response.text();
    const text = stripTags(html);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";

    const emails = uniq(
      Array.from(text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)).map((m) => m[0]),
    );

    const phoneCandidates = uniq(
      Array.from(
        text.matchAll(
          /(?:\+81[-\s]?)?(?:\(?0\d{1,4}\)?[-\s]?\d{1,4}[-\s]?\d{3,4}|0\d{9,10})/g,
        ),
      )
        .map((m) => m[0].trim())
        .filter((value) => value.replace(/\D/g, "").length >= 10),
    );

    const faxLine = text.match(/FAX[:：\s]*([\d\-+()\s]{6,30})/i)?.[1]?.trim() ?? "";
    const fax = faxLine || phoneCandidates.find((item) => /fax/i.test(item)) || "";

    const address =
      text.match(/〒?\d{3}-?\d{4}[\s\S]{0,60}?(都|道|府|県)[\s\S]{0,80}?(市|区|町|村)/)?.[0]?.trim() ?? "";

    const links = uniq(
      Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi))
        .map((m) => m[1])
        .filter((href) => /^https?:\/\//i.test(href)),
    ).slice(0, 20);

    const companyName =
      title || text.match(/株式会社[^\s、。]{1,40}|有限会社[^\s、。]{1,40}|合同会社[^\s、。]{1,40}/)?.[0] || "";

    const memo = [title ? `title: ${title}` : "", links.length ? `links: ${links.length}件` : ""]
      .filter(Boolean)
      .join(" / ");

    const extracted_at = new Date().toISOString();

    return {
      company_name: companyName,
      person_name: "",
      address,
      phone: phoneCandidates[0] ?? "",
      fax,
      email: emails[0] ?? "",
      website_url: sourceUrl,
      source_url: sourceUrl,
      memo,
      title,
      links,
      extracted_at,
    } as ExtractResult;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("タイムアウトしました。しばらくしてから再試行してください。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
