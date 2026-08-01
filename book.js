import axios from "axios"
import fs from "fs"
import he from "he"
import { JSDOM } from "jsdom"

// const bookSlug = "slime-evolution"
// const bookSlug = "shadow-slave"
// const bookSlug = "weakest-beast-tamer-gets-all-sss-dragons"
// const bookSlug = "my-talents-name-is-generator"
const bookSlug = "global-pokemon-starting-by-snatching-an-atavistic-gyarados"
const bookTitle = "Global Pokémon: Starting by Snatching an Atavistic Gyarados"
const sourceNovelSlug = "global-elf-cut-off-the-hu-and-return-to-the-ancestral-gyarados-at-the-beginning"

const chapterSlugPrefix = "trxs7746_"
const apiUrl = "https://alpha.mtlbooks.com/api/v1/chapters/read"
const folderPath = `all-books/${bookSlug}/${bookSlug}_raw`

main()
async function main() {
    const startChapter = 1
    const endChapter = 231

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true })
    }

    const chaptersToScrape = []

    for (let i = startChapter; i <= endChapter; i++) {
        const filePath = `${folderPath}/Chapter ${i}.html`

        if (!isValidChapterFile(filePath)) {
            chaptersToScrape.push(i)
        }
    }

    if (chaptersToScrape.length === 0) {
        console.log("No chapters are missing or invalid")
        return
    }

    console.log(
        `Scraping ${chaptersToScrape.length} missing or invalid chapters: ${chaptersToScrape.join(", ")}`,
    )

    const failedChapters = []
    let nextIndex = 0
    const concurrency = 4

    async function worker() {
        while (nextIndex < chaptersToScrape.length) {
            const chapter = chaptersToScrape[nextIndex++]
            const saved = await scrapeChapter({ _chapter: chapter })

            if (!saved) {
                failedChapters.push(chapter)
            }
        }
    }

    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, chaptersToScrape.length) },
            worker,
        ),
    )

    if (failedChapters.length > 0) {
        console.error(`Failed chapters: ${failedChapters.sort((a, b) => a - b).join(", ")}`)
        process.exitCode = 1
        return
    }

    console.log(`Saved all ${chaptersToScrape.length} chapters with article content`)
}

function isValidChapterFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return false
    }

    try {
        const html = fs.readFileSync(filePath, "utf8")
        const document = new JSDOM(html).window.document
        const articleText = document.querySelector("#article")?.textContent?.trim() || ""

        return articleText.length >= 100
    } catch {
        return false
    }
}

async function scrapeChapter({ _chapter, retryIndex = 1 }) {
    const maximumAttempts = 5

    while (retryIndex <= maximumAttempts) {
        try {
            const res = await axios.post(
                apiUrl,
                {
                    novel_slug: sourceNovelSlug,
                    chapter_slug: `${chapterSlugPrefix}${_chapter}`,
                },
                {
                    headers: { "Content-Type": "application/json" },
                    timeout: 30_000,
                },
            )
            const chapter = res.data?.result?.chapter

            if (!chapter || typeof chapter.content !== "string" || chapter.content.trim().length < 100) {
                throw new Error("MTL Books returned no chapter content")
            }

            const title = `${bookTitle} - Chapter ${chapter.chapter_number}: ${chapter.chapter_title}`
            const paragraphs = chapter.content
                .trim()
                .split(/\r?\n\s*\r?\n/)
                .map(paragraph => `<p>${he.encode(paragraph.trim()).replace(/\r?\n/g, "<br>")}</p>`)
                .join("\n")
            const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${he.encode(title)}</title>
</head>
<body>
<div id="article">
${paragraphs}
</div>
</body>
</html>
`

            fs.writeFileSync(`${folderPath}/Chapter ${_chapter}.html`, html, "utf8")
            console.log(`Saved chapter ${_chapter} (${chapter.content.length} characters)`)
            return true
        } catch (err) {
            const status = err.response?.status
            console.log(
                `Retry ${retryIndex}/${maximumAttempts} for chapter ${_chapter}: ${status || err.code || err.message}`,
            )

            if (retryIndex >= maximumAttempts) {
                console.log(`Failed to scrape chapter ${_chapter} after ${maximumAttempts} attempts`)
                return false
            }

            const retryAfter = Number(err.response?.headers?.["retry-after"])
            const delay = Number.isFinite(retryAfter)
                ? retryAfter * 1000
                : Math.min(2 ** (retryIndex - 1) * 1000, 30_000)

            retryIndex++
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    return false
}
