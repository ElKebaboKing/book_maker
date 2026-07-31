import fs from 'fs'
import path from 'path'

// let bookName = "shadow-slave"
// let bookName = "slime-evolution"
// let bookName = "weakest-beast-tamer-gets-all-sss-dragons"
// let bookName = "my-talents-name-is-generator"
let bookName = "global-elf-cut-off-the-hu-and-return-to-the-ancestral-gyarados-at-the-beginning"


const folderPath = `all-books/${bookName}/${bookName}_raw`
const outputDir = `all-books/${bookName}/${bookName}_combined`;

if (!fs.existsSync(outputDir))
  fs.mkdirSync(outputDir, { recursive: true });


const startChapter = 1; // change this to the chapter number you want to start from
const chunkSize = 231;

const files = fs.readdirSync(folderPath)
  .filter(file => fs.statSync(path.join(folderPath, file)).isFile())
  .sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
    const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
    return numA - numB;
  })
  .filter(file => {
    const chapterNumber = parseInt(file.match(/\d+/)?.[0] || '0', 10);
    return chapterNumber >= startChapter;
  });

for (let i = 0; i < files.length; i += chunkSize) {
  const chunk = files.slice(i, i + chunkSize);

  const content = chunk
    .map(file => {
      return fs.readFileSync(path.join(folderPath, file), 'utf8');
    })
    .join('\n\n');

  const fileIndex = Math.floor(i / chunkSize) + 1;
  const outputFile = path.join(outputDir, `${bookName}_${fileIndex}.html`);

  fs.writeFileSync(outputFile, content);

  console.log(`✅ Created ${outputFile} with ${chunk.length} chapters`);
}