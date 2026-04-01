// Fetch Gemini Batch results and write translated chapter HTML files
// Usage:
//   GEMINI_API_KEY=... node fetch_results.js <batch_name>
// Example:
//   node fetch_results.js batches/123456789

import 'dotenv/config'
import fs from "fs"
import path from "path"
import { GoogleGenAI } from "@google/genai"

// Load Gemini API configuration
const API_KEY = process.env.GOOGLE_API_KEY
if (!API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY in .env")
}

const ai = new GoogleGenAI({ apiKey: API_KEY })

// Require a batch name as the first CLI argument
let batchId = process.argv[2]

// If no batch name is provided, try reading from last_batch_id.txt
if (!batchId) {
    const batchIdFile = path.join(process.cwd(), "last_batch_id.txt")

    if (fs.existsSync(batchIdFile)) {
        batchId = fs.readFileSync(batchIdFile, "utf8").trim()
        console.log(`Using batch name from file: ${batchId}`)
    } else {
        throw new Error("Usage: node fetch_results.js <batch_name> OR ensure last_batch_id.txt exists")
    }
}

// Define output paths
const outDir = path.join(process.cwd(), "talent_tl")
const safeBatchName = batchId.replace(/[\\/:]/g, "_")
const rawOutputFile = path.join(process.cwd(), `${safeBatchName}_output.jsonl`)

// Ensure translated output directory exists
fs.mkdirSync(outDir, { recursive: true })

// Helper: fetch batch metadata from Gemini
async function getBatch(batchId) {
    return await ai.batches.get({ name: batchId })
}

// Helper: download a Gemini file and save it locally
async function downloadFile(fileName, destination) {
    const fileContentBuffer = await ai.files.download({ file: fileName })
    fs.writeFileSync(destination, fileContentBuffer.toString("utf8"), "utf8")
}

// Helper: extract translated HTML from one Gemini batch JSONL line
function extractOutputText(parsedLine) {
    const response = parsedLine?.response
    const candidates = response?.candidates
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return null
    }

    const parts = candidates[0]?.content?.parts
    if (!Array.isArray(parts)) {
        return null
    }

    const textParts = parts
        .filter(part => typeof part?.text === "string")
        .map(part => part.text)

    if (textParts.length === 0) {
        return null
    }

    return textParts.join("")
}

// Parse JSONL result file and write each translated chapter to talent_tl/
function writeTranslatedFiles(jsonlPath) {
    const raw = fs.readFileSync(jsonlPath, "utf8")
    const lines = raw.split(/\r?\n/).filter(Boolean)

    let written = 0
    let skipped = 0

    for (const line of lines) {
        let parsed
        try {
            parsed = JSON.parse(line)
        } catch (err) {
            console.warn("Skipping invalid JSONL line:", err.message)
            skipped += 1
            continue
        }

        const key = parsed?.key
        if (!key) {
            console.warn("Skipping line with missing key")
            skipped += 1
            continue
        }

        if (parsed?.error) {
            console.warn(`Skipping ${key}: ${JSON.stringify(parsed.error)}`)
            skipped += 1
            continue
        }

        const translated = extractOutputText(parsed)
        if (!translated) {
            console.warn(`Skipping ${key}: no translated text found in Gemini batch output`)
            skipped += 1
            continue
        }

        const destination = path.join(outDir, key)
        fs.writeFileSync(destination, translated, "utf8")
        console.log(`Wrote translated file: ${destination}`)
        written += 1
    }

    console.log(`Done. Wrote ${written} files. Skipped ${skipped} lines.`)
}

async function run() {
    console.log(`Checking batch status for ${batchId}...`)
    const batch = await getBatch(batchId)

    console.log("Batch state:", batch.state)

    if (batch.state !== "JOB_STATE_SUCCEEDED") {
        if (batch.state === "JOB_STATE_FAILED") {
            console.error("Batch failed:", batch.error ? JSON.stringify(batch.error) : "Unknown error")
            return
        }

        if (batch.state === "JOB_STATE_CANCELLED" || batch.state === "JOB_STATE_EXPIRED") {
            console.error(`Batch ended with state: ${batch.state}`)
            return
        }

        console.log("Batch is not completed yet.")
        console.log("Re-run this script later with the same batch name.")
        return
    }

    if (!batch.dest?.fileName) {
        throw new Error("Batch succeeded but no destination file was returned")
    }

    console.log("Downloading output file...")
    await downloadFile(batch.dest.fileName, rawOutputFile)
    console.log(`Saved raw batch output to ${rawOutputFile}`)

    writeTranslatedFiles(rawOutputFile)
}

run().catch(err => {
    console.error("Failed to fetch batch results:", err.message)
    process.exitCode = 1
})