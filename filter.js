import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "talent");

const files = fs.readdirSync(dir).filter(f => f.endsWith(".html"));

for (const file of files) {
    const filePath = path.join(dir, file);

    let text = fs.readFileSync(filePath, "utf8");

    // Remove VIP ad blocks containing vip.png
    text = text.replace(/<div[^>]*style="[^"]*"[^>]*>\s*<img[^>]*src="\/images\/vip\.png"[^>]*>[\s\S]*?<\/a>\s*<\/div>/g, "");

    // Remove only the <p> containing "溫馨提示"
    text = text.replace(/<p[^>]*>[\s\S]*?溫馨提示[\s\S]*?<\/p>/g, "");

    fs.writeFileSync(filePath, text, "utf8");

    console.log(`Cleaned ${file}`);
}

console.log("All files cleaned ✔️");