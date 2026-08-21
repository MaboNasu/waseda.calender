#!/usr/bin/env node
/**
 * og-image-receiver.js - OGP画像バックフィル用の一時的なローカル受信サーバー。
 *
 * generate-og-images.html がブラウザ側でCanvas描画したPNGを、
 * このサーバーにPOSTすることで x-post-images/ にファイルとして保存する。
 * ブラウザにはファイルシステムへの直接書き込み権限が無いため、この中継が必要。
 *
 * このプロジェクトの「npm依存なし」方針を維持するため、Node標準の http/fs のみを使う。
 *
 * 使い方: node scripts/og-image-receiver.js
 * (Ctrl+Cで停止。全件保存できたら止めてよい一時的なツール)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'x-post-images');
const PORT = 8899;

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let savedCount = 0;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Event-Id, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/save') {
    const eventId = req.headers['x-event-id'];
    if (!eventId || !/^evt-[0-9]+$/.test(eventId)) {
      res.writeHead(400);
      res.end('invalid event id');
      return;
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(path.join(OUT_DIR, `${eventId}.png`), buf);
      savedCount++;
      console.log(`[${savedCount}] saved ${eventId}.png (${buf.length} bytes)`);
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`og-image-receiver: listening on http://localhost:${PORT} (saving into ${OUT_DIR})`);
});
