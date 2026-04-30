import fs from "fs";
import path from "path";

let bookName = "shadow-slave"

const folderPath = `all-books/${bookName}/${bookName}_raw`
const outputDir = `all-books/${bookName}/${bookName}_filtered`;

if (!fs.existsSync(outputDir))
    fs.mkdirSync(outputDir, { recursive: true });


const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".html"));

for (const file of files) {
    const filePath = path.join(folderPath, file);
    const outputPath = path.join(outputDir, file);

    const html = fs.readFileSync(filePath, "utf8");

    const normalizeText = (text) =>
        text.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");

    const cleanedHtml = normalizeText(html);

    // Find the opening tag for <div id="article">.
    const articleOpenTag = /<div\b[^>]*\bid=["']article["'][^>]*>/i;
    const openMatch = articleOpenTag.exec(cleanedHtml);

    if (!openMatch) {
        console.warn(`No #article found in ${file}`);
        continue;
    }

    // Extract <title> and convert it into an <h1>
    const titleRegex = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
    const titleMatch = titleRegex.exec(cleanedHtml);
    const titleContent = titleMatch ? `<h1>${titleMatch[1].trim()}</h1>\n\n` : "";

    // Start scanning right after the opening <div id="article"> tag.
    let cursor = openMatch.index + openMatch[0].length;
    let depth = 1;

    // Match any opening or closing div tag so we can keep track of nesting.
    const divTagRegex = /<\/?div\b[^>]*>/gi;
    divTagRegex.lastIndex = cursor;

    let tagMatch;
    while ((tagMatch = divTagRegex.exec(cleanedHtml)) !== null) {
        const tag = tagMatch[0];

        if (/^<div\b/i.test(tag))
            depth += 1;
        else if (/^<\/div\b/i.test(tag))
            depth -= 1;


        // When depth returns to 0, we have reached the matching closing
        // tag for <div id="article"> rather than the first nested </div>.
        if (depth === 0) {
            const articleContent = cleanedHtml.slice(cursor, tagMatch.index);

            fs.writeFileSync(outputPath, titleContent + articleContent, "utf8");
            console.log(`Cleaned ${file}`);
            break;
        }
    }

    // If we never got back to depth 0, the HTML structure is broken.
    if (depth !== 0)
        console.warn(`Could not find closing </div> for #article in ${file}`);

}

console.log("All files cleaned ✔️");