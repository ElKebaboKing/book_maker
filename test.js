import axios from "axios"
import fs from "fs"
import { JSDOM } from "jsdom"

async function run() {
    try {
        let _index = 1920
        const url = `https://www.novel543.com/0217202057/8090_${_index}.html`

        const res = await axios.get(url)
        const html = res.data

        // Use jsdom to parse and normalize broken HTML
        // const dom = new JSDOM(html)

        // // Serialize back to clean HTML (browser-like formatting)
        // let cleanedHtml = dom.serialize()

        // // Optional: simple indentation improvement
        // cleanedHtml = cleanedHtml
        //     .replace(/></g, ">\n<")
        //     .split("\n")
        //     .map(line => line.trim())
        //     .join("\n")

        // Ensure folder exists
        fs.mkdirSync("talent", { recursive: true })

        const filePath = `talent/Chapter ${_index}.html`
        fs.writeFileSync(filePath, html, "utf8")

        console.log("Wrote cleaned HTML to:", filePath)
        console.log("cwd:", process.cwd())

    } catch (err) {
        console.error("Error:", err)
    }
}

run()