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

/** 指定幅に収まるよう末尾を…で省略する */
function trimTextToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(result + '…').width > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + '…';
}

/** テキストをmaxWidthに収まるよう1文字ずつ折り返す（禁則処理付き）。ctx.fontは呼び出し前に設定しておくこと */
function wrapTextForCanvas(ctx, text, maxWidth) {
  if (!text) return [''];

  const lines = [];
  let current = '';
  for (const ch of String(text)) {
    const test = current + ch;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  // 禁則処理。前行へ禁則文字を移して幅超過する場合は、前行末尾を次行へ戻して調整する。
  for (let i = 1; i < lines.length; i++) {
    while (lines[i] && KINSOKU_NO_LINE_START.has(lines[i][0])) {
      const moved = lines[i][0];
      const candidate = lines[i - 1] + moved;
      if (ctx.measureText(candidate).width <= maxWidth) {
        lines[i - 1] = candidate;
        lines[i] = lines[i].slice(1);
      } else {
        const lastChar = lines[i - 1].slice(-1);
        if (!lastChar) break;
        lines[i - 1] = lines[i - 1].slice(0, -1);
        lines[i] = lastChar + lines[i];
      }
    }
  }

  return lines.filter(line => line.length > 0);
}

/** 指定行数以内に収まる最大フォントサイズを探す汎用テキストフィット */
function fitTextBlock(ctx, text, options) {
  const {
    fontWeight = 700,
    maxWidth,
    maxFontSize,
    minFontSize,
    maxLines,
    lineHeightRatio = 1.25
  } = options;

  for (let size = maxFontSize; size >= minFontSize; size -= 2) {
    ctx.font = `${fontWeight} ${size}px \"${POST_IMAGE_FONT}\", sans-serif`;
    const lines = wrapTextForCanvas(ctx, text, maxWidth);
    if (lines.length <= maxLines) {
      return {
        fontSize: size,
        lines,
        lineHeight: Math.round(size * lineHeightRatio)
      };
    }
  }

  ctx.font = `${fontWeight} ${minFontSize}px \"${POST_IMAGE_FONT}\", sans-serif`;
  let lines = wrapTextForCanvas(ctx, text, maxWidth);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = trimTextToWidth(ctx, lines[maxLines - 1], maxWidth);
  }

  return {
    fontSize: minFontSize,
    lines,
    lineHeight: Math.round(minFontSize * lineHeightRatio)
  };
}

/** 情報行を指定サイズで折り返し、最大行数に収める */
function getInfoLines(ctx, text, maxWidth, fontSize, maxLines) {
  ctx.font = `700 ${fontSize}px \"${POST_IMAGE_FONT}\", sans-serif`;
  let lines = wrapTextForCanvas(ctx, text, maxWidth);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = trimTextToWidth(ctx, lines[maxLines - 1], maxWidth);
  }
  return lines;
}

/** 情報行の描画に必要な高さを返す */
function measureInfoRow(ctx, text, maxWidth, fontSize, maxLines) {
  const lines = getInfoLines(ctx, text, maxWidth, fontSize, maxLines);
  const lineHeight = Math.round(fontSize * 1.25);
  return lines.length * lineHeight + 8;
}

/** アイコン列と本文列を分離して情報行を描画する */
function drawInfoRow(ctx, options) {
  const {
    icon,
    text,
    x,
    y,
    maxWidth,
    fontSize,
    maxLines,
    color
  } = options;

  const iconColWidth = 44;
  const textX = x + iconColWidth;
  const textWidth = maxWidth - iconColWidth;
  const lineHeight = Math.round(fontSize * 1.25);

  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `700 ${Math.max(fontSize - 1, 20)}px \"${POST_IMAGE_FONT}\", sans-serif`;
  ctx.fillText(icon, x, y);

  const lines = getInfoLines(ctx, text, textWidth, fontSize, maxLines);
  ctx.font = `700 ${fontSize}px \"${POST_IMAGE_FONT}\", sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, textX, y + i * lineHeight);
  });

  return lines.length * lineHeight + 8;
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
    ctx.font = `700 44px \"${POST_IMAGE_FONT}\", sans-serif`;
    ctx.fillText('Waseda Calendar', size / 2, 110);
    ctx.font = `400 22px \"${POST_IMAGE_FONT}\", sans-serif`;
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
  const cardBottomPadding = 52;
  let cursorY = cardY + 58;

  // カテゴリタグ：旧レイアウトより少しコンパクトにし、タイトルと情報欄へ余白を回す
  const categoryText = (typeof categoryLabel === 'function') ? categoryLabel(ev.category) : (ev.category || '');
  ctx.font = `700 25px \"${POST_IMAGE_FONT}\", sans-serif`;
  const tagPaddingX = 21, tagHeight = 44;
  const tagWidth = ctx.measureText(categoryText).width + tagPaddingX * 2;
  ctx.fillStyle = c.enjyPale;
  tracePostImageRoundRect(ctx, innerX, cursorY, tagWidth, tagHeight, tagHeight / 2);
  ctx.fill();
  ctx.fillStyle = c.enjy;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(categoryText, innerX + tagPaddingX, cursorY + tagHeight / 2 + 1);

  cursorY += tagHeight + 24;

  // イベント名：1行化のために縮めず、「2行以内に収まる最大サイズ」を選ぶ
  ctx.textBaseline = 'alphabetic';
  const titleFit = fitTextBlock(ctx, ev.title || '', {
    fontWeight: 700,
    maxWidth: innerWidth,
    maxFontSize: 54,
    minFontSize: 38,
    maxLines: 2,
    lineHeightRatio: 1.25
  });
  ctx.font = `700 ${titleFit.fontSize}px \"${POST_IMAGE_FONT}\", sans-serif`;
  ctx.fillStyle = c.textPrimary;
  titleFit.lines.forEach((line, i) => {
    ctx.fillText(line, innerX, cursorY + titleFit.fontSize + i * titleFit.lineHeight);
  });
  cursorY += titleFit.lines.length * titleFit.lineHeight + 24;

  // 区切り線
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(innerX, cursorY);
  ctx.lineTo(innerX + innerWidth, cursorY);
  ctx.stroke();
  cursorY += 28;

  // 日時・会場・主催団体：アイコン列を固定し、長い文字列の2行目を本文位置へ揃える。
  // 残り高さを先に測り、30→28→26→24→22pxの順で最大サイズを採用する。
  const dateText = (typeof formatEventDateDisplay === 'function') ? formatEventDateDisplay(ev) : ev.date;
  const infoRows = [
    { icon: '📅', text: dateText || '', maxLines: 1 },
    ...(ev.location ? [{ icon: '📍', text: ev.location, maxLines: 2 }] : []),
    { icon: '🏫', text: ev.organizer || '', maxLines: 2 }
  ];

  const infoTextWidth = innerWidth - 44;
  const remainingHeight = (cardY + cardHeight) - cardBottomPadding - cursorY;
  const infoFontCandidates = [30, 28, 26, 24, 22];
  let chosenInfoFont = infoFontCandidates[infoFontCandidates.length - 1];

  for (const sizeCandidate of infoFontCandidates) {
    const totalHeight = infoRows.reduce((sum, row) => {
      return sum + measureInfoRow(ctx, row.text, infoTextWidth, sizeCandidate, row.maxLines);
    }, 0);
    if (totalHeight <= remainingHeight) {
      chosenInfoFont = sizeCandidate;
      break;
    }
  }

  ctx.fillStyle = c.textSecondary;
  infoRows.forEach(row => {
    cursorY += drawInfoRow(ctx, {
      icon: row.icon,
      text: row.text,
      x: innerX,
      y: cursorY,
      maxWidth: innerWidth,
      fontSize: chosenInfoFont,
      maxLines: row.maxLines,
      color: c.textSecondary
    });
  });

  // 下部：SNSハンドル・URL（背景画像がある場合は焼き込み済みのため描かない）
  if (!bgImage) {
    ctx.textAlign = 'center';
    ctx.fillStyle = c.white;
    ctx.font = `700 30px \"${POST_IMAGE_FONT}\", sans-serif`;
    ctx.fillText('@waseda_calendar', size / 2, 960);
    ctx.font = `400 24px \"${POST_IMAGE_FONT}\", sans-serif`;
    ctx.fillText('wasedacalendar.com', size / 2, 1000);
  }

  return canvas;
}

/** Canvas描画前にフォントの読み込みを待つ（未読込のままだとデフォルトフォントで描かれてしまうため） */
async function ensurePostImageFontsLoaded() {
  const specs = [
    `400 24px \"${POST_IMAGE_FONT}\"`,
    `700 22px \"${POST_IMAGE_FONT}\"`,
    `700 24px \"${POST_IMAGE_FONT}\"`,
    `700 25px \"${POST_IMAGE_FONT}\"`,
    `700 26px \"${POST_IMAGE_FONT}\"`,
    `700 28px \"${POST_IMAGE_FONT}\"`,
    `700 30px \"${POST_IMAGE_FONT}\"`,
    `700 38px \"${POST_IMAGE_FONT}\"`,
    `700 44px \"${POST_IMAGE_FONT}\"`,
    `700 54px \"${POST_IMAGE_FONT}\"`
  ];
  try {
    await Promise.all(specs.map(spec => document.fonts.load(spec)));
    await document.fonts.ready;
  } catch (err) {
    // フォント読み込みに失敗してもデフォルトフォントで描画を続行する
  }
}

/** iOS/iPadOSかどうかの簡易判定。iPadOSはSafari/Chromeともに既定でMac相当の
 *  UserAgentを名乗るため、UA文字列だけでは判別できず、タッチ対応も合わせて見る
 *  （Macは通常マルチタッチ非対応なので、この組み合わせでiPadOSを検出できる）。 */
function isIOSDevice() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** 指定イベントの投稿用画像を生成してPNGとして保存する。
 *  iOS/iPadOSではOS標準の共有シートを開き、「画像を保存」で直接カメラロールに
 *  保存できるようにする（iOS/iPadOSではblob URLの<a download>だけだと「ファイルに
 *  保存」的な選択を挟むことがあるため）。それ以外の環境(PC・Android等)では、
 *  既に直接ダウンロードできているため従来通りの方式を維持する。 */
async function generatePostImageForEvent(eventId) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const ev = allEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;

  const [, bgImage] = await Promise.all([ensurePostImageFontsLoaded(), loadPostImageBackground()]);
  const canvas = drawPostImageCanvas(ev, bgImage);

  canvas.toBlob(async blob => {
    if (!blob) return;
    const filename = `${ev.id}-post.png`;

    if (isIOSDevice() && navigator.canShare) {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return; // 共有シートをキャンセルしただけなので何もしない
          // 共有に失敗した場合は下のダウンロード方式にフォールバックする
        }
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
