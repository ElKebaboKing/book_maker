// Batch translation script for Chinese → English novel chapters
// Generates a JSONL file compatible with OpenAI Batch API

import 'dotenv/config'
import fs from "fs"
import path from "path"
import fetch from "node-fetch"
import FormData from "form-data"

// Load glossary (used to enforce consistent terminology across all chapters)
const glossaryPath = path.join(process.cwd(), "glossary.json")
const glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf8"))

// Load OpenAI API configuration
const API_KEY = process.env.OPENAI_API_KEY
if (!API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in .env")
}
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini"

// Define input/output directories and batch file path
const dir = path.join(process.cwd(), "talent")
const outDir = path.join(process.cwd(), "talent_tl")
const batchFile = path.join(process.cwd(), "openai_batch_input.jsonl")

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
- Terminology consistency is more important than stylistic variation
- Keep all HTML tags, structure, and line breaks exactly as they are
- Only translate visible Chinese text
- Do not add commentary

TERMINOLOGY LOCKS:
- 巅峰 = Peak (never Supreme)
- 至强 = Supreme
- 无敌 = Invincible
- 禁忌 = Forbidden (never Taboo)
- 域 = Domain (never Territory)
- 入门 = Entry (never Beginner)
- 圆满 = Perfected (never Consummate)
- 极限 = Limit
- 极致 = Extreme
- 阶段 = Stage
- 层次 = Tier
- 层 = Tier when referring to ranked power levels
- 石碑 = Stele (never Tablet)
- 碑 = Stele (never Tablet)
- 湮灭 = Annihilation
- 泯灭 = Annihilation
- 涅槃 = Nirvana
- 毁灭族 = Destruction Race
- 湮灭族 = Annihilation Race
- 泯灭族 = Annihilation Race
- 寂灭族 = Extinction Race

NUMBER RULE:
- Only treat numbers as levels if explicitly written as levels in the Chinese text
- Do not invent level systems from stray or corrupted numbers

OUTPUT RULES:
- Preserve chapter structure exactly
- Preserve HTML exactly
- Translate faithfully and conservatively
- When uncertain, prefer the most literal meaning that does not break English readability
- Use Stage for cultivation progression (Entry Stage, Minor Stage, Major Stage, Perfected Stage)
- Use Tier for ranked power levels (First-Tier, Second-Tier, etc.)
- Use Stele for inscription/meditation objects, not Tablet
- Do not use synonyms for locked glossary terms

${html}`
}

// Create a single batch request entry for one chapter
// Each request is independent (important for batch processing)
function buildBatchRequest(file) {
    const filePath = path.join(dir, file)
    const html = fs.readFileSync(filePath, "utf8")
    const prompt = buildPrompt(html)

    return {
        custom_id: file,
        method: "POST",
        url: "/v1/responses",
        body: {
            model: MODEL,
            input: prompt
        }
    }
}

// Main function:
// - Iterates through chapter range
// - Builds batch requests
// - Writes them into a JSONL file for OpenAI Batch API
async function run() {
    const requests = []

    for (let _index = 1554; _index <= 1600; _index++) {
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

    // Step 1: Upload batch input file to OpenAI Files API
    console.log("Uploading batch file...")

    const formData = new FormData()
    formData.append("purpose", "batch")
    formData.append("file", fs.createReadStream(batchFile))

    const uploadRes = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${API_KEY}`
        },
        body: formData
    })

    const uploadData = await uploadRes.json()

    if (!uploadRes.ok) {
        console.error("Upload failed:", uploadData)
        return
    }

    const fileId = uploadData.id
    console.log("Uploaded file ID:", fileId)

    // Step 2: Create batch
    console.log("Creating batch job...")

    const batchRes = await fetch("https://api.openai.com/v1/batches", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            input_file_id: fileId,
            endpoint: "/v1/responses",
            completion_window: "24h"
        })
    })

    const batchData = await batchRes.json()

    if (!batchRes.ok) {
        console.error("Batch creation failed:", batchData)
        return
    }

    console.log("Batch created successfully!")
    console.log("Batch ID:", batchData.id)
    console.log("Status:", batchData.status)

    // Save batch ID for later retrieval (used by fetch_results.js)
    const batchIdFile = path.join(process.cwd(), "last_batch_id.txt")
    fs.writeFileSync(batchIdFile, batchData.id, "utf8")
    console.log(`Saved batch ID to ${batchIdFile}`)
}

run()