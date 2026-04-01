import 'dotenv/config'
import fs from "fs"
import path from "path"
import { GoogleGenAI } from "@google/genai"

// Load glossary (used to enforce consistent terminology across all chapters)
const glossaryPath = path.join(process.cwd(), "glossary.json")
const glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf8"))

// Load Gemini API configuration
const API_KEY = process.env.GOOGLE_API_KEY
if (!API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY in .env")
}
const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview"
const ai = new GoogleGenAI({ apiKey: API_KEY })

// Define input/output directories and Gemini batch file path
const dir = path.join(process.cwd(), "talent")
const outDir = path.join(process.cwd(), "talent_tl")
const batchFile = path.join(process.cwd(), "gemini_batch_input.jsonl")

// Ensure output directory exists (not used yet, but kept for later processing)
fs.mkdirSync(outDir, { recursive: true })

// Read available HTML chapter files
const files = fs.readdirSync(dir).filter(f => f.endsWith(".html"))

// Convert glossary JSON into a formatted prompt block for the model
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

// Build full translation prompt including glossary + strict rules + chapter HTML
function buildPrompt(html) {
    const glossaryText = buildGlossaryPrompt(glossary)

    return `Translate Chinese novel text into fluent natural English.

${glossaryText}

CRITICAL RULES:
- Use glossary terms EXACTLY as defined
- Do NOT invent meanings
- Do NOT use synonyms for glossary terms
- If a glossary term appears, always use the glossary translation verbatim
- When a title, epithet, sect name, technique name, or title-like name has a clear semantic meaning in Chinese, prefer a natural and consistent English meaning rather than transliteration, unless the glossary explicitly locks a transliteration
- Only keep transliteration for true personal names, place names, or terms the glossary explicitly preserves in transliterated form
- Terminology consistency is more important than stylistic variation
- Keep all HTML tags, structure, and line breaks exactly as they are
- Only translate visible Chinese text
- Do not add commentary

TERMINOLOGY LOCKS:
- Follow the glossary for all locked terms and do not override it
- Do not use synonyms for glossary-mapped terms
- If a full phrase exists in the glossary, prefer the full-phrase mapping over translating character by character
- Keep a term translated the same way every time once the glossary defines it

NUMBER RULE:
- Only treat numbers as levels if explicitly written as levels in the Chinese text
- Do not invent level systems from stray or corrupted numbers

OUTPUT RULES:
- Preserve chapter structure exactly
- Preserve HTML exactly
- Translate faithfully and conservatively
- When uncertain, prefer the most literal meaning that does not break English readability
- Keep true personal names and place names consistently transliterated unless the glossary explicitly says otherwise
- For meaningful titles, epithets, sect names, and title-like names, prefer one consistent English rendering rather than pinyin
- Do not alternate between multiple English renderings for the same meaningful name or title
- Example: if a title-like name means Myriad Laws, keep it as Myriad Laws consistently rather than switching between Wanfa, Myriad Laws, and Ten Thousand Laws
- Follow glossary-defined stage, tier, rank, and title terminology exactly
- Do not omit any part of a glossary-defined rank or title

${html}`
}

// Create a single batch request entry for one chapter
// Each request is independent (important for batch processing)
function buildBatchRequest(file) {
    const filePath = path.join(dir, file)
    const html = fs.readFileSync(filePath, "utf8")
    const prompt = buildPrompt(html)

    return {
        key: file,
        request: {
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                temperature: 0.2
            }
        }
    }
}

// Main function:
// - Iterates through chapter range
// - Builds Gemini batch requests
// - Writes them into a JSONL file for Gemini Batch API
async function run() {
    const requests = []

    for (let _index = 1701; _index <= 1750; _index++) {
        const file = `Chapter ${_index}.html`
        const filePath = path.join(dir, file)

        // Skip missing chapters safely
        if (!fs.existsSync(filePath)) {
            console.warn(`Skipping missing file: ${file}`)
            continue
        }

        requests.push(buildBatchRequest(file))
    }

    // Convert all requests into JSONL format (one JSON per line)
    const jsonl = requests.map(req => JSON.stringify(req)).join("\n") + "\n"

    // Save batch file to disk
    fs.writeFileSync(batchFile, jsonl, "utf8")

    console.log(`Wrote ${requests.length} batch requests to ${batchFile}`)

    // Step 1: Upload batch input file to the Gemini File API
    console.log("Uploading batch file to Gemini...")

    const uploadedFile = await ai.files.upload({
        file: batchFile,
        config: {
            displayName: path.basename(batchFile),
            mimeType: "jsonl"
        }
    })

    console.log("Uploaded file name:", uploadedFile.name)

    // Step 2: Create Gemini batch job from the uploaded input file
    console.log("Creating Gemini batch job...")

    const batchJob = await ai.batches.create({
        model: MODEL,
        src: uploadedFile.name,
        config: {
            displayName: `translation-${Date.now()}`
        }
    })

    console.log("Batch created successfully!")
    console.log("Batch name:", batchJob.name)
    console.log("State:", batchJob.state)

    // Save batch name for later retrieval (used by fetch_results.js after it is updated)
    const batchIdFile = path.join(process.cwd(), "last_batch_id.txt")
    fs.writeFileSync(batchIdFile, batchJob.name, "utf8")
    console.log(`Saved batch name to ${batchIdFile}`)
}

run()