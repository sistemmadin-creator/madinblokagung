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
