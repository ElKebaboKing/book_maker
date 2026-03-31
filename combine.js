import fs from 'fs'
import path from 'path'

const dir = 'talent_tl';
const startChapter = 1401; // change this to the chapter number you want to start from

const files = fs.readdirSync(dir)
  .filter(file => fs.statSync(path.join(dir, file)).isFile())
  .sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
    const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
    return numA - numB;
  })
  .filter(file => {
    const chapterNumber = parseInt(file.match(/\d+/)?.[0] || '0', 10);
    return chapterNumber >= startChapter;
  });

const chunkSize = 50;

for (let i = 0; i < files.length; i += chunkSize) {
  const chunk = files.slice(i, i + chunkSize);

  const content = chunk
    .map(file => {
      return fs.readFileSync(path.join(dir, file), 'utf8');
    })
    .join('\n\n');

  const fileIndex = Math.floor(i / chunkSize) + 1;
  const outputFile = `combined_tl_${fileIndex}.html`;

  fs.writeFileSync(outputFile, content);

  console.log(`✅ Created ${outputFile} with ${chunk.length} chapters`);
}