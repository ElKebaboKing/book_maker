import 'dotenv/config'
import fs from "fs"
import path from "path"
import fetch from "node-fetch"

const API_KEY = process.env.GOOGLE_API_KEY
if (!API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY in .env")
}
const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview"

const dir = path.join(process.cwd(), "talent")
const outDir = path.join(process.cwd(), "talent_tl")

fs.mkdirSync(outDir, { recursive: true })

const files = fs.readdirSync(dir).filter(f => f.endsWith(".html"))

async function translateFile(file) {
    const filePath = path.join(dir, file)
    const html = fs.readFileSync(filePath, "utf8")

    const MAX_RETRIES = 20

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`Translating ${file} with ${MODEL} (attempt ${attempt}/${MAX_RETRIES})...`)

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    {
                                        text: `Translate Chinese novel text into fluent natural English. Keep all HTML tags, structure, and line breaks exactly as they are. Only translate visible Chinese text. Do not add commentary.
${html}`
                                    }
                                ]
                            }
                        ],
                        generationConfig: {
                            temperature: 0.2
                        }
                    })
                }
            )

            const data = await response.json()

            if (!response.ok) {
                const message = data.error?.message || `HTTP ${response.status}`
                console.warn(`Attempt ${attempt} failed: ${message}`)

                if (attempt === MAX_RETRIES) {
                    console.error("Max retries reached. Exiting...")
                    process.exit(1)
                }

                await new Promise(res => setTimeout(res, attempt * 3000))
                continue
            }

            const translated = data.candidates?.[0]?.content?.parts?.[0]?.text

            if (!translated) {
                console.warn(`Attempt ${attempt} returned empty result`)

                if (attempt === MAX_RETRIES) {
                    console.error("Max retries reached. Exiting...")
                    process.exit(1)
                }

                await new Promise(res => setTimeout(res, attempt * 3000))
                continue
            }

            fs.writeFileSync(path.join(outDir, file), translated, "utf8")
            console.log(`Done: ${file}`)
            return

        } catch (err) {
            console.warn(`Attempt ${attempt} error: ${err.message}`)

            if (attempt === MAX_RETRIES) {
                console.error("Max retries reached. Exiting...")
                process.exit(1)
            }

            await new Promise(res => setTimeout(res, attempt * 3000))
        }
    }
}

async function run() {
    for (let _index = 1452; _index <= 1550; _index++) {
        try {
            // let _index = 1451
            let file = `Chapter ${_index}.html`
            await translateFile(file)
        } catch (err) {
            console.error("Translation failed:", err.message)
            process.exitCode = 1
        }
    }
}

run()