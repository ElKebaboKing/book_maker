import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "slime");

const files = fs.readdirSync(dir).filter(f => f.endsWith(".html"));

for (const file of files) {
    const filePath = path.join(dir, file);

    let text = fs.readFileSync(filePath, "utf8");

    // Extract only <div id="article"> content
    const match = text.match(/<div[^>]*id=["']article["'][^>]*>([\s\S]*?)<\/div>/i);
    if (match) {
        text = match[1];
    } else {
        console.warn(`No #article found in ${file}`);
        continue;
    }

    fs.writeFileSync(filePath, text, "utf8");

    console.log(`Cleaned ${file}`);
}

console.log("All files cleaned ✔️");