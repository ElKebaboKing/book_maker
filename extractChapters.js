import fs from "fs"
import path from "path"
import * as cheerio from "cheerio"

const folder = path.join(process.cwd(), "talent")

const files = fs
    .readdirSync(folder)
    .filter(file => file.endsWith(".html"))

for (const file of files) {
    const filePath = path.join(folder, file)
    const html = fs.readFileSync(filePath, "utf8")
    const $ = cheerio.load(html)

    const chapter = $('div.chapter-content.px-3').first()

    if (!chapter.length) {
        console.log(`Skipped ${file}: chapter-content not found`)
        continue
    }

    chapter.find("script").remove()
    chapter.find(".gadBlock").remove()
    chapter.find(".adBlock").remove()

    const cleanedHtml = $.html(chapter)

    fs.writeFileSync(filePath, cleanedHtml, "utf8")
    console.log(`Cleaned ${file}`)
}