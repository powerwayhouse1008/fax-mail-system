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

type AthomeCompany = {
  detailUrl: string;
  companyName: string;
  tel: string;
  fax: string;
  address: string;
  websiteUrl: string;
};
const normalizePhoneLikeValue = (value: string) =>
  value
    .replace(/[^\d+()\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const uniq = (values: string[]) => [...new Set(values.filter(Boolean))];
const isLikelyLoginUrl = (url: string) => /(login|signin|auth|account\/login)/i.test(url);

const isLikelyLoginPage = (html: string) => {
  const normalized = html.toLowerCase();
  const hasPasswordField = /<input[^>]+type=["']password["']/i.test(normalized);
  const hasLoginKeyword =
    /(ログイン|サインイン|login|sign in|メールアドレス|password|パスワード)/i.test(normalized);
  return hasPasswordField && hasLoginKeyword;
};

const textOrEmpty = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";

const stripTags = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toAbsoluteAthomeUrl = (href: string) => {
  try {
    return new URL(href, "https://www.athome.co.jp").toString();
  } catch {
    return "";
  }
};

const isAthomeListUrl = (url: string) => /^https:\/\/www\.athome\.co\.jp\/estate\/.+\/list\//i.test(url);

const extractAthomeField = (text: string, labels: string[]) => {
  const stopWords = "TEL|FAX|電話番号|住所|所在地|営業時間|定休日|交通|取扱い|加盟団体|免許番号|ホームページ";
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
     const matched = text.match(
      new RegExp(`${escaped}\\s*[：:]?\\s*(.{1,120}?)(?=\\s*(?:${stopWords})\\s*[：:]|$)`, "i"),
    );
    if (matched?.[1]) return textOrEmpty(matched[1]);
  }
  return "";
};

const buildExtractedFromAthome = (item: AthomeCompany): ExtractResult => ({
  company_name: item.companyName,
  person_name: "",
  address: item.address,
  phone: normalizePhoneLikeValue(item.tel),
  fax: normalizePhoneLikeValue(item.fax),
  email: "",
  website_url: item.websiteUrl,
  source_url: item.detailUrl,
  memo: "source: athome detail page",
  title: item.companyName,
  links: [item.detailUrl, item.websiteUrl].filter(Boolean),
  extracted_at: new Date().toISOString(),
});

async function loadPlaywright(): Promise<
  | { chromium: { launch: (options: { headless: boolean }) => Promise<any> } }
  | null
> {
  try {
    const importer = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    const mod = await importer("playwright");
    if (!mod?.chromium) return null;
    return mod;
  } catch {
    return null;
  }
}

async function extractFromAthomeListing(sourceUrl: string) {
  const playwright = await loadPlaywright();
  if (!playwright) return extractFromAthomeListingWithoutPlaywright(sourceUrl);
  const browser = await playwright.chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    const detailLinks = await page.evaluate(() => {
      const hrefs = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/ahto/"]')).map((a) =>
        a.getAttribute("href") ?? "",
      );
      return Array.from(new Set(hrefs));
    });

    const normalizedDetailLinks = detailLinks
      .map(toAbsoluteAthomeUrl)
      .filter((link) => /^https:\/\/www\.athome\.co\.jp\/ahto\/[^/]+\.html/i.test(link));

    const results: ExtractResult[] = [];

    for (const detailUrl of normalizedDetailLinks) {
      const detailPage = await browser.newPage();

      try {
        await detailPage.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        const scraped = await detailPage.evaluate(() => {
          const companyName =
            document.querySelector<HTMLElement>("h1")?.innerText?.trim() ||
            document.querySelector<HTMLElement>(".shopName")?.innerText?.trim() ||
            document.title ||
            "";

          const allText = document.body?.innerText ?? "";
          const homepageAnchor = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find((a) =>
            /ホームページ/i.test(a.innerText ?? ""),
          );
         const pairs = Array.from(document.querySelectorAll<HTMLElement>("dt, th")).map((labelEl) => {
            const key = (labelEl.innerText ?? "").trim();
            const valueEl = labelEl.nextElementSibling as HTMLElement | null;
            const value = valueEl?.innerText?.trim() ?? "";
            return { key, value };
          });
          const telFromPair = pairs.find((pair) => /^(TEL|電話番号)/i.test(pair.key))?.value ?? "";
          const faxFromPair = pairs.find((pair) => /^FAX/i.test(pair.key))?.value ?? "";
          const addressFromPair = pairs.find((pair) => /^(住所|所在地)/i.test(pair.key))?.value ?? "";
          return {
            companyName,
            allText,
            websiteUrl: homepageAnchor?.href ?? "",
            telFromPair,
            faxFromPair,
            addressFromPair,
          };
        });

        results.push(
          buildExtractedFromAthome({
            detailUrl,
            companyName: textOrEmpty(scraped.companyName),
             tel: textOrEmpty(scraped.telFromPair) || extractAthomeField(scraped.allText, ["TEL", "電話番号"]),
            fax: textOrEmpty(scraped.faxFromPair) || extractAthomeField(scraped.allText, ["FAX"]),
            address: textOrEmpty(scraped.addressFromPair) || extractAthomeField(scraped.allText, ["住所", "所在地"]),
            websiteUrl: textOrEmpty(scraped.websiteUrl),
          }),
        );
      } finally {
        await detailPage.close();
      }
    }

    if (results.length === 0) {
      throw new Error("AtHomeの会社リンクを取得できませんでした。リストURLをご確認ください。");
    }

    return results;
  } finally {
    await browser.close();
  }
}
const collectAthomeDetailLinks = (html: string) => {
  const matches = Array.from(html.matchAll(/href=["']([^"']*\/ahto\/[^"']+)["']/gi)).map((m) => m[1] ?? "");
  return uniq(matches.map(toAbsoluteAthomeUrl)).filter((link) =>
    /^https:\/\/www\.athome\.co\.jp\/ahto\/[^/]+\.html/i.test(link),
  );
};

const extractAthomeDetailFromHtml = (html: string, detailUrl: string): ExtractResult => {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const allText = stripTags(html);
  const homepageMatch = html.match(
    /<a[^>]+href=["']([^"']+)["'][^>]*>\s*[^<]*ホームページ[^<]*<\/a>/i,
  );

  return buildExtractedFromAthome({
    detailUrl,
    companyName: textOrEmpty(stripTags(titleMatch?.[1] ?? "")),
    tel: extractAthomeField(allText, ["TEL", "電話番号"]),
    fax: extractAthomeField(allText, ["FAX"]),
    address: extractAthomeField(allText, ["住所", "所在地"]),
    websiteUrl: textOrEmpty(homepageMatch?.[1] ?? ""),
  });
};

async function extractFromAthomeListingWithoutPlaywright(sourceUrl: string) {
   const athomeHeaders = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "ja,en-US;q=0.9,en;q=0.8",
    referer: "https://www.athome.co.jp/",
  };

  const listRes = await fetch(sourceUrl, {
    cache: "no-store",
    headers: athomeHeaders,
  });
  if (!listRes.ok) {
    throw new Error(`AtHomeページの取得に失敗しました: ${listRes.status}`);
  }


  const listHtml = await listRes.text();
  const detailLinks = collectAthomeDetailLinks(listHtml);

  const results: ExtractResult[] = [];

  for (const detailUrl of detailLinks) {
    const detailRes = await fetch(detailUrl, {
      cache: "no-store",
      headers: athomeHeaders,
    });
    if (!detailRes.ok) continue;

    const detailHtml = await detailRes.text();
    results.push(extractAthomeDetailFromHtml(detailHtml, detailUrl));
  }

  if (results.length === 0) {
    throw new Error("AtHomeの会社リンクを取得できませんでした。リストURLをご確認ください。");
  }

  return results;
}
const toHalfWidth = (value: string) =>
  value
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");

const buildExtracted = (textInput: string, options: ExtractOptions) => {
  const normalizedInput = toHalfWidth(textInput);
  const text = normalizedInput.replace(/\s+/g, " ").trim();
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

  const faxLine =
    text
      .match(/(?:FAX|ファックス|Fax番号|FAX番号|fax)\s*[:：]?\s*([\d\-+()\s]{6,30})/i)?.[1]
      ?.trim() ?? "";
  const fax = faxLine || "";

    const address = "";

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
  if (isAthomeListUrl(sourceUrl)) {
    return extractFromAthomeListing(sourceUrl);
  }

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

    return extractManyFromTextRows(pages.join("\n"), {
      source: sourceUrl,
      title,
      links,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`対象URLの取得がタイムアウトしました（${timeoutMs / 1000}秒）。しばらくしてから再試行してください。`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
