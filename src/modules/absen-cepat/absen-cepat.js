import { supabase } from '../../lib/supabase.js';
import { store } from '../../state/store.js';
import { escHtmlFan_ } from '../fan/fan.js';
import {
  muatAbsensiTanggalTerpilih,
  syncTanggalInputAbsensiUtama,
  getSesiKey,
  getSesiStatusData,
  setSesiStatusData,
  updateStatistikRingkas,
  renderFormAbsensiBertahap,
  simpanAbsensiJam,
  bukaModalGeneratorWA,
  populateDatalistPengganti
} from '../absensi/absensi.js';

// ============================================================================
// 1. STATE LOKAL & INSTANCE FLATPICKR ABSEN CEPAT
// ============================================================================
let flatpickrAbsenCepatInstance = null;
let acGestureInitialized = false;
let acWasDragging = false;
let cacheDaftarSemuaUser = null;

/**
 * Sinkronisasi tanggal dari halaman Absensi Asatidz ke input Flatpickr Absen Cepat
 */
export function syncTanggalInputAbsenCepat(tanggalYMD) {
  if (!tanggalYMD) return;
  const inputCepat = document.getElementById('inputTglAbsensiCepat');
  if (inputCepat) inputCepat.value = tanggalYMD;
  if (flatpickrAbsenCepatInstance) {
    flatpickrAbsenCepatInstance.setDate(tanggalYMD, false);
  }
}

/**
 * Inisialisasi halaman Absen Cepat saat menu dibuka
 */
export async function inisialisasiHalamanAbsenCepat() {
  const inputCepat = document.getElementById('inputTglAbsensiCepat');

  // Tentukan tanggal default: Auto-Forward ke H+1 jika sudah lewat jam 18:00 WIB (Maghrib)
  let defaultDateStr = store.absensiState.tanggal;
  if (!defaultDateStr) {
    const today = new Date();
    if (today.getHours() >= 18) {
      today.setDate(today.getDate() + 1);
    }
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    defaultDateStr = `${yyyy}-${mm}-${dd}`;
    store.absensiState.tanggal = defaultDateStr;
  }

  if (inputCepat && window.flatpickr && !flatpickrAbsenCepatInstance) {
    flatpickrAbsenCepatInstance = window.flatpickr(inputCepat, {
      locale: 'id',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'l, d F Y',
      disableMobile: 'true',
      defaultDate: defaultDateStr,
      onChange: async function (selectedDates, dateStr) {
        inputCepat.value = dateStr;
        syncTanggalInputAbsensiUtama(dateStr);
        await muatAbsensiTanggalTerpilih(false);
        renderAbsenCepat();
      }
    });
  } else if (inputCepat && !inputCepat.value) {
    inputCepat.value = defaultDateStr;
  }

  populateDatalistPengganti();

  // Jika data jadwal atau master Asatidz belum siap di memori, muat terlebih dahulu
  const belumAdaSesi =
    !store.globalDataAsatidz ||
    store.globalDataAsatidz.length === 0 ||
    !store.absensiState.hari ||
    ([1, 2, 3, 4].every(j => (store.absensiState.sesiHariIni[j] || []).length === 0) &&
      store.absensiState.hari !== 'Jumat');

  if (belumAdaSesi) {
    syncTanggalInputAbsensiUtama(defaultDateStr);
    await muatAbsensiTanggalTerpilih(false);
  } else {
    syncTanggalInputAbsenCepat(store.absensiState.tanggal);
  }

  renderAbsenCepat();
}

// ============================================================================
// 2. ENGINE RENDER TABS, HEADER KONTROL, BAR FILTER, & KARTU PER BLOK
// ============================================================================

/**
 * Menentukan jam aktif default: jam pertama (1..4) yang belum lengkap diabsen, atau Jam 1
 */
export function tentukanJamAktifDefault() {
  for (let j = 1; j <= 4; j++) {
    const list = store.absensiState.sesiHariIni[j] || [];
    if (list.length === 0) continue;
    const allSaved = list.every(s => !!store.absensiState.savedRecords[getSesiKey(s)]);
    if (!allSaved) return j;
  }
  return 1;
}

/**
 * Mengganti tab sesi Jam aktif (1, 2, 3, atau 4) pada Absen Cepat
 */
export function gantiJamAktifAbsenCepat(jam, arahSwipe = null) {
  store.absenCepatState.jamAktif = parseInt(jam, 10) || 1;
  store.absenCepatState.arahSwipe = arahSwipe || null;
  store.absenCepatState.selectedKeys.clear();
  store.absenCepatState.search = '';
  store.absenCepatState.filterBlok = '';
  renderAbsenCepat();
}

/**
 * Fungsi utama render Absen Cepat — dipanggil setiap kali data atau filter berubah
 */
export function renderAbsenCepat() {
  const page = document.getElementById('page-absen-cepat');
  if (!page) return;

  if (store.absenCepatState.initializedForDate !== store.absensiState.tanggal) {
    store.absenCepatState.jamAktif = tentukanJamAktifDefault();
    store.absenCepatState.selectedKeys.clear();
    store.absenCepatState.initializedForDate = store.absensiState.tanggal;
  }

  syncTanggalInputAbsenCepat(store.absensiState.tanggal);

  const badgeHari = document.getElementById('acBadgeHari');
  if (badgeHari) badgeHari.innerText = store.absensiState.hari || '-';

  renderAcTabs();
  renderAcHeader();
  renderAcFilterBar();
  renderAcCards();
}

/**
 * Merender 4 tombol bulat Tab Sesi Jam (1, 2, 3, 4)
 */
export function renderAcTabs() {
  [1, 2, 3, 4].forEach(j => {
    const btn = document.querySelector(`.ac-tab-jam[data-jam="${j}"]`);
    if (!btn) return;
    const list = store.absensiState.sesiHariIni[j] || [];
    const totalSesi = list.length;
    let terisi = 0;
    list.forEach(s => {
      if (store.absensiState.savedRecords[getSesiKey(s)]) terisi++;
    });
    const isDone = totalSesi > 0 && terisi === totalSesi;
    btn.classList.toggle('active', j === store.absenCepatState.jamAktif);
    btn.innerHTML = `<span class="fw-bold">${j}</span> ${
      isDone ? '<i class="bi bi-check-circle-fill ms-1 text-white" style="font-size:11px;"></i>' : ''
    }`;
  });
}

/**
 * Merender panel Header Kontrol & Aksi Massal (`#acHeaderControls`)
 */
export function renderAcHeader() {
  const jam = store.absenCepatState.jamAktif;
  const container = document.getElementById('acHeaderControls');
  if (!container) return;

  if (store.absensiState.isLibur) {
    const katLibur = store.absensiState.infoLibur
      ? store.absensiState.infoLibur.kategori
      : 'Hari ini diliburkan';
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bi bi-slash-circle text-danger mb-2" style="font-size:2.5rem;"></i>
        <h6 class="fw-bold text-danger">${escHtmlFan_(katLibur)}</h6>
      </div>`;
    const filterBar = document.getElementById('acFilterBar');
    const cardsBox = document.getElementById('acCardsContainer');
    if (filterBar) filterBar.innerHTML = '';
    if (cardsBox) cardsBox.innerHTML = '';
    return;
  }

  const listSesi = store.absensiState.sesiHariIni[jam] || [];
  const totalSesi = listSesi.length;
  let terisi = 0;
  listSesi.forEach(s => {
    if (store.absensiState.savedRecords[getSesiKey(s)]) terisi++;
  });

  const labelWaktu = jam <= 3 ? '(Malam Sebelumnya)' : '(Siang Hari)';
  const badgeWaktuColor = jam <= 3 ? 'bg-dark' : 'bg-primary';
  const selCount = store.absenCepatState.selectedKeys.size;
  const isLocked = !store.absensiState.unlockedJams[jam];

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
      <div class="d-flex align-items-center gap-3">
        <div class="d-flex flex-column align-items-start">
          <span class="badge bg-success fs-6 px-3 py-2 rounded-pill shadow-xs mb-1">Jam Ke-${jam}</span>
          <span class="badge ${badgeWaktuColor} bg-opacity-75 text-white" style="font-size:10px;">${labelWaktu}</span>
        </div>
        <div>
          <span class="fw-bold text-dark d-block">Daftar Pengajar Jam Ke-${jam}</span>
          <span class="text-muted small">Progres: <strong class="text-success">${terisi}</strong> dari <strong>${totalSesi}</strong> sesi diabsen</span>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <button class="btn btn-sm btn-success fw-bold shadow-sm d-flex align-items-center gap-1" onclick="window.bukaModalGeneratorWA()">
          <i class="bi bi-whatsapp"></i><span>Chat WA</span>
        </button>
        <div id="acToolbarMassal" class="${selCount > 0 ? 'd-flex' : 'd-none'} align-items-center gap-1 bg-white border border-success border-opacity-50 rounded-3 p-1 shadow-xs">
          <span class="badge bg-success text-white me-1">${selCount} Dipilih</span>
          <button type="button" class="btn btn-sm btn-outline-primary fw-bold py-1 px-2" onclick="window.terapkanStatusMassalAbsenCepat('Izin')">Izin</button>
          <button type="button" class="btn btn-sm btn-outline-warning text-dark fw-bold py-1 px-2" onclick="window.terapkanStatusMassalAbsenCepat('Sakit')">Sakit</button>
          <button type="button" class="btn btn-sm btn-outline-danger fw-bold py-1 px-2" onclick="window.terapkanStatusMassalAbsenCepat('Alfa')">Alfa</button>
          <button type="button" class="btn btn-sm btn-light text-muted py-1 px-2 border-0" onclick="window.batalkanPilihanAbsenCepat()"><i class="bi bi-x-lg"></i></button>
        </div>
        <button class="btn btn-sm btn-outline-success" onclick="window.tandaiSemuaHadirAbsenCepat()" ${isLocked || totalSesi === 0 ? 'disabled' : ''}>
          <i class="bi bi-check-all me-1"></i> Tandai Semua Hadir
        </button>
        <button class="btn btn-sm btn-success fw-bold px-3 shadow-sm btn-simpan-jam-${jam}" onclick="window.simpanAbsensiJam(${jam})" ${isLocked || totalSesi === 0 ? 'disabled' : ''}>
          <i class="bi bi-save2 me-1"></i> Simpan Jam Ini
        </button>
      </div>
    </div>
  `;
}

/**
 * Merender Bar Filter & Pencarian (`#acFilterBar`)
 */
export function renderAcFilterBar() {
  const jam = store.absenCepatState.jamAktif;
  const container = document.getElementById('acFilterBar');
  if (!container) return;
  if (store.absensiState.isLibur) {
    container.innerHTML = '';
    return;
  }

  const listSesi = store.absensiState.sesiHariIni[jam] || [];
  const setBlok = new Set();
  listSesi.forEach(s => {
    if (s.blok && s.blok !== '-') setBlok.add(s.blok);
  });

  const opsiBlok = Array.from(setBlok)
    .sort((a, b) => bandingkanBlokAbsenCepat(a, b))
    .map(b => {
      const lbl = formatLabelBlokAbsenCepat(b);
      const isSel = store.absenCepatState.filterBlok === b ? 'selected' : '';
      return `<option value="${escHtmlFan_(b)}" ${isSel}>${escHtmlFan_(lbl)}</option>`;
    })
    .join('');

  container.innerHTML = `
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <div class="input-group input-group-sm" style="max-width:260px;">
        <span class="input-group-text bg-light border-secondary"><i class="bi bi-search text-success"></i></span>
        <input type="text" class="form-control border-secondary" id="acSearchInput" placeholder="Cari Asatidz / Kelas..." value="${escHtmlFan_(store.absenCepatState.search)}" oninput="window.onAcSearchInput(this.value)">
        <button class="btn btn-outline-secondary" type="button" onclick="window.clearAcSearch()"><i class="bi bi-x-lg"></i></button>
      </div>
      <select class="form-select form-select-sm border-secondary" style="width:150px;" onchange="window.onAcBlokChange(this.value)">
        <option value="">Semua Blok</option>
        ${opsiBlok}
      </select>
      <select class="form-select form-select-sm border-secondary" style="width:190px;" onchange="window.onAcSortChange(this.value)">
        <option value="kelas_asc" ${store.absenCepatState.sortBy === 'kelas_asc' ? 'selected' : ''}>Urut: Kelas (A-Z)</option>
        <option value="blok_asc" ${store.absenCepatState.sortBy === 'blok_asc' ? 'selected' : ''}>Urut: Blok (Kecil-Besar)</option>
        <option value="nama_asc" ${store.absenCepatState.sortBy === 'nama_asc' ? 'selected' : ''}>Urut: Nama (A-Z)</option>
      </select>
      <small class="text-muted ms-auto" id="acInfoFilter">Menampilkan: 0 dari 0 Sesi</small>
    </div>
  `;
}

export function onAcSearchInput(val) {
  store.absenCepatState.search = val;
  renderAcCards();
}

export function clearAcSearch() {
  store.absenCepatState.search = '';
  const el = document.getElementById('acSearchInput');
  if (el) el.value = '';
  renderAcCards();
}

export function onAcBlokChange(val) {
  store.absenCepatState.filterBlok = val;
  renderAcCards();
}

export function onAcSortChange(val) {
  store.absenCepatState.sortBy = val;
  renderAcCards();
}

/**
 * Membuat label blok yang seragam:
 * "Induk" -> "Blok Induk", "4" -> "Blok 4", kosong / "-" -> "Blok Belum Diatur"
 */
export function formatLabelBlokAbsenCepat(blok) {
  const raw = String(blok || '').trim();
  if (!raw || raw === '-' || raw.toLowerCase() === 'belum diatur') {
    return 'Blok Belum Diatur';
  }
  if (/^blok\b/i.test(raw)) {
    return raw;
  }
  return `Blok ${raw}`;
}

/**
 * Pengurutan kelompok blok:
 * 1. Blok Induk
 * 2. Blok lainnya secara natural: 1, 2, 3, 4, dst.
 * 3. Blok Belum Diatur
 */
export function bandingkanBlokAbsenCepat(a, b) {
  const bersihkan = value =>
    String(value || '')
      .replace(/^blok\s*/i, '')
      .trim()
      .toUpperCase();

  const blokA = bersihkan(a);
  const blokB = bersihkan(b);

  const peringkat = blok => {
    if (blok === 'INDUK') return 0;
    if (!blok || blok === '-' || blok === 'BELUM DIATUR') return 2;
    return 1;
  };

  const peringkatA = peringkat(blokA);
  const peringkatB = peringkat(blokB);

  if (peringkatA !== peringkatB) {
    return peringkatA - peringkatB;
  }

  return blokA.localeCompare(blokB, undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

/**
 * Merender kartu Absen Cepat yang dikelompokkan berdasarkan Blok Kelas (`#acCardsContainer`)
 */
export function renderAcCards() {
  const jam = store.absenCepatState.jamAktif;
  const container = document.getElementById('acCardsContainer');
  if (!container) return;

  if (store.absensiState.isLibur) {
    container.innerHTML = '';
    return;
  }

  const fullList = store.absensiState.sesiHariIni[jam] || [];
  let list = fullList.slice();
  const totalAwal = list.length;

  // Filter Pencarian
  const keyword = String(store.absenCepatState.search || '')
    .toLowerCase()
    .trim();
  if (keyword) {
    list = list.filter(sesi => {
      const nama = String(sesi.nama || '').toLowerCase();
      const kelas = String(sesi.kelasMengajar || '').toLowerCase();
      return nama.includes(keyword) || kelas.includes(keyword);
    });
  }

  // Filter Blok
  if (store.absenCepatState.filterBlok) {
    list = list.filter(
      sesi => String(sesi.blok || '').trim() === String(store.absenCepatState.filterBlok).trim()
    );
  }

  // Informasi Jumlah Data
  const infoEl = document.getElementById('acInfoFilter');
  if (infoEl) {
    infoEl.innerHTML = `Menampilkan: <b class="text-success">${list.length}</b> dari ${totalAwal} Sesi`;
  }

  // Kondisi Data Kosong
  if (totalAwal === 0) {
    container.innerHTML = `
      <div class="col-12 text-center text-muted py-5">
        <i class="bi bi-inbox me-1"></i>
        Tidak ada jadwal pengajar pada Jam Ke-${jam}.
      </div>
    `;
    return;
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center text-muted py-4">
        <i class="bi bi-search me-1 text-danger"></i>
        Tidak ditemukan data yang cocok dengan pencarian/filter.
      </div>
    `;
    return;
  }

  // Kelompokkan Berdasarkan Blok
  const mapKelompokBlok = {};
  list.forEach(sesi => {
    let blokAsli = String(sesi.blok || '').trim();
    if (!blokAsli || blokAsli === '-') {
      blokAsli = 'Belum Diatur';
    }
    const kunciBlok = blokAsli.toUpperCase();
    if (!mapKelompokBlok[kunciBlok]) {
      mapKelompokBlok[kunciBlok] = {
        namaBlok: blokAsli,
        daftarSesi: []
      };
    }
    mapKelompokBlok[kunciBlok].daftarSesi.push(sesi);
  });

  const daftarKelompok = Object.values(mapKelompokBlok).sort((a, b) =>
    bandingkanBlokAbsenCepat(a.namaBlok, b.namaBlok)
  );

  if (store.absenCepatState.sortBy === 'blok_desc') {
    daftarKelompok.reverse();
  }

  let html = '';
  daftarKelompok.forEach(kelompok => {
    const daftarSesi = kelompok.daftarSesi.slice();

    if (store.absenCepatState.sortBy === 'nama_asc') {
      daftarSesi.sort((a, b) =>
        String(a.nama || '').localeCompare(String(b.nama || ''), undefined, {
          sensitivity: 'base'
        })
      );
    } else {
      daftarSesi.sort((a, b) =>
        String(a.kelasMengajar || '').localeCompare(String(b.kelasMengajar || ''), undefined, {
          numeric: true,
          sensitivity: 'base'
        })
      );
    }

    const labelBlok = formatLabelBlokAbsenCepat(kelompok.namaBlok);
    const jumlahAsatidz = new Set(
      daftarSesi.map(sesi => String(sesi.nama || '').trim().toUpperCase())
    ).size;

    const daftarKartuHtml = daftarSesi
      .map(sesi => {
        const idxAsli = fullList.indexOf(sesi);
        return renderAcCardItem(sesi, jam, idxAsli);
      })
      .join('');

    html += `
      <div class="col-12 ac-blok-group mb-2">
        <!-- JUDUL KELOMPOK BLOK -->
        <div class="d-flex justify-content-between align-items-center
                    bg-success bg-opacity-10
                    border border-success border-opacity-25
                    rounded-3 px-3 py-2 mb-2">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-building-fill text-success"></i>
            <span class="fw-bold text-success text-uppercase">
              ${escHtmlFan_(labelBlok)}
            </span>
          </div>
          <span class="badge bg-success rounded-pill px-3 py-1">
            ${jumlahAsatidz} Asatidz
          </span>
        </div>

        <!-- DAFTAR ASATIDZ DALAM BLOK -->
        <div class="row g-2">
          ${daftarKartuHtml}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Jalankan animasi swipe smooth jika perubahan jam dipicu oleh swipe gesture
  if (store.absenCepatState.arahSwipe) {
    const animClass =
      store.absenCepatState.arahSwipe === 'next' ? 'ac-swipe-next' : 'ac-swipe-prev';
    $(container).removeClass('ac-swipe-next ac-swipe-prev').addClass(animClass);
    setTimeout(() => {
      $(container).removeClass('ac-swipe-next ac-swipe-prev');
    }, 300);
    store.absenCepatState.arahSwipe = null;
  }
}

/**
 * Merender 1 kartu baris ringkas Asatidz pada Absen Cepat
 */
export function renderAcCardItem(sesi, jam, idx) {
  const key = getSesiKey(sesi);
  const d = getSesiStatusData(sesi);
  const status = d.status || 'Belum Diabsen';
  const stLower = status.toLowerCase().replace(/\s+/g, '');
  const badgeClass = [
    'hadir',
    'izin',
    'sakit',
    'alfa',
    'terlambat',
    'digantikan',
    'tugaslain'
  ].includes(stLower)
    ? 'badge-status-' + stLower
    : 'badge-status-kosong';

  let iconStatus = '';
  if (stLower === 'hadir') {
    iconStatus = '<i class="bi bi-check2-circle fs-6"></i>';
  } else if (stLower === 'izin') {
    iconStatus = '<i class="bi bi-envelope-paper-fill fs-6"></i>';
  } else if (stLower === 'sakit') {
    iconStatus = '<i class="bi bi-heart-pulse-fill fs-6"></i>';
  } else if (stLower === 'alfa') {
    iconStatus = '<i class="bi bi-x-circle-fill fs-6"></i>';
  } else if (stLower === 'terlambat') {
    iconStatus = '<i class="bi bi-clock-history fs-6"></i>';
  } else if (stLower === 'digantikan') {
    iconStatus = '<i class="bi bi-arrow-left-right fs-6"></i>';
  } else if (stLower === 'tugaslain') {
    iconStatus = '<i class="bi bi-briefcase-fill fs-6"></i>';
  } else {
    iconStatus = '<i class="bi bi-dash-circle fs-6"></i>';
  }

  const isSelected = store.absenCepatState.selectedKeys.has(key);
  const encKey = encodeURIComponent(key);

  return `
    <div class="col-12 item-ac-card-col">
      <div class="card-panel asatidz-card-item p-2 px-3 position-relative ${
        sesi.isBentrok ? 'card-conflict-border' : ''
      } ${isSelected ? 'ac-card-selected' : ''}"
           data-key="${encKey}"
           ondblclick="window.onDblKlikAcCard(${jam}, ${idx})"
           title="Klik 2 kali untuk buka Detail Absen"
           style="cursor:pointer; border-radius:10px;">
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <!-- 1. CHECKBOX -->
          <input type="checkbox" class="form-check-input chk-absen-cepat m-0"
                 style="width:1.15rem;height:1.15rem;cursor:pointer;"
                 ${isSelected ? 'checked' : ''}
                 data-key="${encKey}"
                 onclick="event.stopPropagation(); window.onToggleAcCheckbox('${encKey}', this.checked)"
                 title="Centang untuk memilih">

          <!-- 2. STATUS (ICON RINGKAS DENGAN TOOLTIP) -->
          <span class="badge ${badgeClass} d-flex align-items-center justify-content-center"
                style="width:34px; height:30px; border-radius:8px;"
                title="Status: ${escHtmlFan_(status)}">
            ${iconStatus}
          </span>

          <!-- 3. KELAS -->
          <span class="badge bg-light text-dark border px-2 py-1 fw-semibold"
                style="font-size:11px;">${escHtmlFan_(sesi.kelasMengajar)}</span>

          <!-- 4. ASATIDZ -->
          <div class="fw-bold text-dark">${escHtmlFan_(sesi.nama)}
            ${
              sesi.isBentrok
                ? '<span class="badge bg-danger ms-2" style="font-size:9px;"><i class="bi bi-exclamation-triangle-fill"></i> Bentrok</span>'
                : ''
            }
          </div>
        </div>
      </div>
    </div>`;
}

// ============================================================================
// 3. SELEKSI KARTU, AKSI MASSAL, & MODAL DETAIL ABSEN CEPAT
// ============================================================================

export function onToggleAcCheckbox(encKey, checked) {
  const key = decodeURIComponent(encKey || '');
  if (!key) return;
  if (checked) {
    store.absenCepatState.selectedKeys.add(key);
  } else {
    store.absenCepatState.selectedKeys.delete(key);
  }
  const card = $(`#acCardsContainer .asatidz-card-item[data-key="${encKey}"]`);
  if (checked) card.addClass('ac-card-selected');
  else card.removeClass('ac-card-selected');
  renderAcHeader();
}

export function onDblKlikAcCard(jam, idx) {
  if (acWasDragging) return;
  bukaModalDetailAbsenCepat(jam, idx);
}

function applyStateToAcCard(card, chk, key, checked) {
  chk.prop('checked', checked);
  if (checked) {
    store.absenCepatState.selectedKeys.add(key);
    card.addClass('ac-card-selected');
  } else {
    store.absenCepatState.selectedKeys.delete(key);
    card.removeClass('ac-card-selected');
  }
}

export function batalkanPilihanAbsenCepat(doRender = true) {
  store.absenCepatState.selectedKeys.clear();
  if (doRender !== false) renderAbsenCepat();
}

export function terapkanStatusMassalAbsenCepat(status) {
  const jam = store.absenCepatState.jamAktif;
  const list = store.absensiState.sesiHariIni[jam] || [];
  list.forEach(sesi => {
    if (store.absenCepatState.selectedKeys.has(getSesiKey(sesi))) {
      setSesiStatusData(sesi, { status, isSaved: false }, true);
    }
  });
  store.absenCepatState.selectedKeys.clear();
  renderFormAbsensiBertahap();
  updateStatistikRingkas();
  renderAbsenCepat();
}

export function tandaiSemuaHadirAbsenCepat() {
  const jam = store.absenCepatState.jamAktif;
  (store.absensiState.sesiHariIni[jam] || []).forEach(sesi =>
    setSesiStatusData(sesi, { status: 'Hadir', isSaved: false }, true)
  );
  renderFormAbsensiBertahap();
  updateStatistikRingkas();
  renderAbsenCepat();
}

/**
 * Membuka Modal Detail Absen Asatidz (`#modalDetailAbsenCepat`)
 */
export function bukaModalDetailAbsenCepat(jam, idx) {
  const sesi = store.absensiState.sesiHariIni[jam] && store.absensiState.sesiHariIni[jam][idx];
  if (!sesi) return;
  const d = getSesiStatusData(sesi);

  populateDatalistPengganti();

  $('#ac_modal_jam').val(jam);
  $('#ac_modal_idx').val(idx);
  $('#ac_modal_nama').text(sesi.nama || '-');
  $('#ac_modal_nia').text('NIA: ' + (sesi.nia || '-'));
  $('#ac_modal_kelas').text(sesi.kelasMengajar || '-');
  $('#ac_modal_fan').text(sesi.fan || '-');
  $('#ac_modal_lokasi').text(sesi.lokasi || '-');
  $('#ac_modal_blok').text(formatLabelBlokAbsenCepat(sesi.blok));
  $('#ac_modal_keterangan').val(d.keterangan || '');
  $('#ac_modal_menit').val(d.menitTerlambat || '');
  $('#ac_modal_pengganti').val(d.namaPengganti || '');

  const activeSt = d.status || 'Hadir';
  renderAcModalStatusButtons(activeSt);
  toggleAcModalFields(activeSt);
  $('#modalDetailAbsenCepat').modal('show');
}

export function renderAcModalStatusButtons(activeStatus) {
  const opsi = [
    { v: 'Hadir', c: 'success' },
    { v: 'Izin', c: 'primary' },
    { v: 'Sakit', c: 'warning' },
    { v: 'Alfa', c: 'danger' },
    { v: 'Terlambat', c: 'dark' },
    { v: 'Digantikan', c: 'info' }
  ];
  store.absenCepatState.acModalStatus = activeStatus;
  let html = '';
  opsi.forEach(o => {
    const isActive = activeStatus === o.v;
    const textColor = isActive && o.c === 'warning' ? 'text-dark' : 'text-white';
    html += `<button type="button" class="btn btn-sm ${
      isActive ? 'btn-' + o.c + ' ' + textColor + ' fw-bold' : 'btn-outline-secondary'
    }" style="min-width:92px;" onclick="window.pilihStatusModalAbsenCepat('${o.v}')">${o.v}</button>`;
  });
  $('#ac_modal_status_group').html(html);
}

export function pilihStatusModalAbsenCepat(status) {
  store.absenCepatState.acModalStatus = status;
  renderAcModalStatusButtons(status);
  toggleAcModalFields(status);
}

export function toggleAcModalFields(status) {
  $('#ac_wrap_menit').toggleClass('d-none', status !== 'Terlambat');
  const butuhPengganti = ['Digantikan', 'Izin', 'Sakit'].includes(status);
  $('#ac_wrap_pengganti').toggleClass('d-none', !butuhPengganti);
}

export function terapkanPerubahanModalAbsenCepat() {
  const jam = parseInt($('#ac_modal_jam').val(), 10);
  const idx = parseInt($('#ac_modal_idx').val(), 10);
  const sesi = store.absensiState.sesiHariIni[jam] && store.absensiState.sesiHariIni[jam][idx];
  if (!sesi) return;

  setSesiStatusData(
    sesi,
    {
      status: store.absenCepatState.acModalStatus || 'Hadir',
      keterangan: $('#ac_modal_keterangan').val() || '',
      menitTerlambat: $('#ac_modal_menit').val() || '',
      namaPengganti: $('#ac_modal_pengganti').val() || '',
      isSaved: false
    },
    false
  );

  renderFormAbsensiBertahap();
  renderAbsenCepat();

  $('#modalDetailAbsenCepat').modal('hide');
  Swal.fire({
    icon: 'success',
    title: 'Diperbarui',
    text: sesi.nama + ' berhasil diperbarui.',
    timer: 1200,
    showConfirmButton: false
  });
}

// ============================================================================
// 4. ENGINE DRAG & SELECT + SWIPE GESTURE KHUSUS HP
// ============================================================================
let isAcDragging = false;
let acTargetCheckedState = true;
let acLastHoveredCard = null;
let acHoldTimer = null;
let acStartTouchCoord = { x: 0, y: 0 };
let acActiveHoldingCard = null;
let acLastTapTime = 0;
let acLastTapCard = null;

export function pasangFiturDragSelectAbsenCepat() {
  const HOLD_DURATION = 230;

  function toggleSingleAcCard(cardEl) {
    const $card = $(cardEl);
    const chk = $card.find('.chk-absen-cepat');
    const encKey = $card.attr('data-key') || chk.attr('data-key');
    if (!encKey) return;
    const key = decodeURIComponent(encKey);
    const nextState = !store.absenCepatState.selectedKeys.has(key);
    applyStateToAcCard($card, chk, key, nextState);
    renderAcHeader();
  }

  function activateDragMode(cardEl, isDirectCheckboxClick) {
    isAcDragging = true;
    acWasDragging = true;
    acLastHoveredCard = cardEl;
    document.body.classList.add('is-ac-dragging');

    const $card = $(cardEl);
    $card.removeClass('ac-card-holding');
    const chk = $card.find('.chk-absen-cepat');
    const encKey = $card.attr('data-key') || chk.attr('data-key');
    if (!encKey) return;
    const key = decodeURIComponent(encKey);

    acTargetCheckedState = isDirectCheckboxClick
      ? chk.is(':checked')
      : !store.absenCepatState.selectedKeys.has(key);

    applyStateToAcCard($card, chk, key, acTargetCheckedState);
    renderAcHeader();

    if (navigator.vibrate) {
      try {
        navigator.vibrate(35);
      } catch (e) {}
    }
  }

  function cancelHolding() {
    clearTimeout(acHoldTimer);
    acHoldTimer = null;
    if (acActiveHoldingCard) {
      $(acActiveHoldingCard).removeClass('ac-card-holding');
      acActiveHoldingCard = null;
    }
  }

  function cleanupDrag() {
    cancelHolding();
    if (isAcDragging) {
      isAcDragging = false;
      acLastHoveredCard = null;
      document.body.classList.remove('is-ac-dragging');
      renderAcHeader();
      setTimeout(() => {
        acWasDragging = false;
      }, 180);
    }
  }

  // A. EVENT MOUSE (DESKTOP / LAPTOP)
  $(document).on('mousedown', '#acCardsContainer .asatidz-card-item', function (e) {
    if ($(e.target).is('button, a')) return;
    const cardEl = this;
    acWasDragging = false;

    if ($(e.target).is('.chk-absen-cepat')) {
      activateDragMode(cardEl, true);
      return;
    }

    acStartTouchCoord = { x: e.clientX, y: e.clientY };
    acActiveHoldingCard = cardEl;
    $(cardEl).addClass('ac-card-holding');

    clearTimeout(acHoldTimer);
    acHoldTimer = setTimeout(() => {
      activateDragMode(cardEl, false);
    }, HOLD_DURATION);
  });

  $(document).on('mousemove', function (e) {
    if (!isAcDragging && acActiveHoldingCard) {
      if (Math.hypot(e.clientX - acStartTouchCoord.x, e.clientY - acStartTouchCoord.y) > 6) {
        cancelHolding();
      }
    }
  });

  $(document).on('mouseenter', '#acCardsContainer .asatidz-card-item', function () {
    if (!isAcDragging || acLastHoveredCard === this) return;
    acLastHoveredCard = this;
    acWasDragging = true;

    const $card = $(this);
    const chk = $card.find('.chk-absen-cepat');
    const encKey = $card.attr('data-key') || chk.attr('data-key');
    if (!encKey) return;
    applyStateToAcCard($card, chk, decodeURIComponent(encKey), acTargetCheckedState);
  });

  $(document).on('mouseup', function () {
    if (!isAcDragging && acActiveHoldingCard) {
      toggleSingleAcCard(acActiveHoldingCard);
    }
    cleanupDrag();
  });

  $(window).on('blur', function () {
    cleanupDrag();
  });

  // B. EVENT TOUCHSCREEN (HP / TABLET)
  $(document).on('touchstart', '#acCardsContainer .asatidz-card-item', function (e) {
    if ($(e.target).is('button, a')) return;

    const cardEl = this;
    const touch = e.originalEvent ? e.originalEvent.touches[0] : e.touches[0];
    acStartTouchCoord = { x: touch.clientX, y: touch.clientY };
    acWasDragging = false;

    if ($(e.target).is('.chk-absen-cepat')) {
      activateDragMode(cardEl, true);
      return;
    }

    acActiveHoldingCard = cardEl;
    $(cardEl).addClass('ac-card-holding');

    clearTimeout(acHoldTimer);
    acHoldTimer = setTimeout(() => {
      activateDragMode(cardEl, false);
    }, HOLD_DURATION);
  });

  document.addEventListener(
    'touchmove',
    function (e) {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];

      if (!isAcDragging) {
        if (acActiveHoldingCard) {
          const moveDist = Math.hypot(
            touch.clientX - acStartTouchCoord.x,
            touch.clientY - acStartTouchCoord.y
          );
          if (moveDist > 8) {
            cancelHolding();
          }
        }
        return;
      }

      if (e.cancelable) {
        e.preventDefault();
      }
      acWasDragging = true;

      const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!elUnder) return;

      const card = elUnder.closest('#acCardsContainer .asatidz-card-item');
      if (card && card !== acLastHoveredCard) {
        acLastHoveredCard = card;
        const $card = $(card);
        const chk = $card.find('.chk-absen-cepat');
        const encKey = $card.attr('data-key') || chk.attr('data-key');
        if (encKey) {
          applyStateToAcCard($card, chk, decodeURIComponent(encKey), acTargetCheckedState);
        }
      }
    },
    { passive: false }
  );

  $(document).on('touchend touchcancel', function () {
    if (!isAcDragging && acActiveHoldingCard) {
      const cardEl = acActiveHoldingCard;
      const now = Date.now();

      if (acLastTapCard === cardEl && now - acLastTapTime < 320) {
        acLastTapTime = 0;
        acLastTapCard = null;
        cardEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      } else {
        acLastTapTime = now;
        acLastTapCard = cardEl;
        toggleSingleAcCard(cardEl);
      }
    }
    cleanupDrag();
  });

  $(document).on('dragstart', '#acCardsContainer .asatidz-card-item', function (e) {
    e.preventDefault();
  });
}

/**
 * Gesture Swipe Horizontal Khusus HP untuk berpindah Jam Ke-1, 2, 3, 4
 */
export function pasangFiturSwipeAbsenCepat() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  $(document).on('touchstart', '#page-absen-cepat', function (e) {
    if (window.innerWidth >= 768) return;
    if (
      isAcDragging ||
      $(e.target).closest('input, select, textarea, button, a, .chk-absen-cepat').length > 0
    ) {
      return;
    }

    const touch = e.originalEvent.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
  });

  $(document).on('touchend', '#page-absen-cepat', function (e) {
    if (window.innerWidth >= 768) return;
    if (isAcDragging || $('.modal.show').length > 0) return;
    if ($(e.target).closest('input, select, textarea, button, a, .chk-absen-cepat').length > 0) {
      return;
    }

    const touch = e.originalEvent.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const elapsedTime = Date.now() - touchStartTime;

    if (
      elapsedTime < 500 &&
      Math.abs(deltaX) >= 50 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.5
    ) {
      const curJam = store.absenCepatState.jamAktif || 1;
      if (deltaX < 0 && curJam < 4) {
        gantiJamAktifAbsenCepat(curJam + 1, 'next');
      } else if (deltaX > 0 && curJam > 1) {
        gantiJamAktifAbsenCepat(curJam - 1, 'prev');
      }
    }
  });
}

/**
 * Inisialisasi seluruh listener gesture Absen Cepat (dipanggil 1x dari main.js)
 */
export function initAbsenCepatUI() {
  if (acGestureInitialized) return;
  acGestureInitialized = true;
  pasangFiturDragSelectAbsenCepat();
  pasangFiturSwipeAbsenCepat();
}

// ============================================================================
// 5. ENGINE NOTIFIKASI STATUS ABSEN BLOK PENGGUNA (#modalNotifAbsenBlok)
// ============================================================================

/**
 * Membangun daftar pengguna / petugas pemantau blok (mendukung akun Supabase & petugas per Blok Kelas)
 */
async function muatDaftarUserNotifAbsenBlok() {
  const listUsers = [];

  // 1. Cek apakah ada daftar akun di app_settings ('AKUN_PENGGUNA_MADIN')
  if (supabase) {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'AKUN_PENGGUNA_MADIN')
        .maybeSingle();

      if (data && data.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach(u => {
            if (String(u.status || 'Aktif').toLowerCase() === 'aktif') {
              listUsers.push({
                username: u.username || u.nama || 'user',
                nama: u.nama || u.username || 'Petugas',
                role: u.role || 'Petugas Presensi',
                otoritasBlok: u.otoritasBlok || '',
                status: 'Aktif'
              });
            }
          });
        }
      }
    } catch (e) {}
  }

  // 2. Pastikan pengguna aktif saat ini terdaftar
  const curUser = store.currentUser || {
    username: 'admin',
    nama: 'Master Administrator',
    role: 'Master Admin',
    otoritasBlok: ''
  };
  if (
    !listUsers.some(
      u => String(u.username).toLowerCase() === String(curUser.username || 'admin').toLowerCase()
    )
  ) {
    listUsers.unshift({
      username: curUser.username || 'admin',
      nama: curUser.nama || 'Master Administrator',
      role: curUser.role || 'Master Admin',
      otoritasBlok: curUser.otoritasBlok || '',
      status: 'Aktif'
    });
  }

  // 3. Tambahkan entri petugas per Blok Kelas unik yang terjadwal hari ini agar pemantauan per blok lengkap
  const setBlokHariIni = new Set();
  [1, 2, 3, 4].forEach(j => {
    (store.absensiState.sesiHariIni[j] || []).forEach(s => {
      const bRaw = String(s.blok || '').trim();
      const bNorm = bRaw.replace(/^blok\s*/i, '').trim().toUpperCase();
      if (bNorm && bNorm !== '-' && bNorm !== 'BELUM DIATUR') {
        setBlokHariIni.add(bNorm);
      }
    });
  });

  const sortedBloks = Array.from(setBlokHariIni).sort((a, b) => bandingkanBlokAbsenCepat(a, b));
  sortedBloks.forEach(bNorm => {
    const labelBlok = formatLabelBlokAbsenCepat(bNorm);
    const uname = `petugas_blok_${bNorm.toLowerCase().replace(/\s+/g, '_')}`;
    if (
      !listUsers.some(
        u =>
          String(u.otoritasBlok || '')
            .replace(/^blok\s*/i, '')
            .trim()
            .toUpperCase() === bNorm
      )
    ) {
      listUsers.push({
        username: uname,
        nama: `Petugas ${labelBlok}`,
        role: 'Koor Kesiswaan / TOP',
        otoritasBlok: labelBlok,
        status: 'Aktif'
      });
    }
  });

  cacheDaftarSemuaUser = listUsers;
  return listUsers;
}

/**
 * Membuka Modal Notifikasi Status Penyelesaian Absensi Blok (`#modalNotifAbsenBlok`)
 */
export async function bukaModalNotifAbsenBlok() {
  $('#modalNotifAbsenBlok').modal('show');

  const tglTeks =
    $('#inputTglAbsensiCepat').val() || store.absensiState.tanggal || '-';
  const hariTeks = $('#acBadgeHari').text() || store.absensiState.hari || '-';
  $('#notif_modal_sub').text(`${hariTeks}, ${tglTeks}`);

  $('#notif_filter_jam').val(String(store.absenCepatState.jamAktif || 1));

  $('#notif_user_list_container').html(`
    <div class="text-center py-4 text-muted">
      <span class="spinner-border spinner-border-sm text-success me-2"></span>Memeriksa data pengguna &amp; otoritas blok...
    </div>
  `);

  await muatDaftarUserNotifAbsenBlok();
  populateDropdownPilihUserNotif();
  renderDaftarNotifUser();
}

export function populateDropdownPilihUserNotif() {
  const sel = document.getElementById('notif_filter_user');
  if (!sel) return;
  const curVal = sel.value;
  let html = '<option value="">-- Tampilkan Semua Petugas / User --</option>';

  const users = (cacheDaftarSemuaUser || []).filter(
    u => String(u.status || 'aktif').toLowerCase() === 'aktif'
  );

  users.forEach(u => {
    const otText = u.otoritasBlok ? ` [${u.otoritasBlok}]` : ' [Semua Blok]';
    html += `<option value="${escHtmlFan_(u.username)}">${escHtmlFan_(u.nama)} (${escHtmlFan_(u.role)})${escHtmlFan_(otText)}</option>`;
  });

  sel.innerHTML = html;
  if (curVal) sel.value = curVal;
}

export function hitungStatusAbsensiUserBlok(user, jamTarget) {
  const otStr = String(user.otoritasBlok || '').trim();
  const authBlocks = otStr
    ? otStr
        .split(',')
        .map(b => b.replace(/^blok\s*/i, '').trim().toUpperCase())
        .filter(Boolean)
    : [];

  const jamsToCheck = jamTarget === 'SEMUA' ? [1, 2, 3, 4] : [parseInt(jamTarget, 10) || 1];

  let totalSesi = 0;
  let sesiDiabsen = 0;
  const rincianBlok = {};

  jamsToCheck.forEach(j => {
    const listSesi = store.absensiState.sesiHariIni[j] || [];
    listSesi.forEach(s => {
      const bRaw = String(s.blok || '').trim();
      let bNorm = bRaw.replace(/^blok\s*/i, '').trim().toUpperCase();
      if (!bNorm || bNorm === '-' || bNorm === 'BELUM DIATUR') bNorm = 'BELUM DIATUR';

      let isMatch = false;
      if (authBlocks.length === 0) {
        isMatch = true;
      } else {
        isMatch = authBlocks.includes(bNorm);
      }

      if (isMatch) {
        totalSesi++;
        if (!rincianBlok[bNorm]) rincianBlok[bNorm] = { total: 0, done: 0 };
        rincianBlok[bNorm].total++;

        const key = getSesiKey(s);
        if (store.absensiState.savedRecords && store.absensiState.savedRecords[key]) {
          sesiDiabsen++;
          rincianBlok[bNorm].done++;
        }
      }
    });
  });

  const isSelesai = totalSesi > 0 && sesiDiabsen === totalSesi;
  const isBelum = totalSesi > 0 && sesiDiabsen < totalSesi;
  const isKosong = totalSesi === 0;
  const pct = totalSesi > 0 ? Math.round((sesiDiabsen / totalSesi) * 100) : 0;

  return {
    totalSesi,
    sesiDiabsen,
    isSelesai,
    isBelum,
    isKosong,
    pct,
    rincianBlok,
    authBlocks
  };
}

export function renderDaftarNotifUser() {
  const container = document.getElementById('notif_user_list_container');
  if (!container) return;

  const filterUser = $('#notif_filter_user').val();
  const filterJam = $('#notif_filter_jam').val();

  let users = (cacheDaftarSemuaUser || []).filter(
    u => String(u.status || 'aktif').toLowerCase() === 'aktif'
  );

  if (filterUser) {
    users = users.filter(u => u.username === filterUser);
  }

  if (users.length === 0) {
    container.innerHTML =
      '<div class="text-center py-4 text-muted small">Tidak ada data pengguna yang sesuai.</div>';
    return;
  }

  let html = '';
  users.forEach(u => {
    const res = hitungStatusAbsensiUserBlok(u, filterJam);

    let badgeStatusHtml = '';
    let cardClass = '';
    let iconStatus = '';

    if (res.isKosong) {
      cardClass = 'border-secondary bg-white';
      badgeStatusHtml = '<span class="badge bg-secondary px-2 py-1">Tidak Ada Jadwal</span>';
      iconStatus = '<i class="bi bi-dash-circle text-secondary fs-4"></i>';
    } else if (res.isSelesai) {
      cardClass = 'border-success bg-success bg-opacity-10';
      badgeStatusHtml = `<span class="badge bg-success px-3 py-1 shadow-xs fw-bold"><i class="bi bi-check-circle-fill me-1"></i>Selesai Mengabsen</span>`;
      iconStatus = '<i class="bi bi-check-circle-fill text-success fs-3"></i>';
    } else {
      cardClass = 'border-danger bg-danger bg-opacity-10';
      badgeStatusHtml = `<span class="badge bg-danger px-3 py-1 shadow-xs fw-bold"><i class="bi bi-exclamation-triangle-fill me-1"></i>Belum Selesai (${
        res.totalSesi - res.sesiDiabsen
      } Tersisa)</span>`;
      iconStatus = '<i class="bi bi-x-circle-fill text-danger fs-3"></i>';
    }

    const otBadge = u.otoritasBlok
      ? `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 me-1"><i class="bi bi-building me-1"></i>${escHtmlFan_(u.otoritasBlok)}</span>`
      : `<span class="badge bg-light text-secondary border me-1">Semua Blok</span>`;

    let miniBlokHtml = '';
    Object.keys(res.rincianBlok).forEach(blk => {
      const bData = res.rincianBlok[blk];
      const isBlkDone = bData.total > 0 && bData.done === bData.total;
      miniBlokHtml += `
        <span class="badge ${isBlkDone ? 'bg-success' : 'bg-danger'} bg-opacity-25 text-dark border ${
          isBlkDone ? 'border-success' : 'border-danger'
        } me-1 mb-1 font-monospace" style="font-size:10px;">
          ${escHtmlFan_(blk)}: ${bData.done}/${bData.total}
        </span>
      `;
    });

    html += `
      <div class="card p-3 mb-2 shadow-xs ${cardClass}" style="border-width: 1.5px; border-radius: 12px; transition: all 0.2s ease;">
        <div class="d-flex justify-content-between align-items-start">
          <div class="d-flex align-items-center gap-2">
            ${iconStatus}
            <div>
              <div class="fw-bold text-dark fs-6">${escHtmlFan_(u.nama)}</div>
              <div class="small text-muted">${escHtmlFan_(u.role)} &bull; ${otBadge}</div>
            </div>
          </div>
          <div class="text-end">
            ${badgeStatusHtml}
          </div>
        </div>

        <div class="mt-2 pt-2 border-top border-light-subtle d-flex justify-content-between align-items-center flex-wrap gap-1">
          <div class="small text-muted">
            Progres: <strong class="${
              res.isSelesai ? 'text-success' : res.isBelum ? 'text-danger' : 'text-secondary'
            }">${res.sesiDiabsen}</strong> dari <strong>${res.totalSesi}</strong> Sesi Diabsen (${res.pct}%)
          </div>
          <div class="d-flex flex-wrap align-items-center">
            ${miniBlokHtml}
          </div>
        </div>

        <div class="progress mt-2" style="height: 6px;">
          <div class="progress-bar ${
            res.isSelesai ? 'bg-success' : 'bg-danger'
          }" role="progressbar" style="width: ${res.pct}%;"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}
