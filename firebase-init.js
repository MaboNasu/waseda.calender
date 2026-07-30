/**
 * firebase-init.js - Firebase Authentication (Google) + Firestore の初期化
 *
 * ESモジュールとしてCDNから読み込む（npm/ビルド環境なしの静的サイト構成のため）。
 * 既存の script.js / contact.js 等（classicスクリプト）からは window.WC.auth 経由で利用する。
 *
 * 注: firebaseConfigのmeasurementIdは既存のGA4プロパティ(G-F4NHVEBKTK)とは別物のため、
 * Firebase Analyticsは意図的に組み込んでいない（既存のアクセス解析データを分裂させないため）。
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, deleteDoc, getDoc, getDocs, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBiERMBYoWJmYm2YjD8WtEzo9mrIvJx4Uw",
  authDomain: "waseda-calendar-1c6b0.firebaseapp.com",
  projectId: "waseda-calendar-1c6b0",
  storageBucket: "waseda-calendar-1c6b0.firebasestorage.app",
  messagingSenderId: "556628204009",
  appId: "1:556628204009:web:0c7473ba3d40b0ef6fd378"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/**
 * ポップアップでのログインを試み、ポップアップがブロックされている場合はリダイレクト方式に切り替える。
 * リダイレクト方式の結果は、遷移後のページ読み込み時にonAuthStateChanged経由で反映される
 * （下の getRedirectResult 呼び出しはエラー検知のみに使う）。
 */
function signInWithGoogle() {
  return signInWithPopup(auth, provider).catch((err) => {
    if (err && err.code === 'auth/popup-blocked') {
      return signInWithRedirect(auth, provider);
    }
    throw err;
  });
}

function signOutUser() {
  return signOut(auth);
}

function favoritesCollectionRef(uid) {
  return collection(db, 'users', uid, 'favorites');
}

/** お気に入り一覧を取得（{ id: eventId, reactionType, updatedAt }の配列） */
async function getFavorites() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(favoritesCollectionRef(user.uid));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** 1件分のお気に入り状態を取得（未ログイン・未登録ならnull） */
async function getFavorite(eventId) {
  const user = auth.currentUser;
  if (!user) return null;
  const ref = doc(db, 'users', user.uid, 'favorites', String(eventId));
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/** お気に入りのON/OFFを切り替える。ログインしていない場合は何もせずfalseを返す */
async function setFavorite(eventId, reactionType, isFavorited) {
  const user = auth.currentUser;
  if (!user) return false;
  const ref = doc(db, 'users', user.uid, 'favorites', String(eventId));
  if (isFavorited) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, { reactionType, updatedAt: serverTimestamp() });
  }
  return true;
}

/** 団体フォローのON/OFFを切り替える（将来の団体フォロー機能用、フォロー中の団体一覧もここから取れる） */
async function setOrgFollow(orgId, isFollowing) {
  const user = auth.currentUser;
  if (!user) return false;
  const ref = doc(db, 'users', user.uid, 'orgFollows', String(orgId));
  if (isFollowing) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, { updatedAt: serverTimestamp() });
  }
  return true;
}

async function getOrgFollows() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(collection(db, 'users', user.uid, 'orgFollows'));
  return snap.docs.map(d => d.id);
}

window.WC = window.WC || {};
window.WC.auth = {
  signInWithGoogle, signOutUser, getFavorites, getFavorite, setFavorite, setOrgFollow, getOrgFollows
};
window.WC.authLoading = true;

// リダイレクト方式でログインした場合のエラー（ポップアップと異なりtry/catchで拾えないため）を
// 'wc-auth-error' イベントとして通知する。成功時はonAuthStateChanged側で拾われるため、ここでは何もしない。
getRedirectResult(auth).catch((err) => {
  window.dispatchEvent(new CustomEvent('wc-auth-error', { detail: { error: err } }));
});

onAuthStateChanged(auth, (user) => {
  window.WC.authLoading = false;
  window.WC.currentUser = user;
  window.dispatchEvent(new CustomEvent('wc-auth-changed', { detail: { user } }));
});

window.WC.firebaseReady = true;
window.dispatchEvent(new CustomEvent('wc-firebase-ready'));
