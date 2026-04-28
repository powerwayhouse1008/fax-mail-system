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
type ExtractOptions = { source: string; title?: string; links?: string[] };
const uniq = (values: string[]) => [...new Set(values.filter(Boolean))];
const isLikelyLoginUrl = (url: string) => /(login|signin|auth|account\/login)/i.test(url);

const isLikelyLoginPage = (html: string) => {
  const normalized = html.toLowerCase();
  const hasPasswordField = /<input[^>]+type=["']password["']/i.test(normalized);
  const hasLoginKeyword =
    /(ログイン|サインイン|login|sign in|メールアドレス|password|パスワード)/i.test(normalized);
  return hasPasswordField && hasLoginKeyword;
};
const stripTags = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildExtracted = (textInput: string, options: ExtractOptions) => {
  const text = textInput.replace(/\s+/g, " ").trim();
  const title = options.title?.trim() ?? "";
  const links = uniq((options.links ?? []).filter((href) => /^https?:\/\//i.test(href))).slice(0, 20);

  const emails = uniq(
    Array.from(text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)).map((m) => m[0]),
  );

  const phoneCandidates = uniq(
    Array.from(
      text.matchAll(/(?:\+81[-\s]?)?(?:\(?0\d{1,4}\)?[-\s]?\d{1,4}[-\s]?\d{3,4}|0\d{9,10})/g),
    )
      .map((m) => m[0].trim())
      .filter((value) => value.replace(/\D/g, "").length >= 10),
  );

  const faxLine = text.match(/FAX[:：\s]*([\d\-+()\s]{6,30})/i)?.[1]?.trim() ?? "";
  const fax = faxLine || phoneCandidates.find((item) => /fax/i.test(item)) || "";

  const address =
    text.match(/〒?\d{3}-?\d{4}[\s\S]{0,60}?(都|道|府|県)[\s\S]{0,80}?(市|区|町|村)/)?.[0]?.trim() ?? "";

  const companyName =
    title || text.match(/株式会社[^\s、。]{1,40}|有限会社[^\s、。]{1,40}|合同会社[^\s、。]{1,40}/)?.[0] || "";

  const memo = [title ? `title: ${title}` : "", links.length ? `links: ${links.length}件` : ""]
    .filter(Boolean)
    .join(" / ");

  return {
    company_name: companyName,
    person_name: "",
    address,
    phone: phoneCandidates[0] ?? "",
    fax,
    email: emails[0] ?? "",
    website_url: options.source,
    source_url: options.source,
    memo,
    title,
    links,
    extracted_at: new Date().toISOString(),
  } as ExtractResult;
  };

const hasContactValue = (item: ExtractResult) =>
  [item.company_name, item.phone, item.fax, item.email, item.address].some((value) => value.trim().length > 0);

export function extractFromText(textInput: string, options: ExtractOptions) {
  return buildExtracted(textInput, options);
}

export function extractManyFromTextRows(textInput: string, options: ExtractOptions) {
  const rows = textInput
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  const results: ExtractResult[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const extracted = buildExtracted(row, options);
    if (!hasContactValue(extracted)) return;

    const signature = [extracted.company_name, extracted.phone, extracted.fax, extracted.email].join("|");
    if (!signature.replace(/\|/g, "").trim()) return;
    if (seen.has(signature)) return;
    seen.add(signature);
    extracted.memo = [extracted.memo, `row: ${index + 1}`].filter(Boolean).join(" / ");
    results.push(extracted);
  });

  if (results.length > 0) {
    return results;
  }

  return [buildExtracted(textInput, options)];
}
export async function extractFromUrl(sourceUrl: string) {
  const controller = new AbortController();
  const timeoutMs = 12_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "対象URLは認証が必要です（HTTP 401）。公開ページのURLをご指定いただくか、ログイン不要なページをご利用ください。",
        );
      }
      if (response.status === 403) {
        throw new Error(
          "対象URLへのアクセスが拒否されました（HTTP 403）。対象サイトが自動取得を制限している可能性があります。ブラウザで開けるURLか、ログインが必要なページでないかをご確認ください。",
        );
      }
      throw new Error(`対象URLの取得に失敗しました (HTTP ${response.status})`);
    }

    const html = await response.text();
      if ((response.redirected && isLikelyLoginUrl(response.url)) || isLikelyLoginPage(html)) {
      throw new Error(
        "対象URLはログインが必要なページの可能性があります。公開ページのURLをご指定いただくか、ログイン不要なページをご利用ください。",
      );
    }
   
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";

    const links = uniq(
      Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi))
        .map((m) => m[1])
        .filter((href) => /^https?:\/\//i.test(href)),
    );

  const baseUrl = new URL(sourceUrl);
    const candidateLinks = uniq(
      Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi))
        .map((m) => m[1])
        .map((href) => {
          try {
            return new URL(href, baseUrl).toString();
          } catch {
            return "";
          }
        })
        .filter((href) => href.startsWith(`${baseUrl.protocol}//${baseUrl.host}`)),
    ).slice(0, 6);

    const pages: string[] = [stripTags(html)];
    for (const link of candidateLinks) {
      try {
        const pageResponse = await fetch(link, {
          headers: { Accept: "text/html,application/xhtml+xml" },
          signal: controller.signal,
        });
        if (!pageResponse.ok) continue;
        pages.push(stripTags(await pageResponse.text()));
      } catch {
        continue;
      }
    }

    const extractedList = extractManyFromTextRows(pages.join("\n"), {
      source: sourceUrl,
      title,
      links,
      });

    return extractedList;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
     throw new Error(
        `対象URLの取得がタイムアウトしました（${timeoutMs / 1000}秒）。しばらくしてから再試行してください。`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
