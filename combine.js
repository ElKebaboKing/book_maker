import fs from 'fs'
import path from 'path'

// const bookSlug = "shadow-slave"
// const bookSlug = "slime-evolution"
// const bookSlug = "weakest-beast-tamer-gets-all-sss-dragons"
// const bookSlug = "my-talents-name-is-generator"
const bookSlug = "global-pokemon-starting-by-snatching-an-atavistic-gyarados"


const folderPath = `all-books/${bookSlug}/${bookSlug}_raw`
const outputDir = `all-books/${bookSlug}/${bookSlug}_combined`;

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
  const outputName = files.length <= chunkSize
    ? `${bookSlug}_combined.html`
    : `${bookSlug}_${fileIndex}.html`;
  const outputFile = path.join(outputDir, outputName);

  fs.writeFileSync(outputFile, content);

  console.log(`✅ Created ${outputFile} with ${chunk.length} chapters`);
}
