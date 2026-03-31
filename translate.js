import 'dotenv/config'
import fs from "fs"
import path from "path"
import fetch from "node-fetch"

const glossaryPath = path.join(process.cwd(), "glossary.json")
const glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf8"))

const API_KEY = process.env.GOOGLE_API_KEY
if (!API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY in .env")
}
const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview"

const dir = path.join(process.cwd(), "talent")
const outDir = path.join(process.cwd(), "talent_tl")

fs.mkdirSync(outDir, { recursive: true })

const files = fs.readdirSync(dir).filter(f => f.endsWith(".html"))

function buildGlossaryPrompt(glossary) {
    let text = "GLOSSARY (MANDATORY):\n"

    for (const category in glossary) {
        text += `\n[${category.toUpperCase()}]\n`
        for (const key in glossary[category]) {
            text += `${key} = ${glossary[category][key]}\n`
        }
    }

    return text
}

async function translateFile(file) {
    const filePath = path.join(dir, file)
    const html = fs.readFileSync(filePath, "utf8")

    const MAX_RETRIES = 20

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`Translating ${file} with ${MODEL} (attempt ${attempt}/${MAX_RETRIES})...`)

        try {
            const glossaryText = buildGlossaryPrompt(glossary)
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
                                        text: `Translate Chinese novel text into fluent natural English.

${glossaryText}

CRITICAL RULES:
- Use glossary terms EXACTLY as defined
- Do NOT invent meanings
- 巅峰 = Peak (never Supreme)
- 至强 = Supreme
- 无敌 = Invincible
- Terminology consistency is more important than stylistic variation
- Keep all HTML tags, structure, and line breaks exactly as they are
- Only translate visible Chinese text
- Do not add commentary

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
    // for (let _index = 1551; _index <= 1650; _index++) {
    try {
        let _index = 1551
        let file = `Chapter ${_index}.html`
        await translateFile(file)
    } catch (err) {
        console.error("Translation failed:", err.message)
        process.exitCode = 1
    }
}
// }

run()