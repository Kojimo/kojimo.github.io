#!/usr/bin/env python3
"""Build story reader pages from PDF files.

Exports each PDF page to JPG, generates the StPageFlip HTML reader (en + it),
syncs shared assets, and updates the homepage shelf in index.html.

Usage:
  python scripts/build-story-reader.py
      Process every PDF in en/assets/stories/ and it/assets/stories/.

  python scripts/build-story-reader.py path/to/story.pdf
      Process one or more PDFs (existing outputs are overwritten).

Story metadata (title, excerpt, shelf order) lives in scripts/stories.json.
New PDFs get placeholder shelf text you can edit later.

Requires: pip install -r scripts/requirements.txt
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = Path(__file__).with_name("stories.json")
SHARED_ASSETS = ROOT / "shared" / "assets"
SHELF_START = "<!-- STORIES_SHELF_START -->"
SHELF_END = "<!-- STORIES_SHELF_END -->"
ZOOM = 2
JPG_QUALITY = 92

DEFAULT_SHELF = {
    "en": {
        "excerpt": "Add excerpt in scripts/stories.json",
        "meta": "— · — · Italian",
    },
    "it": {
        "excerpt": "Aggiungi estratto in scripts/stories.json",
        "meta": "— · — · Italiano",
    },
}

LOCALES = {
    "en": {
        "assets_dir": ROOT / "en" / "assets",
        "stories_dir": ROOT / "en" / "stories",
        "pdf_dir": ROOT / "en" / "assets" / "stories",
        "images_dir": ROOT / "en" / "images" / "stories",
        "index_path": ROOT / "en" / "index.html",
        "stories_href": "stories",
        "i18n": {
            "lang": "en",
            "page_label": "Page",
            "of_label": "of",
            "back": "Back to stories",
            "download": "Download PDF",
            "nav_label": "Page navigation",
            "prev": "Previous page",
            "next": "Next page",
            "page_word": "page",
            "shelf_empty": "No stories yet.",
        },
    },
    "it": {
        "assets_dir": ROOT / "it" / "assets",
        "stories_dir": ROOT / "it" / "storie",
        "pdf_dir": ROOT / "it" / "assets" / "stories",
        "images_dir": ROOT / "it" / "images" / "stories",
        "index_path": ROOT / "it" / "index.html",
        "stories_href": "storie",
        "i18n": {
            "lang": "it",
            "page_label": "Pagina",
            "of_label": "di",
            "back": "Torna alle storie",
            "download": "Scarica PDF",
            "nav_label": "Navigazione pagine",
            "prev": "Pagina precedente",
            "next": "Pagina successiva",
            "page_word": "pagina",
            "shelf_empty": "Nessuna storia disponibile.",
        },
    },
}

SHARED_FILES = (
    ("css/library.css", "css/library.css"),
    ("js/story-reader.js", "js/story-reader.js"),
    ("js/lang-switcher.js", "js/lang-switcher.js"),
    ("js/page-flip.browser.min.js", "js/page-flip.browser.min.js"),
)


def load_story_config() -> dict[str, dict]:
    if not CONFIG_PATH.exists():
        return {}
    with CONFIG_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def save_story_config(config: dict[str, dict]) -> None:
    with CONFIG_PATH.open("w", encoding="utf-8") as handle:
        json.dump(config, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def slug_from_pdf(path: Path) -> str:
    return path.stem


def title_from_pdf(pdf_path: Path) -> str:
    try:
        with fitz.open(pdf_path) as doc:
            meta_title = (doc.metadata or {}).get("title", "").strip()
            if meta_title:
                return meta_title
    except Exception:
        pass
    return slug_from_pdf(pdf_path).replace("-", " ").strip()


def title_for_slug(slug: str, pdf_path: Path, config: dict[str, dict]) -> str:
    if slug in config and config[slug].get("title"):
        return config[slug]["title"]
    return title_from_pdf(pdf_path)


def next_story_order(config: dict[str, dict]) -> int:
    orders = [story.get("order", 0) for story in config.values() if isinstance(story, dict)]
    return max(orders, default=0) + 1


def ensure_story_config(slug: str, pdf_path: Path, config: dict[str, dict]) -> dict:
    story = config.setdefault(slug, {})
    if not story.get("title"):
        story["title"] = title_from_pdf(pdf_path)
    story.setdefault("order", next_story_order({k: v for k, v in config.items() if k != slug}))

    shelf = story.setdefault("shelf", {})
    for locale, defaults in DEFAULT_SHELF.items():
        locale_shelf = shelf.setdefault(locale, {})
        locale_shelf.setdefault("excerpt", defaults["excerpt"])
        locale_shelf.setdefault("meta", defaults["meta"])

    return story


def discover_pdfs(inputs: list[Path]) -> dict[str, Path]:
    """Map slug -> source PDF path."""
    if inputs:
        pdfs: dict[str, Path] = {}
        for path in inputs:
            resolved = path.resolve()
            if not resolved.is_file():
                raise FileNotFoundError(f"PDF not found: {path}")
            if resolved.suffix.lower() != ".pdf":
                raise ValueError(f"Not a PDF file: {path}")
            pdfs[slug_from_pdf(resolved)] = resolved
        return pdfs

    discovered: dict[str, Path] = {}
    for locale in LOCALES:
        pdf_dir = LOCALES[locale]["pdf_dir"]
        if not pdf_dir.is_dir():
            continue
        for pdf_path in sorted(pdf_dir.glob("*.pdf")):
            discovered.setdefault(slug_from_pdf(pdf_path), pdf_path.resolve())
    return discovered


def slugs_with_pdf() -> list[str]:
    pdf_dir = LOCALES["en"]["pdf_dir"]
    if not pdf_dir.is_dir():
        return []
    return sorted(path.stem for path in pdf_dir.glob("*.pdf"))


def sync_pdf_to_locales(slug: str, source_pdf: Path) -> None:
    """Copy the source PDF into en/ and it/ assets (overwrite if present)."""
    source_pdf = source_pdf.resolve()
    for locale in LOCALES:
        target = (LOCALES[locale]["pdf_dir"] / f"{slug}.pdf").resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        if source_pdf != target:
            shutil.copy2(source_pdf, target)


def sync_shared_assets() -> None:
    """Copy shared CSS/JS into each locale assets folder."""
    for locale, locale_cfg in LOCALES.items():
        assets_dir = locale_cfg["assets_dir"]
        for source_rel, target_rel in SHARED_FILES:
            source = SHARED_ASSETS / source_rel
            target = assets_dir / target_rel
            if not source.is_file():
                raise FileNotFoundError(f"Missing shared asset: {source.relative_to(ROOT)}")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        print(f"  {assets_dir.relative_to(ROOT)} assets synced")


def export_pages(slug: str, pdf_path: Path, images_dir: Path) -> int:
    out_dir = images_dir / slug
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    with fitz.open(pdf_path) as doc:
        matrix = fitz.Matrix(ZOOM, ZOOM)
        for index in range(doc.page_count):
            pixmap = doc.load_page(index).get_pixmap(matrix=matrix, alpha=False)
            pixmap.save(out_dir / f"page-{index + 1:02d}.jpg", jpg_quality=JPG_QUALITY)
        return doc.page_count


def mirror_story_images(slug: str, source_dir: Path, target_dir: Path) -> None:
    source = source_dir / slug
    target = target_dir / slug
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)


def page_markup(slug: str, title: str, page_number: int, page_word: str, hard: bool) -> str:
    density = ' data-density="hard"' if hard else ""
    alt = html.escape(f"{title} — {page_word} {page_number}")
    src = f"../images/stories/{slug}/page-{page_number:02d}.jpg"
    return (
        f'\t\t\t\t<div class="page page-sheet"{density}>\n'
        f'\t\t\t\t\t<img src="{src}" alt="{alt}" />\n'
        f"\t\t\t\t</div>"
    )


def book_markup(slug: str, title: str, page_count: int, page_word: str) -> str:
    return "\n".join(
        page_markup(slug, title, number, page_word, number == 1 or number == page_count)
        for number in range(1, page_count + 1)
    )


def reader_html(slug: str, title: str, pdf_name: str, locale: str, page_count: int) -> str:
    t = LOCALES[locale]["i18n"]
    book = book_markup(slug, title, page_count, t["page_word"])
    safe_title = html.escape(title)

    return f"""<!DOCTYPE HTML>
<html lang="{t["lang"]}">
<head>
\t<title>{safe_title} — Cosimo &quot;Kojimo&quot; Riondino</title>
\t<meta charset="utf-8" />
\t<meta name="viewport" content="width=device-width, initial-scale=1" />
\t<link rel="stylesheet" href="../assets/css/library.css" />
\t<link rel="icon" href="../favicon.ico" sizes="any" />
\t<link rel="icon" type="image/png" sizes="32x32" href="../images/favicon-32.png" />
</head>
<body class="story-reader-page">
\t<header class="story-reader-toolbar">
\t\t<h1>{safe_title}</h1>
\t\t<div class="story-reader-toolbar-actions">
\t\t\t<span class="story-reader-page-indicator">{t["page_label"]} <span class="page-current">1</span> {t["of_label"]} <span class="page-total">—</span></span>
\t\t\t<a href="../index.html#stories">&larr; {html.escape(t["back"])}</a>
\t\t\t<a class="btn-download" href="../assets/stories/{pdf_name}" download>{html.escape(t["download"])}</a>
\t\t</div>
\t</header>

\t<main class="story-reader-stage">
\t\t<div class="story-reader-book-wrap">
\t\t\t<div id="book">
{book}
\t\t\t</div>
\t\t</div>
\t\t<nav class="story-reader-nav" aria-label="{html.escape(t["nav_label"])}">
\t\t\t<button type="button" class="btn-prev" aria-label="{html.escape(t["prev"])}">&lsaquo;</button>
\t\t\t<button type="button" class="btn-next" aria-label="{html.escape(t["next"])}">&rsaquo;</button>
\t\t</nav>
\t</main>

\t<script src="../assets/js/page-flip.browser.min.js"></script>
\t<script src="../assets/js/story-reader.js"></script>
</body>
</html>
"""


def shelf_base_indent(index_path: Path) -> str:
    for line in index_path.read_text(encoding="utf-8").splitlines():
        if SHELF_START in line:
            return line[: line.index(SHELF_START)]
    raise RuntimeError(
        f"Missing {SHELF_START} marker in {index_path.relative_to(ROOT)}"
    )


def shelf_column_class(index: int, total: int) -> str:
    """4 cards per row (3u); $ marks last column in a row."""
    position_in_row = index % 4
    is_last_in_row = position_in_row == 3 or index == total - 1
    if is_last_in_row:
        return "3u$ 12u$(mobile)"
    return "3u 12u$(mobile)"


def shelf_book_markup(
    slug: str,
    story: dict,
    locale: str,
    indent: str,
    index: int,
    total: int,
) -> str:
    locale_cfg = LOCALES[locale]
    tab = indent + "\t"
    title = story["title"]
    shelf = story.get("shelf", {}).get(locale, DEFAULT_SHELF[locale])
    excerpt = shelf.get("excerpt", DEFAULT_SHELF[locale]["excerpt"])
    meta = shelf.get("meta", DEFAULT_SHELF[locale]["meta"])
    href = f'{locale_cfg["stories_href"]}/{slug}.html'
    col_class = shelf_column_class(index, total)
    safe_title = html.escape(title)
    safe_excerpt = html.escape(excerpt)
    safe_meta = html.escape(meta)

    return (
        f'{indent}<div class="{col_class}">\n'
        f'{tab}<article class="item story-item">\n'
        f'{tab}\t<a href="{href}" class="image fit story-cover">\n'
        f'{tab}\t\t<img src="images/stories/{slug}/page-01.jpg" alt="{safe_title}" />\n'
        f"{tab}\t</a>\n"
        f'{tab}\t<header>\n'
        f'{tab}\t\t<h3>{safe_title}</h3>\n'
        f'{tab}\t\t<p class="story-excerpt">{safe_excerpt}</p>\n'
        f'{tab}\t\t<p class="story-meta">{safe_meta}</p>\n'
        f"{tab}\t</header>\n"
        f'{tab}</article>\n'
        f"{indent}</div>"
    )


def shelf_markup(config: dict[str, dict], locale: str) -> str:
    index_path = LOCALES[locale]["index_path"]
    indent = shelf_base_indent(index_path)
    books_indent = indent + "\t"
    available = slugs_with_pdf()
    stories = [
        (config[slug].get("order", 999), slug, config[slug])
        for slug in available
        if slug in config
    ]
    stories.sort(key=lambda item: (item[0], item[1]))

    if not stories:
        empty = html.escape(LOCALES[locale]["i18n"]["shelf_empty"])
        return (
            f"{SHELF_START}\n"
            f'{indent}<p class="story-shelf-empty">{empty}</p>\n'
            f"{indent}{SHELF_END}"
        )

    total = len(stories)
    books = "\n".join(
        shelf_book_markup(slug, story, locale, books_indent, index, total)
        for index, (_, slug, story) in enumerate(stories)
    )
    return (
        f"{SHELF_START}\n"
        f"{books}\n"
        f"{indent}{SHELF_END}"
    )


def update_homepage_shelf(locale: str, config: dict[str, dict]) -> None:
    index_path = LOCALES[locale]["index_path"]
    content = index_path.read_text(encoding="utf-8")
    replacement = shelf_markup(config, locale)

    pattern = re.compile(
        re.escape(SHELF_START) + r".*?" + re.escape(SHELF_END),
        re.DOTALL,
    )
    if not pattern.search(content):
        raise RuntimeError(
            f"Missing {SHELF_START} / {SHELF_END} markers in {index_path.relative_to(ROOT)}"
        )

    index_path.write_text(pattern.sub(replacement, content, count=1), encoding="utf-8")
    print(f"  {index_path.relative_to(ROOT)} shelf updated")


def build_story(slug: str, source_pdf: Path, config: dict[str, dict]) -> None:
    ensure_story_config(slug, source_pdf, config)
    sync_pdf_to_locales(slug, source_pdf)
    title = title_for_slug(slug, source_pdf, config)
    pdf_name = f"{slug}.pdf"
    pdf_path = LOCALES["en"]["pdf_dir"] / pdf_name

    page_count = export_pages(slug, pdf_path, LOCALES["en"]["images_dir"])
    mirror_story_images(slug, LOCALES["en"]["images_dir"], LOCALES["it"]["images_dir"])

    for locale, locale_cfg in LOCALES.items():
        reader_path = locale_cfg["stories_dir"] / f"{slug}.html"
        reader_path.parent.mkdir(parents=True, exist_ok=True)
        reader_path.write_text(
            reader_html(slug, title, pdf_name, locale, page_count),
            encoding="utf-8",
        )
        print(f"  {reader_path.relative_to(ROOT)} ({page_count} pages)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export PDF pages to JPG and generate story reader HTML (en + it).",
    )
    parser.add_argument(
        "pdfs",
        nargs="*",
        type=Path,
        help="PDF file(s) to process. If omitted, all PDFs in assets/stories are processed.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_story_config()

    try:
        pdfs = discover_pdfs(args.pdfs)
    except (FileNotFoundError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1

    if not pdfs:
        print("No PDF files found.", file=sys.stderr)
        return 1

    print("shared assets:")
    try:
        sync_shared_assets()
    except FileNotFoundError as error:
        print(error, file=sys.stderr)
        return 1

    for slug, source_pdf in sorted(pdfs.items()):
        print(f"{slug}:")
        build_story(slug, source_pdf, config)

    save_story_config(config)

    print("homepage:")
    for locale in LOCALES:
        update_homepage_shelf(locale, config)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
