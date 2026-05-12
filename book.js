import axios from "axios"
import fs from "fs"
import he from "he"
import prettier from "prettier"
import { JSDOM } from "jsdom"

let bookName = "weakest-beast-tamer-gets-all-sss-dragons"
// let bookName = "my-talents-name-is-generator"
const folderPath = `all-books/${bookName}/${bookName}_raw`

main()
async function main() {
    const startChapter = 963
    const endChapter = 982

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true })
    }

    const existingFiles = new Set(fs.readdirSync(folderPath))
    const missingChapters = []

    for (let i = startChapter; i <= endChapter; i++) {
        const expectedFileName = `Chapter ${i}.html`

        if (!existingFiles.has(expectedFileName)) {
            missingChapters.push(i)
        }
    }

    if (missingChapters.length === 0) {
        console.log("No chapters are missing")
        return
    }

    console.log(`Missing chapters: ${missingChapters.join(", ")}`)

    for (const chapter of missingChapters) {
        scrapeChapter({
            _link: `https://freewebnovel.com/novel/${bookName}/chapter-${chapter}`,
            _chapter: chapter,
        })
    }
}



async function scrapeChapter({ _link, _chapter, retryIndex = 1 }) {
    while (retryIndex <= 20) {
        try {
            const res = await axios.get(_link)
            const html = res.data
            fs.writeFileSync(`${folderPath}/Chapter ${_chapter}.html`, html, "utf8")
            console.log(`Saved chapter ${_chapter}`)
            return
        } catch (err) {
            console.log(`Retry ${retryIndex}/20 for chapter ${_chapter}: ${err.code || err.message}`)

            if (retryIndex >= 20) {
                console.log(`Failed to scrape chapter ${_chapter} after 20 attempts`)
                return
            }

            retryIndex++
            await new Promise(res => setTimeout(res, 5000))
        }
    }
}