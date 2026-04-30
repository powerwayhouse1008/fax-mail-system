"""
SUUMOの不動産情報を定型フォーマットで抽出するためのサンプル。

使い方:
    python suumo_extraction_guide.py --url "https://suumo.jp/jj/bukken/ichiran/JJ012FC001/?ar=030&bs=011"

注意:
- 取得前に必ず対象サイトの利用規約/robots.txtを確認してください。
- 高頻度アクセスは避け、適切な間隔を空けて実行してください。
- 実運用ではHTML構造変更に備え、セレクタの保守が必要です。
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import re
import time
from pathlib import Path
from typing import Iterable

import requests
from bs4 import BeautifulSoup


@dataclasses.dataclass
class PropertyRecord:
    title: str
    price_yen: int | None
    management_fee_yen: int | None
    layout: str | None
    area_m2: float | None
    address: str | None
    nearest_station: str | None
    detail_url: str


def fetch_html(url: str, timeout: int = 15) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.text


def parse_int_yen(text: str | None) -> int | None:
    if not text:
        return None
    digits = re.sub(r"[^0-9]", "", text)
    return int(digits) if digits else None


def parse_float(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)", text)
    return float(m.group(1)) if m else None


def extract_listings(list_page_html: str, base_url: str = "https://suumo.jp") -> Iterable[PropertyRecord]:
    soup = BeautifulSoup(list_page_html, "html.parser")

    # セレクタはSUUMOのDOM変更で壊れるため、必要に応じて更新してください。
    card_nodes = soup.select(".cassetteitem")

    for node in card_nodes:
        title_node = node.select_one(".cassetteitem_content-title")
        title = title_node.get_text(strip=True) if title_node else ""

        detail_link_node = node.select_one("a[href*='/chukoikkodate/']") or node.select_one("a[href]")
        detail_url = ""
        if detail_link_node and detail_link_node.has_attr("href"):
            href = detail_link_node["href"]
            detail_url = href if href.startswith("http") else f"{base_url}{href}"

        price_node = node.select_one(".cassetteitem_price--info")
        fee_node = node.select_one(".cassetteitem_price--administration")
        layout_node = node.select_one(".cassetteitem_madori")
        area_node = node.select_one(".cassetteitem_menseki")
        address_node = node.select_one(".cassetteitem_detail-col1")
        station_node = node.select_one(".cassetteitem_detail-col2")

        price_text = price_node.get_text(" ", strip=True) if price_node else ""
        fee_text = fee_node.get_text(" ", strip=True) if fee_node else ""
        layout_text = layout_node.get_text(strip=True) if layout_node else ""
        area_text = area_node.get_text(strip=True) if area_node else ""
        address_text = address_node.get_text(strip=True) if address_node else ""
        station_text = station_node.get_text(" ", strip=True) if station_node else ""

        yield PropertyRecord(
            title=title,
            price_yen=parse_int_yen(price_text),
            management_fee_yen=parse_int_yen(fee_text),
            layout=layout_text or None,
            area_m2=parse_float(area_text),
            address=address_text or None,
            nearest_station=station_text or None,
            detail_url=detail_url,
        )


def export_csv(records: Iterable[PropertyRecord], csv_path: str) -> None:
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "title",
                "price_yen",
                "management_fee_yen",
                "layout",
                "area_m2",
                "address",
                "nearest_station",
                "detail_url",
            ],
        )
        writer.writeheader()
        for r in records:
            writer.writerow(dataclasses.asdict(r))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SUUMO物件一覧ページから情報を抽出してCSV出力します。")
    parser.add_argument(
        "--url",
        default="https://suumo.jp/jj/bukken/ichiran/JJ012FC001/?ar=030&bs=011",
        help="抽出対象のSUUMO一覧ページURL",
    )
    parser.add_argument("--output", default="suumo_properties.csv", help="出力CSVパス")
    parser.add_argument("--sleep", type=float, default=2.0, help="実行後に待機する秒数")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output = Path(args.output)

    html = fetch_html(args.url)
    records = list(extract_listings(html))
    export_csv(records, str(output))
    print(f"exported: {len(records)} records -> {output.resolve()}")

    # 複数ページ巡回時はアクセス間隔を必ず設ける
    time.sleep(max(0.0, args.sleep))


if __name__ == "__main__":
    main()
