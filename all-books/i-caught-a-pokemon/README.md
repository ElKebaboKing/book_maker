# I caught a pokemon

- Original title: 我收服了宝可梦
- Author: 侵掠如火
- Source: https://www.69shuba.com/book/53923/
- Catalog: `chapters.json` (site entries in reading order, including interludes)
- Chinese source chapters: `i-caught-a-pokemon_raw/Chapter N.html`
- English translations: `i-caught-a-pokemon_translated/`

The 69shuba catalog currently contains 1,459 entries. All 1,459 Chinese HTML files were downloaded on 2026-09-19. English translation has not started.

Download or resume all indexed entries from the repository root:

```sh
node download-69shuba.js
```

Download a specific range by catalog position:

```sh
node download-69shuba.js 1 50
```

The downloader skips files that already match the catalog and writes any failed entries to `download-failures.json`. Rerun the same command to retry them. Catalog positions may differ from chapter numbers because the source includes interludes and other entries.
