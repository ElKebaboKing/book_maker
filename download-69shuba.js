import axios from "axios"
import fs from "node:fs/promises"
import path from "node:path"

const bookId = "53923"
const bookSlug = "i-caught-a-pokemon"
const bookTitle = "I caught a pokemon"
const bookDir = path.join("all-books", bookSlug)
const rawDir = path.join(bookDir, `${bookSlug}_raw`)
const manifestPath = path.join(bookDir, "chapters.json")
const sourceIndex = `https://www.69shuba.com/book/${bookId}/`
const jinaBase = "https://r.jina.ai/http://www.69shuba.com"
const maxRetries = 8

let completed = 0

const [start, end] = process.argv.slice(2).map(value => value === undefined ? undefined : Number(value))
if ((start !== undefined && (!Number.isInteger(start) || start < 1)) ||
    (end !== undefined && (!Number.isInteger(end) || end < 1)) ||
    (start !== undefined && end !== undefined && start > end)) {
    throw new Error("Usage: node download-69shuba.js [start-index [end-index]]")
}

await fs.mkdir(rawDir, { recursive: true })
await fs.mkdir(path.join(bookDir, `${bookSlug}_translated`), { recursive: true })
const chapters = await getCatalog()
const selected = chapters.filter(chapter => chapter.index >= (start ?? 1) && chapter.index <= (end ?? chapters.length))
const validity = await Promise.all(selected.map(validSavedChapter))
const missing = selected.filter((_, index) => !validity[index])

console.log(`${bookTitle}: ${chapters.length} indexed entries, ${missing.length} to download`)
const failures = []
const downloads = missing.map(async chapter => {
    try {
        await saveChapter(chapter)
        completed++
        if (completed % 25 === 0 || completed === missing.length) {
            console.log(`Saved ${completed}/${missing.length}; latest: Chapter ${chapter.index}`)
        }
    } catch (error) {
        failures.push({ index: chapter.index, url: chapter.url, error: error.message })
        console.error(`Chapter ${chapter.index} failed: ${error.message}`)
    }
})
await Promise.all(downloads)

if (failures.length) {
    await fs.writeFile(path.join(bookDir, "download-failures.json"), JSON.stringify(failures, null, 2) + "\n")
    process.exitCode = 1
    console.error(`${failures.length} entries failed; rerun this command to retry them.`)
} else {
    await fs.rm(path.join(bookDir, "download-failures.json"), { force: true })
    console.log(`All ${selected.length} selected entries are saved.`)
}

async function getCatalog() {
    let chapters
    try {
        const markdown = await requestWithRetries(`${jinaBase}/book/${bookId}/`)
        const matches = [...markdown.matchAll(/^\*\s+\[([^\]]+)\]\((https?:\/\/www\.69shuba\.com\/txt\/53923\/\d+)\)\s*$/gm)]
        const entries = matches.map(match => ({ title: match[1], url: match[2] }))
        const unique = new Set(entries.map(entry => entry.url))
        if (entries.length < 1000 || unique.size !== entries.length) {
            throw new Error(`Catalog contained ${entries.length} links, ${unique.size} unique`)
        }
        const firstOrdinal = Number(entries[0].title.match(/^(\d+)\./)?.[1])
        const lastOrdinal = Number(entries.at(-1).title.match(/^(\d+)\./)?.[1])
        if (!Number.isFinite(firstOrdinal) || !Number.isFinite(lastOrdinal) || firstOrdinal === lastOrdinal) {
            throw new Error("Cannot determine catalog order")
        }
        if (firstOrdinal > lastOrdinal) entries.reverse()
        chapters = entries.map((entry, index) => ({ index: index + 1, ...entry }))
        await fs.writeFile(manifestPath, JSON.stringify({ title: bookTitle, originalTitle: "我收服了宝可梦", source: sourceIndex, chapters }, null, 2) + "\n")
    } catch (error) {
        try {
            chapters = JSON.parse(await fs.readFile(manifestPath, "utf8")).chapters
            console.warn(`Using saved catalog: ${error.message}`)
        } catch {
            throw error
        }
    }
    return chapters
}

async function saveChapter(chapter) {
    const url = `${jinaBase}/txt/${bookId}/${chapter.url.split("/").at(-1)}`
    const markdown = await requestWithRetries(url)
    const sourceUrl = markdown.match(/^URL Source:\s*(\S+)/m)?.[1]?.replace(/^http:/, "https:")
    const marker = "Markdown Content:"
    const markerIndex = markdown.indexOf(marker)
    if (sourceUrl !== chapter.url || markerIndex < 0) throw new Error("Response source URL or content marker did not match")

    let content = markdown.slice(markerIndex + marker.length).trim()
    content = content.replace(/^\d{4}-\d{2}-\d{2}\s+作者：[^\n]*\n+/, "").trim()
    if (content.length < 300 || !/[\u3400-\u9fff]/.test(content) || /Just a moment|Cloudflare challenge/i.test(content)) {
        throw new Error("Response did not contain a complete chapter")
    }
    const paragraphs = content.split(/\n\s*\n/).map(block => block.trim().replace(/\s{2,}\n\s*/g, "\n")).filter(Boolean)
    const article = paragraphs.map(block => `<p>${escapeHtml(block).replace(/\n/g, "<br>\n")}</p>`).join("\n")
    const html = `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(chapter.title)}</title>\n</head>\n<body>\n<div id="article">\n${article}\n</div>\n</body>\n</html>\n`
    const destination = chapterPath(chapter)
    const temporary = `${destination}.tmp`
    await fs.writeFile(temporary, html, "utf8")
    await fs.rename(temporary, destination)
}

async function validSavedChapter(chapter) {
    try {
        const html = await fs.readFile(chapterPath(chapter), "utf8")
        return html.includes('<div id="article">') && html.includes(`<title>${escapeHtml(chapter.title)}</title>`) && html.length > 500
    } catch {
        return false
    }
}

function chapterPath(chapter) {
    return path.join(rawDir, `Chapter ${chapter.index}.html`)
}

async function requestWithRetries(url) {
    let lastError
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.get(url, { timeout: 60_000, headers: { Accept: "text/plain" } })
            if (typeof response.data !== "string") throw new Error("Non-text response")
            return response.data
        } catch (error) {
            lastError = error
            if (attempt === maxRetries) break
            const retryAfter = Number(error.response?.headers?.["retry-after"])
            const wait = error.response?.status === 429 && Number.isFinite(retryAfter)
                ? retryAfter * 1000
                : Math.min(2 ** attempt * 1000, 60_000)
            await new Promise(resolve => setTimeout(resolve, wait + Math.random() * 5_000))
        }
    }
    throw lastError
}

function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
