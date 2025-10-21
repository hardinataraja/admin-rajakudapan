import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, onSnapshot, orderBy, query, where, setDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

/* ------------------ Firebase Config ------------------ */
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

const $ = (s) => document.querySelector(s);

/* ------------------ NAVIGATION ------------------ */
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    $("#" + btn.dataset.target).classList.add("active");
  });
});

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
function isoDateNDaysAgo(n) {
  if (n === "all") return null;
  const d = new Date();
  if (n === 1) {
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const ms = Date.now() - (Number(n) * 24 * 60 * 60 * 1000);
  return new Date(ms).toISOString();
}

/* ------------------ ORDERS REALTIME + FILTER ------------------ */
let ordersUnsub = null;
let previousCount = 0;

function subscribeOrders(range = "7") {
  if (ordersUnsub) ordersUnsub();

  const startISO = isoDateNDaysAgo(range);
  let q;
  if (startISO) q = query(collection(db, "orders"), where("time", ">=", startISO), orderBy("time", "desc"));
  else q = query(collection(db, "orders"), orderBy("time", "desc"));

  ordersUnsub = onSnapshot(q, (snap) => {
    const tbody = $("#ordersTable");
    tbody.innerHTML = "";

    let stats = { pending: 0, processing: 0, delivering: 0, done: 0 };
    let totalSalesToday = 0;
    let currentCount = snap.size;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const total = Number(d.total || 0);

      // Tally status
      stats[d.status] = (stats[d.status] || 0) + 1;

      // Jika pesanan hari ini dan sudah dibayar/selesai
      if (d.time >= todayISO && d.status !== "pending") totalSalesToday += total;

      // Build row
      const tr = document.createElement("tr");
      tr.innerHTML = `
  <td>${d.code || "-"}</td>
  <td>${d.nama || "-"}</td>
  <td><a href="https://wa.me/${(d.nohp || "").replace(/[^0-9]/g,"")}" target="_blank">${d.nohp || "-"}</a></td>
  <td>${(d.alamat || "").replace(/\n/g,"<br>")}</td>
  <td>${formatRupiah(total)}</td>
  <td><span class="status ${d.status}">${d.status}</span></td>
  <td>
    <select data-id="${docSnap.id}" class="status-select">
      <option value="pending" ${d.status==="pending"?"selected":""}>Pending</option>
      <option value="processing" ${d.status==="processing"?"selected":""}>Processing</option>
      <option value="delivering" ${d.status==="delivering"?"selected":""}>Delivering</option>
      <option value="done" ${d.status==="done"?"selected":""}>Done</option>
    </select>
  </td>
`;
      tbody.appendChild(tr);
    });

    // Show badge for new orders
    const badge = $("#orderBadge");
    if (previousCount && currentCount > previousCount) {
      badge.classList.remove("hidden");
      setTimeout(() => badge.classList.add("hidden"), 3000);
    }
    previousCount = currentCount;

    // Update dashboard
    const totalAll = (stats.pending||0) + (stats.processing||0) + (stats.delivering||0) + (stats.done||0);
    $("#totalOrders").textContent = totalAll;
    $("#pendingOrders").textContent = stats.pending || 0;
    $("#processingOrders").textContent = stats.processing || 0;
    $("#doneOrders").textContent = stats.done || 0;
    $("#totalSalesToday").textContent = formatRupiah(totalSalesToday);
    renderChart(stats);

    // Attach update handlers
    document.querySelectorAll(".status-select").forEach((sel) => {
      sel.onchange = async () => {
        try {
          await updateDoc(doc(db, "orders", sel.dataset.id), { status: sel.value });
          Swal.fire("Updated", "Status pesanan diperbarui", "success");
        } catch (err) {
          console.error(err);
          Swal.fire("Error", "Gagal update status", "error");
        }
      };
    });
  }, (err) => console.error("orders snapshot err", err));
}

/* ------------------ MENU MANAGEMENT ------------------ */
async function loadMenus() {
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

  document.querySelectorAll("[data-action='edit']").forEach(b => b.onclick = () => showMenuForm(b.dataset.id));
  document.querySelectorAll("[data-action='delete']").forEach(b => b.onclick = () => deleteMenu(b.dataset.id));
}

$("#addMenuBtn").onclick = () => showMenuForm(null);

async function showMenuForm(id = null) {
  let data = { name: "", price: "", stock: "", category: "", image: "" };
  if (id) {
    const all = await getDocs(collection(db, "menus"));
    all.forEach(d => { if (d.id === id) data = d.data(); });
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

// elemen input & preview QRIS
const qrisInput = document.getElementById("qris");
const qrisPreview = document.getElementById("qrisPreview");

function updateQrisPreview() {
  const url = qrisInput?.value?.trim();
  if (qrisPreview) {
    qrisPreview.src = url || "";
    qrisPreview.style.display = url ? "block" : "none";
  }
}

// load data merchant
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
    updateQrisPreview(); // tampilkan preview jika ada
  } catch (err) {
    console.error("loadSettings err", err);
  }
}

// tombol "Load" manual
$("#btnLoadSettings").onclick = loadSettings;

// form simpan pengaturan
$("#merchantForm").onsubmit = async (e) => {
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
    updateQrisPreview(); // update preview setelah disimpan
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "Gagal menyimpan pengaturan", "error");
  }
};

// update preview setiap kali user ubah URL QRIS
if (qrisInput) {
  qrisInput.addEventListener("input", updateQrisPreview);
}

/* ------------------ FILTER CONTROL ------------------ */
$("#ordersFilter").addEventListener("change", () => {
  subscribeOrders($("#ordersFilter").value);
});
$("#btnClearFilter").addEventListener("click", () => {
  $("#ordersFilter").value = "1";
  subscribeOrders("1");
});
$("#btnRefresh").addEventListener("click", () => {
  const dr = $("#dashboardRange").value;
  subscribeOrders(dr);
  loadMenus();
  loadSettings();
});

/* Start default: 7 hari */
subscribeOrders($("#dashboardRange").value || "7");
loadMenus();
loadSettings();

$("#dashboardRange").addEventListener("change", (e) => {
  subscribeOrders(e.target.value);
});