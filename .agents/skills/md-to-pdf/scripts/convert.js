/**
 * Markdown to PDF Converter
 * 
 * Usage:
 *   1. Edit the `files` array below with absolute paths to .md files
 *   2. Run: NODE_PATH=$(npm root -g) node /path/to/convert.js
 * 
 * Prerequisites:
 *   npm i -g md-to-pdf
 */

const { mdToPdf } = require('md-to-pdf');
const path = require('path');
const fs = require('fs');

// ============================================================
// 🎨 CSS STYLING — Customize PDF appearance here
// ============================================================
const CSS_STYLE = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
                 'Noto Sans', 'Noto Sans CJK', 'Helvetica Neue', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
    max-width: 100%;
  }
  h1 {
    color: #1a1a2e;
    border-bottom: 2px solid #e94560;
    padding-bottom: 8px;
    font-size: 24px;
    margin-top: 0;
  }
  h2 {
    color: #16213e;
    font-size: 20px;
    margin-top: 28px;
    border-bottom: 1px solid #eee;
    padding-bottom: 4px;
  }
  h3 { color: #0f3460; font-size: 17px; }
  h4 { color: #533483; font-size: 15px; }
  
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 13px;
  }
  th, td {
    border: 1px solid #ddd;
    padding: 8px 10px;
    text-align: left;
  }
  th {
    background-color: #1a1a2e;
    color: white;
    font-weight: 600;
  }
  tr:nth-child(even) { background-color: #f8f9fa; }
  
  blockquote {
    border-left: 4px solid #e94560;
    margin: 16px 0;
    padding: 10px 16px;
    background: #fff5f5;
    color: #333;
    font-style: italic;
  }
  
  details {
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 12px;
    margin: 10px 0;
    background: #fafafa;
  }
  /* Force details to always show content in PDF (no interactivity) */
  details > *:not(summary) {
    display: block !important;
  }
  details > summary {
    font-weight: bold;
    color: #0f3460;
    list-style: none; /* Remove toggle marker in PDF */
    margin-bottom: 8px;
  }
  details > summary::-webkit-details-marker {
    display: none;
  }
  
  code {
    background: #f0f0f0;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 13px;
  }
  pre {
    background: #1a1a2e;
    color: #e0e0e0;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 13px;
  }
  pre code {
    background: none;
    padding: 0;
    color: inherit;
  }
  
  ul, ol { padding-left: 20px; }
  li { margin-bottom: 4px; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 20px 0; }
  
  a { color: #0f3460; text-decoration: none; }
  strong { color: #1a1a2e; }
  
  /* Print-specific */
  @media print {
    body { font-size: 12px; }
    h1 { font-size: 22px; }
    h2 { font-size: 18px; }
    details { display: block !important; }
    details > * { display: block !important; }
  }
`;

// ============================================================
// 📄 PDF OPTIONS
// ============================================================
const PDF_OPTIONS = {
  format: 'A4',
  margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
  printBackground: true,
  displayHeaderFooter: false,
};

// ============================================================
// 📁 FILES TO CONVERT — Edit this list!
// ============================================================
// Option A: Explicit file list
const files = process.argv.slice(2);

// ============================================================
// 🚀 CONVERSION LOGIC
// ============================================================
async function convertFile(filePath) {
  const outputPath = filePath.replace(/\.md$/, '.pdf');
  const relativeName = path.relative(process.cwd(), filePath) || filePath;
  
  console.log(`  ⏳ Converting: ${relativeName}`);
  
  try {
    // Read markdown and force all <details> to be open (PDF has no interactivity)
    let mdContent = fs.readFileSync(filePath, 'utf-8');
    mdContent = mdContent.replace(/<details>/gi, '<details open>');
    
    const pdf = await mdToPdf(
      { content: mdContent },
      {
        launch_options: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
        pdf_options: PDF_OPTIONS,
        css: CSS_STYLE,
        stylesheet: [],
        // Set basedir so relative images/links resolve correctly
        basedir: path.dirname(filePath),
      }
    );
    
    if (pdf) {
      fs.writeFileSync(outputPath, pdf.content);
      const sizeKB = Math.round(fs.statSync(outputPath).size / 1024);
      console.log(`  ✅ Saved: ${outputPath} (${sizeKB}K)`);
      return { success: true, input: relativeName, output: outputPath, size: sizeKB };
    }
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return { success: false, input: relativeName, error: err.message };
  }
}

async function findMdFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => path.join(dirPath, e.name));
}

async function main() {
  let filesToConvert = [];
  
  if (files.length === 0) {
    console.error('Usage: node convert.js <file1.md> [file2.md] [directory/]');
    console.error('  Pass .md files or directories as arguments.');
    process.exit(1);
  }
  
  // Resolve files vs directories
  for (const f of files) {
    const absPath = path.resolve(f);
    if (fs.statSync(absPath).isDirectory()) {
      const mdFiles = await findMdFiles(absPath);
      filesToConvert.push(...mdFiles);
    } else if (absPath.endsWith('.md')) {
      filesToConvert.push(absPath);
    }
  }
  
  if (filesToConvert.length === 0) {
    console.error('No .md files found.');
    process.exit(1);
  }
  
  console.log(`\n📄 Converting ${filesToConvert.length} file(s) to PDF...\n`);
  
  const results = [];
  for (const file of filesToConvert) {
    results.push(await convertFile(file));
  }
  
  // Summary
  const success = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🎉 Done! ${success.length}/${results.length} converted successfully.`);
  if (failed.length > 0) {
    console.log(`⚠️  ${failed.length} failed:`);
    failed.forEach(f => console.log(`   - ${f.input}: ${f.error}`));
  }
}

main();
