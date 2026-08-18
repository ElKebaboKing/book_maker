import axios from "axios"
import fs from "fs"
import he from "he"
import { JSDOM } from "jsdom"

const sourceName = process.env.BOOK_SOURCE || "freewebnovel"

// let bookName = "weakest-beast-tamer-gets-all-sss-dragons"
let bookName = "slime-evolution"

const sources = {
    freewebnovel: {
        type: "freewebnovel",
        bookName: bookName,
        startChapter: 324,
        endChapter: 366,
    },
    mtlbooks: {
        type: "mtlbooks",
        bookName: "global-pokemon-starting-by-snatching-an-atavistic-gyarados",
        novelSlug: "global-elf-cut-off-the-hu-and-return-to-the-ancestral-gyarados-at-the-beginning",
        chapterSlug: chapter => `trxs7746_${chapter}`,
        startChapter: 1,
        endChapter: 231,
    },
}

const source = sources[sourceName]

if (!source) {
    throw new Error(`Unknown BOOK_SOURCE "${sourceName}". Choose one of: ${Object.keys(sources).join(", ")}`)
}

const startChapter = parseChapterArgument(process.argv[2], source.startChapter, "start")
const endChapter = parseChapterArgument(process.argv[3], source.endChapter, "end")
const folderPath = `all-books/${source.bookName}/${source.bookName}_raw`
const maxRetries = 5
const jinaMinimumDelayMs = 3_200

let freeWebNovelTransport = "direct"
let lastJinaRequestAt = 0

await main()

async function main() {
    if (startChapter > endChapter) {
        throw new Error(`Start chapter ${startChapter} cannot be greater than end chapter ${endChapter}`)
    }

    fs.mkdirSync(folderPath, { recursive: true })

    const missingChapters = []

    for (let chapter = startChapter; chapter <= endChapter; chapter++) {
        const filePath = chapterFilePath(chapter)

        if (!isValidChapterFile(filePath)) {
            missingChapters.push(chapter)
        }
    }

    if (missingChapters.length === 0) {
        console.log("No chapters are missing or invalid")
        return
    }

    console.log(`Source: ${sourceName}`)
    console.log(`Missing or invalid chapters: ${missingChapters.join(", ")}`)

    const failedChapters = []

    for (const chapter of missingChapters) {
        const saved = await scrapeChapter(chapter)

        if (!saved) {
            failedChapters.push(chapter)
        }
    }

    if (failedChapters.length > 0) {
        console.error(`Failed chapters: ${failedChapters.join(", ")}`)
        process.exitCode = 1
        return
    }

    console.log(`Saved all ${missingChapters.length} missing chapters with article content`)
}

async function scrapeChapter(chapter) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const html = await fetchChapter(chapter)

            if (!hasArticleContent(html)) {
                throw new Error("Response did not contain valid #article content")
            }

            fs.writeFileSync(chapterFilePath(chapter), html, "utf8")
            console.log(`Saved chapter ${chapter}`)
            return true
        } catch (error) {
            const status = error.response?.status
            const retryAfter = parseRetryAfter(error.response?.headers?.["retry-after"])
            const reason = status ? `HTTP ${status}` : error.code || error.message

            console.warn(`Attempt ${attempt}/${maxRetries} for chapter ${chapter}: ${reason}`)

            if (attempt === maxRetries || (status >= 400 && status < 500 && status !== 429)) {
                return false
            }

            await sleep(retryAfter ?? Math.min(2 ** attempt * 1_000, 15_000))
        }
    }

    return false
}

async function fetchChapter(chapter) {
    if (source.type === "freewebnovel") {
        return fetchFreeWebNovelChapter(chapter)
    }

    if (source.type === "mtlbooks") {
        return fetchMtlBooksChapter(chapter)
    }

    throw new Error(`Unsupported source type: ${source.type}`)
}

async function fetchFreeWebNovelChapter(chapter) {
    const chapterUrl = `https://freewebnovel.com/novel/${source.bookName}/chapter-${chapter}`

    if (freeWebNovelTransport === "direct") {
        try {
            console.log(chapterUrl)
            const response = await axios.get(chapterUrl, { timeout: 30_000 })

            if (hasArticleContent(response.data)) {
                return response.data
            }
        } catch (error) {
            if (!isCloudflareChallenge(error)) {
                throw error
            }
        }

        freeWebNovelTransport = "jina"
        console.warn("FreeWebNovel is protected by a Cloudflare browser challenge; using the text-rendering fallback")
    }

    await waitForJinaRateLimit()

    const fallbackUrl = `https://r.jina.ai/http://freewebnovel.com/novel/${source.bookName}/chapter-${chapter}`
    const response = await axios.get(fallbackUrl, {
        headers: { Accept: "text/plain" },
        timeout: 45_000,
    })

    lastJinaRequestAt = Date.now()
    return renderJinaMarkdownAsChapterHtml(response.data, chapterUrl)
}

async function fetchMtlBooksChapter(chapter) {
    const response = await axios.post(
        "https://alpha.mtlbooks.com/api/v1/chapters/read",
        {
            novel_slug: source.novelSlug,
            chapter_slug: source.chapterSlug(chapter),
        },
        { timeout: 30_000 },
    )

    const chapterResult = response.data?.result?.chapter
    const content = chapterResult?.content

    if (typeof content !== "string" || content.trim().length < 100) {
        throw new Error("MTLBooks response did not contain chapter content")
    }

    const title = chapterResult.title || `Chapter ${chapter}`
    return createChapterHtml(title, content)
}

function renderJinaMarkdownAsChapterHtml(responseText, expectedUrl) {
    if (typeof responseText !== "string") {
        throw new Error("FreeWebNovel fallback returned a non-text response")
    }

    const titleMatch = responseText.match(/^Title:\s*(.+)$/m)
    const urlMatch = responseText.match(/^URL Source:\s*(.+)$/m)
    const marker = "Markdown Content:"
    const markerIndex = responseText.indexOf(marker)

    if (!titleMatch || !urlMatch || markerIndex === -1) {
        throw new Error("FreeWebNovel fallback response was missing chapter metadata")
    }

    const returnedUrl = urlMatch[1].trim().replace(/^http:/, "https:")

    if (returnedUrl !== expectedUrl) {
        throw new Error(`FreeWebNovel fallback returned the wrong URL: ${returnedUrl}`)
    }

    const markdown = responseText.slice(markerIndex + marker.length).trim()
    const blocks = markdown.split(/\n\s*\n/).filter(Boolean)

    if (blocks.length < 2 || markdown.length < 500 || !/^#{1,6}\s+Chapter\b/m.test(markdown)) {
        throw new Error("FreeWebNovel fallback did not contain chapter text")
    }

    const content = blocks
        .map(block => {
            const headingMatch = block.match(/^#{1,6}\s+(.+)$/s)

            if (headingMatch) {
                return `<h4>${escapeHtml(headingMatch[1].trim())}</h4>`
            }

            return `<p>${escapeHtml(block.trim()).replace(/\n/g, "<br>\n")}</p>`
        })
        .join("\n")

    return createChapterHtml(titleMatch[1].trim(), content)
}

function createChapterHtml(title, content) {
    return [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '    <meta charset="utf-8">',
        `    <title>${escapeHtml(title)}</title>`,
        "</head>",
        "<body>",
        '<div id="article">',
        content.trim(),
        "</div>",
        "</body>",
        "</html>",
        "",
    ].join("\n")
}

function hasArticleContent(html) {
    if (typeof html !== "string" || /<title>\s*Just a moment\.\.\.<\/title>/i.test(html)) {
        return false
    }

    const document = new JSDOM(html).window.document
    const articleText = document.querySelector("#article")?.textContent?.trim() || ""
    return articleText.length >= 100
}

function isValidChapterFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return false
    }

    try {
        return hasArticleContent(fs.readFileSync(filePath, "utf8"))
    } catch {
        return false
    }
}

function isCloudflareChallenge(error) {
    return error.response?.status === 403 && error.response?.headers?.["cf-mitigated"] === "challenge"
}

function chapterFilePath(chapter) {
    return `${folderPath}/Chapter ${chapter}.html`
}

function parseChapterArgument(argument, defaultValue, label) {
    if (argument === undefined) {
        return defaultValue
    }

    const chapter = Number(argument)

    if (!Number.isInteger(chapter) || chapter < 1) {
        throw new Error(`Invalid ${label} chapter: ${argument}`)
    }

    return chapter
}

function parseRetryAfter(value) {
    if (value === undefined) {
        return null
    }

    const seconds = Number(value)
    return Number.isFinite(seconds) ? seconds * 1_000 : null
}

async function waitForJinaRateLimit() {
    const elapsed = Date.now() - lastJinaRequestAt
    const waitMs = jinaMinimumDelayMs - elapsed

    if (waitMs > 0) {
        await sleep(waitMs)
    }
}

function escapeHtml(value) {
    return he.encode(String(value), { useNamedReferences: true })
}

function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}
