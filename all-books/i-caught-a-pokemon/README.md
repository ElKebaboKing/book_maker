# I caught a pokemon

- Original title: 我收服了宝可梦
- Author: 侵掠如火
- Source: https://www.69shuba.com/book/53923/
- Catalog: `chapters.json` (site entries in reading order, including interludes)
- Chinese source chapters: `i-caught-a-pokemon_raw/Chapter N.html`
- Supplemental Chinese chapters: `additional-chapters.json` (from a later ixdzs8 TXT archive)
- Webnovel English translations: `i-caught-a-pokemon_translated/Chapter N.html`
- Webnovel catalog and source URLs: `webnovel-chapters.json`

The 69shuba catalog contained 1,459 entries when downloaded on 2026-09-19. All 1,459 Chinese HTML files are saved. All 150 publicly readable English chapters from [Webnovel](https://www.webnovel.com/book/35795835208280805/catalog), credited there to Yuva14, are also saved.

The [ixdzs8 TXT archive](https://ixdzs8.com/read/391632/) adds 26 later Chinese chapters as `Chapter 1460.html` through `Chapter 1485.html`. Its chapter 1450 matches the last 69shuba chapter, which 69shuba labels chapter 1451. The additions are archive chapters 1451–1476. The archive has wording differences from 69shuba, and its final chapter 1476 has no title. `additional-chapters.json` records both numbering systems and the archive hash. These files were added on 2026-09-20 without changing the original 1,459 chapters.

Webnovel omits the Chinese index's entry 92 (`上架感言`). Webnovel chapters 1–91 align with Chinese catalog positions 1–91; Webnovel chapters 92–150 align with Chinese positions 93–151. Its translation also adapts some names, including rendering 夏幽 as Ethan Vale. Keep this in mind when translating later Chinese chapters.

Download or resume all indexed entries from the repository root:

```sh
node download-69shuba.js
```

Download a specific range by catalog position:

```sh
node download-69shuba.js 1 50
```

The downloader skips files that already match the catalog and writes any failed entries to `download-failures.json`. Rerun the same command to retry them. Catalog positions may differ from chapter numbers because the source includes interludes and other entries.

Refresh or resume the Webnovel translations:

```sh
node download-webnovel.js
```

Reimport the supplemental Chinese chapters from the archive:

```sh
python3 -B import-ixdzs-supplement.py
```
