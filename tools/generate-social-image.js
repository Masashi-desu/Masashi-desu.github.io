#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('playwright');

const OUTPUT_PATH = path.resolve(__dirname, '..', 'site', 'products', 'social', 'site-default.png');
const VIEWPORT = { width: 1200, height: 630, deviceScaleFactor: 2 };

async function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function generate() {
  await ensureDirExists(OUTPUT_PATH);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });

  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; }
        html, body {
          height: 100%;
          margin: 0;
        }
        body {
          --paper: #f4f1ea;
          --ink: #161512;
          --muted: #6f685d;
          --accent: #2f49ff;
          background: var(--paper);
          color: var(--ink);
          font-family: 'Instrument Sans', 'Hiragino Sans', 'Noto Sans JP', system-ui, -apple-system, sans-serif;
        }
        .frame {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 38px;
          padding: 80px 88px;
        }
        .kicker {
          margin: 0;
          font-size: 27px;
          font-weight: 700;
          color: var(--muted);
        }
        .headline {
          margin: 0;
          font-family: 'Instrument Serif', Georgia, serif;
          font-weight: 400;
          font-size: 164px;
          line-height: 0.9;
          letter-spacing: 0;
        }
        .headline span { display: block; white-space: nowrap; }
        .headline .dot { display: inline; color: var(--accent); }
        .body-jp {
          margin: 0;
          font-size: 25px;
          line-height: 1.5;
          letter-spacing: 0.04em;
          color: var(--muted);
        }
      </style>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
    </head>
    <body>
      <div class="frame">
        <p class="kicker">Masahi_desu</p>
        <h1 class="headline">
          <span>Behavior</span>
          <span>for Behavior<span class="dot">.</span></span>
        </h1>
        <p class="body-jp">ふるまいを観察し、ふるまいに返す。日々の手ざわりを静かに変える。</p>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUTPUT_PATH, type: 'png' });
  await browser.close();
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
