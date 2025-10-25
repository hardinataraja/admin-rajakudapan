/* ===========================
   script.js — Raja Kudapan Admin (v2)
   Full ready-to-replace file
   =========================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, onSnapshot, query, setDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

/* ------------------ CONFIG ------------------ */
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
const auth = getAuth(app);

/* ------------------ DOM HELPERS ------------------ */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ------------------ AUTH: protect + logout ------------------ */
onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = "login.html";
});

const logoutBtn = document.getElementById("btnLogout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "login.html";
    } catch (err) {
      console.error("Logout error:", err);
      Swal.fire("Error", "Gagal logout", "error");
    }
  });
}

/* ------------------ CHART ------------------ */
let chart;
function renderChart(stats) {
  const ctx = document.getElementById("ordersChart").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Pending", "Processing", "Delivering", "Done"],
      datasets: [{
        data: [
          stats.pending || 0,
          stats.processing || 0,
          stats.delivering || 0,
          stats.done || 0
        ],
        backgroundColor: ["#f9a825", "#42a5f5", "#ab47bc", "#00c853"]
      }]
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });
}

/* ------------------ UTILS ------------------ */
function formatRupiah(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}
function formatDateTime(val) {
  if (!val) return "-";
  // support ISO string, number ms, or Firestore Timestamp-like { seconds }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d)) return d.toLocaleString("id-ID");
  }
  if (val.seconds) {
    // Firestore Timestamp
    return new Date(val.seconds * 1000).toLocaleString("id-ID");
  }
  try {
    return new Date(val).toLocaleString("id-ID");
  } catch {
    return String(val);
  }
}
function getMillisFromTimeField(d) {
  // Try common time fields
  const candidates = [d.time, d.timestamp, d.createdAt, d.created_at];
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string" || typeof c === "number") {
      const ms = Date.parse(c);
      if (!isNaN(ms)) return ms;
      if (typeof c === "number") return c;
    }
    if (c.seconds) return c.seconds * 1000;
  }
  // fallback: use Firestore doc read order (return now)
  return Date.now();
}

/* ------------------ NAVIGATION (UI) ------------------ */
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    const target = btn.dataset.target;
    if (target) $("#" + target).classList.add("active");
  });
});

/* ------------------ ORDERS (realtime, client-side range filter) ------------------ */
let ordersUnsub = null;
let previousCount = 0;

function subscribeOrders(range = "7") {
  // unsubscribe previous
  if (ordersUnsub) ordersUnsub();

  // Listen to whole collection (we'll sort & filter client-side for robustness)
  const colRef = collection(db, "orders");
  ordersUnsub = onSnapshot(colRef, (snap) => {
    // Build array of docs with sort key
    const docs = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      docs.push({ id: docSnap.id, data });
    });

    // sort by time desc (using helper)
    docs.sort((a, b) => getMillisFromTimeField(b.data) - getMillisFromTimeField(a.data));

    // apply range filter client-side if needed
    let filtered = docs;
    if (range !== "all" && Number(range)) {
      const days = Number(range);
      const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
      filtered = docs.filter(d => getMillisFromTimeField(d.data) >= cutoff);
    }

    renderOrdersTable(filtered);

    // badge & toast for new orders
    const currentCount = docs.length;
    const badge = $("#orderBadge");
    if (previousCount && currentCount > previousCount) {
      if (badge) {
        badge.classList.remove("hidden");
        setTimeout(() => badge.classList.add("hidden"), 3000);
      }
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "info",
        title: "Pesanan baru masuk",
        showConfirmButton: false,
        timer: 2200
      });
    }
    previousCount = currentCount;
  }, (err) => {
    console.error("orders snapshot err", err);
  });
}

function renderOrdersTable(docs) {
  const tbody = $("#ordersTable");
  tbody.innerHTML = "";

  const stats = { pending: 0, processing: 0, delivering: 0, done: 0 };
  let totalSalesToday = 0;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayMs = todayStart.getTime();

  docs.forEach((docObj) => {
    const id = docObj.id;
    const d = docObj.data;
    // total amount fallback
    const total = Number(d.total_bayar ?? d.total ?? d.amount ?? 0);
    // compute status counts
    stats[d.status] = (stats[d.status] || 0) + 1;
    // sales today
    if (getMillisFromTimeField(d) >= todayMs && d.status !== "pending") totalSalesToday += total;

    // items to HTML
    const itemsList = (d.items || []).map(it => {
      const name = it.name || it.nama || it.title || "-";
      const qty = it.qty ?? it.quantity ?? it.jumlah ?? 1;
      const price = Number(it.price ?? it.harga ?? 0);
      return `${name} x${qty} (Rp ${price.toLocaleString("id-ID")})`;
    }).join("<br>");

    // payment method detection
    const payMethod = d.paymentMethod || d.metode || d.metode_bayar || d.metodeBayar || d.metodePembayaran || "Unknown";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="order-checkbox" data-id="${id}" type="checkbox"></td>
      <td>${d.kode || d.code || "-"}</td>
      <td>${formatDateTime(d.time || d.timestamp || d.createdAt || d.created_at)}</td>
      <td>${d.nama || d.name || "-"}</td>
      <td>${d.nohp || d.whatsapp || d.phone || "-"}</td>
      <td>${(d.alamat || "-").replace(/\n/g,"<br>")}</td>
      <td>${itemsList || "-"}</td>
      <td>${formatRupiah(total)}</td>
      <td>${payMethod}</td>
      <td><span class="status ${d.status || ''}">${d.status || 'pending'}</span></td>
      <td>
        <select data-id="${id}" class="status-select" style="margin-bottom:6px;">
          <option value="pending" ${d.status==="pending"?"selected":""}>Pending</option>
          <option value="processing" ${d.status==="processing"?"selected":""}>Processing</option>
          <option value="delivering" ${d.status==="delivering"?"selected":""}>Delivering</option>
          <option value="done" ${d.status==="done"?"selected":""}>Done</option>
        </select>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn-ghost btn-detail" data-id="${id}">Detail</button>
          <button class="btn" data-id="${id}" data-action="print">Print</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // update dashboard numbers & chart
  const totalAll = (stats.pending||0) + (stats.processing||0) + (stats.delivering||0) + (stats.done||0);
  $("#totalOrders").textContent = totalAll;
  $("#pendingOrders").textContent = stats.pending || 0;
  $("#processingOrders").textContent = stats.processing || 0;
  $("#doneOrders").textContent = stats.done || 0;
  $("#totalSalesToday").textContent = formatRupiah(totalSalesToday);
  renderChart(stats);

  // attach events after table render
  attachOrderEvents();
}

/* ------------------ ORDER ACTIONS ------------------ */
function attachOrderEvents() {
  // status change
  $$(".status-select").forEach(sel => {
    sel.onchange = async () => {
      try {
        await updateDoc(doc(db, "orders", sel.dataset.id), { status: sel.value });
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Status pesanan diperbarui",
          showConfirmButton: false,
          timer: 1500
        });
      } catch (err) {
        console.error("update status err", err);
        Swal.fire("Error", "Gagal update status", "error");
      }
    };
  });

  // detail button
  $$(".btn-detail").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      try {
        // fetch single doc
        const snaps = await getDocs(collection(db, "orders"));
        let data = null;
        snaps.forEach(s => { if (s.id === id) data = { id: s.id, ...s.data() }; });
        if (!data) {
          Swal.fire("Error", "Pesanan tidak ditemukan", "error");
          return;
        }
        showOrderDetail(data);
      } catch (err) {
        console.error("detail err", err);
        Swal.fire("Error", "Gagal mengambil detail pesanan", "error");
      }
    };
  });

  // print button
  $$("button[data-action='print']").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      try {
        const snaps = await getDocs(collection(db, "orders"));
        let data = null;
        snaps.forEach(s => { if (s.id === id) data = { id: s.id, ...s.data() }; });
        if (!data) {
          Swal.fire("Error", "Pesanan tidak ditemukan", "error");
          return;
        }
        await printInvoiceAsPNG(data);
      } catch (err) {
        console.error("print err", err);
        Swal.fire("Error", "Gagal membuat invoice", "error");
      }
    };
  });

  // checkboxes (single) don't immediately delete — delete massal handled by Delete Selected button
  $$(".order-checkbox").forEach(cb => {
    cb.onchange = () => {
      // keep UI responsive; actual deletion done by #btnDeleteSelected
      // optional: enable/disable delete button visually
    };
  });
}

/* ------------------ SHOW ORDER DETAIL (SweetAlert2) ------------------ */
function showOrderDetail(data) {
  const itemsHtml = (data.items || []).map(it => {
    const name = it.name || it.nama || "-";
    const qty = it.qty ?? it.quantity ?? 1;
    const price = Number(it.price ?? it.harga ?? 0);
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${name}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${qty}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">Rp ${price.toLocaleString("id-ID")}</td>
    </tr>`;
  }).join("");

  const total = Number(data.total_bayar ?? data.total ?? 0);
  const payMethod = data.paymentMethod || data.metode || data.metode_bayar || "Unknown";

  const html = `
    <div style="text-align:left">
      <p><strong>Kode:</strong> ${data.kode || data.code || "-"}</p>
      <p><strong>Waktu:</strong> ${formatDateTime(data.time || data.timestamp || data.createdAt)}</p>
      <p><strong>Nama:</strong> ${data.nama || data.name || "-"}</p>
      <p><strong>No WA:</strong> ${data.nohp || data.whatsapp || "-"}</p>
      <p><strong>Alamat:</strong><br>${(data.alamat||"-").replace(/\n/g,"<br>")}</p>
      <p><strong>Metode Bayar:</strong> ${payMethod}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding-bottom:6px">Item</th>
            <th style="text-align:center;border-bottom:1px solid #ddd;padding-bottom:6px">Qty</th>
            <th style="text-align:right;border-bottom:1px solid #ddd;padding-bottom:6px">Harga</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          <tr>
            <td style="padding:6px 8px"></td>
            <td style="padding:6px 8px"></td>
            <td style="padding:6px 8px;text-align:right;border-top:1px solid #ddd"><strong>${formatRupiah(total)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top:8px"><strong>Catatan:</strong> ${data.catatan || "-"}</p>
    </div>
  `;

  Swal.fire({
    title: 'Detail Pesanan',
    html,
    width: Math.min(640, window.innerWidth * 0.95),
    showCancelButton: true,
    confirmButtonText: 'Print (PNG)',
    cancelButtonText: 'Tutup',
    preConfirm: async () => {
      // find data again and print
      await printInvoiceAsPNG(data);
    }
  });
}

/* ------------------ PRINT INVOICE -> PNG (html2canvas) ------------------ */
async function printInvoiceAsPNG(data) {
  // create off-screen invoice element
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.background = "#fff";
  container.style.padding = "12px";
  container.style.width = "360px";
  container.style.fontFamily = "Poppins, Arial, sans-serif";
  container.style.color = "#000";
  container.style.fontSize = "12px";
  container.id = "invoice-to-print";

  const itemsHtml = (data.items || []).map(it => {
    const name = it.name || it.nama || "-";
    const qty = it.qty ?? 1;
    const price = Number(it.price ?? it.harga ?? 0);
    return `<div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <div style="flex:1">${name}</div>
      <div style="width:36px;text-align:center">${qty}</div>
      <div style="width:80px;text-align:right">${price.toLocaleString("id-ID")}</div>
    </div>`;
  }).join("");

  const total = Number(data.total_bayar ?? data.total ?? 0);
  const payMethod = data.paymentMethod || data.metode || data.metode_bayar || "Unknown";

  container.innerHTML = `
    <div style="text-align:center;margin-bottom:6px">
      <div style="font-weight:700">RAJA KUDAPAN</div>
      <div style="font-size:11px">Nota Penjualan</div>
      <hr style="border:none;border-top:1px dashed #000;margin:6px 0">
    </div>
    <div style="margin-bottom:6px">
      <div><strong>Kode:</strong> ${data.kode || data.code || "-"}</div>
      <div><strong>Waktu:</strong> ${formatDateTime(data.time || data.timestamp || data.createdAt)}</div>
      <div><strong>Nama:</strong> ${data.nama || data.name || "-"}</div>
      <div><strong>WA:</strong> ${data.nohp || data.whatsapp || "-"}</div>
      <div><strong>Metode:</strong> ${payMethod}</div>
      <hr style="border:none;border-top:1px dashed #000;margin:6px 0">
    </div>
    <div style="margin-bottom:6px">${itemsHtml}</div>
    <div style="border-top:1px dashed #000;padding-top:6px;margin-top:6px;display:flex;justify-content:space-between">
      <div><strong>Total</strong></div>
      <div><strong>${formatRupiah(total)}</strong></div>
    </div>
    <div style="margin-top:8px;font-size:11px">Terima kasih - Selamat Menikmati</div>
  `;

  document.body.appendChild(container);
  // small wait to render
  await new Promise(r => setTimeout(r, 120));

  try {
    // use global html2canvas (loaded via CDN in index.html)
    if (typeof html2canvas !== "undefined") {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false });
      const dataUrl = canvas.toDataURL("image/png");
      // open in new tab or trigger download
      const w = window.open("");
      if (!w) {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${data.kode || 'invoice'}.png`;
        a.click();
      } else {
        w.document.write(`<img src="${dataUrl}" style="max-width:100%"/>`);
        w.document.close();
      }
    } else {
      // fallback: render very simple canvas
      const canvas = document.createElement("canvas");
      canvas.width = 380; canvas.height = 480;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = "#000"; ctx.font = "14px sans-serif";
      ctx.fillText("RAJA KUDAPAN", 20, 30);
      ctx.fillText(`Kode: ${data.kode || "-"}`, 20, 60);
      ctx.fillText(`Nama: ${data.nama || "-"}`, 20, 80);
      ctx.fillText(`Total: ${formatRupiah(total)}`, 20, 100);
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl; a.download = `${data.kode || 'invoice'}.png`; a.click();
    }
  } catch (err) {
    console.error("printInvoiceAsPNG err", err);
    Swal.fire("Error", "Gagal membuat gambar invoice", "error");
  } finally {
    const el = document.getElementById("invoice-to-print");
    if (el) el.remove();
  }
}

/* ------------------ DELETE SELECTED ORDERS ------------------ */
const btnDeleteSelected = document.getElementById("btnDeleteSelected");
if (btnDeleteSelected) {
  btnDeleteSelected.addEventListener("click", async () => {
    const selected = Array.from(document.querySelectorAll(".order-checkbox:checked")).map(i => i.dataset.id);
    if (!selected.length) {
      Swal.fire("Info", "Belum ada order yang dipilih", "info");
      return;
    }
    const res = await Swal.fire({
      title: `Hapus ${selected.length} order?`,
      text: "Tindakan ini tidak bisa dibatalkan",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Hapus"
    });
    if (!res.isConfirmed) return;
    try {
      for (const id of selected) {
        await deleteDoc(doc(db, "orders", id));
      }
      Swal.fire("Terhapus", "Order terpilih berhasil dihapus", "success");
    } catch (err) {
      console.error("delete selected err", err);
      Swal.fire("Error", "Gagal menghapus beberapa order", "error");
    }
  });
}

/* select all checkbox handler */
document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "checkAllOrders") {
    document.querySelectorAll(".order-checkbox").forEach(cb => cb.checked = e.target.checked);
  }
});

/* ------------------ MENU MANAGEMENT (CRUD) ------------------ */
async function loadMenus() {
  try {
    const snap = await getDocs(collection(db, "menus"));
    const tbody = $("#menuTable");
    tbody.innerHTML = "";
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.name || "-"}</td>
        <td>${formatRupiah(d.price)}</td>
        <td>${d.stock ?? "-"}</td>
        <td>${d.category || "-"}</td>
        <td><img src="${d.image || ''}" style="width:50px;height:50px;object-fit:cover;border-radius:6px"></td>
        <td>
          <button class="btn-ghost" data-id="${docSnap.id}" data-action="edit">Edit</button>
          <button class="btn" data-id="${docSnap.id}" data-action="delete">Hapus</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // attach menu buttons
    document.querySelectorAll("[data-action='edit']").forEach(b => b.onclick = () => showMenuForm(b.dataset.id));
    document.querySelectorAll("[data-action='delete']").forEach(b => b.onclick = () => deleteMenu(b.dataset.id));
  } catch (err) {
    console.error("loadMenus err", err);
  }
}

$("#addMenuBtn").onclick = () => showMenuForm(null);

async function showMenuForm(id = null) {
  let data = { name: "", price: "", stock: "", category: "", image: "" };
  if (id) {
    try {
      const all = await getDocs(collection(db, "menus"));
      all.forEach(d => { if (d.id === id) data = d.data(); });
    } catch (err) { console.error(err); }
  }

  const widthOpt = window.innerWidth < 480 ? "90%" : 460;

  const { value: formValues } = await Swal.fire({
    title: id ? "Edit Menu" : "Tambah Menu",
    html: `
      <input id="mName" class="swal2-input" placeholder="Nama" value="${data.name||''}">
      <input id="mPrice" type="number" class="swal2-input" placeholder="Harga" value="${data.price||''}">
      <input id="mStock" type="number" class="swal2-input" placeholder="Stok" value="${data.stock||''}">
      <input id="mCategory" class="swal2-input" placeholder="Kategori" value="${data.category||''}">
      <input id="mImage" class="swal2-input" placeholder="URL Gambar" value="${data.image||''}">
    `,
    focusConfirm: false,
    width: widthOpt,
    preConfirm: () => ({
      name: document.getElementById("mName").value,
      price: Number(document.getElementById("mPrice").value),
      stock: Number(document.getElementById("mStock").value),
      category: document.getElementById("mCategory").value,
      image: document.getElementById("mImage").value
    })
  });

  if (!formValues) return;
  try {
    if (id) {
      await updateDoc(doc(db, "menus", id), formValues);
      Swal.fire("Tersimpan", "Menu diperbarui", "success");
    } else {
      await addDoc(collection(db, "menus"), formValues);
      Swal.fire("Berhasil", "Menu ditambahkan", "success");
    }
    loadMenus();
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "Gagal menyimpan menu", "error");
  }
}

async function deleteMenu(id) {
  const res = await Swal.fire({ title: "Hapus menu ini?", showCancelButton: true, confirmButtonText: "Hapus" });
  if (!res.isConfirmed) return;
  try {
    await deleteDoc(doc(db, "menus", id));
    Swal.fire("Terhapus", "Menu dihapus", "success");
    loadMenus();
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "Gagal menghapus menu", "error");
  }
}

/* ------------------ MERCHANT SETTINGS ------------------ */
const settingsRef = doc(db, "settings", "merchant");
const qrisInput = document.getElementById("qris");
const qrisPreview = document.getElementById("qrisPreview");

function updateQrisPreview() {
  const url = qrisInput?.value?.trim();
  if (qrisPreview) {
    qrisPreview.src = url || "";
    qrisPreview.style.display = url ? "block" : "none";
  }
}

async function loadSettings() {
  try {
    const snap = await getDocs(collection(db, "settings"));
    snap.forEach((d) => {
      const data = d.data();
      $("#storeName").value = data.storeName || "";
      $("#rekeningBRI").value = data.rekeningBRI || "";
      $("#rekeningBCA").value = data.rekeningBCA || "";
      $("#dana").value = data.dana || "";
      $("#ovo").value = data.ovo || "";
      $("#gopay").value = data.gopay || "";
      $("#linkaja").value = data.linkaja || "";
      $("#qris").value = data.qris || "";
    });
    updateQrisPreview();
  } catch (err) {
    console.error("loadSettings err", err);
  }
}

$("#btnLoadSettings")?.addEventListener("click", loadSettings);

$("#merchantForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    storeName: $("#storeName").value,
    rekeningBRI: $("#rekeningBRI").value,
    rekeningBCA: $("#rekeningBCA").value,
    dana: $("#dana").value,
    ovo: $("#ovo").value,
    gopay: $("#gopay").value,
    linkaja: $("#linkaja").value,
    qris: $("#qris").value
  };
  try {
    await setDoc(settingsRef, data);
    Swal.fire("Disimpan", "Pengaturan merchant diperbarui", "success");
    updateQrisPreview();
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "Gagal menyimpan pengaturan", "error");
  }
});

if (qrisInput) qrisInput.addEventListener("input", updateQrisPreview);

/* ------------------ FILTER CONTROLS & INIT ------------------ */
$("#ordersFilter")?.addEventListener("change", (e) => subscribeOrders(e.target.value));
$("#btnClearFilter")?.addEventListener("click", () => { $("#ordersFilter").value = "1"; subscribeOrders("1"); });
$("#btnRefresh")?.addEventListener("click", () => { const dr = $("#dashboardRange").value; subscribeOrders(dr); loadMenus(); loadSettings(); });
$("#dashboardRange")?.addEventListener("change", (e) => subscribeOrders(e.target.value));

/* Initialize */
subscribeOrders($("#dashboardRange")?.value || "7");
loadMenus();
loadSettings();