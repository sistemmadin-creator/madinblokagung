import { supabase } from '../../lib/supabase.js';
import { store } from '../../state/store.js';
import { logActivity } from '../audit/audit.js';
import { fetchAllAsatidzFromSupabase } from '../asatidz/asatidz.js';
import { loadFormasiData } from '../formasi/formasi.js';

// ============================================================================
// 1. STATE LOKAL & PENYIMPANAN KE SUPABASE (TABEL `app_settings`)
// ============================================================================
const KEY_DB_FAN_CONFIG = 'FAN_CONFIG';
const KEY_DB_FAN_DETAIL = 'FAN_PELAJARAN_DETAIL';
const KEY_DB_GRUP_ASAL = 'GRUP_ASAL_ASATIDZ';

const LS_FAN_CONFIG = 'MADIN_FAN_CONFIG';
const LS_FAN_DETAIL = 'MADIN_FAN_PELAJARAN_DETAIL';
const LS_GRUP_ASAL = 'MADIN_GRUP_ASAL_ASATIDZ';

let fanSaveDebounceTimer = null;
let currentSwitchFanMode = 'semua'; // 'semua' | 'reguler' | 'unggulan'
let keywordCariFan = '';
let timerCariFan = null;

/**
 * Memuat konfigurasi Fan Pelajaran (Item Fan, Detail Jam/Pengajar/Keterangan, & Grup Asal)
 * dari tabel `app_settings` di Supabase dengan fallback localStorage
 */
export async function loadFanSettingsFromSupabase() {
  // 1. Muat instan dari localStorage sebagai nilai awal / fallback
  try {
    const lsCfg = localStorage.getItem(LS_FAN_CONFIG);
    if (lsCfg) store.fanConfig = JSON.parse(lsCfg) || {};
  } catch (e) {}

  try {
    const lsDet = localStorage.getItem(LS_FAN_DETAIL);
    if (lsDet) {
      const parsed = JSON.parse(lsDet) || { kelas: {}, item: {} };
      store.fanPelajaranDetail = {
        kelas: parsed.kelas || {},
        item: parsed.item || {}
      };
    }
  } catch (e) {}

  try {
    const lsGrup = localStorage.getItem(LS_GRUP_ASAL);
    if (lsGrup) store.masterGrupAsal = JSON.parse(lsGrup) || [];
  } catch (e) {}

  if (!supabase) return;

  // 2. Tarik data teraktual dari tabel `app_settings` Supabase
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [KEY_DB_FAN_CONFIG, KEY_DB_FAN_DETAIL, KEY_DB_GRUP_ASAL]);

    if (error) throw error;

    (data || []).forEach(row => {
      let val = row.value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) {}
      }

      if (row.key === KEY_DB_FAN_CONFIG && val && typeof val === 'object') {
        store.fanConfig = val;
        try { localStorage.setItem(LS_FAN_CONFIG, JSON.stringify(val)); } catch (e) {}
      } else if (row.key === KEY_DB_FAN_DETAIL && val && typeof val === 'object') {
        store.fanPelajaranDetail = {
          kelas: val.kelas || {},
          item: val.item || {}
        };
        try { localStorage.setItem(LS_FAN_DETAIL, JSON.stringify(store.fanPelajaranDetail)); } catch (e) {}
      } else if (row.key === KEY_DB_GRUP_ASAL && Array.isArray(val)) {
        store.masterGrupAsal = val;
        try { localStorage.setItem(LS_GRUP_ASAL, JSON.stringify(val)); } catch (e) {}
      }
    });
  } catch (err) {
    console.error('Gagal memuat pengaturan Fan Pelajaran dari Supabase:', err.message);
  }
}

/**
 * Menyimpan konfigurasi daftar item Fan (`store.fanConfig`) ke Supabase
 */
export async function simpanFanConfigKeServer(newConfig) {
  store.fanConfig = newConfig || {};
  try {
    localStorage.setItem(LS_FAN_CONFIG, JSON.stringify(store.fanConfig));
  } catch (e) {}

  if (!supabase) return true;
  const { error } = await supabase
    .from('app_settings')
    .upsert([{ key: KEY_DB_FAN_CONFIG, value: store.fanConfig }], { onConflict: 'key' });

  if (error) throw error;
  await logActivity('SIMPAN ITEM FAN', 'Memperbarui konfigurasi daftar item Fan / Mata Pelajaran');
  return true;
}

/**
 * Menyimpan detail Fan Pelajaran (Jam, MS/MB, Daftar Asatidz, Keterangan Kelas)
 * ke Supabase dengan debounce 500ms dan indikator status otomatis
 */
export function simpanFanPelajaranDetailKeServer() {
  try {
    localStorage.setItem(LS_FAN_DETAIL, JSON.stringify(store.fanPelajaranDetail));
  } catch (e) {}

  const statusEl = document.getElementById('fanAutoSaveStatus');
  if (statusEl) {
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1 text-success"></span><span class="text-muted">Menyimpan...</span>';
  }

  if (fanSaveDebounceTimer) clearTimeout(fanSaveDebounceTimer);
  fanSaveDebounceTimer = setTimeout(async function () {
    try {
      if (supabase) {
        const { error } = await supabase
          .from('app_settings')
          .upsert([{ key: KEY_DB_FAN_DETAIL, value: store.fanPelajaranDetail }], { onConflict: 'key' });
        if (error) throw error;
      }
      if (statusEl) {
        statusEl.innerHTML = '<i class="bi bi-check2-circle text-success me-1"></i><span class="text-success fw-semibold">Tersimpan otomatis</span>';
        setTimeout(() => {
          if (statusEl) statusEl.innerHTML = '';
        }, 2500);
      }
    } catch (err) {
      if (statusEl) {
        statusEl.innerHTML = '<i class="bi bi-x-circle text-danger me-1"></i><span class="text-danger fw-semibold">Gagal simpan!</span>';
      }
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menyimpan ke Supabase',
        text: err.message,
        confirmButtonColor: '#0f766e'
      });
    }
  }, 500);
}

/**
 * Menyimpan daftar Grup Asal Asatidz (`store.masterGrupAsal`) ke Supabase
 */
export async function simpanGrupAsalKeServer(arr) {
  const bersih = JSON.parse(JSON.stringify(arr || []));
  store.masterGrupAsal = bersih;
  try {
    localStorage.setItem(LS_GRUP_ASAL, JSON.stringify(bersih));
  } catch (e) {}

  if (!supabase) return true;
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert([{ key: KEY_DB_GRUP_ASAL, value: bersih }], { onConflict: 'key' });
    if (error) throw error;
    return true;
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Grup Asal Gagal Disimpan',
      text: err.message,
      confirmButtonColor: '#0f766e'
    });
    return false;
  }
}

// ============================================================================
// 2. HELPER ADAPTASI DATA `madinblokagung` (ASATIDZ & FORMASI KELAS)
// ============================================================================
export const URUTAN_TINGKAT = { "ULA": 1, "WUSTHO": 2, "ULYA": 3, "ISTI'DAD": 4, "IST": 4 };

export function escHtmlFan_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Natural Sort berdasarkan Kode / NIA (A1, A2, A3 ... A10, lalu B1, B2 ... dst.)
 */
export function compareNIANatural(niaA, niaB) {
  niaA = String(niaA || '').trim().toUpperCase();
  niaB = String(niaB || '').trim().toUpperCase();
  const mA = niaA.match(/^([A-Za-z]*)(\d+)/);
  const mB = niaB.match(/^([A-Za-z]*)(\d+)/);
  if (mA && mB) {
    const letA = mA[1], letB = mB[1];
    if (letA !== letB) return letA.localeCompare(letB);
    return parseInt(mA[2], 10) - parseInt(mB[2], 10);
  }
  return niaA.localeCompare(niaB, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Mengurutkan array objek `store.globalDataAsatidz` berdasarkan properti `nia` secara natural
 */
export function sortAsatidzByKodeNatural(list) {
  return (list || []).slice().sort((a, b) => {
    const niaA = String(a?.nia || '').trim();
    const niaB = String(b?.nia || '').trim();
    if (!niaA && !niaB) return 0;
    if (!niaA) return 1;
    if (!niaB) return -1;
    return compareNIANatural(niaA, niaB);
  });
}

/**
 * Konversi angka kelas ke angka Romawi (1 -> I, 2 -> II, 3 -> III, 4 -> IV)
 */
export function toRomanNumeralKls(numStr) {
  const n = parseInt(numStr, 10);
  if (isNaN(n)) return String(numStr || '');
  const romanMap = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };
  return romanMap[n] || String(numStr);
}

/**
 * Memecah format "(NamaFan) Nama Kitab/Mapel"
 * Contoh: "(Fiqih) Mabadi Fiqih Juz I II III" -> { fan: "Fiqih", mapel: "Mabadi Fiqih Juz I II III" }
 */
export function parseFanItemString(itemStr) {
  if (!itemStr) return { fan: '-', mapel: '-' };
  const str = String(itemStr).trim();
  const match = str.match(/^\s*\(([^)]+)\)\s*(.*)$/);
  if (match) {
    return {
      fan: match[1].trim() || '-',
      mapel: match[2].trim() || '-'
    };
  }
  return {
    fan: '-',
    mapel: str
  };
}

/**
 * Mengekstrak daftar kelas reguler unik ({ tingkat, kls }) dari gabungan
 * `store.globalDataFormasi` dan `store.globalDataAsatidz`
 */
export function getDaftarKelasUnikDariMaster() {
  const mapKelas = new Set();

  // 1. Dari Master Formasi Kelas
  (store.globalDataFormasi || []).forEach(f => {
    const tingkat = String(f.tingkat || '').trim().toUpperCase();
    const kls = String(f.din_kls || '').trim().toUpperCase();
    if (tingkat && kls) {
      mapKelas.add(JSON.stringify({ tingkat, kls }));
    }
  });

  // 2. Dari Master Data Asatidz
  (store.globalDataAsatidz || []).forEach(a => {
    const tingkat = String(a.tingkat_asatidz || '').trim().toUpperCase();
    const kls = String(a.din_kls_asatidz || '').trim().toUpperCase();
    if (tingkat && kls) {
      mapKelas.add(JSON.stringify({ tingkat, kls }));
    }
  });

  const arr = Array.from(mapKelas).map(s => JSON.parse(s));
  arr.sort((a, b) => {
    const orderA = URUTAN_TINGKAT[a.tingkat] || 99;
    const orderB = URUTAN_TINGKAT[b.tingkat] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.kls.localeCompare(b.kls, undefined, { numeric: true });
  });

  return arr;
}

export function normalisasiKelasBandingUnggulan_(str) {
  return String(str || '')
    .replace(/\(\s*(Ug\vert{}PA\vert{}PI)\s*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Mengambil daftar nama kelas yang berstatus Unggulan (`is_unggulan === true`)
 * dari `store.globalDataFormasi` (contoh: ["1 A ULA", "2 B WUSTHO"])
 */
export function getDaftarKelasUnggulan() {
  const setUg = new Map();

  (store.globalDataFormasi || []).forEach(f => {
    if (f && f.is_unggulan) {
      const kls = String(f.din_kls || '').trim();
      const bag = String(f.din_bag || '').trim().toUpperCase();
      const tingkat = String(f.tingkat || '').trim().toUpperCase();
      if (kls && bag && tingkat) {
        const nama = `${kls} ${bag} ${tingkat}`;
        setUg.set(normalisasiKelasBandingUnggulan_(nama), nama);
      }
    }
  });

  return Array.from(setUg.values());
}

/**
 * Mengecek apakah suatu nama kelas ("1 A ULA") berstatus Kelas Unggulan
 */
export function isKelasUnggulan(namaKelas) {
  const clean = normalisasiKelasBandingUnggulan_(namaKelas);
  return getDaftarKelasUnggulan().some(k => normalisasiKelasBandingUnggulan_(k) === clean);
}

// ============================================================================
// 3. TABEL UTAMA: DAFTAR MATA PELAJARAN KELAS (FAN PELAJARAN)
// ============================================================================

/**
 * Handler tombol switch kategori: 'semua' | 'reguler' | 'unggulan'
 */
export function setSwitchFanPelajaran(mode) {
  currentSwitchFanMode = mode;
  $('#btnSwitchFanSemua').attr('class', mode === 'semua' ? 'btn btn-success fw-bold px-3 py-2' : 'btn btn-outline-success fw-bold px-3 py-2');
  $('#btnSwitchFanReguler').attr('class', mode === 'reguler' ? 'btn btn-success fw-bold px-3 py-2' : 'btn btn-outline-success fw-bold px-3 py-2');
  $('#btnSwitchFanUnggulan').attr('class', mode === 'unggulan' ? 'btn btn-success fw-bold px-3 py-2' : 'btn btn-outline-success fw-bold px-3 py-2');

  const labelStatus = mode === 'semua'
    ? 'Semua Kategori'
    : (mode === 'reguler' ? 'Kelas Reguler Saja' : 'Kelas Unggulan (Ug) Saja');
  $('#badgeStatusFanFilter').html(`Menampilkan: <b>${labelStatus}</b>`);
  renderFanPelajaran();
}

export function cariFanPelajaranDebounce(val) {
  clearTimeout(timerCariFan);
  timerCariFan = setTimeout(function () {
    cariFanPelajaran(val);
  }, 250);
}

export function cariFanPelajaran(val) {
  keywordCariFan = String(val || '').toLowerCase().replace(/\s+/g, ' ').trim();
  $('#btnHapusCariFan').toggleClass('d-none', !keywordCariFan);
  renderFanPelajaran();
}

export function resetCariFanPelajaran() {
  $('#inputCariFan').val('');
  cariFanPelajaran('');
}

/**
 * Menyaring daftar item Fan pada satu kelas sesuai kata kunci pencarian
 */
function getItemsFanTersaring_(c) {
  const semua = store.fanConfig[c.kelasKey]
    || (c.fallbackKey ? store.fanConfig[c.fallbackKey] : null)
    || [];
  const kw = keywordCariFan;
  if (!kw) return semua;

  const norm = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').toLowerCase();

  const ketKelas = (store.fanPelajaranDetail.kelas
    && store.fanPelajaranDetail.kelas[c.kelasKey]
    && store.fanPelajaranDetail.kelas[c.kelasKey].keterangan) || '';
  const teksKelas = norm(`${c.kelasKey} ${c.klsNum} ${c.romawiKls} ${c.tingkat} ${c.isUg ? 'unggulan' : ''} ${ketKelas}`);
  if (kw.length >= 3 && teksKelas.includes(kw)) return semua;

  return semua.filter(rawItem => {
    const itemKey = `${c.kelasKey}||${rawItem}`;
    const det = (store.fanPelajaranDetail.item && store.fanPelajaranDetail.item[itemKey]) || {};
    const guru = Array.isArray(det.asatidz) ? det.asatidz.join(' ') : '';
    return norm(`${rawItem} ${det.pengajar || ''} ${guru}`).includes(kw);
  });
}

/**
 * Render Tabel Utama Fan Pelajaran dengan Multi-Level Rowspan (KLS & TNK Vertikal)
 */
export async function renderFanPelajaran(alreadyFetched = false) {
  const tbody = document.getElementById('tbodyFanPelajaran');
  if (!tbody) return;

  // Pastikan data Asatidz atau Formasi sudah dimuat dari Supabase
  if ((!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) &&
      (!store.globalDataFormasi || store.globalDataFormasi.length === 0) &&
      !alreadyFetched) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-success me-2"></div>Memuat master data kelas &amp; asatidz...</td></tr>`;
    try {
      if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
        store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
      }
      if (!store.globalDataFormasi || store.globalDataFormasi.length === 0) {
        await loadFormasiData();
      }
    } catch (e) {
      console.error(e);
    }
    return renderFanPelajaran(true);
  }

  const canEdit = !store.currentUser || store.currentUser.canEdit !== false;
  const listMasterReguler = getDaftarKelasUnikDariMaster();
  const listUnggulanNama = getDaftarKelasUnggulan();

  let itemsToRender = [];

  // 1. Tambahkan Kelas Reguler jika mode 'semua' atau 'reguler'
  if (currentSwitchFanMode === 'semua' || currentSwitchFanMode === 'reguler') {
    listMasterReguler.forEach(c => {
      itemsToRender.push({
        klsNum: c.kls,
        tingkat: c.tingkat,
        kelasKey: `${c.kls} ${c.tingkat}`,
        romawiKls: toRomanNumeralKls(c.kls),
        isUg: false
      });
    });
  }

  // 2. Tambahkan Kelas Unggulan jika mode 'semua' atau 'unggulan'
  if (currentSwitchFanMode === 'semua' || currentSwitchFanMode === 'unggulan') {
    listUnggulanNama.sort().forEach(klsUg => {
      const p = klsUg.trim().split(/\s+/);
      const klsNum = p[0] || '1';
      const bag = p[1] || '';
      const tkt = (p.slice(2).join(' ') || 'ULA').toUpperCase();
      const keyUg = `${klsUg} (Ug)`;
      itemsToRender.push({
        klsNum: klsNum,
        tingkat: tkt,
        kelasKey: keyUg,
        fallbackKey: `${klsNum} ${tkt}`,
        romawiKls: `${toRomanNumeralKls(klsNum)} ${bag} <span class="badge bg-warning text-dark border ms-1" style="font-size:9px;"><i class="bi bi-star-fill text-danger me-1"></i>Ug</span>`,
        isUg: true
      });
    });
  }

  // Filter Pencarian
  if (keywordCariFan) {
    itemsToRender = itemsToRender.filter(c => getItemsFanTersaring_(c).length > 0);
  }
  const infoCariFan = document.getElementById('infoHasilCariFan');
  if (infoCariFan) {
    if (keywordCariFan) {
      const totalItemCari = itemsToRender.reduce((s, c) => s + getItemsFanTersaring_(c).length, 0);
      infoCariFan.innerHTML = `Ditemukan: <b class="text-success">${totalItemCari}</b> mata pelajaran di <b>${itemsToRender.length}</b> kelas`;
    } else {
      infoCariFan.innerHTML = '';
    }
  }

  if (keywordCariFan && itemsToRender.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted">
      <i class="bi bi-search fs-3 d-block mb-2"></i>
      Tidak ditemukan hasil untuk "<b>${escHtmlFan_(keywordCariFan)}</b>".</td></tr>`;
    return;
  }

  if (itemsToRender.length === 0) {
    if (currentSwitchFanMode === 'unggulan') {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted">
        <i class="bi bi-star text-warning fs-3 d-block mb-2"></i>
        Belum ada kelas yang dilabeli Unggulan.<br>
        <small class="fst-italic">Silakan centang <b>Kelas Unggulan</b> saat menambah/mengedit kelas pada menu <b>Formasi Kelas</b>.</small>
      </td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Data kelas belum tersedia.</td></tr>`;
    }
    return;
  }

  // Kelompokkan kelas per Tingkat (ULA -> WUSTHO -> ULYA -> ISTI'DAD)
  const groupsByTingkat = {};
  itemsToRender.forEach(c => {
    const t = c.tingkat;
    if (!groupsByTingkat[t]) groupsByTingkat[t] = [];
    groupsByTingkat[t].push(c);
  });

  const sortedTingkatKeys = Object.keys(groupsByTingkat).sort(
    (a, b) => (URUTAN_TINGKAT[a] || 99) - (URUTAN_TINGKAT[b] || 99)
  );

  let html = '';
  sortedTingkatKeys.forEach(tingkat => {
    const arrKelasDiTingkat = groupsByTingkat[tingkat];
    let totalRowsTingkat = 0;
    arrKelasDiTingkat.forEach(c => {
      const items = getItemsFanTersaring_(c);
      totalRowsTingkat += Math.max(items.length, 1);
    });

    let isFirstRowInTingkat = true;

    arrKelasDiTingkat.forEach(c => {
      const kelasKey = c.kelasKey;
      const items = getItemsFanTersaring_(c);
      const totalRowsKelas = Math.max(items.length, 1);
      const romawiKls = c.romawiKls;

      if (items.length === 0) {
        html += `<tr>`;
        html += `<td class="text-center fw-bold">1</td>`;
        html += `<td class="cell-kls-grup" rowspan="1">${romawiKls}</td>`;
        if (isFirstRowInTingkat) {
          html += `<td class="cell-tingkat-grup" rowspan="${totalRowsTingkat}">${tingkat}</td>`;
          isFirstRowInTingkat = false;
        }
        html += `<td class="text-center text-muted">-</td>`;
        html += `<td class="cell-jam-grup" rowspan="1">-</td>`;
        html += `<td colspan="3" class="text-muted fst-italic text-center">Belum ada item Fan untuk kelas ini (Atur via tombol "Atur Item Fan")</td>`;
        html += `</tr>`;
      } else {
        items.forEach((rawItem, idx) => {
          const parsed = parseFanItemString(rawItem);
          const itemKey = `${kelasKey}||${rawItem}`;
          const itemKeySafe = encodeURIComponent(itemKey).replace(/'/g, '%27');

          const itemDetail = (store.fanPelajaranDetail.item && store.fanPelajaranDetail.item[itemKey]) || {
            pengajar: '',
            keterangan: ''
          };
          const pengajarVal = itemDetail.pengajar || '';
          const jamFanVal = (itemDetail && itemDetail.jam !== undefined) ? itemDetail.jam : '';

          html += `<tr>`;
          html += `<td class="text-center fw-semibold">${idx + 1}</td>`;
          if (idx === 0) {
            html += `<td class="cell-kls-grup" rowspan="${totalRowsKelas}">${romawiKls}</td>`;
          }
          if (isFirstRowInTingkat) {
            html += `<td class="cell-tingkat-grup" rowspan="${totalRowsTingkat}">${tingkat}</td>`;
            isFirstRowInTingkat = false;
          }
          html += `<td class="text-center fw-bold text-success">${escHtmlFan_(parsed.fan)}</td>`;
          html += `<td class="cell-jam-grup">
            <input type="number" min="0" max="6" class="form-control form-control-sm input-jam-kls"
              value="${escHtmlFan_(jamFanVal)}" data-itemkey="${itemKeySafe}"
              oninput="if(parseInt(this.value)>6) this.value=6; if(parseInt(this.value)<0) this.value=0;"
              onchange="window.onChangeJamFanItem(this)" title="Jam pelajaran untuk fan ini (maksimal 6 jam)"
              ${!canEdit ? 'disabled' : ''}>
          </td>`;
          html += `<td class="fw-medium">${escHtmlFan_(parsed.mapel)}</td>`;

          const listGuruItem = Array.isArray(itemDetail.asatidz) ? itemDetail.asatidz : [];
          const badgeKategori = pengajarVal
            ? `<span class="badge ${pengajarVal.includes('MS') ? 'bg-success' : 'bg-primary'} px-2 py-1">${escHtmlFan_(pengajarVal)}</span>`
            : '';

          let labelGuru = '';
          if (listGuruItem.length === 1) {
            labelGuru = `<div class="small fw-semibold text-truncate text-dark mt-1" style="max-width: 130px;" title="${escHtmlFan_(listGuruItem[0])}">${escHtmlFan_(listGuruItem[0])}</div>`;
          } else if (listGuruItem.length > 1) {
            labelGuru = `<div class="badge bg-light text-dark border mt-1" title="${escHtmlFan_(listGuruItem.join(', '))}">${listGuruItem.length} Asatidz</div>`;
          } else {
            labelGuru = `<div class="small text-muted fst-italic mt-1">Pilih Asatidz</div>`;
          }

          html += `<td class="text-center align-middle" style="cursor: pointer;" onclick="${canEdit ? `window.bukaModalPilihAsatidzFan('${itemKeySafe}')` : ''}" title="Klik untuk memilih &amp; menetapkan Asatidz">
            <div class="p-1 rounded hover-bg-light border border-light-subtle d-flex flex-column align-items-center justify-content-center" style="min-height: 44px; transition: all .2s;">
              ${badgeKategori || '<span class="badge bg-secondary bg-opacity-10 text-dark border px-2 py-0">Belum Diatur</span>'}
              ${labelGuru}
            </div>
          </td>`;

          if (idx === 0) {
            const ketKelasVal = (store.fanPelajaranDetail.kelas &&
              store.fanPelajaranDetail.kelas[kelasKey] &&
              store.fanPelajaranDetail.kelas[kelasKey].keterangan) || '';
            html += `<td rowspan="${totalRowsKelas}" style="vertical-align: middle; background-color: #ffffff;">
              <textarea class="form-control form-control-sm"
                style="min-height: 80px; height: 90%; resize: vertical; font-size: 0.8rem;"
                data-kelaskey="${encodeURIComponent(kelasKey)}"
                placeholder="Catatan / Keterangan Kelas..."
                onchange="window.onChangeKeteranganKelas(this)" ${!canEdit ? 'disabled' : ''}>${escHtmlFan_(ketKelasVal)}</textarea>
            </td>`;
          }
          html += `</tr>`;
        });
      }
    });
  });

  tbody.innerHTML = html;
}

/**
 * Handler saat input JAM per Fan diubah (0 - 6 jam)
 */
export function onChangeJamFanItem(el) {
  const itemKey = decodeURIComponent(el.getAttribute('data-itemkey') || '');
  if (!itemKey) return;
  let val = parseInt(el.value, 10);
  if (isNaN(val) || val < 0) {
    val = '';
    el.value = '';
  } else if (val > 6) {
    val = 6;
    el.value = 6;
  }
  if (!store.fanPelajaranDetail.item) store.fanPelajaranDetail.item = {};
  if (!store.fanPelajaranDetail.item[itemKey]) store.fanPelajaranDetail.item[itemKey] = {};
  store.fanPelajaranDetail.item[itemKey].jam = String(el.value).trim();
  simpanFanPelajaranDetailKeServer();
}

/**
 * Handler saat dropdown PENGAJAR (MS/MB) diubah
 */
export function onChangePengajarFanItem(el) {
  const itemKey = decodeURIComponent(el.getAttribute('data-itemkey') || '');
  if (!itemKey) return;
  if (!store.fanPelajaranDetail.item) store.fanPelajaranDetail.item = {};
  if (!store.fanPelajaranDetail.item[itemKey]) store.fanPelajaranDetail.item[itemKey] = {};
  store.fanPelajaranDetail.item[itemKey].pengajar = el.value;
  simpanFanPelajaranDetailKeServer();
}

/**
 * Handler saat textarea KETERANGAN KELAS (Merged) diubah
 */
export function onChangeKeteranganKelas(el) {
  const kelasKey = decodeURIComponent(el.getAttribute('data-kelaskey') || '');
  if (!kelasKey) return;
  if (!store.fanPelajaranDetail.kelas) store.fanPelajaranDetail.kelas = {};
  if (!store.fanPelajaranDetail.kelas[kelasKey]) store.fanPelajaranDetail.kelas[kelasKey] = {};
  store.fanPelajaranDetail.kelas[kelasKey].keterangan = el.value.trim();
  simpanFanPelajaranDetailKeServer();
}

/**
 * Konfirmasi dan Eksekusi Pembersihan Massal (Seluruh Jam / Seluruh Pengajar)
 */
export function konfirmasiHapusMassalFan(tipe) {
  if (store.currentUser && store.currentUser.canEdit === false) {
    return Swal.fire({
      icon: 'error',
      title: 'Akses Ditolak',
      text: 'Anda tidak memiliki hak akses untuk menghapus data ini.'
    });
  }

  const isHapusJam = (tipe === 'jam');
  const judul = isHapusJam ? 'Hapus Isi Seluruh Jam?' : 'Hapus Isi Seluruh Pengajar?';
  const pesan = isHapusJam
    ? 'Seluruh angka <b>Jam Pelajaran</b> di semua Fan dan Kelas akan dikosongkan secara permanen.'
    : 'Seluruh <b>Asatidz Pengajar &amp; Kategori (MS/MB)</b> di semua Fan dan Kelas akan dikosongkan secara permanen.';

  Swal.fire({
    title: judul,
    html: pesan + '<br><br><span class="text-danger fw-bold">Tindakan ini tidak dapat dibatalkan!</span>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: isHapusJam
      ? '<i class="bi bi-clock-history me-1"></i> Ya, Kosongkan Jam'
      : '<i class="bi bi-people-fill me-1"></i> Ya, Kosongkan Pengajar',
    cancelButtonText: 'Batal'
  }).then(async (res) => {
    if (!res.isConfirmed) return;

    if (!store.fanPelajaranDetail.item) store.fanPelajaranDetail.item = {};
    Object.keys(store.fanPelajaranDetail.item).forEach(key => {
      if (isHapusJam) {
        if (store.fanPelajaranDetail.item[key].jam !== undefined && store.fanPelajaranDetail.item[key].jam !== '') {
          delete store.fanPelajaranDetail.item[key].jam;
        }
      } else {
        const itm = store.fanPelajaranDetail.item[key];
        if ((itm.asatidz && itm.asatidz.length > 0) || itm.pengajar) {
          itm.pengajar = '';
          itm.asatidz = [];
        }
      }
    });

    simpanFanPelajaranDetailKeServer();
    renderFanPelajaran();
    await logActivity(
      isHapusJam ? 'HAPUS MASSAL JAM FAN' : 'HAPUS MASSAL PENGAJAR FAN',
      isHapusJam ? 'Mengosongkan seluruh jam pada Fan Pelajaran' : 'Mengosongkan seluruh pengajar pada Fan Pelajaran'
    );

    Swal.fire({
      icon: 'success',
      title: 'Berhasil Dikosongkan!',
      text: isHapusJam ? 'Seluruh jam pelajaran berhasil dikosongkan.' : 'Seluruh asatidz pengajar berhasil dikosongkan.',
      timer: 1600,
      showConfirmButton: false
    });
  });
}

/**
 * Tombol Segarkan Data Fan Pelajaran dari Supabase
 */
export async function muatUlangFanPelajaran() {
  const tbody = document.getElementById('tbodyFanPelajaran');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-success me-2"></div>Menyegarkan data Fan Pelajaran dari Supabase...</td></tr>`;
  }
  try {
    store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    await loadFormasiData();
    await loadFanSettingsFromSupabase();
    await renderFanPelajaran(true);
    Swal.fire({ icon: 'success', title: 'Data Diperbarui', timer: 1000, showConfirmButton: false });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Gagal Menyegarkan', text: err.message, confirmButtonColor: '#0f766e' });
  }
}

/**
 * Export Excel Data Fan Pelajaran (.xlsx)
 */
export function exportFanPelajaranExcel() {
  const listKelas = getDaftarKelasUnikDariMaster();
  if (!listKelas || listKelas.length === 0) {
    return Swal.fire({ icon: 'warning', title: 'Data belum siap untuk diexport!' });
  }

  const rows = [
    ['NO', 'KLS', 'TNK', 'FAN', 'JAM', 'MATA PELAJARAN', 'PENGAJAR', 'JML ASATIDZ', 'KETERANGAN']
  ];

  const groupsByTingkat = {};
  listKelas.forEach(k => {
    const t = String(k.tingkat || '').trim().toUpperCase();
    if (!groupsByTingkat[t]) groupsByTingkat[t] = [];
    groupsByTingkat[t].push(k);
  });

  Object.keys(groupsByTingkat).forEach(tingkat => {
    groupsByTingkat[tingkat].forEach(c => {
      const kelasKey = `${c.kls} ${c.tingkat}`;
      const items = store.fanConfig[kelasKey] || [];
      const romawiKls = toRomanNumeralKls(c.kls);
      const ketKelas = (store.fanPelajaranDetail.kelas &&
        store.fanPelajaranDetail.kelas[kelasKey] &&
        store.fanPelajaranDetail.kelas[kelasKey].keterangan) || '';

      if (items.length === 0) {
        rows.push([1, romawiKls, tingkat, '-', '', 'Belum ada item Fan', '-', '-', ketKelas]);
      } else {
        items.forEach((rawItem, idx) => {
          const parsed = parseFanItemString(rawItem);
          const itemKey = `${kelasKey}||${rawItem}`;
          const itemDetail = (store.fanPelajaranDetail.item && store.fanPelajaranDetail.item[itemKey]) || {};
          const jmlGuru = Array.isArray(itemDetail.asatidz) ? itemDetail.asatidz.length : 0;
          rows.push([
            idx + 1,
            romawiKls,
            tingkat,
            parsed.fan,
            (itemDetail && itemDetail.jam !== undefined) ? itemDetail.jam : '',
            parsed.mapel,
            itemDetail.pengajar || '-',
            jmlGuru > 0 ? `${jmlGuru} Asatidz` : '-',
            idx === 0 ? ketKelas : ''
          ]);
        });
      }
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fan Pelajaran');
  XLSX.writeFile(wb, 'Daftar_Mata_Pelajaran_Kelas_Madin.xlsx');
}

/**
 * Cetak Dokumen Resmi Fan Pelajaran (Landscape)
 */
export function cetakFanPelajaran() {
  document.body.classList.add('printing-fan-pelajaran');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-fan-pelajaran');
  }, 600);
}

// ============================================================================
// 4. MODAL 1: PENGATURAN ITEM FAN / MATA PELAJARAN (#modalPengaturanFan)
// ============================================================================

/**
 * Membuka Modal Pengaturan Item Fan (Kelas Reguler & Sub-Kelas Unggulan)
 */
export function bukaModalPengaturanFan() {
  const listKelas = getDaftarKelasUnikDariMaster();
  const container = document.getElementById('containerDynamicFanClasses');
  if (!container) return;
  container.innerHTML = '';

  if (listKelas.length === 0) {
    container.innerHTML = '<div class="col-12 text-center text-muted py-4">Data kelas belum tersedia pada master Formasi Kelas maupun Asatidz.</div>';
  } else {
    // 1. Bagian Kelas Reguler
    let htmlReguler = `
      <div class="col-12 mb-1">
        <h6 class="fw-bold text-success border-bottom pb-2 d-flex align-items-center gap-2">
          <i class="bi bi-book-half"></i> 1. Fan Kelas Reguler (Tingkat Umum)
        </h6>
      </div>`;

    listKelas.forEach(item => {
      const key = `${item.kls} ${item.tingkat}`;
      const existingFans = store.fanConfig[key] || [];
      const valStr = Array.isArray(existingFans) ? existingFans.join(', ') : existingFans;
      htmlReguler += `
        <div class="col-12">
          <label class="form-label fw-bold text-dark mb-1" style="font-size:12.5px;">${escHtmlFan_(key)}</label>
          <input type="text"
            class="form-control form-control-sm border-secondary input-config-fan"
            data-key="${escHtmlFan_(key)}"
            value="${escHtmlFan_(valStr)}"
            placeholder="Contoh: (Fiqih) Mabadi Fiqih Juz I II III, (Tajwid) Panduan Tajwid">
        </div>`;
    });
    container.innerHTML += htmlReguler;

    // 2. Sub Pengaturan Khusus Kelas Unggulan (Ug)
    const listUg = getDaftarKelasUnggulan();
    let htmlUnggulan = `
      <div class="col-12 mt-4 mb-1">
        <div class="p-2 rounded bg-warning bg-opacity-10 border border-warning border-opacity-25 d-flex justify-content-between align-items-center">
          <h6 class="fw-bold text-dark m-0 d-flex align-items-center gap-2">
            <i class="bi bi-star-fill text-warning"></i> 2. Sub Pengaturan Fan Khusus Kelas Unggulan (Ug)
          </h6>
          <span class="badge bg-warning text-dark border">${listUg.length} Kelas Terdaftar</span>
        </div>
      </div>`;

    if (listUg.length === 0) {
      htmlUnggulan += `
        <div class="col-12">
          <div class="alert alert-light border small text-muted text-center py-3">
            <i class="bi bi-info-circle me-1 text-secondary"></i> Belum ada kelas yang dilabeli Unggulan.<br>
            <i>*Centang opsi "Kelas Unggulan" pada menu Formasi Kelas untuk menetapkan Kelas Unggulan.</i>
          </div>
        </div>`;
    } else {
      listUg.sort().forEach(klsUg => {
        const keyUg = `${klsUg} (Ug)`;
        const existingFansUg = store.fanConfig[keyUg] || [];
        const valStrUg = Array.isArray(existingFansUg) ? existingFansUg.join(', ') : existingFansUg;
        htmlUnggulan += `
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="form-label fw-bold text-primary m-0" style="font-size:12.5px;">
                <i class="bi bi-award-fill text-warning me-1"></i>${escHtmlFan_(keyUg)}
              </label>
              <small class="text-muted fst-italic" style="font-size:10px;">Item Fan Khusus Unggulan</small>
            </div>
            <input type="text"
              class="form-control form-control-sm border-primary input-config-fan shadow-xs"
              data-key="${escHtmlFan_(keyUg)}"
              value="${escHtmlFan_(valStrUg)}"
              placeholder="Contoh: (Nahwu) Imrithi, (Shorof) Kaylani (Pisahkan dengan koma)">
          </div>`;
      });
    }
    container.innerHTML += htmlUnggulan;
  }

  $('#modalPengaturanFan').modal('show');
}

/**
 * Memigrasikan detail item Fan (jam, pengajar MS/MB, daftar asatidz) saat item di-rename
 * dan membersihkan key yatim yang dihapus pada `store.fanPelajaranDetail.item`
 */
function migrasiDetailItemSaatConfigBerubah_(cfgLama, cfgBaru, kunciTerender) {
  if (!store.fanPelajaranDetail) store.fanPelajaranDetail = { kelas: {}, item: {} };
  if (!store.fanPelajaranDetail.item) store.fanPelajaranDetail.item = {};

  const norm = arr => (arr || []).map(s => String(s).trim()).filter(Boolean);
  let adaPerubahanDetail = false;

  kunciTerender.forEach(key => {
    const lama = norm(cfgLama[key]);
    const baru = norm(cfgBaru[key]);
    const dihapus = lama.filter(x => !baru.includes(x));
    if (dihapus.length === 0) return;

    const ditambah = baru.filter(x => !lama.includes(x));
    const pasangan = new Map();
    const dipakai = new Set();

    // Pasangkan item lama -> item baru berdasarkan posisi indeks yang sama
    if (lama.length === baru.length) {
      lama.forEach((x, i) => {
        if (dihapus.includes(x) && ditambah.includes(baru[i]) && !dipakai.has(baru[i])) {
          pasangan.set(x, baru[i]);
          dipakai.add(baru[i]);
        }
      });
    }
    // Fallback jika jumlah yang dihapus sama dengan yang ditambah
    if (dihapus.length === ditambah.length) {
      dihapus.forEach(x => {
        if (pasangan.has(x)) return;
        const k = ditambah.find(b => !dipakai.has(b));
        if (k) {
          pasangan.set(x, k);
          dipakai.add(k);
        }
      });
    }

    dihapus.forEach(itemLama => {
      const oldItemKey = `${key}||${itemLama}`;
      const itemBaru = pasangan.get(itemLama);
      if (itemBaru) {
        const newItemKey = `${key}||${itemBaru}`;
        if (store.fanPelajaranDetail.item[oldItemKey] && !store.fanPelajaranDetail.item[newItemKey]) {
          store.fanPelajaranDetail.item[newItemKey] = store.fanPelajaranDetail.item[oldItemKey];
        }
      }
      if (store.fanPelajaranDetail.item[oldItemKey]) {
        delete store.fanPelajaranDetail.item[oldItemKey];
        adaPerubahanDetail = true;
      }
    });
  });

  return adaPerubahanDetail;
}

/**
 * Menyimpan konfigurasi Item Fan dari `#modalPengaturanFan` ke Supabase
 */
export async function simpanPengaturanFan() {
  const btn = document.getElementById('btnSimpanPengaturanFan');
  const oriText = btn ? btn.innerHTML : 'Simpan Konfigurasi';

  const newConfig = {};
  const kunciTerender = [];

  $('.input-config-fan').each(function () {
    const key = String($(this).data('key'));
    kunciTerender.push(key);
    const items = ($(this).val() || '').split(',').map(s => s.trim()).filter(Boolean);
    if (items.length > 0) newConfig[key] = items;
  });

  // Pertahankan konfigurasi kelas yang tidak ikut ter-render di form
  Object.keys(store.fanConfig || {}).forEach(k => {
    if (!kunciTerender.includes(k)) newConfig[k] = store.fanConfig[k];
  });

  if (btn) {
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';
    btn.disabled = true;
  }

  try {
    const adaMigrasi = migrasiDetailItemSaatConfigBerubah_(store.fanConfig || {}, newConfig, kunciTerender);
    await simpanFanConfigKeServer(newConfig);
    if (adaMigrasi) {
      simpanFanPelajaranDetailKeServer();
    }

    await renderFanPelajaran(true);
    if ($('#page-pengajar-fan').is(':visible')) {
      renderTabelPengajarFan(true);
    }

    $('#modalPengaturanFan').modal('hide');
    Swal.fire({
      icon: 'success',
      title: 'Tersimpan!',
      text: 'Pengaturan item Fan / Mata Pelajaran berhasil disimpan.',
      timer: 1800,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Menyimpan',
      text: err.message || 'Terjadi kesalahan saat menyimpan ke Supabase.'
    });
  } finally {
    if (btn) {
      btn.innerHTML = oriText;
      btn.disabled = false;
    }
  }
}

// ============================================================================
// 5. MODAL 2: BATCH SETUP "ATUR FAN MS" (#modalAturFanMS)
// ============================================================================

/**
 * Membuka Modal "Atur Fan MS" (Batch Setup Fan Khusus Mustahiq)
 */
export async function bukaModalAturFanMS() {
  if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
    Swal.fire({ title: 'Memuat Data Asatidz...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
      store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
      Swal.close();
    } catch (err) {
      Swal.fire('Gagal Memuat', err.message, 'error');
      return;
    }
  }
  renderChecklistFanMS();
  $('#modalAturFanMS').modal('show');
}

/**
 * Mengambil Set daftar bagian kelas (A, B, C, ...) untuk Tingkat + Din.Kls tertentu
 */
function dapatkanDaftarBagUntukFanMS(tingkat, kls) {
  const daftarBag = new Set();
  const tktUpper = String(tingkat || '').trim().toUpperCase();
  const klsStr = String(kls || '').trim();

  (store.globalDataFormasi || []).forEach(f => {
    if (String(f.tingkat || '').trim().toUpperCase() === tktUpper &&
        String(f.din_kls || '').trim() === klsStr) {
      const bag = String(f.din_bag || '').trim().toUpperCase();
      if (bag) daftarBag.add(bag);
    }
  });

  (store.globalDataAsatidz || []).forEach(a => {
    if (String(a.tingkat_asatidz || '').trim().toUpperCase() === tktUpper &&
        String(a.din_kls_asatidz || '').trim() === klsStr) {
      const bag = String(a.din_bag_asatidz || '').trim().toUpperCase();
      if (bag) daftarBag.add(bag);
    }
  });

  return daftarBag;
}

function dapatkanKelasKeyEfektifFanMS(kls, bag, tingkat, keyReguler) {
  const namaKelasMurni = `${kls} ${bag} ${tingkat}`;
  const isUg = isKelasUnggulan(namaKelasMurni);
  const keyUg = `${namaKelasMurni} (Ug)`;
  if (isUg && store.fanConfig[keyUg] && store.fanConfig[keyUg].length > 0) return keyUg;
  return keyReguler;
}

/**
 * Merender checklist Fan untuk kombinasi Tingkat + Din.Kls di `#modalAturFanMS`
 */
export function renderChecklistFanMS() {
  const tingkat = $('#afms_tingkat').val();
  const kls = $('#afms_kelas').val();
  const keyReguler = `${kls} ${tingkat}`;
  const container = document.getElementById('afms_checklist_container');
  if (!container) return;

  const items = store.fanConfig[keyReguler] || [];
  if (items.length === 0) {
    container.innerHTML = `<div class="text-center text-muted py-4 small">
      <i class="bi bi-inbox me-1"></i> Belum ada item Fan untuk kelas <b>${escHtmlFan_(keyReguler)}</b>.
      Silakan atur terlebih dahulu melalui tombol "Atur Item Fan".
    </div>`;
    $('#afms_count_badge').text('0 Fan Dipilih');
    return;
  }

  const daftarBag = dapatkanDaftarBagUntukFanMS(tingkat, kls);
  if (!store.fanPelajaranDetail.item) store.fanPelajaranDetail.item = {};

  let html = '';
  let countChecked = 0;

  items.forEach((rawItem, idx) => {
    const parsed = parseFanItemString(rawItem);
    const detReg = (store.fanPelajaranDetail.item && store.fanPelajaranDetail.item[`${keyReguler}||${rawItem}`]) || {};
    let isChecked = detReg.pengajar === 'MS';

    if (daftarBag.size > 0) {
      let adaCek = false;
      let semuaMS = true;
      daftarBag.forEach(bag => {
        const kelasKeyEfektif = dapatkanKelasKeyEfektifFanMS(kls, bag, tingkat, keyReguler);
        const itemsKelasIni = store.fanConfig[kelasKeyEfektif] || [];
        if (!itemsKelasIni.includes(rawItem)) return;
        adaCek = true;
        const det = (store.fanPelajaranDetail.item && store.fanPelajaranDetail.item[`${kelasKeyEfektif}||${rawItem}`]) || {};
        if (det.pengajar !== 'MS') semuaMS = false;
      });
      if (adaCek) isChecked = semuaMS;
    }

    if (isChecked) countChecked++;

    html += `
      <div class="form-check py-2 px-2 border-bottom">
        <input class="form-check-input chk-fan-ms" type="checkbox"
          value="${encodeURIComponent(rawItem)}" id="afms_item_${idx}"
          ${isChecked ? 'checked' : ''} onchange="window.updateCountFanMS()">
        <label class="form-check-label small fw-semibold" for="afms_item_${idx}">
          <span class="text-success fw-bold">${escHtmlFan_(parsed.fan)}</span> - ${escHtmlFan_(parsed.mapel)}
        </label>
      </div>`;
  });

  container.innerHTML = html;
  $('#afms_count_badge').text(`${countChecked} Fan Dipilih`);
}

export function updateCountFanMS() {
  const count = $('.chk-fan-ms:checked').length;
  $('#afms_count_badge').text(`${count} Fan Dipilih`);
}

/**
 * Mengambil seluruh nama Asatidz Mustahiq (Mustahiq, Mustahiqoh, MS & Koor, ISTI'DAD)
 * dari `store.globalDataAsatidz` untuk Tingkat & Kelas tertentu
 */
export function getDaftarNamaMustahiqKelas(tingkat, kls, bag = null) {
  const tktUpper = String(tingkat || '').trim().toUpperCase();
  const klsStr = String(kls || '').trim();
  const bagUpper = bag ? String(bag || '').trim().toUpperCase() : null;

  const listMustahiq = [];
  (store.globalDataAsatidz || []).forEach(a => {
    const rTkt = String(a.tingkat_asatidz || '').trim().toUpperCase();
    const rBag = String(a.din_bag_asatidz || '').trim().toUpperCase();
    const rKls = String(a.din_kls_asatidz || '').trim();
    const rJah = String(a.jah_asatidz || '').toLowerCase();
    const rNama = String(a.nama_asatidz || '').trim();

    const isMustahiq =
      rJah.includes('mustahiq') ||
      rJah.includes('ms & koor') ||
      rJah === 'ist' ||
      rJah.includes("isti'dad");

    if (isMustahiq && rTkt === tktUpper && rKls === klsStr && rNama) {
      if (!bagUpper || rBag === bagUpper) {
        if (!listMustahiq.includes(rNama)) {
          listMustahiq.push(rNama);
        }
      }
    }
  });

  return listMustahiq;
}

/**
 * Menyimpan pengaturan Fan Khusus MS: menetapkan `pengajar = 'MS'` dan
 * memasukkan seluruh Mustahiq kelas tersebut ke array `asatidz`
 */
export function simpanPengaturanFanMS() {
  const tingkat = $('#afms_tingkat').val();
  const kls = $('#afms_kelas').val();
  const selectedItems = [];

  $('.chk-fan-ms:checked').each(function () {
    selectedItems.push(decodeURIComponent($(this).val()));
  });

  if (selectedItems.length === 0) {
    return Swal.fire({
      icon: 'warning',
      title: 'Belum Ada Fan Dipilih',
      text: 'Pilih minimal satu Fan untuk dijadikan Fan khusus MS.'
    });
  }

  const daftarBag = dapatkanDaftarBagUntukFanMS(tingkat, kls);
  if (!store.fanPelajaranDetail.item) store.fanPelajaranDetail.item = {};
  const keyReguler = `${kls} ${tingkat}`;

  const semuaMustahiqKls = getDaftarNamaMustahiqKelas(tingkat, kls);

  // 1. Terapkan pada Fan Kelas Reguler (contoh: "1 ULA")
  const itemsReguler = store.fanConfig[keyReguler] || [];
  itemsReguler.forEach(rawItem => {
    const itemKeyReg = `${keyReguler}||${rawItem}`;
    if (!store.fanPelajaranDetail.item[itemKeyReg]) store.fanPelajaranDetail.item[itemKeyReg] = {};

    if (selectedItems.includes(rawItem)) {
      store.fanPelajaranDetail.item[itemKeyReg].pengajar = 'MS';
      store.fanPelajaranDetail.item[itemKeyReg].asatidz = [...semuaMustahiqKls];
    } else if (store.fanPelajaranDetail.item[itemKeyReg].pengajar === 'MS') {
      store.fanPelajaranDetail.item[itemKeyReg].pengajar = '';
      store.fanPelajaranDetail.item[itemKeyReg].asatidz = [];
    }
  });

  // 2. Terapkan juga pada Sub-Kelas Unggulan jika ada (contoh: "1 A ULA (Ug)")
  daftarBag.forEach(bag => {
    const kelasKeyEfektif = dapatkanKelasKeyEfektifFanMS(kls, bag, tingkat, keyReguler);
    if (kelasKeyEfektif !== keyReguler) {
      const itemsUg = store.fanConfig[kelasKeyEfektif] || [];
      const mustahiqBag = getDaftarNamaMustahiqKelas(tingkat, kls, bag);
      itemsUg.forEach(rawItem => {
        const itemKeyUg = `${kelasKeyEfektif}||${rawItem}`;
        if (!store.fanPelajaranDetail.item[itemKeyUg]) store.fanPelajaranDetail.item[itemKeyUg] = {};

        if (selectedItems.includes(rawItem)) {
          store.fanPelajaranDetail.item[itemKeyUg].pengajar = 'MS';
          store.fanPelajaranDetail.item[itemKeyUg].asatidz = [...mustahiqBag];
        } else if (store.fanPelajaranDetail.item[itemKeyUg].pengajar === 'MS') {
          store.fanPelajaranDetail.item[itemKeyUg].pengajar = '';
          store.fanPelajaranDetail.item[itemKeyUg].asatidz = [];
        }
      });
    }
  });

  simpanFanPelajaranDetailKeServer();
  renderFanPelajaran(true);

  Swal.fire({
    icon: 'success',
    title: 'Berhasil Diterapkan!',
    html: `Fan khusus MS untuk <b>${escHtmlFan_(kls)} ${escHtmlFan_(tingkat)}</b> berhasil diterapkan.<br>` +
          `Daftar Asatidz Mustahiq (<b>${semuaMustahiqKls.length} Asatidz</b>) otomatis ditetapkan sebagai pengajar.`,
    timer: 2600,
    showConfirmButton: false
  });

  $('#modalAturFanMS').modal('hide');
}

// ============================================================================
// 6. MODAL 3: PILIH ASATIDZ PENGAJAR PER FAN (#modalPilihAsatidzFan)
// ============================================================================

/**
 * Klasifikasi Jabatan (Jah) Asatidz menjadi MS (Mustahiq) vs MB (Munawib)
 */
export function cekKategoriJahAsatidz(jahStr) {
  const j = String(jahStr || '').trim().toLowerCase();
  const isMS =
    j === 'mustahiq' ||
    j === 'mustahiqoh' ||
    j === 'ms & koor' ||
    j === 'ist' ||
    j.includes("isti'dad");
  const isMB =
    j === 'munawib' ||
    j === 'munawibah' ||
    j === 'mb & top' ||
    j === 'mb & media' ||
    j === 'tm & mb' ||
    j === 'tu & mb';
  return { isMS, isMB };
}

/**
 * Membuka Pop-Up Pilih Asatidz saat kolom PENGAJAR pada tabel diklik
 */
export async function bukaModalPilihAsatidzFan(itemKeyEncoded) {
  if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
    Swal.fire({ title: 'Memuat Data Asatidz...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
      store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
      Swal.close();
    } catch (err) {
      Swal.fire('Gagal Memuat', err.message, 'error');
      return;
    }
  }

  const itemKey = decodeURIComponent(itemKeyEncoded);
  $('#modal_fan_target_itemkey').val(itemKey);

  const parts = itemKey.split('||');
  const kelasKey = parts[0] || '';
  const fanMapel = parts[1] || '';
  $('#modalFanSubtitle').text(`Kelas ${kelasKey} • ${fanMapel}`);

  const itemDetail = (store.fanPelajaranDetail.item && store.fanPelajaranDetail.item[itemKey]) || {
    pengajar: '',
    asatidz: []
  };
  const currentPengajar = itemDetail.pengajar || '';
  const currentAsatidz = Array.isArray(itemDetail.asatidz) ? itemDetail.asatidz : [];

  $('#chkFilterMS').prop('checked', currentPengajar.includes('MS') || !currentPengajar.includes('MB'));
  $('#chkFilterMB').prop('checked', currentPengajar.includes('MB'));
  $('#searchAsatidzFanModal').val('');
  $('#chkAllAsatidzFan').prop('checked', false);

  renderListAsatidzFanModal(currentAsatidz);
  $('#modalPilihAsatidzFan').modal('show');
}

/**
 * Menyaring daftar checklist Asatidz berdasarkan Checkbox MS/MB & kata kunci pencarian
 */
export function filterAsatidzFanModal() {
  const isMS = $('#chkFilterMS').is(':checked');
  const isMB = $('#chkFilterMB').is(':checked');
  const keyword = ($('#searchAsatidzFanModal').val() || '').trim().toLowerCase();

  $('#boxListAsatidzFanModal .item-asatidz-row').each(function () {
    const rowJah = $(this).attr('data-jah') || '';
    const rowNama = $(this).attr('data-nama') || '';
    const rowNia = $(this).attr('data-nia') || '';
    const kat = cekKategoriJahAsatidz(rowJah);

    let matchKategori = false;
    if (isMS && kat.isMS) matchKategori = true;
    if (isMB && kat.isMB) matchKategori = true;
    if (!isMS && !isMB) matchKategori = true;

    const matchKeyword =
      !keyword ||
      rowNama.includes(keyword) ||
      rowNia.includes(keyword) ||
      rowJah.toLowerCase().includes(keyword);

    if (matchKategori && matchKeyword) {
      $(this).removeClass('d-none');
    } else {
      $(this).addClass('d-none');
    }
  });

  updateCountTerpilihAsatidzFan();
}

/**
 * Merender daftar Asatidz di dalam `#modalPilihAsatidzFan`
 * (Asatidz yang sudah terpilih otomatis berada di urutan paling atas, diikuti Natural Sort NIA)
 */
export function renderListAsatidzFanModal(selectedNames = []) {
  const box = document.getElementById('boxListAsatidzFanModal');
  if (!box) return;

  const selectedSet = new Set((selectedNames || []).map(n => String(n).trim().toUpperCase()));

  const listGuru = (store.globalDataAsatidz || []).slice().sort((a, b) => {
    const namaA = String(a.nama_asatidz || '').trim().toUpperCase();
    const namaB = String(b.nama_asatidz || '').trim().toUpperCase();
    const isSelA = selectedSet.has(namaA) ? 0 : 1;
    const isSelB = selectedSet.has(namaB) ? 0 : 1;
    if (isSelA !== isSelB) return isSelA - isSelB;
    return compareNIANatural(a.nia, b.nia);
  });

  let html = '';
  listGuru.forEach((a, idx) => {
    const nama = String(a.nama_asatidz || '').trim();
    if (!nama) return;
    const namaUpper = nama.toUpperCase();
    const nia = String(a.nia || '').trim();
    const jah = String(a.jah_asatidz || '').trim();

    const isChecked = selectedSet.has(namaUpper);
    const kat = cekKategoriJahAsatidz(jah);
    const badgeKat = kat.isMS
      ? '<span class="badge bg-success py-0" style="font-size:9px;">MS</span>'
      : (kat.isMB ? '<span class="badge bg-primary py-0" style="font-size:9px;">MB</span>' : '');

    const rowBgClass = isChecked
      ? 'bg-success bg-opacity-10 border-success border-opacity-25'
      : 'border-light';

    html += `
      <div class="item-asatidz-row py-2 px-3 border rounded d-flex align-items-center justify-content-between ${rowBgClass}"
        data-nama="${escHtmlFan_(nama.toLowerCase())}"
        data-nia="${escHtmlFan_(nia.toLowerCase())}"
        data-jah="${escHtmlFan_(jah)}"
        style="cursor: pointer;">

        <div class="d-flex align-items-center gap-2" style="min-width: 0;">
          <input class="chk-pilih-guru-fan"
            type="checkbox"
            value="${escHtmlFan_(nama)}"
            id="chk_fan_g_${idx}"
            ${isChecked ? 'checked' : ''}
            onchange="window.onCheckboxGuruFanChange(this)">

          <label class="small fw-semibold text-dark m-0 d-flex align-items-center text-truncate cursor-pointer"
            for="chk_fan_g_${idx}">
            <span class="badge bg-dark text-white font-monospace py-0 me-2" style="font-size:10px; flex-shrink:0;">${escHtmlFan_(nia || '-')}</span>
            <span class="text-truncate">${escHtmlFan_(nama)}</span>
          </label>
        </div>

        <div class="d-flex align-items-center gap-1 flex-shrink-0 ms-2">
          ${badgeKat}
          <span class="badge bg-light text-secondary border py-0" style="font-size:10px;">${escHtmlFan_(jah || '-')}</span>
        </div>
      </div>`;
  });

  box.innerHTML = html || '<div class="text-center text-muted py-3 small">Tidak ada data Asatidz.</div>';
  filterAsatidzFanModal();
}

export function onCheckboxGuruFanChange(el) {
  const row = $(el).closest('.item-asatidz-row');
  if (el.checked) {
    row.addClass('bg-success bg-opacity-10 border-success border-opacity-25');
  } else {
    row.removeClass('bg-success bg-opacity-10 border-success border-opacity-25');
  }
  updateCountTerpilihAsatidzFan();
}

export function updateCountTerpilihAsatidzFan() {
  const count = $('#boxListAsatidzFanModal .chk-pilih-guru-fan:checked').length;
  $('#countTerpilihAsatidzFan').text(`${count} Asatidz Dipilih`);
}

export function toggleSelectAllAsatidzFan(masterEl) {
  const isChecked = $(masterEl).is(':checked');
  $('#boxListAsatidzFanModal .item-asatidz-row:not(.d-none)').each(function () {
    const $chk = $(this).find('.chk-pilih-guru-fan');
    if ($chk.length) {
      $chk.prop('checked', isChecked);
      if (isChecked) {
        $(this).addClass('bg-success bg-opacity-10 border-success border-opacity-25');
      } else {
        $(this).removeClass('bg-success bg-opacity-10 border-success border-opacity-25');
      }
    }
  });
  updateCountTerpilihAsatidzFan();
}

/**
 * Menyimpan daftar Asatidz pengajar yang dipilih pada `#modalPilihAsatidzFan`
 */
export function simpanPilihanAsatidzFan() {
  const itemKey = $('#modal_fan_target_itemkey').val();
  if (!itemKey) return;

  const selectedNames = [];
  $('#boxListAsatidzFanModal .chk-pilih-guru-fan:checked').each(function () {
    selectedNames.push($(this).val());
  });

  const isMS = $('#chkFilterMS').is(':checked');
  const isMB = $('#chkFilterMB').is(':checked');
  let pengajarVal = '';
  if (isMS && isMB) pengajarVal = 'MS, MB';
  else if (isMS) pengajarVal = 'MS';
  else if (isMB) pengajarVal = 'MB';

  if (!store.fanPelajaranDetail.item) store.fanPelajaranDetail.item = {};
  if (!store.fanPelajaranDetail.item[itemKey]) store.fanPelajaranDetail.item[itemKey] = {};

  store.fanPelajaranDetail.item[itemKey].pengajar = pengajarVal;
  store.fanPelajaranDetail.item[itemKey].asatidz = selectedNames;

  simpanFanPelajaranDetailKeServer();
  renderFanPelajaran(true);
  if ($('#page-pengajar-fan').is(':visible')) {
    renderTabelPengajarFan(true);
  }
  $('#modalPilihAsatidzFan').modal('hide');

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: 'Asatidz pengajar berhasil ditetapkan!',
    showConfirmButton: false,
    timer: 2000
  });
}

// ============================================================================
// 7. MODAL 4: PENGATURAN GRUP ASAL ASATIDZ (#modalGrupAsal) & DRAG-DROP URUTAN
// ============================================================================
let dragSrcIdxGrup = null;

export function getMasterGrupAsal() {
  return JSON.parse(JSON.stringify(store.masterGrupAsal || []));
}

export async function bukaModalGrupAsal() {
  if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
    Swal.fire({ title: 'Memuat Data Asatidz...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
      store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
      Swal.close();
    } catch (err) {
      Swal.fire('Gagal Memuat', err.message, 'error');
      return;
    }
  }
  resetFormGrupAsal();
  renderDaftarGrupTersimpan();
  $('#modalGrupAsal').modal('show');
}

export function resetQuickSelectHurufGrup() {
  $('#wrapQuickSelectHurufGrup .quick-huruf-grup').prop('checked', false);
}

export function resetFormGrupAsal() {
  $('#inputNamaGrupAsal').val('');
  $('#cariAsatidzGrup').val('');
  resetQuickSelectHurufGrup();
  renderChecklistAsatidzGrup([]);
}

export function renderChecklistAsatidzGrup(selectedList = []) {
  const box = document.getElementById('boxListAsatidzGrup');
  if (!box) return;

  const selectedSet = new Set((selectedList || []).map(n => String(n).trim().toUpperCase()));
  const masterGrup = getMasterGrupAsal();
  const mapGrupLain = {};

  masterGrup.forEach(g => {
    (g.anggota || []).forEach(namaMember => {
      const mUpper = String(namaMember || '').trim().toUpperCase();
      mapGrupLain[mUpper] = g.namaGrup;
    });
  });

  const list = (store.globalDataAsatidz || []).slice().sort((a, b) => {
    const namaA = String(a.nama_asatidz || '').trim().toUpperCase();
    const namaB = String(b.nama_asatidz || '').trim().toUpperCase();
    const isSelA = selectedSet.has(namaA) ? 0 : 1;
    const isSelB = selectedSet.has(namaB) ? 0 : 1;
    if (isSelA !== isSelB) return isSelA - isSelB;
    return compareNIANatural(a.nia, b.nia);
  });

  let html = '';
  list.forEach((a, idx) => {
    const nama = String(a.nama_asatidz || '').trim();
    if (!nama) return;
    const namaUpper = nama.toUpperCase();
    const nia = String(a.nia || '').trim();
    const jah = String(a.jah_asatidz || '').trim();

    const isChecked = selectedSet.has(namaUpper);
    const grupAsalLain = mapGrupLain[namaUpper];
    const isLocked = !isChecked && !!grupAsalLain;

    const fullSearch = `${nama} ${nia} ${jah} ${grupAsalLain || ''}`.toLowerCase();
    const rowBgClass = isChecked ? 'bg-success bg-opacity-10' : (isLocked ? 'bg-light opacity-75' : '');
    const labelCursor = isLocked ? 'cursor: not-allowed;' : 'cursor: pointer;';
    const badgeGrupLainHtml = isLocked
      ? `<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 ms-auto text-nowrap font-monospace" style="font-size:10px;" title="Sudah terdaftar di grup: ${escHtmlFan_(grupAsalLain)}"><i class="bi bi-lock-fill me-1 text-danger"></i>${escHtmlFan_(grupAsalLain)}</span>`
      : '';

    html += `
      <div class="form-check item-chk-asatidz py-1 px-2 border-bottom border-light d-flex align-items-center gap-2 ${rowBgClass}"
        data-nama="${escHtmlFan_(nama.toLowerCase())}"
        data-nia="${escHtmlFan_(nia.toLowerCase())}"
        data-jah="${escHtmlFan_(jah.toLowerCase())}"
        data-full="${escHtmlFan_(fullSearch)}"
        data-locked="${isLocked ? 'true' : 'false'}">
        <input class="form-check-input chk-grup-asatidz mt-0" type="checkbox"
          value="${escHtmlFan_(nama)}"
          id="chk_grup_${idx}"
          ${isChecked ? 'checked' : ''}
          ${isLocked ? 'disabled' : ''}>
        <label class="form-check-label small fw-semibold ${isLocked ? 'text-muted' : 'text-dark'} d-flex align-items-center gap-2 m-0 w-100"
          for="chk_grup_${idx}"
          style="${labelCursor}">
          <span class="badge-nia-checklist ${isLocked ? 'bg-secondary' : ''}">[${escHtmlFan_(nia || '-')}]</span>
          <span>${escHtmlFan_(nama)} <span class="text-muted fw-normal">(${escHtmlFan_(jah || '-')})</span></span>
          ${badgeGrupLainHtml}
        </label>
      </div>`;
  });

  box.innerHTML = html || '<div class="text-muted small">Tidak ada data asatidz.</div>';
  filterChecklistGrupAsatidz();
}

export function filterChecklistGrupAsatidz() {
  const kw = ($('#cariAsatidzGrup').val() || '').toLowerCase().trim();
  $('#boxListAsatidzGrup .item-chk-asatidz').each(function () {
    const fullText = $(this).attr('data-full') || '';
    if (!kw || fullText.includes(kw)) {
      $(this).removeClass('d-none');
    } else {
      $(this).addClass('d-none');
    }
  });
}

export function toggleQuickSelectHurufGrup(huruf, isChecked) {
  const hurufLower = String(huruf || '').toLowerCase();
  $('#boxListAsatidzGrup .item-chk-asatidz').each(function () {
    const nia = $(this).attr('data-nia') || '';
    const isLocked = $(this).attr('data-locked') === 'true';
    if (nia.charAt(0) === hurufLower && !isLocked) {
      const $chk =$(this).find('.chk-grup-asatidz');
      if (!$chk.prop('disabled')) {$chk.prop('checked', isChecked);
        if (isChecked) $(this).addClass('bg-success bg-opacity-10');
        else $(this).removeClass('bg-success bg-opacity-10');
      }
    }
  });
}

export async function simpanGrupAsalBaru() {
  const namaGrup = ($('#inputNamaGrupAsal').val() || '').trim().toUpperCase();
  if (!namaGrup) {
    return Swal.fire('Perhatian', 'Harap isi nama grup asal terlebih dahulu!', 'warning');
  }

  const selectedAsatidz = [];
  $('.chk-grup-asatidz:checked').each(function () {
    selectedAsatidz.push($(this).val());
  });

  if (selectedAsatidz.length === 0) {
    return Swal.fire('Perhatian', 'Pilih minimal satu Asatidz untuk grup ini!', 'warning');
  }

  const master = getMasterGrupAsal();
  const existingIdx = master.findIndex(g => g.namaGrup === namaGrup);
  if (existingIdx > -1) {
    master[existingIdx].anggota = selectedAsatidz;
  } else {
    master.push({ namaGrup, anggota: selectedAsatidz });
  }

  await simpanGrupAsalKeServer(master);
  renderDaftarGrupTersimpan();
  resetFormGrupAsal();
  renderTabelPengajarFan(true);

  Swal.fire({
    icon: 'success',
    title: 'Tersimpan!',
    text: `Grup ${namaGrup} berhasil disimpan.`,
    timer: 1300,
    showConfirmButton: false
  });
}

export function renderDaftarGrupTersimpan() {
  const container = document.getElementById('containerListGrupTersimpan');
  if (!container) return;
  const master = getMasterGrupAsal();
  if (master.length === 0) {
    container.innerHTML = '<small class="text-muted fst-italic">Belum ada grup yang dibuat.</small>';
    return;
  }

  let html = '';
  master.forEach((g, idx) => {
    html += `
      <div class="d-flex justify-content-between align-items-center p-2 rounded bg-light border item-grup-drag"
           draggable="true" data-idx="${idx}"
           ondragstart="window.handleDragStartGrup(event)"
           ondragover="window.handleDragOverGrup(event)"
           ondragleave="window.handleDragLeaveGrup(event)"
           ondrop="window.handleDropGrup(event)"
           ondragend="window.handleDragEndGrup(event)"
           title="Tahan &amp; seret untuk mengubah urutan grup">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-grip-vertical text-muted fs-5" style="cursor:grab;"></i>
          <div>
            <b class="text-success">${escHtmlFan_(g.namaGrup)}</b>
            <div class="small text-muted">${(g.anggota || []).length} Asatidz</div>
          </div>
        </div>
        <div class="d-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" onclick="window.editGrupAsal(${idx})" title="Edit Grup">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" onclick="window.hapusGrupAsal(${idx})" title="Hapus Grup">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

export function editGrupAsal(idx) {
  const master = getMasterGrupAsal();
  const g = master[idx];
  if (!g) return;
  $('#inputNamaGrupAsal').val(g.namaGrup);
  $('#cariAsatidzGrup').val('');
  resetQuickSelectHurufGrup();
  renderChecklistAsatidzGrup(g.anggota || []);
  document.getElementById('inputNamaGrupAsal')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function hapusGrupAsal(idx) {
  Swal.fire({
    title: 'Hapus Grup Ini?',
    text: 'Asatidz yang ada di dalam grup akan kembali menjadi Asatidz tanpa Grup Asal.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  }).then(async (r) => {
    if (!r.isConfirmed) return;
    const master = getMasterGrupAsal();
    master.splice(idx, 1);
    await simpanGrupAsalKeServer(master);
    renderDaftarGrupTersimpan();
    resetFormGrupAsal();
    renderTabelPengajarFan(true);
  });
}

export function handleDragStartGrup(e) {
  dragSrcIdxGrup = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(dragSrcIdxGrup)); } catch (err) {}
  e.currentTarget.style.opacity = '0.4';
}

export function handleDragOverGrup(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over-target');
  return false;
}

export function handleDragLeaveGrup(e) {
  e.currentTarget.classList.remove('drag-over-target');
}

export async function handleDropGrup(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over-target');
  const targetIdx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
  if (dragSrcIdxGrup === null || dragSrcIdxGrup === targetIdx) return false;

  const master = getMasterGrupAsal();
  const movedItem = master.splice(dragSrcIdxGrup, 1)[0];
  master.splice(targetIdx, 0, movedItem);
  await simpanGrupAsalKeServer(master);

  renderDaftarGrupTersimpan();
  renderTabelPengajarFan(true);
  return false;
}

export function handleDragEndGrup(e) {
  e.currentTarget.style.opacity = '1';
  document.querySelectorAll('.item-grup-drag').forEach(el => el.classList.remove('drag-over-target'));
  dragSrcIdxGrup = null;
}

// ============================================================================
// 8. SUB-MENU: PENGAJAR FAN (#page-pengajar-fan)
// ============================================================================
let keywordCariPengajarFan = '';
let timerCariPengajarFan = null;
let barisTampilPengajarFan = [];

export function cariPengajarFanDebounce(val) {
  clearTimeout(timerCariPengajarFan);
  timerCariPengajarFan = setTimeout(function () {
    cariPengajarFan(val);
  }, 200);
}

export function cariPengajarFan(val) {
  keywordCariPengajarFan = String(val || '').toLowerCase().replace(/\s+/g, ' ').trim();
  $('#btnHapusCariPengajarFan').toggleClass('d-none', !keywordCariPengajarFan);
  renderTabelPengajarFan(true);
}

export function resetFilterPengajarFan() {
  $('#inputCariPengajarFan').val('');
  $('#fltPFanTingkat').val('');
  $('#fltPFanJah').val('');
  cariPengajarFan('');
}

function getItemsKonfigFanKelas_(kelasKey) {
  const cfg = store.fanConfig || {};
  if (Array.isArray(cfg[kelasKey]) && cfg[kelasKey].length) return cfg[kelasKey];
  if (/\(Ug\)\s*$/i.test(kelasKey)) {
    const p = kelasKey.replace(/\s*\(Ug\)\s*$/i, '').trim().split(/\s+/);
    const fb = p[0] + ' ' + p[p.length - 1];
    if (Array.isArray(cfg[fb])) return cfg[fb];
  }
  return null;
}

function ekstraksiDataPengajarFan() {
  const petaTemp = {};
  (store.globalDataAsatidz || []).forEach(a => {
    const n = String(a.nama_asatidz || '').trim().toUpperCase();
    if (n) petaTemp[n] = {};
  });

  const items = (store.fanPelajaranDetail && store.fanPelajaranDetail.item) || {};
  Object.keys(items).forEach(itemKey => {
    const idx = itemKey.indexOf('||');
    if (idx < 0) return;
    const kelasKey = itemKey.substring(0, idx);
    const rawItem = itemKey.substring(idx + 2);

    const daftarCfg = getItemsKonfigFanKelas_(kelasKey);
    if (daftarCfg && !daftarCfg.includes(rawItem)) return;

    const det = items[itemKey] || {};
    const guru = Array.isArray(det.asatidz) ? det.asatidz : [];
    if (!guru.length) return;

    const parsed = parseFanItemString(rawItem);
    const namaFan = (parsed.fan && parsed.fan !== '-') ? parsed.fan : parsed.mapel;
    const isUg = /\(Ug\)\s*$/i.test(kelasKey);
    const kelasBersih = kelasKey.replace(/\s*\(Ug\)\s*$/i, '').trim();
    const kelasLabel = isUg ? `${kelasBersih} Ug` : kelasBersih;
    const parts = kelasBersih.split(/\s+/);
    const tingkat = String(parts[parts.length - 1] || '').toUpperCase();
    const klsNum = parseInt(parts[0], 10) || 0;

    guru.forEach(g => {
      const key = String(g || '').trim().toUpperCase();
      if (!key || !petaTemp[key]) return;
      const ek = `${namaFan.toLowerCase()}|${kelasLabel.toLowerCase()}`;
      if (!petaTemp[key][ek]) {
        petaTemp[key][ek] = {
          fan: namaFan,
          kelas: kelasLabel,
          tingkat,
          klsNum,
          isUg,
          kitab: []
        };
      }
      if (parsed.mapel && parsed.mapel !== '-' && !petaTemp[key][ek].kitab.includes(parsed.mapel)) {
        petaTemp[key][ek].kitab.push(parsed.mapel);
      }
    });
  });

  const peta = {};
  Object.keys(petaTemp).forEach(k => {
    peta[k] = Object.values(petaTemp[k]).sort((a, b) =>
      ((URUTAN_TINGKAT[a.tingkat] || 99) - (URUTAN_TINGKAT[b.tingkat] || 99)) ||
      (a.klsNum - b.klsNum) ||
      a.kelas.localeCompare(b.kelas, undefined, { numeric: true }) ||
      a.fan.localeCompare(b.fan)
    );
  });

  let totalItem = 0;
  let itemTerisi = 0;
  const cfg = store.fanConfig || {};
  Object.keys(cfg).forEach(kelasKey => {
    (cfg[kelasKey] || []).forEach(raw => {
      totalItem++;
      const d = items[`${kelasKey}||${raw}`];
      if (d && Array.isArray(d.asatidz) && d.asatidz.length) itemTerisi++;
    });
  });

  return { peta, totalItem, itemTerisi };
}

function isiOpsiFilterPengajarFan() {
  const el = document.getElementById('fltPFanJah');
  if (!el) return;
  const cur = el.value;
  const set = new Set();
  (store.globalDataAsatidz || []).forEach(a => {
    const j = String(a.jah_asatidz || '').trim();
    if (j && j !== '-') set.add(j);
  });
  const arr = Array.from(set).sort();
  const sig = arr.join('|');
  if (el.getAttribute('data-sig') === sig) return;
  el.innerHTML = '<option value="">Semua Jah</option>' +
    arr.map(j => `<option value="${escHtmlFan_(j)}">${escHtmlFan_(j)}</option>`).join('');
  el.setAttribute('data-sig', sig);
  el.value = cur;
}

/**
 * Membuka Modal Profil Detail Asatidz (`#detailModalAsatidz`) saat nama Asatidz
 * pada tabel Pengajar Fan diklik
 */
export function bukaDetailAsatidzDariFan(namaEncoded) {
  const nama = decodeURIComponent(namaEncoded || '').trim().toUpperCase();
  const found = (store.globalDataAsatidz || []).find(
    a => String(a.nama_asatidz || '').trim().toUpperCase() === nama
  );
  if (!found) return;
  store.selectedRowDataAsatidz = found;
  if (typeof window.renderDetailAsatidz === 'function') {
    window.renderDetailAsatidz(found);
    $('#detailModalAsatidz').modal('show');
  }
}

/**
 * Merender Tabel Rekapitulasi Pengajar Fan (`#tablePengajarFan`)
 */
export async function renderTabelPengajarFan(sudahFetch = false) {
  const tbody = document.getElementById('tbodyPengajarFan');
  if (!tbody) return;

  if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
    if (sudahFetch === true) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Tidak ada data asatidz.</td></tr>`;
      return;
    }
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-success me-2"></div>Memuat data Asatidz...</td></tr>`;
    try {
      store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle-fill me-1"></i> Gagal memuat data: ${escHtmlFan_(err.message)}</td></tr>`;
      return;
    }
    return renderTabelPengajarFan(true);
  }

  const data = ekstraksiDataPengajarFan();
  isiOpsiFilterPengajarFan();
  const fTkt = ($('#fltPFanTingkat').val() || '').toUpperCase();
  const fJah = $('#fltPFanJah').val() || '';
  const kw = keywordCariPengajarFan;

  const masterGrup = getMasterGrupAsal();
  const asatidzAssigned = new Set();
  let kelompok = [];

  masterGrup.forEach(g => {
    let list = [];
    (g.anggota || []).forEach(nama => {
      const found = store.globalDataAsatidz.find(
        a => String(a.nama_asatidz || '').trim().toUpperCase() === String(nama || '').trim().toUpperCase()
      );
      if (found) {
        list.push(found);
        asatidzAssigned.add(String(found.nama_asatidz || '').trim().toUpperCase());
      }
    });
    list = sortAsatidzByKodeNatural(list);
    if (list.length > 0) kelompok.push({ namaGrup: g.namaGrup, asatidzList: list });
  });

  let nonGrup = store.globalDataAsatidz.filter(
    a => !asatidzAssigned.has(String(a.nama_asatidz || '').trim().toUpperCase())
  );
  nonGrup = sortAsatidzByKodeNatural(nonGrup);
  if (nonGrup.length > 0) kelompok.push({ namaGrup: '', asatidzList: nonGrup });

  let fallbackN = 0;
  kelompok = kelompok.map(grp => ({
    namaGrup: grp.namaGrup,
    rows: grp.asatidzList.map(a => {
      let kode = String(a.nia || '').trim();
      if (!kode) kode = 'D' + (++fallbackN);
      const nama = String(a.nama_asatidz || '').trim();
      const jah = String(a.jah_asatidz || '').trim();
      let entries = data.peta[nama.toUpperCase()] || [];
      if (fTkt) entries = entries.filter(e => e.tingkat === fTkt);
      return { kode, nama, jah, entries };
    })
  }));

  kelompok = kelompok.map(grp => {
    const grupCocok = !!kw && String(grp.namaGrup || '').toLowerCase().includes(kw);
    const rows = grp.rows.filter(o => {
      if (fJah && o.jah !== fJah) return false;
      if (fTkt && o.entries.length === 0) return false;
      if (!kw || grupCocok) return true;
      const teks = `${o.kode} ${o.nama} ${o.jah} ${o.entries.map(e => `${e.fan}${e.kelas}`).join(' ')}`.toLowerCase();
      return teks.includes(kw);
    });
    return { namaGrup: grp.namaGrup, rows };
  }).filter(grp => grp.rows.length > 0);

  let html = '';
  let totalAsatidz = 0;
  barisTampilPengajarFan = [];

  kelompok.forEach(grp => {
    const isGrouped = !!grp.namaGrup;
    const rowCount = grp.rows.length;
    grp.rows.forEach((o, idxInGroup) => {
      totalAsatidz++;
      const badges = o.entries.map(e => {
        const tip = e.kitab.length ? e.kitab.join(', ') : e.fan;
        return `<span class="badge-fan-ajar ${e.isUg ? 'is-ug' : ''}" title="${escHtmlFan_(tip)}">${escHtmlFan_(e.fan)} <small>(${escHtmlFan_(e.kelas)})</small></span>`;
      }).join('');

      barisTampilPengajarFan.push({
        kode: o.kode,
        nama: o.nama,
        asal: isGrouped ? grp.namaGrup : '-',
        jah: o.jah || '-',
        fanText: o.entries.map(e => `${e.fan} (${e.kelas})`).join('; '),
        jml: o.entries.length
      });

      html += `<tr>`;
      html += `<td class="font-monospace text-center fw-bold">${escHtmlFan_(o.kode)}</td>`;
      html += `<td class="nama-pendidik nama-pendidik-click"
        onclick="window.bukaDetailAsatidzDariFan('${encodeURIComponent(o.nama).replace(/'/g, '%27')}')"
        title="Klik untuk lihat profil ${escHtmlFan_(o.nama)}">${escHtmlFan_(o.nama)}</td>`;
      if (isGrouped) {
        if (idxInGroup === 0) {
          html += `<td class="cell-asal-grup" rowspan="${rowCount}">${escHtmlFan_(grp.namaGrup)}</td>`;
        }
      } else {
        html += `<td class="text-center text-muted">-</td>`;
      }
      html += `<td class="text-center">${escHtmlFan_(o.jah) || '-'}</td>`;
      html += o.entries.length
        ? `<td class="cell-fan-pengajar">${badges}</td>`
        : `<td class="cell-pfan-kosong">Belum ada fan yang diampu</td>`;
      html += `<td class="cell-jam-total text-center">${o.entries.length}</td>`;
      html += `</tr>`;
    });
  });

  tbody.innerHTML = html || (kw || fTkt || fJah
    ? `<tr><td colspan="6" class="text-center py-4 text-muted"><i class="bi bi-search me-1"></i>Tidak ada asatidz yang cocok dengan filter/pencarian.</td></tr>`
    : `<tr><td colspan="6" class="text-center py-4 text-muted">Tidak ada data asatidz.</td></tr>`);

  const pct = data.totalItem > 0 ? Math.round((data.itemTerisi / data.totalItem) * 100) : 0;
  $('#infoTotalAsatidzPFan').text(`${totalAsatidz} Asatidz`);
  $('#infoTotalFanPFan').text(`Keterisian Fan: ${data.itemTerisi}/${data.totalItem} (${pct}%)`);
}

export async function muatUlangPengajarFan() {
  const tbody = document.getElementById('tbodyPengajarFan');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-success me-2"></div>Menyegarkan data terbaru...</td></tr>`;
  }
  try {
    store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    await loadFormasiData();
    await loadFanSettingsFromSupabase();
    await renderTabelPengajarFan(true);
    Swal.fire({ icon: 'success', title: 'Data Diperbarui', timer: 1000, showConfirmButton: false });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Gagal Menyegarkan', text: err.message, confirmButtonColor: '#0f766e' });
    renderTabelPengajarFan(true);
  }
}

export function exportPengajarFanExcel() {
  if (!barisTampilPengajarFan || barisTampilPengajarFan.length === 0) {
    return Swal.fire({ icon: 'warning', title: 'Tidak ada data untuk diexport!' });
  }
  const rows = [['No', 'Kode', 'Nama', 'Asal', 'Jah', 'Mengajar Fan', 'Jumlah Fan']];
  barisTampilPengajarFan.forEach((b, i) =>
    rows.push([i + 1, b.kode, b.nama, b.asal, b.jah, b.fanText, b.jml])
  );
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 8 }, { wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 70 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pengajar Fan');
  XLSX.writeFile(wb, 'Daftar_Pengajar_Fan_Madin.xlsx');
}

export function cetakPengajarFan() {
  document.body.classList.add('printing-pengajar-fan');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-pengajar-fan');
  }, 600);
}

// ============================================================================
// 9. ENGINE PRESS & HOLD DRAG-AND-SELECT CHECKBOX + INISIALISASI UI FAN
// ============================================================================
export function pasangFiturDragSelect(containerSelector, itemSelector, checkboxSelector, callbackOnChange) {
  let isDragging = false;
  let isDragConfirmed = false;
  let targetCheckedState = true;
  let lastElem = null;
  let holdTimer = null;
  let activeHoldingRow = null;
  let startTouchCoord = { x: 0, y: 0 };
  const HOLD_DURATION = 250;

function applyItemCheck(el) {
    if (!el || $(el).hasClass('d-none') || $(el).css('display') === 'none') return;
    if ($(el).attr('data-locked') === 'true') return;

    const $checkbox = $(el).find(checkboxSelector);
    if ($checkbox.length && !$checkbox.prop('disabled')) {
      if ($checkbox.prop('checked') !== targetCheckedState) {
        $checkbox.prop('checked', targetCheckedState);
        if (targetCheckedState) {
          $(el).addClass('bg-success bg-opacity-10 border-success border-opacity-25');
        } else {
          $(el).removeClass('bg-success bg-opacity-10 border-success border-opacity-25');
        }
        if (typeof callbackOnChange === 'function') callbackOnChange();
      }
    }
    $(el).addClass('drag-swept-highlight');
  }

  function startHolding(rowEl, startChecked) {
    if ($(rowEl).attr('data-locked') === 'true') return;
    activeHoldingRow = rowEl;
    $(rowEl).addClass('item-chk-holding');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      isDragging = true;
      isDragConfirmed = true;
      lastElem = rowEl;
      targetCheckedState = !startChecked;
      applyItemCheck(rowEl);
      if (navigator.vibrate) {
        try { navigator.vibrate(35); } catch (e) {}
      }
    }, HOLD_DURATION);
  }

  function cancelHolding() {
    clearTimeout(holdTimer);
    if (activeHoldingRow) {
      $(activeHoldingRow).removeClass('item-chk-holding');
      activeHoldingRow = null;
    }
  }

  function cleanupDrag() {
    cancelHolding();
    isDragging = false;
    isDragConfirmed = false;
    lastElem = null;
    $(`${containerSelector} ${itemSelector}`).removeClass('drag-swept-highlight item-chk-holding');
  }

  // Event Mouse (Desktop / PC)
  $(document).on('mousedown', `${containerSelector} ${itemSelector}`, function (e) {
    if ($(e.target).is('button, a, select, option, input[type="text"]')) return;
    if ($(this).attr('data-locked') === 'true') return;

    const targetRow = this;
    const $checkbox =$(targetRow).find(checkboxSelector);
    if (!$checkbox.length \vert{}\vert{}$checkbox.prop('disabled')) return;

    startTouchCoord = { x: e.clientX, y: e.clientY };
    isDragConfirmed = false;

    if ($(e.target).is(checkboxSelector)) {
      isDragging = true;
      isDragConfirmed = true;
      lastElem = targetRow;
      targetCheckedState = $checkbox.is(':checked');
      applyItemCheck(targetRow);
      return;
    }

    startHolding(targetRow, $checkbox.is(':checked'));
  });

  $(document).on('mousemove', function (e) {
    if (!isDragConfirmed && activeHoldingRow) {
      const dist = Math.hypot(e.clientX - startTouchCoord.x, e.clientY - startTouchCoord.y);
      if (dist > 6) cancelHolding();
    }
  });

  $(document).on('mouseenter', `${containerSelector} ${itemSelector}`, function () {
    if (!isDragging || !isDragConfirmed || lastElem === this) return;
    if ($(this).attr('data-locked') === 'true') return;
    lastElem = this;
    applyItemCheck(this);
  });

  $(document).on('mouseup', function () {
    if (!isDragConfirmed && activeHoldingRow) {
      const $chk =$(activeHoldingRow).find(checkboxSelector);
      if ($chk.length && !$chk.prop('disabled')) {
        const nextState = !$chk.is(':checked');$chk.prop('checked', nextState);
        if (nextState) {
          $(activeHoldingRow).addClass('bg-success bg-opacity-10 border-success border-opacity-25'); } else {$(activeHoldingRow).removeClass('bg-success bg-opacity-10 border-success border-opacity-25');
        }
        if (typeof callbackOnChange === 'function') callbackOnChange();
      }
    }
    cleanupDrag();
  });

  // Event Touchscreen (HP / Tablet)
  $(document).on('touchstart', `${containerSelector} ${itemSelector}`, function (e) {
    if ($(e.target).is('button, a, select, option, input[type="text"]')) return;
    if ($(this).attr('data-locked') === 'true') return;

    const targetRow = this;
    const touch = e.originalEvent ? e.originalEvent.touches[0] : e.touches[0];
    startTouchCoord = { x: touch.clientX, y: touch.clientY };
    isDragConfirmed = false;

    const $checkbox =$(targetRow).find(checkboxSelector);
    if (!$checkbox.length \vert{}\vert{}$checkbox.prop('disabled')) return;

    if ($(e.target).is(checkboxSelector)) {
      isDragging = true;
      isDragConfirmed = true;
      lastElem = targetRow;
      targetCheckedState = $checkbox.is(':checked');
      applyItemCheck(targetRow);
      return;
    }

    startHolding(targetRow, $checkbox.is(':checked'));
  });

  document.addEventListener('touchmove', function (e) {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];

    if (!isDragConfirmed) {
      if (activeHoldingRow) {
        const moveDist = Math.hypot(touch.clientX - startTouchCoord.x, touch.clientY - startTouchCoord.y);
        if (moveDist > 8) cancelHolding();
      }
      return;
    }

    if (e.cancelable) e.preventDefault();

    const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!elUnder) return;
    const targetRow = $(elUnder).closest(`${containerSelector} ${itemSelector}`)[0];
    if (targetRow && targetRow !== lastElem && $(targetRow).attr('data-locked') !== 'true') {
      lastElem = targetRow;
      applyItemCheck(targetRow);
    }
  }, { passive: false });

  $(document).on('touchend touchcancel', function () {
    if (!isDragConfirmed && activeHoldingRow) {
      const $chk =$(activeHoldingRow).find(checkboxSelector);
      if ($chk.length && !$chk.prop('disabled')) {
        const nextState = !$chk.is(':checked');$chk.prop('checked', nextState);
        if (nextState) {
          $(activeHoldingRow).addClass('bg-success bg-opacity-10 border-success border-opacity-25'); } else {$(activeHoldingRow).removeClass('bg-success bg-opacity-10 border-success border-opacity-25');
        }
        if (typeof callbackOnChange === 'function') callbackOnChange();
      }
    }
    cleanupDrag();
  });
}

let fanUIInitialized = false;

/**
 * Menginisialisasi event listener Drag & Select serta reset modal Fan Pelajaran
 */
export function initFanUI() {
  if (fanUIInitialized) return;
  fanUIInitialized = true;

  pasangFiturDragSelect(
    '#boxListAsatidzGrup',
    '.item-chk-asatidz',
    '.chk-grup-asatidz',
    null
  );

  pasangFiturDragSelect(
    '#boxListAsatidzFanModal',
    '.item-asatidz-row',
    '.chk-pilih-guru-fan',
    function () {
      updateCountTerpilihAsatidzFan();
    }
  );

  $(document).on('hidden.bs.modal', '#modalGrupAsal', function () {
    resetQuickSelectHurufGrup();
  });
}
