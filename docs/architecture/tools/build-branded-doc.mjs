/**
 * Branded document builder for the MentorMAMA design-sequence deliverables.
 *
 * Renders a Markdown stage document to a brand-styled A4 PDF and a DOCX, with
 * Mermaid diagrams rasterised so both formats are self-contained (no external
 * image links).
 *
 * Usage — copy this file into a scratch directory, then:
 *   npm init -y && npm install marked puppeteer-core sharp
 *   COVER='{"kicker":"...","title":"...","sub":"...","lede":"...","footer":"..."}' \
 *     node build-branded-doc.mjs <path-to-source.md> <output-basename>
 *
 * COVER supplies the cover-page copy (JSON). OUTDIR overrides the output directory
 * (defaults to docs/architecture).
 *
 * Requires google-chrome and libreoffice (soffice) on PATH-adjacent standard
 * locations. Defaults to the Stage 3 document.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { marked } from 'marked';
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';

const REPO = '/home/bouric/Documents/projects/mentor-mama';
const SRC = process.argv[2] || path.join(REPO, 'docs/architecture/stage3-business-rules-and-invariants.md');
const OUTDIR = process.env.OUTDIR || path.join(REPO, 'docs/architecture');
const COVER = JSON.parse(process.env.COVER || '{}');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-doc-'));
const BASE = process.argv[3] || 'MentorMAMA_Stage3_Business_Rules_and_Invariants';

const C = {
  navy: '#0D1B33',
  teal: '#1D8C8C',
  mist: '#F4F7F8',
  stone: '#E4E8EE',
  terracotta: '#D97757',
};

// Brand logo.png ships with a uniform near-white background that reads as a grey box
// on a white page. Trim the border and make near-white pixels transparent once, then
// reuse the clean asset for both the PDF and the DOCX build.
import sharp from 'sharp';
const LOGO_CLEAN = path.join(WORK, 'logo-clean.png');
let LOGO_W = 1152;
let LOGO_H = 722;
{
  const { data, info } = await sharp(path.join(REPO, 'assets/brand/logo/logo.png'))
    .trim({ threshold: 12 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] >= 238 && data[i + 1] >= 238 && data[i + 2] >= 238) data[i + 3] = 0;
  }
  LOGO_W = info.width;
  LOGO_H = info.height;
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toFile(LOGO_CLEAN);
}
const logo = fs.readFileSync(LOGO_CLEAN).toString('base64');

function pngSize(file) {
  const buf = fs.readFileSync(file).subarray(16, 24);
  return { width: buf.readUInt32BE(0), height: buf.readUInt32BE(4) };
}

let md = fs.readFileSync(SRC, 'utf8');

// Strip the H1 + meta table (they become the cover page) --------------------
const lines = md.split('\n');
const cutIdx = lines.findIndex((l) => l.trim() === '---' && lines.indexOf(l) > 5);
const metaBlock = lines.slice(0, cutIdx).join('\n');
const body = lines.slice(cutIdx + 1).join('\n');

// Pull meta rows for the cover
const metaRows = [...metaBlock.matchAll(/^\| ([^|]+?) \| ([^|]+?) \|$/gm)]
  .filter(([, k]) => !/^-+$/.test(k.trim()) && k.trim() !== 'Field')
  .map(([, k, v]) => [k.trim(), v.trim()]);

const mermaids = [];
marked.use({
  renderer: {
    code(token) {
      const text = typeof token === 'string' ? token : token.text;
      const lang = typeof token === 'string' ? arguments[1] : token.lang;
      if (lang === 'mermaid') {
        const i = mermaids.length;
        mermaids.push(text);
        return `<div class="diagram"><div class="mermaid" id="mmd-${i}">${text}</div></div>`;
      }
      return `<pre class="code"><code>${text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</code></pre>`;
    },
  },
});

let htmlBody = marked.parse(body);

// Tag tables whose first column is a short rule identifier so it never wraps.
htmlBody = htmlBody.replace(/<table>([\s\S]*?)<\/table>/g, (m, inner) => {
  const firstHeader = (inner.match(/<th>(.*?)<\/th>/) || [, ''])[1].trim();
  const headers = [...inner.matchAll(/<th>(.*?)<\/th>/g)].map((h) => h[1].trim());
  if (firstHeader === '#' && headers[1] === 'From' && headers[2] === 'To')
    return `<table class="idtable transtable">${inner}</table>`;
  if (firstHeader === '#') return `<table class="idtable">${inner}</table>`;
  if (firstHeader === 'ID') return `<table class="idtable">${inner}</table>`;
  return m;
});

const css = `
  @page { size: A4; margin: 20mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Inter, "Helvetica Neue", Arial, sans-serif; color: ${C.navy};
         font-size: 9.6pt; line-height: 1.55; margin: 0; }
  h1, h2, h3, h4 { font-family: Manrope, Inter, Arial, sans-serif; color: ${C.navy};
                   line-height: 1.25; margin: 0 0 .5em; font-weight: 700; }
  h2 { font-size: 16pt; margin-top: 1.6em; padding-bottom: .3em;
       border-bottom: 2px solid ${C.teal}; page-break-after: avoid; }
  h3 { font-size: 12pt; margin-top: 1.4em; color: ${C.teal}; page-break-after: avoid; }
  h4 { font-size: 10.4pt; margin-top: 1.1em; page-break-after: avoid; }
  p { margin: 0 0 .7em; }
  strong { font-weight: 700; }
  code { font-family: "JetBrains Mono", "DejaVu Sans Mono", monospace; font-size: .86em;
         background: ${C.mist}; padding: .1em .35em; border-radius: 3px; color: ${C.navy}; }
  pre.code { background: ${C.navy}; color: #EAF2F4; padding: 10px 12px; border-radius: 6px;
             font-size: 8.6pt; overflow: hidden; page-break-inside: avoid; }
  pre.code code { background: none; color: inherit; padding: 0; }
  table { width: 100%; border-collapse: collapse; margin: .5em 0 1.1em; font-size: 8.5pt;
          page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: ${C.navy}; color: #fff; text-align: left; padding: 6px 8px;
       font-weight: 600; font-size: 8.3pt; letter-spacing: .01em; }
  td { padding: 5px 8px; border-bottom: 1px solid ${C.stone}; vertical-align: top; }
  tbody tr:nth-child(even) td { background: ${C.mist}; }
  ul, ol { margin: 0 0 .8em; padding-left: 1.3em; }
  li { margin-bottom: .3em; }
  hr { border: none; border-top: 1px solid ${C.stone}; margin: 1.6em 0; }
  em { color: ${C.navy}; }
  blockquote { margin: 0 0 1em; padding: .6em .9em; background: ${C.mist};
               border-left: 3px solid ${C.terracotta}; }
  .diagram { margin: 1em 0 1.4em; padding: 14px; background: ${C.mist};
             border: 1px solid ${C.stone}; border-radius: 8px; text-align: center;
             page-break-inside: avoid; }
  /* Diagram dimensions are set explicitly in JS after render (see fitDiagrams):
     a percentage-width SVG root does not clamp reliably via max-height, and an
     oversized figure collides with page-break-inside: avoid and prints blank. */
  .diagram svg { max-width: 100%; }
  table.idtable td:first-child, table.idtable th:first-child { white-space: nowrap; }
  table.transtable td:nth-child(2), table.transtable td:nth-child(3) { white-space: nowrap; }

  /* Cover ---------------------------------------------------------------- */
  .cover { height: 257mm; display: flex; flex-direction: column;
           page-break-after: always; }
  .cover .logo { height: 78px; width: auto; align-self: flex-start;
                 object-fit: contain; margin-bottom: auto; }
  .cover .kicker { font-family: Manrope, Arial, sans-serif; font-size: 9.5pt;
                   letter-spacing: .18em; text-transform: uppercase; color: ${C.teal};
                   font-weight: 700; margin-bottom: 10px; }
  .cover h1 { font-size: 30pt; line-height: 1.12; margin: 0 0 12px; max-width: 15em; }
  .cover .sub { font-size: 12pt; color: ${C.teal}; font-weight: 600; margin-bottom: 6px; }
  .cover .lede { font-size: 10pt; max-width: 34em; color: #3A4B63; margin-bottom: 26px; }
  .cover .rule { width: 70px; height: 4px; background: ${C.terracotta}; margin: 0 0 26px; }
  .cover table { font-size: 8.6pt; margin: 0; }
  .cover td:first-child { width: 30%; font-weight: 600; color: ${C.teal}; }
  .cover .tag { margin-top: auto; padding-top: 20px; font-size: 8.6pt; color: #5B6C84;
                border-top: 1px solid ${C.stone}; }
`;

const coverMetaRows = metaRows
  .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
  .join('');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>${css}</style></head><body>
<section class="cover">
  <img class="logo" src="data:image/png;base64,${logo}" alt="MentorMAMA" width="${LOGO_W}" height="${LOGO_H}">
  <div class="kicker">${COVER.kicker || ''}</div>
  <h1>${COVER.title || ''}</h1>
  <div class="sub">${COVER.sub || ''}</div>
  <div class="rule"></div>
  <div class="lede">${COVER.lede || ''}</div>
  <table><tbody>${coverMetaRows}</tbody></table>
  <div class="tag">Sinaps Technology &nbsp;|&nbsp; Driving Innovation Out of Isolation &nbsp;·&nbsp;
  Confidential — Sinaps Technology / JHUB Africa</div>
</section>
${htmlBody}
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  mermaid.initialize({ startOnLoad: false, theme: 'base', fontFamily: 'Inter, Arial, sans-serif',
    themeVariables: {
      primaryColor: '#FFFFFF', primaryTextColor: '${C.navy}', primaryBorderColor: '${C.navy}',
      lineColor: '${C.teal}', tertiaryColor: '${C.mist}', fontSize: '13px',
      transitionLabelColor: '${C.navy}'
    }});
  // Wait for the webfonts before rendering: Mermaid measures label widths at
  // render time, and measuring with the fallback font then swapping to Inter
  // makes text wider than the node box, which prints clipped.
  window.__mermaidDone = document.fonts.ready
    .then(() => mermaid.run({ querySelector: '.mermaid' }))
    .then(() => true).catch((e) => { console.error(e); return false; });
</script>
</body></html>`;

fs.writeFileSync(path.join(WORK, 'doc.html'), html);

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.goto('file://' + path.join(WORK, 'doc.html'), { waitUntil: 'networkidle0', timeout: 90000 });
// Scale every rendered figure to fit the printable area, from its viewBox.
await page.evaluate(() => {
  const MAX_H = 760; // px at 96dpi — comfortably inside A4 minus margins
  for (const svg of document.querySelectorAll('.diagram svg')) {
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (vb.length !== 4) continue;
    const [, , vw, vh] = vb;
    const maxW = svg.parentElement.clientWidth;
    const scale = Math.min(maxW / vw, MAX_H / vh, 1);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.maxWidth = 'none';
    svg.style.width = `${Math.floor(vw * scale)}px`;
    svg.style.height = `${Math.floor(vh * scale)}px`;
  }
});

const ok = await page.evaluate(() => window.__mermaidDone);
console.log('mermaid rendered:', ok, '| diagrams:', mermaids.length);
// A failed diagram renders as a "Syntax error in text" placeholder rather than throwing,
// so fail the build loudly instead of shipping a broken figure.
const broken = await page.evaluate(() =>
  [...document.querySelectorAll('.diagram')]
    .map((d, i) => {
      if (/Syntax error/i.test(d.textContent)) return i;
      const svg = d.querySelector('svg');
      const r = svg && svg.getBoundingClientRect();
      // A figure that renders taller than a printable page collides with
      // page-break-inside: avoid and comes out blank.
      if (!r || r.height < 20 || r.height > 800) return i;
      // A classDef colour can leak to every node label, printing white text on a
      // white fill: the figure renders, and says nothing. Check real contrast.
      const lum = (c) => {
        const m = (c || '').match(/\d+/g);
        if (!m) return null;
        const [r1, g1, b1] = m.map(Number);
        return (0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1) / 255;
      };
      for (const node of d.querySelectorAll('.node')) {
        const label = node.querySelector('.nodeLabel');
        const shape = node.querySelector('rect, path, polygon');
        if (!label || !shape) continue;
        const a = lum(getComputedStyle(label).color);
        const b = lum(getComputedStyle(shape).fill);
        if (a !== null && b !== null && Math.abs(a - b) < 0.2) return i;
      }
      return -1;
    })
    .filter((i) => i >= 0));
if (!ok || broken.length) {
  await browser.close();
  throw new Error(`Mermaid render failed. Broken diagram indexes: ${broken.join(', ') || 'unknown'}`);
}
await new Promise((r) => setTimeout(r, 800));

// Export each rendered diagram as PNG for the DOCX build ---------------------
const pngs = [];
for (let i = 0; i < mermaids.length; i++) {
  const el = await page.$(`#mmd-${i}`);
  if (!el) continue;
  const p = path.join(WORK, `diagram-${i}.png`);
  await el.screenshot({ path: p, omitBackground: false });
  pngs.push(p);
}

const footer = `<div style="width:100%;font-family:Inter,Arial,sans-serif;font-size:7.5pt;color:#5B6C84;
  padding:0 16mm;display:flex;justify-content:space-between;">
  <span>MentorMAMA — ${COVER.footer || COVER.title || ''}</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span> &nbsp;·&nbsp; Confidential — Sinaps Technology / JHUB Africa</span></div>`;

await page.pdf({
  path: path.join(OUTDIR, BASE + '.pdf'),
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: footer,
  margin: { top: '18mm', bottom: '18mm', left: '0mm', right: '0mm' },
});
await browser.close();
console.log('PDF written');

// ---- DOCX: same HTML, diagrams as <img>, converted via LibreOffice --------
let docxHtml = html
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<link[^>]*>/g, '');
mermaids.forEach((_, i) => {
  docxHtml = docxHtml.replace(
    new RegExp(`<div class="mermaid" id="mmd-${i}">[\\s\\S]*?</div>`),
    (() => {
      // Fit each figure inside the printable area of an A4 page. Setting only a
      // width lets a tall diagram compute to a height greater than the page,
      // which LibreOffice renders clipped at the page break.
      const file = path.join(WORK, `diagram-${i}.png`);
      const { width: pw, height: ph } = pngSize(file);
      const MAX_W = 16;   // cm
      const MAX_H = 20;   // cm
      const scale = Math.min(MAX_W / pw, MAX_H / ph);
      const w = (pw * scale).toFixed(2);
      const h = (ph * scale).toFixed(2);
      const b64 = fs.readFileSync(file).toString('base64');
      return `<img src="data:image/png;base64,${b64}" style="width:${w}cm;height:${h}cm">`;
    })()
  );
});
docxHtml = docxHtml.replace('.cover { height: 257mm;', '.cover {');
fs.writeFileSync(path.join(WORK, 'doc-docx.html'), docxHtml);
execFileSync('/usr/bin/soffice', [
  '--headless', '--norestore',
  '--convert-to', 'docx:MS Word 2007 XML',
  '--outdir', path.join(WORK, 'out'), path.join(WORK, 'doc-docx.html'),
], { stdio: 'inherit', timeout: 180000 });
fs.copyFileSync(path.join(WORK, 'out', 'doc-docx.docx'), path.join(OUTDIR, BASE + '.docx'));
console.log('DOCX written');
