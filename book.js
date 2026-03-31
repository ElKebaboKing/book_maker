import axios from "axios"
import fs from "fs"
import he from "he"
import prettier from "prettier"
import { JSDOM } from "jsdom"


main()
async function main() {

    let _id = 1146
    let i = _id
    for (let i = 2800; i <= 3166; i++) {
        await scrapeChapter({
            // _link: `https://www.fanmtl.com/novel/i-can-copy-talents_${i}.html`,
            // _link: `https://etudetranslations.com/novel/backlog-your-talent-is-mine/chapter-${i}/`,
            _link: `https://www.novel543.com/0217202057/8090_${i}.html`,
            _chapter: i,
        })
    }
}



async function scrapeChapter({ _link, _chapter, retryIndex }) {
    try {
        axios.get(_link)
            .then(async res => {
                const html = res.data

                // // Use jsdom to parse and normalize broken HTML
                // const dom = new JSDOM(html)

                // // Serialize back to clean HTML (browser-like formatting)
                // let cleanedHtml = dom.serialize()

                // // Optional: simple indentation improvement
                // cleanedHtml = cleanedHtml
                //     .replace(/></g, ">\n<")
                //     .split("\n")
                //     .map(line => line.trim())
                //     .join("\n")

                fs.writeFileSync(`talent/Chapter ${_chapter}.html`, html, "utf8")
            })
            .catch(err => async () => {
                console.log(`index ${_chapter}: ${err.code}`)
                if (retryIndex == undefined) retryIndex = 1
                if (retryIndex >= 20) return
                else {
                    retryIndex++
                    await new Promise(res => setTimeout(res, 5000))
                    return scrapeChapter({ _link: _link, _chapter: _chapter, retryIndex: retryIndex })
                }
            })
    } catch (e) {
        console.log("Failed to scrape chapter " + _chapter)
    }
}