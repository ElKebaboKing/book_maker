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

    // Also keep the main <h1> heading if it appears before <div id="article">.
    const beforeArticle = html.slice(0, openMatch.index);
    const h1Regex = /<h1\b[^>]*>[\s\S]*?<\/h1>/i;
    const h1Match = h1Regex.exec(beforeArticle);
    const h1Content = h1Match ? `${h1Match[0]}\n\n` : "";

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

            fs.writeFileSync(filePath, h1Content + articleContent, "utf8");
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