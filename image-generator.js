/**
 * image-generator.js - イベント情報からInstagram投稿用の正方形画像(1080x1080)を生成する
 *
 * Canvas APIでその場で描画してPNGとしてダウンロードする（サーバー処理なし・静的サイトのまま完結）。
 * script.js の categoryLabel / formatEventDateDisplay を流用する。
 */

const POST_IMAGE_SIZE = 1080;
const POST_IMAGE_COLORS = {
  enjy: '#8B0000',
  enjyDark: '#6B0000',
  enjyLight: '#A52020',
  enjyPale: '#FBF0F0',
  white: '#FFFFFF',
  textPrimary: '#1F2937',
  textSecondary: '#4B5563'
};
const POST_IMAGE_FONT = 'Noto Sans JP';
/** AIで生成した背景画像（用意できていない場合はグラデーションにフォールバックする） */
const POST_IMAGE_BG_URL = 'assets/post-template-bg.jpg';

/** 背景画像を読み込む。存在しない・読み込み失敗の場合はnullを返す（呼び出し側でグラデーションにフォールバック） */
function loadPostImageBackground() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = POST_IMAGE_BG_URL;
  });
}

/** 行頭に来てはいけない文字（句読点・閉じ括弧・長音などの禁則文字） */
const KINSOKU_NO_LINE_START = new Set('、。，．・：；？！ヽヾゝゞ々’”）〕］｝〉》」』】ー%,.:;!?)'.split(''));

/** テキストをmaxWidthに収まるよう1文字ずつ折り返す（禁則処理付き）。ctx.fontは呼び出し前に設定しておくこと */
function wrapTextForCanvas(ctx, text, maxWidth) {
  const lines = [];
  let current = '';
  for (const ch of text) {
    const test = current + ch;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  // 禁則処理: 行頭に来てはいけない文字を前の行の末尾に送る
  for (let i = 1; i < lines.length; i++) {
    while (lines[i].length && KINSOKU_NO_LINE_START.has(lines[i][0])) {
      lines[i - 1] += lines[i][0];
      lines[i] = lines[i].slice(1);
    }
  }
  return lines.filter(line => line.length > 0);
}

/**
 * イベント名のフォントサイズと行を決める。
 * maxFontSizeから縮小しながら1行に収まるサイズを探し、minFontSizeでも収まらなければ
 * minFontSizeのまま自然な位置（禁則処理済み）で複数行に折り返す（maxLinesを超える分は省略）。
 */
function fitEventTitle(ctx, title, maxWidth, maxFontSize, minFontSize, maxLines) {
  for (let size = maxFontSize; size >= minFontSize; size -= 2) {
    ctx.font = `700 ${size}px "${POST_IMAGE_FONT}", sans-serif`;
    const lines = wrapTextForCanvas(ctx, title, maxWidth);
    if (lines.length <= 1) return { fontSize: size, lines };
  }

  ctx.font = `700 ${minFontSize}px "${POST_IMAGE_FONT}", sans-serif`;
  let lines = wrapTextForCanvas(ctx, title, maxWidth);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last + '…';
  }
  return { fontSize: minFontSize, lines };
}

/** 角丸長方形のパスを作る */
function tracePostImageRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** イベント情報から投稿用画像のCanvasを描画して返す。bgImageが渡されればそれを背景に使い、無ければグラデーションにフォールバックする */
function drawPostImageCanvas(ev, bgImage) {
  const size = POST_IMAGE_SIZE;
  const c = POST_IMAGE_COLORS;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (bgImage) {
    // 背景（AIで生成した画像。中央は白いカードで隠れる前提のデザイン）
    ctx.drawImage(bgImage, 0, 0, size, size);
  } else {
    // フォールバック（背景画像が用意されていない場合のサイト配色グラデーション）
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, c.enjyDark);
    bg.addColorStop(0.5, c.enjy);
    bg.addColorStop(1, c.enjyLight);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }

  // 上部：サイトのロゴ文言（背景画像がある場合はロゴが焼き込み済みのため描かない）
  if (!bgImage) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = c.white;
    ctx.font = `700 44px "${POST_IMAGE_FONT}", sans-serif`;
    ctx.fillText('Waseda Calendar', size / 2, 110);
    ctx.font = `400 22px "${POST_IMAGE_FONT}", sans-serif`;
    ctx.fillText('早稲田のイベントを、ひとつのカレンダーで。', size / 2, 145);
  }

  // 中央：白いカード（背景画像側の白いカード枠の実測値に合わせた座標）
  const cardX = 111, cardY = 268, cardWidth = 858, cardHeight = 523;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = c.white;
  tracePostImageRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, 28);
  ctx.fill();
  ctx.restore();

  const innerX = cardX + 60;
  const innerWidth = cardWidth - 120;
  let cursorY = cardY + 90;

  // カテゴリタグ
  const categoryText = (typeof categoryLabel === 'function') ? categoryLabel(ev.category) : (ev.category || '');
  ctx.font = `700 28px "${POST_IMAGE_FONT}", sans-serif`;
  const tagPaddingX = 24, tagHeight = 48;
  const tagWidth = ctx.measureText(categoryText).width + tagPaddingX * 2;
  ctx.fillStyle = c.enjyPale;
  tracePostImageRoundRect(ctx, innerX, cursorY, tagWidth, tagHeight, tagHeight / 2);
  ctx.fill();
  ctx.fillStyle = c.enjy;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(categoryText, innerX + tagPaddingX, cursorY + tagHeight / 2 + 2);

  cursorY += tagHeight + 40;

  // イベント名（自動縮小＋自然な改行）
  ctx.textBaseline = 'alphabetic';
  const titleFit = fitEventTitle(ctx, ev.title, innerWidth, 60, 34, 3);
  ctx.font = `700 ${titleFit.fontSize}px "${POST_IMAGE_FONT}", sans-serif`;
  ctx.fillStyle = c.textPrimary;
  const lineHeight = titleFit.fontSize * 1.4;
  titleFit.lines.forEach((line, i) => {
    ctx.fillText(line, innerX, cursorY + titleFit.fontSize + i * lineHeight);
  });
  cursorY += titleFit.fontSize + (titleFit.lines.length - 1) * lineHeight + 50;

  // 区切り線
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(innerX, cursorY);
  ctx.lineTo(innerX + innerWidth, cursorY);
  ctx.stroke();
  cursorY += 55;

  // 日時
  const dateText = (typeof formatEventDateDisplay === 'function') ? formatEventDateDisplay(ev) : ev.date;
  ctx.font = `700 32px "${POST_IMAGE_FONT}", sans-serif`;
  ctx.fillStyle = c.textSecondary;
  ctx.fillText('📅 ' + dateText, innerX, cursorY);
  cursorY += 60;

  // 主催団体
  ctx.font = `700 32px "${POST_IMAGE_FONT}", sans-serif`;
  ctx.fillStyle = c.textSecondary;
  ctx.fillText('🏫 ' + (ev.organizer || ''), innerX, cursorY);

  // 下部：SNSハンドル・URL（背景画像がある場合は焼き込み済みのため描かない）
  if (!bgImage) {
    ctx.textAlign = 'center';
    ctx.fillStyle = c.white;
    ctx.font = `700 30px "${POST_IMAGE_FONT}", sans-serif`;
    ctx.fillText('@waseda_calendar', size / 2, 960);
    ctx.font = `400 24px "${POST_IMAGE_FONT}", sans-serif`;
    ctx.fillText('wasedacalendar.com', size / 2, 1000);
  }

  return canvas;
}

/** Canvas描画前にフォントの読み込みを待つ（未読込のままだとデフォルトフォントで描かれてしまうため） */
async function ensurePostImageFontsLoaded() {
  const specs = [
    `400 24px "${POST_IMAGE_FONT}"`, `700 32px "${POST_IMAGE_FONT}"`
  ];
  try {
    await Promise.all(specs.map(spec => document.fonts.load(spec)));
    await document.fonts.ready;
  } catch (err) {
    // フォント読み込みに失敗してもデフォルトフォントで描画を続行する
  }
}

/** 指定イベントの投稿用画像を生成してPNGとしてダウンロードする */
async function generatePostImageForEvent(eventId) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const ev = allEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;

  const [, bgImage] = await Promise.all([ensurePostImageFontsLoaded(), loadPostImageBackground()]);
  const canvas = drawPostImageCanvas(ev, bgImage);

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ev.id}-post.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
