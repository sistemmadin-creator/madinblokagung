import { supabase } from '../../lib/supabase.js';
import { store } from '../../state/store.js';
import { logActivity } from '../audit/audit.js';

// ============================================================================
// KONSTANTA PENYIMPANAN SUPABASE (`app_settings`) & CACHE LOCALSTORAGE
// ============================================================================
const KEY_DB_RIWAYAT_MUHAFADZOH = 'RIWAYAT_MUHAFADZOH_DATA';
const LS_RIWAYAT_MUHAFADZOH = 'MADIN_RIWAYAT_MUHAFADZOH';

const KEY_DB_HAFALAN_CONFIG = 'MUHAFADZOH_HAFALAN_CONFIG';
const LS_HAFALAN_CONFIG = 'MADIN_HAFALAN_CONFIG';

const DEFAULT_HAFALAN_WAJIB = {
  ULA_1: ["Juz Amma' (Al-Fajr-An-Nass)"],
  ULA_2: ["Aurod Fii Sholah Wa ba'daha", 'Tahlil / Yasin'],
  ULA_3: ['Tasrif Istilahi'],
  ULA_4: ['Nadhom Al-Imrithi'],
  WUSTHO_1: ['Al-Fiyyah 350', 'Al-Fiyyah 500'],
  WUSTHO_2: ['Al-Fiyyah 850', 'Al-Fiyyah 1000'],
  ULYA_1: ['Jauharul Maknun'],
  ULYA_2: ['Tashilut Thuruqot']
};

const VALID_JAH_WALIKELAS = ['MUSTAHIQ', 'MS & KOOR', 'MUSTAHIQOH'];

let setoranInitialized = false;

function norm(val) {
  return String(val || '').trim().toUpperCase();
}

function getNowLocalDateTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatDateTimeSetoran(dtStr) {
  if (!dtStr) return '';
  const parts = String(dtStr).split('T');
  if (parts.length !== 2) return dtStr;
  const dateParts = parts[0].split('-');
  if (dateParts.length !== 3) return dtStr;
  return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} ${parts[1]}`;
}

function toDateTimeLocalInput(formattedStr) {
  if (!formattedStr) return getNowLocalDateTimeString();
  if (String(formattedStr).includes('T')) return formattedStr;
  const parts = String(formattedStr).trim().split(' ');
  const dateParts = (parts[0] || '').split('/');
  if (dateParts.length === 3) {
    const timePart = parts[1] ? parts[1].slice(0, 5) : '00:00';
    return `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}T${timePart}`;
  }
  return getNowLocalDateTimeString();
}

// ============================================================================
// 1. PEMUATAN & PENYIMPANAN DATA SETORAN KE SUPABASE (`app_settings`)
// ============================================================================
export async function loadSetoranFromSupabase() {
  // 1. Muat instan dari localStorage sebagai nilai awal / fallback
  try {
    const rawMuh = localStorage.getItem(LS_RIWAYAT_MUHAFADZOH);
    if (rawMuh) {
      const parsed = JSON.parse(rawMuh);
      if (Array.isArray(parsed)) {
        store.globalDataMuhafadzoh = parsed;
      }
    }
  } catch (e) {}

  try {
    const rawCfg = localStorage.getItem(LS_HAFALAN_CONFIG);
    if (rawCfg) {
      const parsedCfg = JSON.parse(rawCfg);
      if (parsedCfg && typeof parsedCfg === 'object') {
        store.appSettingsGlobal.hafWajib = parsedCfg.hafWajib || DEFAULT_HAFALAN_WAJIB;
        store.appSettingsGlobal.hafSunnah = parsedCfg.hafSunnah || {};
        store.appSettingsGlobal.hafKitab = parsedCfg.hafKitab || {};
        store.appSettingsGlobal.penjagaBebas = parsedCfg.penjagaBebas || '';
      }
    }
  } catch (e) {}

  if (!store.appSettingsGlobal.hafWajib || Object.keys(store.appSettingsGlobal.hafWajib).length === 0) {
    store.appSettingsGlobal.hafWajib = { ...DEFAULT_HAFALAN_WAJIB };
  }

  // 2. Tarik data teraktual dari tabel `app_settings` Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [KEY_DB_RIWAYAT_MUHAFADZOH, KEY_DB_HAFALAN_CONFIG]);

      if (error) throw error;

      (data || []).forEach(row => {
        let val = row.value;
        if (typeof val === 'string') {
          try { val = JSON.parse(val); } catch (e) {}
        }

        if (row.key === KEY_DB_RIWAYAT_MUHAFADZOH && Array.isArray(val)) {
          store.globalDataMuhafadzoh = val;
          try { localStorage.setItem(LS_RIWAYAT_MUHAFADZOH, JSON.stringify(val)); } catch (e) {}
        } else if (row.key === KEY_DB_HAFALAN_CONFIG && val && typeof val === 'object') {
          store.appSettingsGlobal.hafWajib = (val.hafWajib && Object.keys(val.hafWajib).length > 0)
            ? val.hafWajib
            : { ...DEFAULT_HAFALAN_WAJIB };
          store.appSettingsGlobal.hafSunnah = val.hafSunnah || {};
          store.appSettingsGlobal.hafKitab = val.hafKitab || {};
          store.appSettingsGlobal.penjagaBebas = val.penjagaBebas || '';
          try { localStorage.setItem(LS_HAFALAN_CONFIG, JSON.stringify(val)); } catch (e) {}
        }
      });
    } catch (err) {
      console.error('Gagal memuat data Setoran dari Supabase:', err.message);
    }
  }

  buildMuhafadzohIndex();
  renderTableMuhafadzoh(store.globalDataMuhafadzoh);
}

async function simpanRiwayatMuhafadzohKeServer() {
  try {
    localStorage.setItem(LS_RIWAYAT_MUHAFADZOH, JSON.stringify(store.globalDataMuhafadzoh));
  } catch (e) {}

  if (!supabase) return true;
  const { error } = await supabase
    .from('app_settings')
    .upsert([{ key: KEY_DB_RIWAYAT_MUHAFADZOH, value: store.globalDataMuhafadzoh }], { onConflict: 'key' });

  if (error) throw error;
  return true;
}

// ============================================================================
// 2. INDEXING O(1) RIWAYAT MUHAFADZOH PER SANTRI
// ============================================================================
export function buildMuhafadzohIndex() {
  if (!store.muhafadzohIndexMap) {
    store.muhafadzohIndexMap = new Map();
  }
  store.muhafadzohIndexMap.clear();

  const list = store.globalDataMuhafadzoh || [];
  if (list.length === 0) return;

  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const noInduk = String(row[1] || '').trim();
    if (!noInduk) continue;

    if (!store.muhafadzohIndexMap.has(noInduk)) {
      store.muhafadzohIndexMap.set(noInduk, {
        list: [],
        summaryText: ''
      });
    }
    store.muhafadzohIndexMap.get(noInduk).list.push(row);
  }

  store.muhafadzohIndexMap.forEach(val => {
    let ringkasan = val.list.slice(0, 3).map(m => `[${m[2]}] ${m[17]} (${m[18]})`).join(' • ');
    if (val.list.length > 3) {
      ringkasan += ` • (+${val.list.length - 3} lainnya)`;
    }
    val.summaryText = ringkasan;
  });
}

// ============================================================================
// 3. INISIALISASI UI, DATALIST SANTRI & AUTO-FILL FORM SETORAN
// ============================================================================
export function initSetoranUI() {
  if (setoranInitialized) return;
  setoranInitialized = true;

  const tglInput = document.getElementById('m_tgl_setor');
  if (tglInput) {
    tglInput.value = getNowLocalDateTimeString();
  }

  // Listener perubahan form untuk Live Preview Kartu
  $('#formMuhafadzoh input').on('input change', updateLivePreview);

  // Listener input No. Induk Santri
  $('#m_induk').on('input', function () {
    const val = String($(this).val() || '').trim();
    if (!val) return;
    const santri = (store.globalDataSantri || []).find(r => String(r[1]).trim() === val);
    if (santri) fillMuhafadzohForm(santri);
  });

  // Listener input Nama Santri
  $('#m_nama').on('input', function () {
    const val = String($(this).val() || '').trim().toUpperCase();
    if (!val) return;
    const santri = (store.globalDataSantri || []).find(r => String(r[5] || '').trim().toUpperCase() === val);
    if (santri) fillMuhafadzohForm(santri);
  });

  // Listener Radio Kategori Hafalan (Wajib / Sunnah / Tahfidz / Kitab)
  $(document).on('change', '.hafalan-kat', function () {
    const inputHafalan = document.getElementById('m_hafalan');
    if (!inputHafalan) return;
    inputHafalan.value = '';
    updateHafalanDatalist();
    inputHafalan.focus();

    const dl = document.getElementById('dl_m_hafalan');
    if (dl && dl.options.length === 1) {
      inputHafalan.value = dl.options[0].value;
      updateLivePreview();
    } else if (dl && dl.options.length > 1) {
      inputHafalan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });

  // Listener Checkbox Select All pada Tabel Riwayat
  $(document).on('change', '#checkAllMuh', function () {
    $('.row-check-muh').prop('checked', this.checked);
  });

  // Listener Autocomplete Chips Akses Penjaga Bebas di #settingsHafalanModal
  setupPenjagaBebasAutocomplete();
}

export function inisialisasiHalamanSetoran() {
  initSetoranUI();
  updateMuhafadzohDatalist();
  generateHafalanConfigUI();
  if (store.dataTableMuhafadzoh) {
    setTimeout(() => {
      store.dataTableMuhafadzoh.columns.adjust().draw(false);
    }, 150);
  } else {
    renderTableMuhafadzoh(store.globalDataMuhafadzoh);
  }
}

export function onFilterGenderSetoranChange() {
  updateMuhafadzohDatalist();
  renderTableMuhafadzoh(store.globalDataMuhafadzoh);
}

export function updateMuhafadzohDatalist() {
  const dlInduk = document.getElementById('dl_m_induk');
  const dlNama = document.getElementById('dl_m_nama');
  if (!dlInduk || !dlNama) return;

  const filterGender = norm(document.getElementById('m_filter_papi')?.value);
  const sourceSantri = (store.globalDataSantri || []).filter(r => {
    if (!filterGender) return true;
    return norm(r[4]) === filterGender;
  });

  const uniqueInduk = [...new Set(sourceSantri.map(r => r[1]))].filter(Boolean);
  const uniqueNama = [...new Set(sourceSantri.map(r => r[5]))].filter(Boolean);

  dlInduk.innerHTML = uniqueInduk.map(v => `<option value="${v}">`).join('');
  dlNama.innerHTML = uniqueNama.sort().map(v => `<option value="${v}">`).join('');
}

function cariMustahiqSantri(santriTingkat, santriDinBag, santriDinKls, santriPaPi) {
  const tkt = norm(santriTingkat);
  const bag = norm(santriDinBag);
  const kls = norm(santriDinKls);
  const papi = norm(santriPaPi);

  const listAsatidz = store.globalDataAsatidz || [];

  // 1. Cari Asatidz di kelas tersebut yang berstatus Wali Kelas (Mustahiq / Mustahiqoh / MS & Koor)
  const matchWali = listAsatidz.find(a =>
    norm(a.tingkat_asatidz) === tkt &&
    norm(a.din_bag_asatidz) === bag &&
    norm(a.din_kls_asatidz) === kls &&
    norm(a.pa_pi) === papi &&
    VALID_JAH_WALIKELAS.includes(norm(a.jah_asatidz))
  );
  if (matchWali && matchWali.nama_asatidz) return matchWali.nama_asatidz;

  // 2. Fallback: Cari Asatidz siapa saja yang ditempatkan di kelas tersebut
  const matchAnyAsatidz = listAsatidz.find(a =>
    norm(a.tingkat_asatidz) === tkt &&
    norm(a.din_bag_asatidz) === bag &&
    norm(a.din_kls_asatidz) === kls &&
    norm(a.pa_pi) === papi
  );
  if (matchAnyAsatidz && matchAnyAsatidz.nama_asatidz) return matchAnyAsatidz.nama_asatidz;

  // 3. Fallback: Cari dari Master Formasi Kelas (`store.globalDataFormasi`)
  const matchFormasi = (store.globalDataFormasi || []).find(f =>
    norm(f.tingkat) === tkt &&
    norm(f.din_bag) === bag &&
    norm(f.din_kls) === kls &&
    norm(f.pa_pi) === papi
  );
  if (matchFormasi && matchFormasi.id_mustahiq && matchFormasi.id_mustahiq !== '-') {
    return matchFormasi.id_mustahiq;
  }

  return 'Belum Ditentukan';
}

export function fillMuhafadzohForm(santri) {
  $('#m_induk').val(santri[1] || '');
  $('#m_nama').val(santri[5] || '');
  $('#m_tgl_lhr').val(santri[7] || '');
  $('#m_bln_lhr').val(santri[8] || '');
  $('#m_thn_lhr').val(santri[9] || '');
  $('#m_tmpt_lhr').val(santri[6] || '');

  $('#m_tingkat').val(santri[26] || '');
  $('#m_dinbag').val(santri[25] || '');
  $('#m_dinkls').val(santri[24] || '');

  $('#m_kec').val(santri[12] || '');
  $('#m_kab').val(santri[13] || '');
  $('#m_prov').val(santri[14] || '');
  $('#m_bin').val(santri[30] || '');

  const santriPaPi = santri[4] || '';
  const santriTingkat = santri[26] || '';
  const santriDinBag = santri[25] || '';
  const santriDinKls = santri[24] || '';

  const namaMustahiq = cariMustahiqSantri(santriTingkat, santriDinBag, santriDinKls, santriPaPi);
  $('#m_mustahiq').val(namaMustahiq);

  // Filter daftar Penjaga: Asatidz dengan Tingkat & PA/PI yang sama ATAU termasuk Penjaga Akses Bebas
  const bebasString = norm(store.appSettingsGlobal.penjagaBebas || '');
  const listBebas = bebasString.split(',').map(s => s.trim()).filter(Boolean);

  const filteredAsatidz = (store.globalDataAsatidz || []).filter(a => {
    const namaAsatidz = norm(a.nama_asatidz);
    const asatidzTingkat = norm(a.tingkat_asatidz);
    const asatidzPaPi = norm(a.pa_pi);
    const isBebas = listBebas.includes(namaAsatidz);
    const isDefaultMatch = (asatidzTingkat === norm(santriTingkat) && asatidzPaPi === norm(santriPaPi));
    return isDefaultMatch || isBebas;
  });

  const uniquePenjaga = [...new Set(filteredAsatidz.map(a => a.nama_asatidz))].filter(Boolean);
  const dlPenjaga = document.getElementById('dl_m_penjaga');
  const inputPenjaga = document.getElementById('m_penjaga');
  if (dlPenjaga) {
    dlPenjaga.innerHTML = uniquePenjaga.sort().map(v => `<option value="${v}">`).join('');
  }
  if (inputPenjaga) {
    inputPenjaga.disabled = false;
    inputPenjaga.value = '';
  }

  updateLivePreview();

  $('.hafalan-kat').prop('checked', false);
  $('#m_hafalan').val('');
  updateHafalanDatalist();
}

// ============================================================================
// 4. LIVE PREVIEW KARTU, PRINT KARTU & UNDUH JPG
// ============================================================================
export function updateLivePreview() {
  $('#c_nama').text($('#m_nama').val() || '');
  $('#c_bin').text($('#m_bin').val() || '');
  $('#c_nis').text($('#m_induk').val() || '');

  const ttl = [];
  if ($('#m_tmpt_lhr').val()) ttl.push($('#m_tmpt_lhr').val());
  const tgl = $('#m_tgl_lhr').val();
  const bln = $('#m_bln_lhr').val();
  const thn = $('#m_thn_lhr').val();
  if (tgl && bln && thn) ttl.push(`${tgl} ${bln} ${thn}`);
  $('#c_ttl').text(ttl.join(', '));

  $('#c_mustahiq').text($('#m_mustahiq').val() || '');

  const kls = [];
  if ($('#m_dinkls').val()) kls.push($('#m_dinkls').val());
  if ($('#m_dinbag').val()) kls.push($('#m_dinbag').val());
  if ($('#m_tingkat').val()) kls.push($('#m_tingkat').val());
  $('#c_kelas').text(kls.join(' - '));

  $('#c_kec').text($('#m_kec').val() || '');
  $('#c_kab').text($('#m_kab').val() || '');
  $('#c_prov').text($('#m_prov').val() || '');
  $('#c_penjaga').text($('#m_penjaga').val() || '');
  $('#c_hafalan').text($('#m_hafalan').val() || '');

  const tglSetorRaw = $('#m_tgl_setor').val();
  if (tglSetorRaw) {
    const d = new Date(tglSetorRaw);
    const blnArr = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    if (!isNaN(d.getTime())) {
      $('#c_tglsetor').text(`${d.getDate()} ${blnArr[d.getMonth()]} ${d.getFullYear()}`);
    } else {
      $('#c_tglsetor').text(tglSetorRaw);
    }
  } else {
    $('#c_tglsetor').text('');
  }
}

export function printKartuSetoran() {
  updateLivePreview();
  document.body.classList.add('printing-kartu-setoran');
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-kartu-setoran');
    }, 600);
  }, 150);
}

export function downloadKartuJpg() {
  updateLivePreview();
  const kartuElement = document.querySelector('.kartu-container');
  if (!kartuElement) return;

  if (typeof html2canvas === 'undefined') {
    Swal.fire('Error', 'Pustaka html2canvas belum dimuat.', 'error');
    return;
  }

  html2canvas(kartuElement, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff'
  }).then(canvas => {
    const imageURL = canvas.toDataURL('image/jpeg', 0.95);
    const downloadLink = document.createElement('a');
    downloadLink.href = imageURL;
    downloadLink.download = 'Kartu_Bukti_Setoran.jpg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }).catch(err => {
    console.error('Gagal mengunduh gambar JPG:', err);
    Swal.fire('Gagal', 'Terjadi kesalahan saat mengunduh gambar kartu.', 'error');
  });
}

// ============================================================================
// 5. PENGATURAN OPSI HAFALAN & AKSES PENJAGA BEBAS (#settingsHafalanModal)
// ============================================================================
function getDaftarTingkatKelasDiniyyah() {
  const pairs = [];
  const seen = new Set();

  function addPair(tk, kls) {
    const cleanTk = String(tk || '').trim().toUpperCase();
    const cleanKls = String(kls || '').trim().toUpperCase();
    if (!cleanTk || !cleanKls || cleanTk === '-' || cleanKls === '-') return;
    const key = `${cleanTk}_${cleanKls}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ key, tk: cleanTk, kls: cleanKls, label: `${cleanKls} ${cleanTk}` });
    }
  }

  // 1. Dari Master Formasi Kelas (`store.globalDataFormasi`)
  (store.globalDataFormasi || []).forEach(f => {
    addPair(f.tingkat, f.din_kls);
  });

  // 2. Dari tree3Data jika tersedia
  if (store.tree3Data && typeof store.tree3Data === 'object') {
    for (const tk in store.tree3Data) {
      for (const kls in store.tree3Data[tk]) {
        addPair(tk, kls);
      }
    }
  }

  // 3. Dari Data Santri jika masih kosong
  if (pairs.length === 0 && store.globalDataSantri && store.globalDataSantri.length > 0) {
    store.globalDataSantri.forEach(s => {
      addPair(s[26], s[24]);
    });
  }

  // 4. Fallback standar Kurikulum Madin
  if (pairs.length === 0) {
    [
      ['ULA', '1'], ['ULA', '2'], ['ULA', '3'], ['ULA', '4'],
      ['WUSTHO', '1'], ['WUSTHO', '2'],
      ['ULYA', '1'], ['ULYA', '2']
    ].forEach(([tk, kls]) => addPair(tk, kls));
  }

  const orderTingkat = { ULA: 1, WUSTHO: 2, WUSTHA: 2, ULYA: 3 };
  pairs.sort((a, b) => {
    const tA = orderTingkat[a.tk] || 99;
    const tB = orderTingkat[b.tk] || 99;
    if (tA !== tB) return tA - tB;
    return String(a.kls).localeCompare(String(b.kls), 'id', { numeric: true });
  });

  return pairs;
}

export function generateHafalanConfigUI() {
  const containerW = document.getElementById('containerHafalanWajib');
  const containerS = document.getElementById('containerHafalanSunnah');
  const containerK = document.getElementById('containerHafalanKitab');
  if (!containerW || !containerS || !containerK) return;

  const pairs = getDaftarTingkatKelasDiniyyah();
  let htmlW = '';
  let htmlS = '';
  let htmlK = '';

  pairs.forEach(({ key, label }) => {
    htmlW += `<div class="mb-2"><label class="form-label text-success fw-bold" style="font-size:13px;">${label}</label><input type="text" class="form-control form-control-sm config-wajib" data-key="${key}"></div>`;
    htmlS += `<div class="mb-2"><label class="form-label text-success fw-bold" style="font-size:13px;">${label}</label><input type="text" class="form-control form-control-sm config-sunnah" data-key="${key}"></div>`;
    htmlK += `<div class="mb-2"><label class="form-label text-success fw-bold" style="font-size:13px;">${label}</label><input type="text" class="form-control form-control-sm config-kitab" data-key="${key}"></div>`;
  });

  containerW.innerHTML = htmlW;
  containerS.innerHTML = htmlS;
  containerK.innerHTML = htmlK;

  document.querySelectorAll('.config-wajib').forEach(el => {
    const k = el.dataset.key;
    if (store.appSettingsGlobal.hafWajib && store.appSettingsGlobal.hafWajib[k]) {
      el.value = Array.isArray(store.appSettingsGlobal.hafWajib[k])
        ? store.appSettingsGlobal.hafWajib[k].join(', ')
        : store.appSettingsGlobal.hafWajib[k];
    }
  });

  document.querySelectorAll('.config-sunnah').forEach(el => {
    const k = el.dataset.key;
    if (store.appSettingsGlobal.hafSunnah && store.appSettingsGlobal.hafSunnah[k]) {
      el.value = Array.isArray(store.appSettingsGlobal.hafSunnah[k])
        ? store.appSettingsGlobal.hafSunnah[k].join(', ')
        : store.appSettingsGlobal.hafSunnah[k];
    }
  });

  document.querySelectorAll('.config-kitab').forEach(el => {
    const k = el.dataset.key;
    if (store.appSettingsGlobal.hafKitab && store.appSettingsGlobal.hafKitab[k]) {
      el.value = Array.isArray(store.appSettingsGlobal.hafKitab[k])
        ? store.appSettingsGlobal.hafKitab[k].join(', ')
        : store.appSettingsGlobal.hafKitab[k];
    }
  });

  const pb = store.appSettingsGlobal.penjagaBebas || '';
  const cfgPbEl = document.getElementById('configPenjagaBebas');
  if (cfgPbEl) cfgPbEl.value = pb;
  store.selectedPenjagaBebasArray = pb.split(',').map(s => s.trim()).filter(Boolean);
  renderPenjagaBebasChips();
}

export function renderPenjagaBebasChips() {
  const container = document.getElementById('penjagaBebasChips');
  const hiddenInput = document.getElementById('configPenjagaBebas');
  if (!container) return;

  container.innerHTML = (store.selectedPenjagaBebasArray || []).map((nama, idx) =>
    `<span class="badge bg-success rounded-pill d-flex align-items-center py-1 px-3" style="font-size: 13px;">
      ${nama}
      <i class="bi bi-x-circle-fill ms-2 text-white opacity-75" style="cursor:pointer;" onclick="window.removePenjagaBebas(${idx})"></i>
    </span>`
  ).join('');

  if (hiddenInput) {
    hiddenInput.value = (store.selectedPenjagaBebasArray || []).join(', ');
  }
}

export function removePenjagaBebas(idx) {
  store.selectedPenjagaBebasArray.splice(idx, 1);
  renderPenjagaBebasChips();
}

function setupPenjagaBebasAutocomplete() {
  const inputPgm = document.getElementById('inputPenjagaBebas');
  const dropdownPgm = document.getElementById('dropdownPenjagaBebas');
  const containerPgm = document.getElementById('penjagaBebasContainer');
  if (!inputPgm || !dropdownPgm || !containerPgm) return;

  inputPgm.addEventListener('input', function () {
    const val = norm(this.value);
    dropdownPgm.innerHTML = '';
    if (!val) {
      dropdownPgm.style.display = 'none';
      return;
    }

    const matches = (store.globalDataAsatidz || []).filter(a => norm(a.nama_asatidz).includes(val));

    if (matches.length > 0) {
      dropdownPgm.style.display = 'block';
      matches.forEach(a => {
        const nama = a.nama_asatidz || '';
        const kelas = `${a.din_kls_asatidz || ''} ${a.din_bag_asatidz || ''} ${a.tingkat_asatidz || ''}`.trim();

        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-action border-bottom border-light';
        li.style.cursor = 'pointer';
        li.innerHTML = `<div class="fw-bold text-dark">${nama}</div><div class="text-secondary small">Kelas ${kelas || '-'}</div>`;

        li.onclick = function () {
          if (!store.selectedPenjagaBebasArray.includes(nama)) {
            store.selectedPenjagaBebasArray.push(nama);
            renderPenjagaBebasChips();
          }
          inputPgm.value = '';
          dropdownPgm.style.display = 'none';
          inputPgm.focus();
        };
        dropdownPgm.appendChild(li);
      });
    } else {
      dropdownPgm.style.display = 'block';
      dropdownPgm.innerHTML = '<li class="list-group-item text-muted text-center border-0">Data Asatidz tidak ditemukan</li>';
    }
  });

  document.addEventListener('click', function (e) {
    if (!containerPgm.contains(e.target) && e.target !== dropdownPgm) {
      dropdownPgm.style.display = 'none';
    }
  });
}

export async function saveHafalanSettingsData() {
  const btn = document.getElementById('btnSaveHafalanSettings');
  if (!btn) return;
  const prevText = btn.innerHTML;
  btn.innerHTML = 'Menyimpan...';
  btn.disabled = true;

  store.appSettingsGlobal.penjagaBebas = document.getElementById('configPenjagaBebas')?.value || '';

  const wData = {};
  const sData = {};
  const kData = {};

  document.querySelectorAll('.config-wajib').forEach(el => {
    if (el.value.trim()) wData[el.dataset.key] = el.value.split(',').map(s => s.trim()).filter(Boolean);
  });
  document.querySelectorAll('.config-sunnah').forEach(el => {
    if (el.value.trim()) sData[el.dataset.key] = el.value.split(',').map(s => s.trim()).filter(Boolean);
  });
  document.querySelectorAll('.config-kitab').forEach(el => {
    if (el.value.trim()) kData[el.dataset.key] = el.value.split(',').map(s => s.trim()).filter(Boolean);
  });

  store.appSettingsGlobal.hafWajib = wData;
  store.appSettingsGlobal.hafSunnah = sData;
  store.appSettingsGlobal.hafKitab = kData;

  const configPayload = {
    hafWajib: wData,
    hafSunnah: sData,
    hafKitab: kData,
    penjagaBebas: store.appSettingsGlobal.penjagaBebas
  };

  try {
    try {
      localStorage.setItem(LS_HAFALAN_CONFIG, JSON.stringify(configPayload));
    } catch (e) {}

    if (supabase) {
      const { error } = await supabase
        .from('app_settings')
        .upsert([{ key: KEY_DB_HAFALAN_CONFIG, value: configPayload }], { onConflict: 'key' });
      if (error) throw error;
    }

    await logActivity('SIMPAN PENGATURAN HAFALAN', 'Memperbarui konfigurasi item hafalan Wajib/Sunnah/Kitab & Akses Penjaga');
    $('#settingsHafalanModal').modal('hide');
    updateHafalanDatalist();

    Swal.fire({
      icon: 'success',
      title: 'Tersimpan!',
      text: 'Pengaturan Item Hafalan Berhasil Disimpan Permanen!',
      timer: 1500,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire('Gagal Menyimpan Konfigurasi', err.message, 'error');
  } finally {
    btn.innerHTML = prevText;
    btn.disabled = false;
  }
}

export function updateHafalanDatalist() {
  const cat = $('input[name="m_kat"]:checked').val();
  const tk = norm($('#m_tingkat').val());
  const kls = norm($('#m_dinkls').val());
  const dl = document.getElementById('dl_m_hafalan');
  if (!dl) return;
  dl.innerHTML = '';

  if (!cat) return;

  if (cat === 'Tahfidz') {
    for (let i = 1; i <= 30; i++) {
      dl.innerHTML += `<option value="Juz ${i}">Juz ${i}</option>`;
    }
  } else {
    if (!tk || !kls) return;
    const key = `${tk}_${kls}`;
    const wObj = store.appSettingsGlobal.hafWajib || {};
    const sObj = store.appSettingsGlobal.hafSunnah || {};
    const kObj = store.appSettingsGlobal.hafKitab || {};

    let sourceData = [];
    if (cat === 'Wajib') sourceData = wObj[key];
    else if (cat === 'Sunnah') sourceData = sObj[key];
    else if (cat === 'Kitab') sourceData = kObj[key];

    if (sourceData && sourceData.length > 0) {
      const arr = Array.isArray(sourceData) ? sourceData : String(sourceData).split(',').map(s => s.trim());
      dl.innerHTML = arr.filter(Boolean).map(v => `<option value="${v}">${v}</option>`).join('');
    }
  }
}

// ============================================================================
// 6. SIMPAN, RESET, EDIT, HAPUS & TABEL RIWAYAT SETORAN (#dataTableMuhafadzoh)
// ============================================================================
export function resetFormMuhafadzoh() {
  const form = document.getElementById('formMuhafadzoh');
  if (form) form.reset();

  const tglInput = document.getElementById('m_tgl_setor');
  if (tglInput) tglInput.value = getNowLocalDateTimeString();

  const penjagaInput = document.getElementById('m_penjaga');
  if (penjagaInput) {
    penjagaInput.disabled = true;
    penjagaInput.value = '';
  }
  const dlPenjaga = document.getElementById('dl_m_penjaga');
  if (dlPenjaga) dlPenjaga.innerHTML = '';

  if (store.editMuhDataOld) {
    store.editMuhDataOld = null;
    const btn = document.getElementById('btnSimpanMuhafadzoh');
    if (btn) {
      btn.innerHTML = '<i class="bi bi-save me-2"></i> Simpan Setoran';
      btn.classList.remove('btn-warning');
      btn.classList.add('btn-success');
    }
  }
  updateLivePreview();
}

export async function simpanMuhafadzoh(e) {
  if (e && e.preventDefault) e.preventDefault();

  const record = {
    noInduk: String($('#m_induk').val() || '').trim(),
    tglSetor: $('#m_tgl_setor').val(),
    namaSantri: String($('#m_nama').val() || '').trim(),
    tglLahir: $('#m_tgl_lhr').val() || '',
    blnLahir: $('#m_bln_lhr').val() || '',
    thnLahir: $('#m_thn_lhr').val() || '',
    tempatLahir: $('#m_tmpt_lhr').val() || '',
    penjaga: String($('#m_penjaga').val() || '').trim(),
    mustahiq: $('#m_mustahiq').val() || '',
    tingkat: $('#m_tingkat').val() || '',
    dinBag: $('#m_dinbag').val() || '',
    dinKls: $('#m_dinkls').val() || '',
    kecamatan: $('#m_kec').val() || '',
    kabupaten: $('#m_kab').val() || '',
    provinsi: $('#m_prov').val() || '',
    bin: $('#m_bin').val() || '',
    hafalan: String($('#m_hafalan').val() || '').trim(),
    kategori: $('input[name="m_kat"]:checked').map(function () { return $(this).val(); }).get().join(', ')
  };

  if (!record.noInduk || !record.namaSantri) {
    return Swal.fire('Perhatian', 'Pilih Santri terlebih dahulu!', 'warning');
  }
  if (!record.penjaga) {
    return Swal.fire('Perhatian', 'Kolom Penjaga wajib diisi!', 'warning');
  }
  if (!record.hafalan) {
    return Swal.fire('Perhatian', 'Kolom Hafalan wajib diisi!', 'warning');
  }

  const btn = document.getElementById('btnSimpanMuhafadzoh');
  const prevText = btn ? btn.innerHTML : '<i class="bi bi-save me-2"></i> Simpan Setoran';
  if (btn) {
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Memproses...';
    btn.disabled = true;
  }

  const formattedTglSetor = formatDateTimeSetoran(record.tglSetor);
  const rowData = [
    '',
    record.noInduk,
    formattedTglSetor,
    record.namaSantri,
    record.tglLahir,
    record.blnLahir,
    record.thnLahir,
    record.tempatLahir,
    record.penjaga,
    record.mustahiq,
    record.tingkat,
    record.dinBag,
    record.dinKls,
    record.kecamatan,
    record.kabupaten,
    record.provinsi,
    record.bin,
    record.hafalan,
    record.kategori
  ];

  try {
    if (store.editMuhDataOld) {
      const oldRec = store.editMuhDataOld;
      const idx = store.globalDataMuhafadzoh.findIndex(r =>
        String(r[1]) === String(oldRec.noInduk) &&
        String(r[2]) === String(oldRec.tglSetor) &&
        String(r[17]) === String(oldRec.hafalan)
      );

      if (idx !== -1) {
        store.globalDataMuhafadzoh[idx] = rowData;
      } else {
        store.globalDataMuhafadzoh.unshift(rowData);
      }

      await simpanRiwayatMuhafadzohKeServer();
      await logActivity(
        'UPDATE SETORAN',
        `Mengubah setoran santri: ${record.namaSantri} dari [${oldRec.hafalan}] ke [${record.hafalan}]`
      );

      buildMuhafadzohIndex();
      renderTableMuhafadzoh(store.globalDataMuhafadzoh);
      resetFormMuhafadzoh();

      Swal.fire({
        icon: 'success',
        title: 'Diperbarui!',
        text: 'Data Hafalan Berhasil Diperbarui!',
        timer: 1400,
        showConfirmButton: false
      });
    } else {
      // Tambah baris baru di urutan paling atas
      store.globalDataMuhafadzoh.unshift(rowData);
      await simpanRiwayatMuhafadzohKeServer();
      await logActivity(
        'INPUT SETORAN',
        `Mencatat setoran [${record.hafalan}] untuk santri: ${record.namaSantri} (Penjaga: ${record.penjaga})`
      );

      const tglLahirGabung = `${rowData[7] || ''}, ${rowData[4] || ''} ${rowData[5] || ''} ${rowData[6] || ''}`.trim();
      const klsGabung = `${rowData[12] || ''} ${rowData[11] || ''} ${rowData[10] || ''}`.trim();

      if (store.dataTableMuhafadzoh) {
        store.dataTableMuhafadzoh.row.add([
          `<input type="checkbox" class="row-check-muh form-check-input" value="${rowData[1]}">`,
          '',
          rowData[1] || '',
          rowData[2] || '',
          `<span class="fw-bold text-dark">${rowData[3] || ''}</span>`,
          tglLahirGabung,
          rowData[8] || '',
          rowData[9] || '',
          klsGabung,
          `<span class="text-success fw-bold">${rowData[17] || ''}</span>`,
          `<span class="badge bg-secondary rounded-pill">${rowData[18] || ''}</span>`
        ]).draw(false);
      } else {
        renderTableMuhafadzoh(store.globalDataMuhafadzoh);
      }

      buildMuhafadzohIndex();
      resetFormMuhafadzoh();

      Swal.fire({
        icon: 'success',
        title: 'Tersimpan!',
        text: 'Data Hafalan Berhasil Disimpan!',
        timer: 1400,
        showConfirmButton: false
      });
    }
  } catch (err) {
    Swal.fire('Gagal Menyimpan Setoran', err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = store.editMuhDataOld
        ? '<i class="bi bi-pencil-square me-2"></i> Update Riwayat'
        : prevText;
      btn.disabled = false;
    }
  }
}

export function renderTableMuhafadzoh(data) {
  const tableEl = document.getElementById('dataTableMuhafadzoh');
  const tbody = document.getElementById('tableBodyMuhafadzoh');
  if (!tableEl || !tbody) return;

  if (store.dataTableMuhafadzoh) {
    store.dataTableMuhafadzoh.destroy();
  }
  tbody.innerHTML = '';

  store.globalDataMuhafadzoh = Array.isArray(data)
    ? data
    : (typeof data === 'string' ? JSON.parse(data || '[]') : []);

  const filterGender = norm(document.getElementById('m_filter_papi')?.value);
  let santriGenderMap = null;
  if (filterGender && store.globalDataSantri && store.globalDataSantri.length > 0) {
    santriGenderMap = new Map();
    store.globalDataSantri.forEach(s => {
      santriGenderMap.set(String(s[1]).trim(), norm(s[4]));
    });
  }

  store.globalDataMuhafadzoh.forEach(row => {
    if (santriGenderMap) {
      const g = santriGenderMap.get(String(row[1]).trim());
      if (g && g !== filterGender) return;
    }

    const tr = document.createElement('tr');
    const tglLahirGabung = `${row[7] || ''}, ${row[4] || ''} ${row[5] || ''} ${row[6] || ''}`.trim();
    const klsGabung = `${row[12] || ''} ${row[11] || ''} ${row[10] || ''}`.trim();

    tr.innerHTML = `
      <td class="text-center"><input type="checkbox" class="row-check-muh form-check-input" value="${row[1] || ''}"></td>
      <td></td>
      <td>${row[1] || ''}</td>
      <td>${row[2] || ''}</td>
      <td class="fw-bold text-dark">${row[3] || ''}</td>
      <td>${tglLahirGabung}</td>
      <td>${row[8] || ''}</td>
      <td>${row[9] || ''}</td>
      <td>${klsGabung}</td>
      <td class="text-success fw-bold">${row[17] || ''}</td>
      <td><span class="badge bg-secondary rounded-pill">${row[18] || ''}</span></td>
    `;
    tbody.appendChild(tr);
  });

  store.dataTableMuhafadzoh = $('#dataTableMuhafadzoh').DataTable({
    scrollX: true,
    processing: true,
    deferRender: true,
    language: {
      search: 'Pencarian:',
      lengthMenu: 'Tampilkan _MENU_ data',
      info: 'Hal _PAGE_ dari _PAGES_',
      emptyTable: 'Belum ada data riwayat setoran hafalan.'
    },
    columnDefs: [
      { searchable: false, orderable: false, targets: [0, 1] }
    ],
    order: [[3, 'desc']],
    initComplete: function () {
      const api = this.api();
      setTimeout(() => api.columns.adjust(), 150);

      if ($('#actionGroupMuh').length === 0) {
        $('#dataTableMuhafadzoh_filter').addClass('d-flex justify-content-end align-items-center gap-2');
        $('#dataTableMuhafadzoh_filter label').addClass('mb-0 d-flex align-items-center gap-2');

        const actionBtns = $(`
          <div class="d-flex gap-2 flex-nowrap" id="actionGroupMuh">
            <button class="btn btn-outline-danger btn-sm text-nowrap border-0" onclick="window.hapusTerpilihMuhafadzoh(); return false;" title="Hapus Terpilih"><i class="bi bi-trash fs-5"></i></button>
          </div>
        `);
        $('#dataTableMuhafadzoh_filter').prepend(actionBtns);
      }
    }
  });

  store.dataTableMuhafadzoh.on('order.dt search.dt', function () {
    let i = 1;
    store.dataTableMuhafadzoh.cells(null, 1, { search: 'applied', order: 'applied' }).every(function () {
      this.data(i++);
    });
  }).draw();

  // Pasang event klik baris untuk membuka Modal Detail Riwayat Santri (#detailRiwayatModal)
  $('#dataTableMuhafadzoh tbody').off('click', 'tr').on('click', 'tr', function (e) {
    if (
      $(e.target).hasClass('row-check-muh') ||
      $(e.target).closest('td').hasClass('text-center') ||
      $(this).find('.dataTables_empty').length > 0
    ) {
      return;
    }

    const rowData = store.dataTableMuhafadzoh.row(this).data();
    if (!rowData) return;

    const noIndukClick = $('<div>').html(rowData[2]).text().trim();
    const tglClick = $('<div>').html(rowData[3]).text().trim();
    const namaClick = $('<div>').html(rowData[4]).text().trim();
    const mustahiqClick = $('<div>').html(rowData[7]).text().trim();
    const kelasClick = $('<div>').html(rowData[8]).text().trim();
    const hafalanClick = $('<div>').html(rowData[9]).text().trim();

    const clickedIndex = store.globalDataMuhafadzoh.findIndex(
      r => String(r[1]) === String(noIndukClick) &&
           String(r[2]) === String(tglClick) &&
           String(r[17]) === String(hafalanClick)
    );

    $('#detMuhNama').text(namaClick);
    $('#detMuhKelas').text(kelasClick);
    $('#detMuhMustahiq').text(mustahiqClick);

    let allHistoryHtml = '';
    let currentHtml = '';
    const riwayatSantri = store.globalDataMuhafadzoh.filter(r => String(r[1]) === String(noIndukClick));

    riwayatSantri.forEach(r => {
      const originalIndex = store.globalDataMuhafadzoh.indexOf(r);
      const aksiBtns = `
        <div class="d-flex justify-content-center gap-1">
          <button class="btn btn-sm btn-primary py-0 px-2 border-0" title="Edit" onclick="window.editMuh(${originalIndex})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-success py-0 px-2 border-0" title="Print" onclick="window.printMuh(${originalIndex})"><i class="bi bi-printer"></i></button>
          <button class="btn btn-sm btn-danger py-0 px-2 border-0" title="Hapus" onclick="window.hapusMuh(${originalIndex})"><i class="bi bi-trash"></i></button>
        </div>
      `;

      const rowHtml = `
        <tr>
          <td>${r[2] || ''}</td>
          <td class="fw-bold text-success">${r[17] || ''}</td>
          <td><span class="badge bg-secondary rounded-pill">${r[18] || ''}</span></td>
          <td>${r[8] || ''}</td>
          <td>${aksiBtns}</td>
        </tr>
      `;

      allHistoryHtml += rowHtml;
      if (originalIndex === clickedIndex) currentHtml = rowHtml;
    });

    $('#detMuhTbodyCurrent').html(currentHtml);
    $('#detMuhTbodyAll').html(allHistoryHtml);
    $('#detailRiwayatModal').modal('show');
  });
}

export async function hapusMuh(index) {
  const row = store.globalDataMuhafadzoh[index];
  if (!row) return;

  const confirmRes = await Swal.fire({
    title: 'Hapus Setoran Hafalan?',
    text: `Hapus setoran hafalan ${row[17]} (${row[3]}) tanggal ${row[2]}?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });

  if (!confirmRes.isConfirmed) return;

  $('#detailRiwayatModal').modal('hide');
  try {
    store.globalDataMuhafadzoh.splice(index, 1);
    await simpanRiwayatMuhafadzohKeServer();
    await logActivity('HAPUS SETORAN', `Menghapus setoran [${row[17]}] santri: ${row[3]} tgl: ${row[2]}`);

    buildMuhafadzohIndex();
    renderTableMuhafadzoh(store.globalDataMuhafadzoh);
    Swal.fire({
      icon: 'success',
      title: 'Terhapus!',
      text: 'Data setoran berhasil dihapus.',
      timer: 1300,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire('Gagal Menghapus', err.message, 'error');
  }
}

export async function hapusTerpilihMuhafadzoh() {
  const selected = [];
  $('.row-check-muh:checked').each(function () {
    selected.push(String($(this).val()));
  });

  if (selected.length === 0) {
    return Swal.fire('Perhatian', 'Centang minimal satu data riwayat!', 'info');
  }

  const confirmRes = await Swal.fire({
    title: `Hapus Riwayat Setoran?`,
    text: `Yakin ingin menghapus riwayat setoran untuk ${selected.length} baris terpilih?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Ya, Hapus Terpilih',
    cancelButtonText: 'Batal'
  });

  if (!confirmRes.isConfirmed) return;

  $('#actionGroupMuh button').prop('disabled', true);
  try {
    const setDelete = new Set(selected);
    store.globalDataMuhafadzoh = store.globalDataMuhafadzoh.filter(r => !setDelete.has(String(r[1])));
    await simpanRiwayatMuhafadzohKeServer();
    await logActivity('HAPUS RIWAYAT SETORAN', `Menghapus riwayat setoran untuk ${selected.length} santri terpilih`);

    buildMuhafadzohIndex();
    renderTableMuhafadzoh(store.globalDataMuhafadzoh);
    $('#checkAllMuh').prop('checked', false);

    Swal.fire({
      icon: 'success',
      title: 'Berhasil!',
      text: 'Data riwayat terpilih berhasil dihapus.',
      timer: 1400,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire('Gagal Menghapus', err.message, 'error');
  } finally {
    $('#actionGroupMuh button').prop('disabled', false);
  }
}

export function printMuh(index) {
  const row = store.globalDataMuhafadzoh[index];
  if (!row) return;

  $('#c_nama').text(row[3] || '');
  $('#c_bin').text(row[16] || '');
  $('#c_nis').text(row[1] || '');
  const ttl = `${row[7] || ''}, ${row[4] || ''} ${row[5] || ''} ${row[6] || ''}`.replace(/^,\s*/, '').trim();
  $('#c_ttl').text(ttl);
  $('#c_mustahiq').text(row[9] || '');
  $('#c_kelas').text(`${row[12] || ''} - ${row[11] || ''} - ${row[10] || ''}`);
  $('#c_kec').text(row[13] || '');
  $('#c_kab').text(row[14] || '');
  $('#c_prov').text(row[15] || '');
  $('#c_penjaga').text(row[8] || '');
  $('#c_hafalan').text(row[17] || '');

  const parsedLocal = toDateTimeLocalInput(row[2]);
  const d = new Date(parsedLocal);
  if (!isNaN(d.getTime())) {
    const blnArr = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    $('#c_tglsetor').text(`${d.getDate()} ${blnArr[d.getMonth()]} ${d.getFullYear()}`);
  } else {
    $('#c_tglsetor').text(row[2] || '');
  }

  $('#detailRiwayatModal').modal('hide');
  setTimeout(() => {
    document.body.classList.add('printing-kartu-setoran');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-kartu-setoran');
    }, 600);
  }, 450);
}

export function editMuh(index) {
  const row = store.globalDataMuhafadzoh[index];
  if (!row) return;

  $('#detailRiwayatModal').modal('hide');

  $('#m_induk').val(row[1] || '');
  $('#m_tgl_setor').val(toDateTimeLocalInput(row[2]));
  $('#m_nama').val(row[3] || '');
  $('#m_tgl_lhr').val(row[4] || '');
  $('#m_bln_lhr').val(row[5] || '');
  $('#m_thn_lhr').val(row[6] || '');
  $('#m_tmpt_lhr').val(row[7] || '');

  $('#m_penjaga').prop('disabled', false);
  $('#m_mustahiq').val(row[9] || '');
  $('#m_dinkls').val(row[12] || '');
  $('#m_dinbag').val(row[11] || '');
  $('#m_tingkat').val(row[10] || '');
  $('#m_kec').val(row[13] || '');
  $('#m_kab').val(row[14] || '');
  $('#m_prov').val(row[15] || '');
  $('#m_bin').val(row[16] || '');

  $('#m_penjaga').val(row[8] || '');
  $('input[name="m_kat"]').prop('checked', false);
  $(`input[name="m_kat"][value="${row[18]}"]`).prop('checked', true);
  updateHafalanDatalist();
  $('#m_hafalan').val(row[17] || '');

  updateLivePreview();

  store.editMuhDataOld = {
    noInduk: row[1],
    tglSetor: row[2],
    hafalan: row[17]
  };

  const btn = document.getElementById('btnSimpanMuhafadzoh');
  if (btn) {
    btn.innerHTML = '<i class="bi bi-pencil-square me-2"></i> Update Riwayat';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-warning');
  }

  const formEl = document.getElementById('formMuhafadzoh');
  if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
}
