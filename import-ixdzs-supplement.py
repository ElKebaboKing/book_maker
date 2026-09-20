#!/usr/bin/env python3
"""Append Chinese chapters after the 69shuba cutoff from the ixdzs TXT archive."""

import argparse
import hashlib
import html
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path


ARCHIVE_URL = "https://down7.ixdzs8.com/391632.zip"
ROOT = Path(__file__).resolve().parent / "all-books" / "i-caught-a-pokemon"
RAW = ROOT / "i-caught-a-pokemon_raw"
MANIFEST = ROOT / "additional-chapters.json"
ANCHOR_TITLE = "格斗大会开幕"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Use an already downloaded ZIP archive")
    args = parser.parse_args()

    if args.archive:
        archive_bytes = args.archive.read_bytes()
    else:
        request = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            archive_bytes = response.read()

    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        members = [entry for entry in archive.infolist() if not entry.is_dir()]
        if len(members) != 1:
            raise ValueError(f"Expected one TXT file, found {len(members)} archive members")
        source_text = archive.read(members[0]).decode("gb18030")

    headings = list(re.finditer(r"^第(\d+)章([^\r\n]*)\r?$", source_text, re.MULTILINE))
    anchors = [index for index, match in enumerate(headings) if match.group(2).strip() == ANCHOR_TITLE]
    if len(anchors) != 1:
        raise ValueError(f"Expected one matching cutoff chapter, found {len(anchors)}")
    anchor_index = anchors[0]
    anchor = headings[anchor_index]

    original_catalog = json.loads((ROOT / "chapters.json").read_text(encoding="utf-8"))["chapters"]
    original_last = original_catalog[-1]
    if original_last["index"] != 1459 or ANCHOR_TITLE not in original_last["title"]:
        raise ValueError("The saved 69shuba cutoff has changed; inspect chapter alignment")
    last_html = (RAW / "Chapter 1459.html").read_text(encoding="utf-8")
    last_text = html.unescape(re.sub(r"<[^>]+>", "", last_html))
    anchor_end = headings[anchor_index + 1].start()
    anchor_body = source_text[anchor.end():anchor_end].strip()
    anchor_suffix = re.sub(r"\s+", "", anchor_body)[-35:]
    if anchor_suffix not in re.sub(r"\s+", "", last_text):
        raise ValueError("The archive cutoff text does not align with 69shuba Chapter 1459")

    additions = []
    for heading_index in range(anchor_index + 1, len(headings)):
        heading = headings[heading_index]
        archive_number = int(heading.group(1))
        if archive_number != int(anchor.group(1)) + heading_index - anchor_index:
            raise ValueError(f"Nonconsecutive archive chapter at {archive_number}")
        next_start = headings[heading_index + 1].start() if heading_index + 1 < len(headings) else len(source_text)
        body = source_text[heading.end():next_start]
        body = re.split(r"^『还在连载中\.\.\.』", body, maxsplit=1, flags=re.MULTILINE)[0]
        lines = [line.strip() for line in body.splitlines() if line.strip()]
        content = "\n".join(lines)
        if len(content) < 1000:
            raise ValueError(f"Chapter {archive_number} is unexpectedly short: {len(content)} characters")

        sequence_index = original_last["index"] + heading_index - anchor_index
        source_title = heading.group(2).strip()
        title = f"第{archive_number}章" + (f" {source_title}" if source_title else "")
        article = "\n".join(f"<p>{html.escape(line, quote=True)}</p>" for line in lines)
        document = (
            '<!doctype html>\n<html lang="zh-CN">\n<head>\n'
            f'<meta charset="utf-8">\n<title>{html.escape(title, quote=True)}</title>\n'
            f'<meta name="source" content="{ARCHIVE_URL}">\n'
            f'</head>\n<body>\n<div id="article">\n{article}\n</div>\n</body>\n</html>\n'
        )
        output = RAW / f"Chapter {sequence_index}.html"
        if output.exists() and output.read_text(encoding="utf-8") != document:
            raise ValueError(f"Refusing to overwrite different content in {output}")
        additions.append({
            "index": sequence_index,
            "archiveChapterNumber": archive_number,
            "title": title,
            "sourceTitlePresent": bool(source_title),
            "file": output.name,
            "characters": len(content),
            "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
            "html": document,
        })

    if not additions:
        raise ValueError("No chapters follow the cutoff in this archive")
    for entry in additions:
        output = RAW / entry["file"]
        temporary = output.with_suffix(".html.tmp")
        temporary.write_text(entry.pop("html"), encoding="utf-8")
        temporary.replace(output)

    manifest = {
        "title": "I caught a pokemon",
        "source": ARCHIVE_URL,
        "archiveSha256": hashlib.sha256(archive_bytes).hexdigest(),
        "after69shubaIndex": original_last["index"],
        "archiveCutoffChapterNumber": int(anchor.group(1)),
        "chapters": additions,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(additions)} supplemental chapters: Chapter {additions[0]['index']}–{additions[-1]['index']}")


if __name__ == "__main__":
    main()
