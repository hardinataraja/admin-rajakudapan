// === Raja Kudapan Super Admin Panel (Multi-Tenant) ===
// Dibuat oleh ChatGPT (Super Admin Mode Version)
// Fitur utama:
// ✅ Multi-tenant via ?store= atau dropdown toko
// ✅ Query Firestore per toko (menu, order, settings)
// ✅ Kompatibel dengan UI lama admin panel
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc,
  updateDoc, deleteDoc, onSnapshot, query, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7VFvAsqRjiYinzfUfwabqHVvMWsvVhFo",
  authDomain: "raja-kudapan.firebaseapp.com",
  projectId: "raja-kudapan",
  storageBucket: "raja-kudapan.firebasestorage.app",
  messagingSenderId: "61175543723",
  appId: "1:61175543723:web:57d4a4f64480cb7f4344ee",
  measurementId: "G-ZGFTZER9RJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ======================================================
// 1️⃣  DETEKSI STORE (dari URL atau dropdown)
// ======================================================
const params = new URLSearchParams(window.location.search);
let storeID = params.get("store") || "";
let storeSelectEl = document.getElementById("storeSelect");

async function loadStoreList() {
  try {
    const snap = await getDocs(collection(db, "stores"));
    if (!storeSelectEl) {
      storeSelectEl = document.createElement("select");
      storeSelectEl.id = "storeSelect";
      storeSelectEl.style = "margin:8px;padding:6px;border-radius:6px;";
      document.querySelector("header")?.appendChild(storeSelectEl);
    }

    storeSelectEl.innerHTML = `<option value="">-- Pilih Toko --</option>`;
    snap.forEach((d) => {
      const s = d.id;
      storeSelectEl.innerHTML += `<option value="${s}" ${
        storeID === s ? "selected" : ""
      }>${d.data().storeName || s}</option>`;
    });

    storeSelectEl.onchange = () => {
      const newID = storeSelectEl.value;
      if (!newID) return Swal.fire("Pilih toko terlebih dahulu");
      localStorage.setItem("selectedStore", newID);
      location.search = `?store=${newID}`;
    };
  } catch (err) {
    console.error("[loadStoreList] gagal ambil daftar toko:", err);
  }
}

// fallback dari localStorage
if (!storeID) {
  const last = localStorage.getItem("selectedStore");
  if (last) storeID = last;
}

if (!storeID) {
  Swal.fire("Pilih toko terlebih dahulu", "", "info");
  loadStoreList();
  throw new Error("Store belum dipilih");
}

console.log("🧩 Admin aktif di store:", storeID);

// ======================================================
// 2️⃣  REFERENSI FIRESTORE BERDASARKAN STORE
// ======================================================
const menusRef = collection(db, "menus", storeID, "items");
const ordersRef = collection(db, "orders", storeID, "orders");
const settingsRef = collection(db, "settings", storeID, "config");

// ======================================================
// 3️⃣  LOAD MENU
// ======================================================
async function loadMenus() {
  const menuList = document.getElementById("menuList");
  if (!menuList) return;
  menuList.innerHTML = "Memuat menu...";
  try {
    const snap = await getDocs(query(menusRef, orderBy("name")));
    menuList.innerHTML = "";
    snap.forEach((d) => {
      const m = d.data();
      const row = document.createElement("div");
      row.className = "menu-item";
      row.innerHTML = `
        <img src="${m.image || "https://via.placeholder.com/100"}" width="80">
        <b>${m.name}</b> - Rp ${Number(m.price || 0).toLocaleString()}
        <button onclick="editMenu('${d.id}')">✏️</button>
        <button onclick="hapusMenu('${d.id}')">🗑️</button>
      `;
      menuList.appendChild(row);
    });
  } catch (err) {
    console.error("[loadMenus]", err);
    menuList.innerHTML = "Gagal memuat menu";
  }
}
window.loadMenus = loadMenus;

// ======================================================
// 4️⃣  TAMBAH MENU
// ======================================================
window.tambahMenu = async () => {
  const { value: formValues } = await Swal.fire({
    title: "Tambah Menu",
    html: `
      <input id="mNama" placeholder="Nama menu" class="swal2-input">
      <input id="mHarga" placeholder="Harga" class="swal2-input" type="number">
      <input id="mGambar" placeholder="URL Gambar" class="swal2-input">
    `,
    focusConfirm: false,
    preConfirm: () => ({
      name: document.getElementById("mNama").value,
      price: Number(document.getElementById("mHarga").value),
      image: document.getElementById("mGambar").value,
    }),
  });
  if (!formValues?.name) return;
  await addDoc(menusRef, formValues);
  Swal.fire("Berhasil", "Menu ditambahkan", "success");
  loadMenus();
};

// ======================================================
// 5️⃣  EDIT & HAPUS MENU
// ======================================================
window.editMenu = async (id) => {
  const d = await getDocs(menusRef);
  const menuDoc = d.docs.find((doc) => doc.id === id);
  if (!menuDoc) return Swal.fire("Menu tidak ditemukan");

  const data = menuDoc.data();
  const { value: formValues } = await Swal.fire({
    title: "Edit Menu",
    html: `
      <input id="eNama" value="${data.name}" class="swal2-input">
      <input id="eHarga" value="${data.price}" type="number" class="swal2-input">
      <input id="eGambar" value="${data.image}" class="swal2-input">
    `,
    preConfirm: () => ({
      name: document.getElementById("eNama").value,
      price: Number(document.getElementById("eHarga").value),
      image: document.getElementById("eGambar").value,
    }),
  });

  if (!formValues?.name) return;
  await updateDoc(doc(menusRef, id), formValues);
  Swal.fire("Berhasil", "Menu diperbarui", "success");
  loadMenus();
};

window.hapusMenu = async (id) => {
  await deleteDoc(doc(menusRef, id));
  Swal.fire("Dihapus", "Menu dihapus", "success");
  loadMenus();
};

// ======================================================
// 6️⃣  PESANAN REALTIME
// ======================================================
function loadOrders() {
  const orderList = document.getElementById("orderList");
  if (!orderList) return;
  orderList.innerHTML = "Memuat pesanan...";
  const qOrder = query(ordersRef, orderBy("time", "desc"));
  onSnapshot(qOrder, (snap) => {
    orderList.innerHTML = "";
    snap.forEach((d) => {
      const o = d.data();
      const div = document.createElement("div");
      div.className = "order-item";
      div.innerHTML = `
        <b>${o.code}</b> - ${o.nama} - Rp ${Number(o.total).toLocaleString()}
        <small>${o.status}</small>
        <button onclick="ubahStatus('${d.id}','${o.status}')">🔄</button>
      `;
      orderList.appendChild(div);
    });
  });
}
window.loadOrders = loadOrders;

// ======================================================
// 7️⃣  UBAH STATUS PESANAN
// ======================================================
window.ubahStatus = async (id, currentStatus) => {
  const next = {
    pending: "processing",
    processing: "delivering",
    delivering: "done",
    done: "done",
  }[currentStatus] || "done";
  await updateDoc(doc(ordersRef, id), { status: next });
  Swal.fire("Berhasil", `Status diubah ke ${next}`, "success");
};

// ======================================================
// 8️⃣  LOAD SETTINGS
// ======================================================
async function loadSettings() {
  const setEl = document.getElementById("settingsForm");
  if (!setEl) return;
  try {
    const snap = await getDocs(settingsRef);
    let cfg = {};
    snap.forEach((d) => (cfg = d.data()));
    document.getElementById("rekeningBCA").value = cfg.rekeningBCA || "";
    document.getElementById("dana").value = cfg.dana || "";
    document.getElementById("qris").value = cfg.qris || "";
  } catch (err) {
    console.error("[loadSettings]", err);
  }
}
window.loadSettings = loadSettings;

// ======================================================
// 9️⃣  SIMPAN SETTINGS
// ======================================================
window.simpanSettings = async () => {
  const data = {
    rekeningBCA: document.getElementById("rekeningBCA").value,
    dana: document.getElementById("dana").value,
    qris: document.getElementById("qris").value,
    storeName: storeID,
  };
  await setDoc(doc(settingsRef, "default"), data);
  Swal.fire("Tersimpan", "Pengaturan diperbarui", "success");
};

// ======================================================
// 🔟  INIT
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  loadStoreList();
  loadMenus();
  loadOrders();
  loadSettings();
});