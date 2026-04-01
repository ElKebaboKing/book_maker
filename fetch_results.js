// Fetch OpenAI Batch results and write translated chapter HTML files
// Usage:
//   OPENAI_API_KEY=... node fetch_results.js <batch_id>
// Example:
//   node fetch_results.js batch_abc123

import 'dotenv/config'
import fs from "fs"
import path from "path"
import fetch from "node-fetch"

// Load OpenAI API configuration
const API_KEY = process.env.OPENAI_API_KEY
if (!API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in .env")
}

// Require a batch ID as the first CLI argument
let batchId = process.argv[2]

// If no batch ID is provided, try reading from last_batch_id.txt
if (!batchId) {
    const batchIdFile = path.join(process.cwd(), "last_batch_id.txt")

    if (fs.existsSync(batchIdFile)) {
        batchId = fs.readFileSync(batchIdFile, "utf8").trim()
        console.log(`Using batch ID from file: ${batchId}`)
    } else {
        throw new Error("Usage: node fetch_results.js <batch_id> OR ensure last_batch_id.txt exists")
    }
}

// Define output paths
const outDir = path.join(process.cwd(), "talent_tl")
const rawOutputFile = path.join(process.cwd(), `${batchId}_output.jsonl`)
const rawErrorFile = path.join(process.cwd(), `${batchId}_error.jsonl`)

// Ensure translated output directory exists
fs.mkdirSync(outDir, { recursive: true })

// Helper: fetch batch metadata from OpenAI
async function getBatch(batchId) {
    const res = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${API_KEY}`
        }
    })

    const data = await res.json()

    if (!res.ok) {
        throw new Error(`Failed to fetch batch: ${JSON.stringify(data)}`)
    }

    return data
}

// Helper: download a file from OpenAI Files API and save it locally
async function downloadFile(fileId, destination) {
    const res = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${API_KEY}`
        }
    })

    if (!res.ok) {
        let errorText = ""
        try {
            errorText = await res.text()
        } catch {
            errorText = `HTTP ${res.status}`
        }
        throw new Error(`Failed to download file ${fileId}: ${errorText}`)
    }

    const text = await res.text()
    fs.writeFileSync(destination, text, "utf8")
}

// Helper: extract translated HTML from a batch output line
function extractOutputText(parsedLine) {
    const output = parsedLine?.response?.body?.output
    if (!Array.isArray(output)) {
        return null
    }

    const messageOutput = output.find(item => item?.type === "message")
    const content = messageOutput?.content
    if (!Array.isArray(content)) {
        return null
    }

    const textParts = content
        .filter(item => item?.type === "output_text")
        .map(item => item?.text || "")

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

        const customId = parsed?.custom_id
        if (!customId) {
            console.warn("Skipping line with missing custom_id")
            skipped += 1
            continue
        }

        const translated = extractOutputText(parsed)
        if (!translated) {
            console.warn(`Skipping ${customId}: no translated text found in batch output`)
            skipped += 1
            continue
        }

        const destination = path.join(outDir, customId)
        fs.writeFileSync(destination, translated, "utf8")
        console.log(`Wrote translated file: ${destination}`)
        written += 1
    }

    console.log(`Done. Wrote ${written} files. Skipped ${skipped} lines.`)
}

async function run() {
    console.log(`Checking batch status for ${batchId}...`)
    const batch = await getBatch(batchId)

    console.log("Batch status:", batch.status)

    if (batch.status !== "completed") {
        console.log("Batch is not completed yet.")
        console.log("Re-run this script later with the same batch ID.")

        if (batch.errors?.data?.length) {
            console.log("Batch errors:")
            for (const err of batch.errors.data) {
                console.log(`- ${err.message || JSON.stringify(err)}`)
            }
        }

        return
    }

    if (!batch.output_file_id) {
        throw new Error("Batch completed but no output_file_id was returned")
    }

    console.log("Downloading output file...")
    await downloadFile(batch.output_file_id, rawOutputFile)
    console.log(`Saved raw batch output to ${rawOutputFile}`)

    if (batch.error_file_id) {
        console.log("Downloading error file...")
        await downloadFile(batch.error_file_id, rawErrorFile)
        console.log(`Saved raw batch errors to ${rawErrorFile}`)
    }

    writeTranslatedFiles(rawOutputFile)
}

run().catch(err => {
    console.error("Failed to fetch batch results:", err.message)
    process.exitCode = 1
})