import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "realms_of_myths_and_legends");

const files = fs.readdirSync(dir).filter(f => f.endsWith(".html"));

for (const file of files) {
    const filePath = path.join(dir, file);

    const html = fs.readFileSync(filePath, "utf8");

    // Find the opening tag for <div id="article">.
    const articleOpenTag = /<div\b[^>]*\bid=["']article["'][^>]*>/i;
    const openMatch = articleOpenTag.exec(html);

    if (!openMatch) {
        console.warn(`No #article found in ${file}`);
        continue;
    }

    // Extract <title> and convert it into an <h1>
    const titleRegex = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
    const titleMatch = titleRegex.exec(html);
    const titleContent = titleMatch ? `<h1>${titleMatch[1].trim()}</h1>\n\n` : "";

    // Start scanning right after the opening <div id="article"> tag.
    let cursor = openMatch.index + openMatch[0].length;
    let depth = 1;

    // Match any opening or closing div tag so we can keep track of nesting.
    const divTagRegex = /<\/?div\b[^>]*>/gi;
    divTagRegex.lastIndex = cursor;

    let tagMatch;
    while ((tagMatch = divTagRegex.exec(html)) !== null) {
        const tag = tagMatch[0];

        if (/^<div\b/i.test(tag)) {
            depth += 1;
        } else if (/^<\/div\b/i.test(tag)) {
            depth -= 1;
        }

        // When depth returns to 0, we have reached the matching closing
        // tag for <div id="article"> rather than the first nested </div>.
        if (depth === 0) {
            const articleContent = html.slice(cursor, tagMatch.index);

            fs.writeFileSync(filePath, titleContent + articleContent, "utf8");
            console.log(`Cleaned ${file}`);
            break;
        }
    }

    // If we never got back to depth 0, the HTML structure is broken.
    if (depth !== 0) {
        console.warn(`Could not find closing </div> for #article in ${file}`);
    }
}

console.log("All files cleaned ✔️");