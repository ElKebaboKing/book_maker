import axios from "axios"
import fs from "node:fs/promises"
import path from "node:path"

const bookId = "35795835208280805"
const bookSlug = "i-caught-a-pokemon"
const root = path.join("all-books", bookSlug)
const outputDir = path.join(root, `${bookSlug}_translated`)
const catalogPath = path.join(root, "webnovel-chapters.json")
const failuresPath = path.join(root, "webnovel-download-failures.json")
const catalogUrl = `https://www.webnovel.com/book/${bookId}/catalog`
const jinaPrefix = "https://r.jina.ai/http://www.webnovel.com"
const maxRetries = 8
const minimumStartIntervalMs = 2_000
let nextRequestAt = 0

await fs.mkdir(outputDir, { recursive: true })
const chapters = await loadCatalog()
const checks = await Promise.all(chapters.map(validSavedChapter))
const missing = chapters.filter((_, index) => !checks[index])
console.log(`Webnovel: ${chapters.length} catalog entries, ${missing.length} to download`)

let saved = 0
const failures = []
await Promise.all(missing.map(async chapter => {
    try {
        await saveChapter(chapter)
        saved++
        if (saved % 10 === 0 || saved === missing.length) console.log(`Saved ${saved}/${missing.length}`)
    } catch (error) {
        failures.push({ index: chapter.index, url: chapter.url, error: error.message })
        console.error(`Chapter ${chapter.index} failed: ${error.message}`)
    }
}))

if (failures.length) {
    await fs.writeFile(failuresPath, JSON.stringify(failures, null, 2) + "\n")
    console.error(`${failures.length} entries failed; rerun to retry them.`)
    process.exitCode = 1
} else {
    await fs.rm(failuresPath, { force: true })
    console.log(`All ${chapters.length} translated chapters are saved.`)
}

async function loadCatalog() {
    try {
        const markdown = await requestWithRetries(`${jinaPrefix}/book/${bookId}/catalog`)
        if (!markdown.includes("Markdown Content:")) throw new Error("Catalog content marker missing")
        const entries = markdown.split(/\r?\n/).filter(line => /^\d+\.\s+\[/.test(line)).map(line => {
            const index = Number(line.match(/^(\d+)\./)?.[1])
            const url = line.match(/\((https?:\/\/www\.webnovel\.com\/book\/i-caught-a-pokemon_35795835208280805\/[^\s)]+)/)?.[1]
            const title = line.match(/"([^"]+)"\)\s*$/)?.[1]
            return url && title ? { index, title, url: url.replace(/^http:/, "https:") } : null
        }).filter(Boolean)
        if (entries.length !== 150 || entries.some((entry, i) => entry.index !== i + 1) || new Set(entries.map(entry => entry.url)).size !== entries.length) {
            throw new Error(`Unexpected catalog: ${entries.length} entries`)
        }
        await fs.writeFile(catalogPath, JSON.stringify({ title: "I caught a pokemon", translator: "Yuva14", source: catalogUrl, chapters: entries }, null, 2) + "\n")
        return entries
    } catch (error) {
        try {
            const saved = JSON.parse(await fs.readFile(catalogPath, "utf8")).chapters
            console.warn(`Using saved catalog: ${error.message}`)
            return saved
        } catch {
            throw error
        }
    }
}

async function saveChapter(chapter) {
    const sourcePath = new URL(chapter.url).pathname
    const markdown = await requestWithRetries(`${jinaPrefix}${sourcePath}`)
    const returnedUrl = markdown.match(/^URL Source:\s*(\S+)/m)?.[1]?.replace(/^http:/, "https:")
    const marker = "Markdown Content:"
    const markerIndex = markdown.indexOf(marker)
    if (returnedUrl !== chapter.url || markerIndex < 0) throw new Error("Wrong chapter URL or missing content marker")

    let content = markdown.slice(markerIndex + marker.length).trim()
    const boilerplateIndex = content.search(/\nLoad failed, please \[RETRY\]/)
    if (boilerplateIndex >= 0) content = content.slice(0, boilerplateIndex).trim()
    const attributionIndex = content.indexOf("© WebNovel")
    if (attributionIndex >= 0 && attributionIndex < 600) content = content.slice(attributionIndex + "© WebNovel".length).trim()
    if (content.length < 500 || !/[A-Za-z]/.test(content) || /Unlock this chapter|Purchase this chapter|Just a moment/i.test(content)) {
        throw new Error("Chapter text missing or locked")
    }

    const blocks = content.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean)
    const paragraphs = blocks.map(block => `<p>${escapeHtml(block).replace(/\n/g, "<br>\n")}</p>`).join("\n")
    const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(chapter.title)}</title>\n</head>\n<body>\n<div id="article">\n${paragraphs}\n</div>\n</body>\n</html>\n`
    const destination = chapterPath(chapter)
    const temporary = `${destination}.tmp`
    await fs.writeFile(temporary, html, "utf8")
    await fs.rename(temporary, destination)
}

async function validSavedChapter(chapter) {
    try {
        const html = await fs.readFile(chapterPath(chapter), "utf8")
        return html.includes(`<title>${escapeHtml(chapter.title)}</title>`) && html.includes('<div id="article">') && html.length > 600
    } catch {
        return false
    }
}

function chapterPath(chapter) {
    return path.join(outputDir, `Chapter ${chapter.index}.html`)
}

async function requestWithRetries(url) {
    let lastError
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const wait = Math.max(0, nextRequestAt - Date.now())
            nextRequestAt = Math.max(nextRequestAt, Date.now()) + minimumStartIntervalMs
            if (wait) await new Promise(resolve => setTimeout(resolve, wait))
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
            if (error.response?.status === 429) nextRequestAt = Math.max(nextRequestAt, Date.now() + Math.max(wait, 30_000))
            await new Promise(resolve => setTimeout(resolve, wait + Math.random() * 5_000))
        }
    }
    throw lastError
}

function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
