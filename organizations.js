/**
 * organizations.js - Waseda Calendar 掲載団体データ
 *
 * ORGANIZATIONS 配列に団体情報を追加すると、organizations.html に表示されます。
 * relatedEventIds には events.js のイベントIDを入れてください（開催予定のイベントもこちらに含めてよい）。
 *
 * id（例: "org-001"）は events.js 側の orgId フィールドとも紐づきます。
 * 紐づくイベントが終了済み（today > endDate）になると、organizations.html?id=org-001 の
 * 団体プロフィールページの「開催実績」一覧に自動的に表示されます（relatedEventIdsへの追加は不要）。
 */

const ORGANIZATIONS = [
  // {
  //   id: "org-001",
  //   name: "団体名",
  //   nameKana: "だんたいめい",
  //   alphabetName: "Dantai Name",
  //   genre: "スポーツ",
  //   description: "団体概要をここに入力します。",
  //   instagramUrl: "https://www.instagram.com/xxxxx/",
  //   websiteUrl: "",
  //   relatedEventIds: []
  // }
];
