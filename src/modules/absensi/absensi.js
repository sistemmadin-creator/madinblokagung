import { supabase } from '../../lib/supabase.js';
import { store } from '../../state/store.js';
import { logActivity } from '../audit/audit.js';
import { fetchAllAsatidzFromSupabase } from '../asatidz/asatidz.js';
import { loadFormasiData } from '../formasi/formasi.js';
import {
  loadFanSettingsFromSupabase,
  compareNIANatural,
  escHtmlFan_,
  isKelasUnggulan
} from '../fan/fan.js';
import {
  loadJadwalKbmFromSupabase,
  getJadwalGuru,
  renderJadwalKBM,
  normalisasiNamaKelas,
  formatTampilanKelas,
  ambilNamaFanSingkat,
  parseJadwalCell_Client,
  LIST_HARI
} from '../jadwal-kbm/jadwal-kbm.js';
import {
  dapatkanBlokDariSesiMengajar,
  formatLabelBlokHariKBM,
  bandingkanBlokHariKBM
} from '../hari-kbm/hari-kbm.js';

// ============================================================================
// 1. KONSTANTA & PENYIMPANAN DATA ABSENSI + HARI LIBUR DI SUPABASE (`app_settings`)
// ============================================================================
const KEY_DB_ABSENSI = 'ABSENSI_ASATIDZ_DATA';
const LS_ABSENSI = 'MADIN_ABSENSI_ASATIDZ_DATA';

const KEY_DB_LIBUR = 'PENGATURAN_LIBUR_MADIN';
const LS_LIBUR = 'MADIN_PENGATURAN_LIBUR';

export const ARRAY_HARI_IND = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

let absensiLoaded = false;
let flatpickrAbsensiInstance = null;

// Menyimpan pilihan checkbox kartu per jam (Jam 1..4) untuk aksi massal
const selectedKeysPerJam = {
  1: new Set(),
  2: new Set(),
  3: new Set(),
  4: new Set()
};

/**
 * Format waktu sekarang ke string standar "dd/MM/yyyy HH:mm:ss" (WIB)
 */
export function formatWaktuSekarangWIB() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

/**
 * Memadatkan 1 objek sesi absensi menjadi Compact Array / Tuple 18 elemen
 * (100% kompatibel dengan skema V3 Kurikulum Madin)
 */
export function packSesiToCompactArray_(r) {
  return [
    r.id || '',             // 0  id
    r.timestamp || '',      // 1  timestamp
    r.nama || '',           // 2  nama
    r.nia || '',            // 3  nia
    r.tingkat || '',        // 4  tingkat
    r.dinKls || '',         // 5  dinKls
    r.dinBag || '',         // 6  dinBag
    r.blok || '',           // 7  blok
    r.gender || '',         // 8  gender
    r.kelasMengajar || '',  // 9  kelasMengajar
    r.fan || '',            // 10 fan
    r.lokasi || '',         // 11 lokasi
    r.status || '',         // 12 status
    r.keterangan || '',     // 13 keterangan
    r.menitTerlambat || '', // 14 menitTerlambat
    r.namaPengganti || '',  // 15 namaPengganti
    r.diinputOleh || '',    // 16 diinputOleh
    r.waktuUpdate || ''     // 17 waktuUpdate
  ];
}

/**
 * Mengembalikan Compact Array 18 elemen menjadi Object Sesi standar
 */
export function unpackCompactArrayToSesi_(arr, tanggal, hari, jamKe) {
  const a = Array.isArray(arr) ? arr : [];
  return {
    id: a[0] || '',
    timestamp: a[1] || '',
    tanggal: tanggal || '',
    hari: hari || '',
    jamke: jamKe || '',
    jamKe: jamKe || '',
    nama: a[2] || '',
    nia: a[3] || '',
    tingkat: a[4] || '',
    dinKls: a[5] || '',
    dinBag: a[6] || '',
    blok: a[7] || '',
    gender: a[8] || '',
    kelasMengajar: a[9] || '',
    fan: a[10] || '',
    lokasi: a[11] || '',
    status: a[12] || '',
    keterangan: a[13] || '',
    menitTerlambat: a[14] || '',
    namaPengganti: a[15] || '',
    diinputOleh: a[16] || '',
    waktuUpdate: a[17] || ''
  };
}

/**
 * Memuat seluruh data Absensi Asatidz & Pengaturan Hari Libur dari tabel `app_settings` Supabase
 * dengan fallback instan dari localStorage
 */
export async function loadAbsensiFromSupabase(forceRefresh = false) {
  if (absensiLoaded && !forceRefresh) {
    return {
      absensiMap: store.absensiMapByDate,
      liburMap: store.liburMapByDate
    };
  }

  // 1. Baca cache localStorage sebagai fallback instan
  try {
    const rawAbs = localStorage.getItem(LS_ABSENSI);
    if (rawAbs) {
      const parsedAbs = JSON.parse(rawAbs);
      if (parsedAbs && typeof parsedAbs === 'object') {
        store.absensiMapByDate = parsedAbs;
      }
    }
  } catch (e) {}

  try {
    const rawLib = localStorage.getItem(LS_LIBUR);
    if (rawLib) {
      const parsedLib = JSON.parse(rawLib);
      if (parsedLib && typeof parsedLib === 'object') {
        store.liburMapByDate = parsedLib;
      }
    }
  } catch (e) {}

  if (!supabase) {
    absensiLoaded = true;
    return {
      absensiMap: store.absensiMapByDate,
      liburMap: store.liburMapByDate
    };
  }

  // 2. Tarik data terbaru dari tabel `app_settings` Supabase
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [KEY_DB_ABSENSI, KEY_DB_LIBUR]);

    if (error) throw error;

    (data || []).forEach(row => {
      let val = row.value;
      if (typeof val === 'string') {
        try {
          val = JSON.parse(val);
        } catch (e) {
          val = null;
        }
      }
      if (!val || typeof val !== 'object') return;

      if (row.key === KEY_DB_ABSENSI) {
        store.absensiMapByDate = val;
        try {
          localStorage.setItem(LS_ABSENSI, JSON.stringify(val));
        } catch (e) {}
      } else if (row.key === KEY_DB_LIBUR) {
        store.liburMapByDate = val;
        try {
          localStorage.setItem(LS_LIBUR, JSON.stringify(val));
        } catch (e) {}
      }
    });

    absensiLoaded = true;
  } catch (err) {
    console.error('Gagal memuat data Absensi dari Supabase:', err.message);
  }

  return {
    absensiMap: store.absensiMapByDate,
    liburMap: store.liburMapByDate
  };
}

/**
 * Menyimpan `store.absensiMapByDate` ke tabel `app_settings` Supabase dan localStorage
 */
export async function saveAbsensiToSupabase(logDesc = '') {
  if (!store.absensiMapByDate) store.absensiMapByDate = {};

  try {
    localStorage.setItem(LS_ABSENSI, JSON.stringify(store.absensiMapByDate));
  } catch (e) {}

  if (!supabase) return true;

  const { error } = await supabase
    .from('app_settings')
    .upsert([{ key: KEY_DB_ABSENSI, value: store.absensiMapByDate }], { onConflict: 'key' });

  if (error) throw error;

  if (logDesc) {
    await logActivity('INPUT ABSENSI ASATIDZ', logDesc);
  }
  return true;
}

/**
 * Menyimpan `store.liburMapByDate` ke tabel `app_settings` Supabase dan localStorage
 */
export async function saveLiburToSupabase(logDesc = '') {
  if (!store.liburMapByDate) store.liburMapByDate = {};

  try {
    localStorage.setItem(LS_LIBUR, JSON.stringify(store.liburMapByDate));
  } catch (e) {}

  if (!supabase) return true;

  const { error } = await supabase
    .from('app_settings')
    .upsert([{ key: KEY_DB_LIBUR, value: store.liburMapByDate }], { onConflict: 'key' });

  if (error) throw error;

  if (logDesc) {
    await logActivity('PENGATURAN HARI LIBUR', logDesc);
  }
  return true;
}

// ============================================================================
// 2. ENGINE TANGGAL, AUTO-FORWARD MAGHRIB (18:00), & EKSTRAKSI SESI 4 JAM
// ============================================================================

/**
 * Konversi string tanggal "YYYY-MM-DD" menjadi nama hari ("Ahad", "Senin", ..., "Sabtu")
 */
export function getNamaHariDariTgl(tanggalYMD) {
  if (!tanggalYMD) return '-';
  const parts = String(tanggalYMD).split('-');
  if (parts.length < 3) return '-';
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return ARRAY_HARI_IND[d.getDay()] || '-';
}

/**
 * Mengisi `<datalist id="dl_asatidz_pengganti">` dari `store.globalDataAsatidz`
 */
export function populateDatalistPengganti() {
  const dl = document.getElementById('dl_asatidz_pengganti');
  if (!dl) return;
  const opts = (store.globalDataAsatidz || [])
    .map(a => String(a.nama_asatidz || '').trim())
    .filter(Boolean)
    .map(nama => `<option value="${escHtmlFan_(nama)}"></option>`)
    .join('');
  dl.innerHTML = opts;
}

/**
 * Inisialisasi halaman Absensi Asatidz saat menu dibuka
 */
export async function inisialisasiHalamanAbsensi() {
  const inputTgl = document.getElementById('inputTglAbsensi');
  if (!inputTgl) return;

  // Tentukan tanggal default: Auto-Forward ke H+1 jika waktu sudah >= 18:00 WIB (Maghrib)
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
  }

  // Pasang Flatpickr Bahasa Indonesia bila tersedia di window, atau gunakan input date standar
  if (window.flatpickr && !flatpickrAbsensiInstance) {
    flatpickrAbsensiInstance = window.flatpickr(inputTgl, {
      locale: 'id',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'l, d F Y',
      defaultDate: defaultDateStr,
      disableMobile: true,
      onChange: function (selectedDates, dateStr) {
        inputTgl.value = dateStr;
        muatAbsensiTanggalTerpilih();
      }
    });
  } else if (!inputTgl.value) {
    inputTgl.value = defaultDateStr;
  }

  populateDatalistPengganti();
  await muatAbsensiTanggalTerpilih(true);
}

/**
 * Memuat data jadwal harian dan rekaman absensi tersimpan untuk tanggal yang sedang dipilih
 */
export async function muatAbsensiTanggalTerpilih(silent = false) {
  const inputTgl = document.getElementById('inputTglAbsensi');
  const tgl = inputTgl?.value || store.absensiState.tanggal;
  if (!tgl) return;

  const hari = getNamaHariDariTgl(tgl);
  store.absensiState.tanggal = tgl;
  store.absensiState.hari = hari;

  const badgeHari = document.getElementById('badgeNamaHari');
  if (badgeHari) badgeHari.innerText = hari;

  if (!silent) {
    Swal.fire({
      title: 'Memuat Jadwal...',
      text: `Menyiapkan jadwal hari ${hari}...`,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  try {
    // Pastikan seluruh data master & jadwal telah siap di memori
    if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
      store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    }
    if (!store.globalDataFormasi || store.globalDataFormasi.length === 0) {
      await loadFormasiData();
    }
    if (!store.fanConfig || Object.keys(store.fanConfig).length === 0) {
      await loadFanSettingsFromSupabase();
    }
    await loadJadwalKbmFromSupabase(silent);
    if (!store.masterStrukturKelasKBM || store.masterStrukturKelasKBM.length === 0) {
      await renderJadwalKBM(true);
    }
    await loadAbsensiFromSupabase(silent);

    populateDatalistPengganti();

    // 1. Periksa apakah tanggal ini ditandai sebagai Hari Libur / Event
    const infoLibur = (store.liburMapByDate && store.liburMapByDate[tgl]) || null;
    store.absensiState.isLibur = !!infoLibur;
    store.absensiState.infoLibur = infoLibur;

    const boxAlertLibur = document.getElementById('boxAlertLibur');
    if (boxAlertLibur) {
      if (infoLibur) {
        boxAlertLibur.classList.remove('d-none');
        const txtKat = document.getElementById('txtKategoriLibur');
        const txtKet = document.getElementById('txtKetLibur');
        if (txtKat) txtKat.innerText = infoLibur.kategori || 'Libur';
        if (txtKet) txtKet.innerText = infoLibur.keterangan ? `(${infoLibur.keterangan})` : '';
      } else {
        boxAlertLibur.classList.add('d-none');
      }
    }

    // 2. Kumpulkan seluruh rekaman absensi tersimpan pada tanggal ini (Jam 1..4)
    store.absensiState.savedRecords = {};
    store.absensiState.pendingStatus = {};
    store.absensiState.unlockedJams = { 1: true, 2: false, 3: false, 4: false };
    store.absensiState.savedJams = { 1: false, 2: false, 3: false, 4: false };

    [1, 2, 3, 4].forEach(j => {
      selectedKeysPerJam[j].clear();
      const jamKeLabel = `Jam ${j}`;
      const bucketKey = `${tgl}|${jamKeLabel}`;
      const bucket = store.absensiMapByDate && store.absensiMapByDate[bucketKey];
      if (bucket && Array.isArray(bucket.data)) {
        bucket.data.forEach(compactArr => {
          const r = unpackCompactArrayToSesi_(
            compactArr,
            tgl,
            bucket.hari || hari,
            bucket.jamKe || jamKeLabel
          );
          const key = `${tgl}|${r.nama}|${r.jamke || r.jamKe}|${r.kelasMengajar}|${r.fan}`
            .trim()
            .toLowerCase();
          store.absensiState.savedRecords[key] = r;
        });
      }
    });

    // 3. Ekstrak sesi jadwal hari ini, render form 4 jam bertahap, dan hitung KPI
    ekstraksiSesiJadwalHariIni(hari);
    renderFormAbsensiBertahap();
    updateStatistikRingkas();

    if (!silent) {
      Swal.close();
    }
  } catch (err) {
    if (!silent) Swal.close();
    Swal.fire({
      icon: 'error',
      title: 'Gagal Memuat Absensi',
      text: err.message
    });
  }
}

/**
 * Mencari lokasi Diniyyah sebuah kelas dari `store.masterStrukturKelasKBM` atau `store.globalDataFormasi`
 */
function cariLokasiKelasDefault(namaKelas) {
  if (!namaKelas || namaKelas === '-') return '';
  const normTarget = normalisasiNamaKelas(namaKelas);

  if (Array.isArray(store.masterStrukturKelasKBM) && store.masterStrukturKelasKBM.length > 0) {
    const foundKbm = store.masterStrukturKelasKBM.find(k => {
      const kNorm = normalisasiNamaKelas(`${k.kls} ${k.bag} ${k.tingkat}`);
      const kNormGen = normalisasiNamaKelas(`${k.kls} ${k.bag} ${k.tingkat} (${k.papi})`);
      return kNorm === normTarget || kNormGen === normTarget;
    });
    if (foundKbm && foundKbm.lokal && foundKbm.lokal !== '-') {
      return foundKbm.lokal;
    }
  }

  if (Array.isArray(store.globalDataFormasi) && store.globalDataFormasi.length > 0) {
    const foundFormasi = store.globalDataFormasi.find(f => {
      const fNorm = normalisasiNamaKelas(`${f.din_kls} ${f.din_bag} ${f.tingkat}`);
      const fNormGen = normalisasiNamaKelas(`${f.din_kls} ${f.din_bag} ${f.tingkat} (${f.pa_pi})`);
      return fNorm === normTarget || fNormGen === normTarget;
    });
    if (foundFormasi && foundFormasi.lokasi_diniyyah && foundFormasi.lokasi_diniyyah !== '-') {
      return foundFormasi.lokasi_diniyyah;
    }
  }

  return '';
}

/**
 * Mengekstrak daftar sesi mengajar Jam Ke-1 s/d Jam Ke-4 pada hari terpilih (`Sabtu` s/d `Kamis`)
 * termasuk ekstraksi otomatis Jam Ke-3 & Jam Ke-4 bagi Mustahiq Kelas Asal
 */
export function ekstraksiSesiJadwalHariIni(hari) {
  const sesiMap = { 1: [], 2: [], 3: [], 4: [] };

  // Hari Jumat libur reguler KBM Madin
  if (!hari || hari === 'Jumat' || !LIST_HARI.includes(hari)) {
    store.absensiState.sesiHariIni = sesiMap;
    return sesiMap;
  }

  const hariKey = hari.toLowerCase();

  (store.globalDataAsatidz || []).forEach(a => {
    const nama = String(a.nama_asatidz || '').trim();
    if (!nama) return;

    const nia = String(a.nia || '').trim();
    const gender = String(a.pa_pi || '').trim().toUpperCase();
    const tingkat = String(a.tingkat_asatidz || '').trim().toUpperCase();
    const dinKls = String(a.din_kls_asatidz || '').trim();
    const dinBag = String(a.din_bag_asatidz || '').trim().toUpperCase();
    const jahRaw = String(a.jah_asatidz || '').trim();
    const jahLower = jahRaw.toLowerCase();
    const lokDinMaster = String(a.lokasi_diniyyah || '').trim();
    const lokTakMaster = String(a.lokasi_takror || '').trim();

    const jdwObj = getJadwalGuru(nama);
    const cellStr = jdwObj[hariKey] || '';
    const parsedSlots = parseJadwalCell_Client(formatTampilanKelas(cellStr));

    const jamSudahAda = new Set();

    // 1. Proses slot yang tercatat di jadwalMengajarMap
    parsedSlots.forEach(slot => {
      const jamNum = slot.jam;
      if (![1, 2, 3, 4].includes(jamNum)) return;
      jamSudahAda.add(jamNum);

      const rawFan = slot.fan && slot.fan !== '-' ? slot.fan.trim() : '-';
      const rawLok = slot.lokasi && slot.lokasi !== '-' ? slot.lokasi.trim() : '';

      let kelasMengajar = '-';
      let lokasiRuang = '-';

      if (rawLok) {
        const match = rawLok.match(/^(.*?)\s*\(([^()]+)\)$/);
        if (match) {
          const isiKurungAkhir = match[2].trim();
          const upperKurung = isiKurungAkhir.toUpperCase();
          if (upperKurung === 'PA' || upperKurung === 'PI' || upperKurung === 'UG') {
            kelasMengajar = formatTampilanKelas(rawLok);
            lokasiRuang = cariLokasiKelasDefault(kelasMengajar) || lokDinMaster || '-';
          } else {
            kelasMengajar = formatTampilanKelas(match[1].trim());
            lokasiRuang =
              isiKurungAkhir && isiKurungAkhir !== '-'
                ? isiKurungAkhir
                : cariLokasiKelasDefault(kelasMengajar) || lokDinMaster || '-';
          }
        } else {
          kelasMengajar = formatTampilanKelas(rawLok);
          lokasiRuang = cariLokasiKelasDefault(kelasMengajar) || lokDinMaster || '-';
        }
      } else {
        const genderTag = gender ? `(${gender})` : '';
        kelasMengajar =
          dinKls && dinBag && tingkat
            ? `${dinKls} ${dinBag} ${tingkat} ${genderTag}`.trim()
            : '-';
        lokasiRuang = (jamNum === 4 ? lokTakMaster || lokDinMaster : lokDinMaster) || '-';
      }

      // Ekstrak tingkat & kelas dari kelasMengajar untuk mempercantik nama Fan pada Jam 1..3
      let tktSlot = tingkat;
      let klsSlot = dinKls;
      const matchKlsInfo = String(kelasMengajar).match(/^(\d+)\s+\S+\s+(ULA|WUSTHO|ULYA|ISTI'DAD|IST)/i);
      if (matchKlsInfo) {
        klsSlot = matchKlsInfo[1];
        tktSlot = matchKlsInfo[2].toUpperCase();
      }

      const fanTampil =
        jamNum <= 3 ? ambilNamaFanSingkat(rawFan, tktSlot, klsSlot) : rawFan || '(Takror) Takror';

      const blokSesi = dapatkanBlokDariSesiMengajar(
        [{ kelas: kelasMengajar, lokasi: lokasiRuang }],
        a
      );

      sesiMap[jamNum].push({
        jamNum,
        jamKe: `Jam ${jamNum}`,
        nama,
        nia,
        gender,
        tingkat: tktSlot || tingkat,
        dinKls: klsSlot || dinKls,
        dinBag,
        jah: jahRaw,
        blok: blokSesi,
        kelasMengajar,
        fan: fanTampil || '-',
        fanAsli: rawFan || '-',
        lokasi: lokasiRuang || '-',
        lokasiGabungan: rawLok
      });
    });

    // 2. Otomatis bentuk sesi Jam 3 & Jam 4 untuk Mustahiq Kelas Asal bila belum tertulis di jadwalMengajarMap
    const isMustahiq =
      jahLower.includes('mustahiq') ||
      jahLower.includes('ms & koor') ||
      jahLower === 'ist' ||
      jahLower.includes("isti'dad");

    if (isMustahiq && dinKls && dinBag && tingkat) {
      const genderTag = gender ? `(${gender})` : '';
      const kelasAsalLengkap = `${dinKls} ${dinBag} ${tingkat} ${genderTag}`.trim();
      const kelasAsalMurni = `${dinKls} ${dinBag} ${tingkat}`.trim();
      const isUg = isKelasUnggulan(kelasAsalMurni);
      const keyUg = `${kelasAsalMurni} (Ug)`;
      const keyReg = `${dinKls} ${tingkat}`;

      const fansRaw =
        isUg && Array.isArray(store.fanConfig?.[keyUg]) && store.fanConfig[keyUg].length > 0
          ? store.fanConfig[keyUg]
          : store.fanConfig?.[keyReg] || [];
      const fansList = fansRaw.map(f => String(f || '').trim()).filter(Boolean);
      const nFan = fansList.length;

      const fanJam3 =
        nFan >= 2
          ? ambilNamaFanSingkat(fansList[nFan - 2], tingkat, dinKls)
          : nFan === 1
            ? ambilNamaFanSingkat(fansList[0], tingkat, dinKls)
            : 'Bandongan / Syawir';

      const fanJam4 =
        nFan >= 1 ? fansList[nFan - 1] : '(Takror) Takror';

      const lokDin = lokDinMaster || cariLokasiKelasDefault(kelasAsalLengkap) || '-';
      const lokTak = lokTakMaster || lokDin;
      const blokAsal = dapatkanBlokDariSesiMengajar(
        [{ kelas: kelasAsalLengkap, lokasi: lokDin }],
        a
      );

      if (!jamSudahAda.has(3)) {
        sesiMap[3].push({
          jamNum: 3,
          jamKe: 'Jam 3',
          nama,
          nia,
          gender,
          tingkat,
          dinKls,
          dinBag,
          jah: jahRaw,
          blok: blokAsal,
          kelasMengajar: kelasAsalLengkap,
          fan: fanJam3 || '-',
          fanAsli: fanJam3 || '-',
          lokasi: lokDin,
          lokasiGabungan: `${kelasAsalLengkap} (${lokDin})`
        });
      }

      if (!jamSudahAda.has(4)) {
        sesiMap[4].push({
          jamNum: 4,
          jamKe: 'Jam 4',
          nama,
          nia,
          gender,
          tingkat,
          dinKls,
          dinBag,
          jah: jahRaw,
          blok: blokAsal,
          kelasMengajar: kelasAsalLengkap,
          fan: fanJam4 || '(Takror) Takror',
          fanAsli: fanJam4 || '(Takror) Takror',
          lokasi: lokTak,
          lokasiGabungan: `${kelasAsalLengkap} (${lokTak})`
        });
      }
    }
  });

  // 3. Tandai apabila ada bentrok kelas pada jam yang sama (khusus Jam 1 & Jam 2) dan urutkan Kelas (A-Z)
  [1, 2, 3, 4].forEach(jam => {
    const countPerKelas = {};
    sesiMap[jam].forEach(s => {
      const kNorm = normalisasiNamaKelas(s.kelasMengajar);
      if (kNorm && kNorm !== '-') {
        countPerKelas[kNorm] = (countPerKelas[kNorm] || 0) + 1;
      }
    });
    sesiMap[jam].forEach(s => {
      const kNorm = normalisasiNamaKelas(s.kelasMengajar);
      s.isBentrok = jam <= 2 && kNorm && countPerKelas[kNorm] > 1;
    });

    sesiMap[jam].sort((a, b) =>
      String(a.kelasMengajar || '').localeCompare(String(b.kelasMengajar || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    );
  });

  store.absensiState.sesiHariIni = sesiMap;
  return sesiMap;
}

// ============================================================================
// 3. ENGINE STATUS SESI (SATU SUMBER KEBENARAN) & HITUNG 5 KARTU KPI
// ============================================================================

/**
 * Menghasilkan kunci unik untuk 1 sesi mengajar pada tanggal aktif
 */
export function getSesiKey(sesi) {
  return `${store.absensiState.tanggal}|${sesi.nama}|${sesi.jamKe}|${sesi.kelasMengajar}|${sesi.fan}`
    .trim()
    .toLowerCase();
}

/**
 * Mengambil status kehadiran terkini sebuah sesi (prioritas: pendingStatus -> savedRecords -> default)
 */
export function getSesiStatusData(sesi) {
  const key = getSesiKey(sesi);
  if (store.absensiState.pendingStatus && store.absensiState.pendingStatus[key]) {
    return store.absensiState.pendingStatus[key];
  }
  const saved = store.absensiState.savedRecords && store.absensiState.savedRecords[key];
  if (saved) {
    return {
      status: saved.status || 'Hadir',
      keterangan: saved.keterangan || '',
      menitTerlambat: saved.menitTerlambat || '',
      namaPengganti: saved.namaPengganti || '',
      isSaved: true
    };
  }
  return {
    status: store.absensiState.unlockedJams[sesi.jamNum] ? 'Hadir' : '',
    keterangan: '',
    menitTerlambat: '',
    namaPengganti: '',
    isSaved: false
  };
}

/**
 * Memperbarui status kehadiran sebuah sesi di memori `pendingStatus`
 */
export function setSesiStatusData(sesi, partial, silent = false) {
  const key = getSesiKey(sesi);
  const cur = getSesiStatusData(sesi);
  store.absensiState.pendingStatus[key] = Object.assign({}, cur, partial, {
    isSaved: !!store.absensiState.savedRecords[key] && partial.isSaved === true
  });
  if (!silent) {
    updateStatistikRingkas();
  }
}

/**
 * Menghitung & memperbarui angka pada 5 Kartu KPI di bagian atas halaman Absensi Asatidz
 */
export function updateStatistikRingkas() {
  let totalSesi = 0;
  let hadir = 0;
  let izinSakit = 0;
  let alfaKosong = 0;
  let terlambatGanti = 0;

  [1, 2, 3, 4].forEach(jam => {
    const list = store.absensiState.sesiHariIni[jam] || [];
    list.forEach(sesi => {
      totalSesi++;
      const key = getSesiKey(sesi);
      const saved = store.absensiState.savedRecords[key];
      const pending = store.absensiState.pendingStatus[key];
      const rec = pending || saved;

      if (!rec || !rec.status) return;
      // Hanya hitung sesi yang sudah disimpan ke database atau baru saja diubah manual oleh petugas
      if (!saved && !pending) return;

      const st = rec.status;
      if (st === 'Hadir') hadir++;
      else if (st === 'Izin' || st === 'Sakit') izinSakit++;
      else if (st === 'Alfa' || st === 'Jadwal Kosong') alfaKosong++;
      else if (st === 'Terlambat' || st === 'Digantikan' || st === 'Tugas Lain') terlambatGanti++;
    });
  });

  $('#kpi_absen_total').text(totalSesi);
  $('#kpi_absen_hadir').text(hadir);
  $('#kpi_absen_izin_sakit').text(izinSakit);
  $('#kpi_absen_alfa').text(alfaKosong);
  $('#kpi_absen_terlambat').text(terlambatGanti);
}

// ============================================================================
// 4. RENDER 4 BLOK JAM BERTAHAP & KARTU SESI PENGAJAR (PERSIS GAMBAR 1)
// ============================================================================

/**
 * Merender 4 Blok Jam Absensi (Jam Ke-1 s/d Jam Ke-4) lengkap dengan logika buka-kunci bertahap,
 * toolbar aksi massal, filter pencarian/blok/urutan, dan daftar kartu pengajar
 */
export function renderFormAbsensiBertahap() {
  const container = document.getElementById('containerJamBertahap');
  if (!container) return;
  container.innerHTML = '';

  if (store.absensiState.isLibur) {
    const info = store.absensiState.infoLibur || {};
    container.innerHTML = `
      <div class="card-panel text-center py-5 border-0">
        <i class="bi bi-slash-circle text-danger mb-2" style="font-size:3.5rem;"></i>
        <h5 class="fw-bold text-danger">Kegiatan Pembelajaran Diliburkan</h5>
        <p class="text-muted small mb-0">${escHtmlFan_(info.kategori || 'Libur')}: ${escHtmlFan_(info.keterangan || '-')}</p>
      </div>`;
    return;
  }

  let previousJamCompleted = true;

  [1, 2, 3, 4].forEach(jam => {
    const listSesi = store.absensiState.sesiHariIni[jam] || [];
    const totalSesi = listSesi.length;
    let terisiCount = 0;

    listSesi.forEach(sesi => {
      const key = getSesiKey(sesi);
      if (store.absensiState.savedRecords[key]) terisiCount++;
    });

    const isSaved = totalSesi > 0 && terisiCount === totalSesi;
    store.absensiState.savedJams[jam] = isSaved;

    // Kunci jam berikutnya jika jam sebelumnya belum disimpan semua, KECUALI sudah dibuka manual
    if (jam > 1 && !previousJamCompleted && !store.absensiState.unlockedJams[jam]) {
      store.absensiState.unlockedJams[jam] = false;
    } else {
      store.absensiState.unlockedJams[jam] = true;
    }
    previousJamCompleted = isSaved;

    const isLocked = !store.absensiState.unlockedJams[jam];
    const labelWaktu = jam <= 3 ? '(Malam Sebelumnya)' : '(Siang Hari)';
    const badgeWaktuColor = jam <= 3 ? 'bg-dark' : 'bg-primary';

    // Kumpulkan opsi blok unik pada jam ini
    const setBlokJam = new Set();
    listSesi.forEach(s => {
      const lbl = formatLabelBlokHariKBM(s.blok);
      if (lbl) setBlokJam.add(lbl);
    });
    const opsiBlokJamHtml = Array.from(setBlokJam)
      .sort((a, b) => bandingkanBlokHariKBM(a, b))
      .map(b => `<option value="${escHtmlFan_(b)}">${escHtmlFan_(b)}</option>`)
      .join('');

    const selCount = selectedKeysPerJam[jam] ? selectedKeysPerJam[jam].size : 0;

    const jamHtml = `
      <div class="card-panel border-0 position-relative p-0 overflow-hidden shadow-sm" id="card_jam_${jam}">
        ${
          isLocked
            ? `
        <div class="jam-locked-overlay">
          <i class="bi bi-lock-fill text-muted mb-2" style="font-size:2.5rem;"></i>
          <h6 class="fw-bold text-dark">Jam Ke-${jam} Terkunci</h6>
          <p class="text-muted small mb-3">Selesaikan absensi Jam Ke-${jam - 1} terlebih dahulu atau buka secara manual.</p>
          <button class="btn btn-sm btn-outline-success fw-bold px-3 shadow-sm" onclick="window.bukaPaksaKunciJam(${jam})">
            <i class="bi bi-unlock me-1"></i> Buka Kunci Jam Ini
          </button>
        </div>`
            : ''
        }

        <div class="jam-card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="d-flex align-items-center gap-3">
            <div class="d-flex flex-column align-items-start">
              <span class="badge bg-success fs-6 px-3 py-2 rounded-pill shadow-xs mb-1">Jam Ke-${jam}</span>
              <span class="badge ${badgeWaktuColor} bg-opacity-75 text-white" style="font-size:10px;">${labelWaktu}</span>
            </div>
            <div>
              <span class="fw-bold text-dark d-block">Daftar Pengajar Jam Ke-${jam}</span>
              <span class="text-muted small">Progres: <strong class="text-success" id="progres_terisi_jam_${jam}">${terisiCount}</strong> dari <strong>${totalSesi}</strong> sesi diabsen</span>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2 flex-wrap">
            <!-- TOOLBAR AKSI MASSAL (MUNCUL OTOMATIS SAAT ADA ASATIDZ DICENTANG) -->
            <div id="toolbar_massal_jam_${jam}" class="${selCount > 0 ? 'd-flex' : 'd-none'} align-items-center gap-1 bg-white border border-success border-opacity-50 rounded-3 p-1 shadow-xs">
              <span class="badge bg-success text-white me-1" id="count_pilih_jam_${jam}" style="font-size:11px;">${selCount} Dipilih</span>
              <button type="button" class="btn btn-sm btn-outline-primary fw-bold py-1 px-2" style="font-size:12px;" onclick="window.terapkanStatusMassal(${jam}, 'Izin')" title="Set status terpilih ke Izin">
                <i class="bi bi-envelope me-1"></i>Izin
              </button>
              <button type="button" class="btn btn-sm btn-outline-warning text-dark fw-bold py-1 px-2" style="font-size:12px;" onclick="window.terapkanStatusMassal(${jam}, 'Sakit')" title="Set status terpilih ke Sakit">
                <i class="bi bi-heart-pulse me-1"></i>Sakit
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger fw-bold py-1 px-2" style="font-size:12px;" onclick="window.terapkanStatusMassal(${jam}, 'Alfa')" title="Set status terpilih ke Alfa">
                <i class="bi bi-x-circle me-1"></i>Alfa
              </button>
              <button type="button" class="btn btn-sm btn-light text-muted py-1 px-2 border-0" onclick="window.batalkanPilihanKartuJam(${jam})" title="Batalkan Pilihan">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>

            <!-- Tombol Tandai Semua Hadir & Simpan Jam Ini -->
            <button class="btn btn-sm btn-outline-success" onclick="window.tandaiSemuaHadirJam(${jam})" ${isLocked || totalSesi === 0 ? 'disabled' : ''}>
              <i class="bi bi-check-all me-1"></i> Tandai Semua Hadir
            </button>
            <button class="btn btn-sm btn-success fw-bold px-3 shadow-sm btn-simpan-jam-${jam}" onclick="window.simpanAbsensiJam(${jam})" id="btn_simpan_jam_${jam}" ${isLocked || totalSesi === 0 ? 'disabled' : ''}>
              <i class="bi bi-save2 me-1"></i> Simpan Jam Ini
            </button>
          </div>
        </div>

        <div class="p-2 px-3 bg-white border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2 flex-wrap flex-grow-1">
            <div class="input-group input-group-sm" style="max-width: 250px;">
              <span class="input-group-text bg-light border-secondary"><i class="bi bi-search text-success"></i></span>
              <input type="text" class="form-control border-secondary input-cari-absen"
                id="cari_absen_jam_${jam}" placeholder="Cari Asatidz / Kelas..." oninput="window.filterSesiAbsenJam(${jam})"
                ${isLocked || totalSesi === 0 ? 'disabled' : ''}>
              <button class="btn btn-outline-secondary" type="button" title="Bersihkan"
                onclick="jQuery('#cari_absen_jam_${jam}').val(''); window.filterSesiAbsenJam(${jam});">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
            <div style="min-width: 140px;">
              <select class="form-select form-select-sm border-secondary" id="filter_blok_jam_${jam}"
                onchange="window.filterSesiAbsenJam(${jam})" ${isLocked || totalSesi === 0 ? 'disabled' : ''}>
                <option value="">Semua Blok</option>
                ${opsiBlokJamHtml}
              </select>
            </div>
            <div style="min-width: 165px;">
              <select class="form-select form-select-sm border-secondary" id="sort_jam_${jam}"
                onchange="window.sortSesiAbsenJam(${jam})" ${isLocked || totalSesi === 0 ? 'disabled' : ''}>
                <option value="kelas_asc">Urut: Kelas (A-Z)</option>
                <option value="blok_asc">Urut: Blok (Kecil-Besar)</option>
                <option value="blok_desc">Urut: Blok (Besar-Kecil)</option>
                <option value="nama_asc">Urut: Nama (A-Z)</option>
              </select>
            </div>
          </div>
          <small class="text-muted" id="info_filter_jam_${jam}">
            Menampilkan: <b class="text-success">${totalSesi}</b> dari ${totalSesi} Sesi
          </small>
        </div>

        <div class="p-3 bg-light">
          ${
            totalSesi === 0
              ? `<div class="text-center py-4 text-muted small"><i class="bi bi-inbox me-1"></i> Tidak ada jadwal pengajar pada Jam Ke-${jam}.</div>`
              : ''
          }
          <div id="pesan_kosong_jam_${jam}" class="text-center text-muted py-4 small d-none">
            <i class="bi bi-search me-1 text-danger"></i> Tidak ditemukan data pengajar / kelas yang cocok dengan pencarian Anda.
          </div>
          <div class="row g-3" id="row_container_jam_${jam}">
            ${listSesi.map((sesi, idx) => renderCardSesiAbsensi(sesi, jam, idx)).join('')}
          </div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', jamHtml);
  });
}

/**
 * Merender 1 Kartu Sesi Pengajar (`.sesi-card-item`) di dalam blok Jam Ke-1..4
 * (Tampilan 100% sama persis dengan Tangkapan Layar Gambar 1)
 */
export function renderCardSesiAbsensi(sesi, jam, idx) {
  const key = getSesiKey(sesi);
  const stData = getSesiStatusData(sesi);
  const statusAktif = stData.status || 'Hadir';
  const isSaved = !!store.absensiState.savedRecords[key];
  const isSelected = selectedKeysPerJam[jam] && selectedKeysPerJam[jam].has(key);

  const labelBlok = formatLabelBlokHariKBM(sesi.blok);
  const prefix = `sesi_${jam}_${idx}`;

  const statusLainList = ['Terlambat', 'Digantikan', 'Tugas Lain', 'Jadwal Kosong'];
  const isStatusLain = statusLainList.includes(statusAktif);

  const showMenit = statusAktif === 'Terlambat';
  const showPengganti = ['Digantikan', 'Izin', 'Sakit'].includes(statusAktif);

  const searchAttr = `${sesi.nama} ${sesi.nia} ${sesi.kelasMengajar} ${sesi.fan} ${sesi.lokasi} ${labelBlok}`.toLowerCase();

  return `
    <div class="col-12 col-xl-6 item-sesi-col"
         id="col_${prefix}"
         data-idx="${idx}"
         data-search="${escHtmlFan_(searchAttr)}"
         data-blok="${escHtmlFan_(labelBlok)}"
         data-kelas="${escHtmlFan_(sesi.kelasMengajar)}"
         data-nama="${escHtmlFan_(sesi.nama)}">
      <div class="sesi-card-item p-3 h-100 ${sesi.isBentrok ? 'card-conflict-border' : ''} ${isSelected ? 'sesi-card-selected' : ''}"
           id="card_${prefix}">
        <!-- Baris 1: Checkbox, Nama Asatidz, NIA + Blok, & Badge Kelas di Kanan Atas -->
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
          <div class="d-flex align-items-start gap-2">
            <input type="checkbox"
                   class="form-check-input mt-1 chk-pilih-sesi-jam-${jam}"
                   id="chk_${prefix}"
                   data-idx="${idx}"
                   ${isSelected ? 'checked' : ''}
                   onchange="window.onToggleCheckboxSesiJam(${jam}, ${idx}, this.checked)"
                   style="cursor:pointer; width:1.05rem; height:1.05rem;">
            <div>
              <div class="fw-bold text-dark" style="font-size:0.95rem;">
                ${escHtmlFan_(sesi.nama)}
                ${
                  sesi.isBentrok
                    ? '<span class="badge bg-danger ms-1 conflict-badge-pulse" style="font-size:9.5px;"><i class="bi bi-exclamation-triangle-fill me-1"></i>Bentrok</span>'
                    : ''
                }
              </div>
              <div class="d-flex align-items-center flex-wrap gap-1 mt-1">
                <span class="text-muted font-monospace" style="font-size:11px;">NIA: ${escHtmlFan_(sesi.nia || '-')}</span>
                <span class="text-muted" style="font-size:11px;">&bull;</span>
                <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 py-0 px-2" style="font-size:10px;">
                  <i class="bi bi-building me-1"></i>${escHtmlFan_(labelBlok)}
                </span>
              </div>
            </div>
          </div>
          <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 fw-bold flex-shrink-0" style="font-size:11px;">
            ${escHtmlFan_(sesi.kelasMengajar)}
          </span>
        </div>

        <!-- Baris 2: Deretan Badge Fan, Lokasi, Blok, & Status Simpan -->
        <div class="d-flex flex-wrap align-items-center gap-1 mb-3">
          <span class="badge bg-light text-dark border fw-semibold" style="font-size:10.5px;">
            <i class="bi bi-book me-1 text-secondary"></i>${escHtmlFan_(sesi.fan || '-')}
          </span>
          <span class="badge bg-light text-secondary border fw-normal" style="font-size:10.5px;">
            <i class="bi bi-geo-alt me-1"></i>${escHtmlFan_(sesi.lokasi || '-')}
          </span>
          <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25" style="font-size:10.5px;">
            <i class="bi bi-building me-1"></i>${escHtmlFan_(labelBlok)}
          </span>
          <span class="badge ${
            isSaved
              ? 'bg-success bg-opacity-10 text-success border border-success border-opacity-25'
              : 'bg-secondary bg-opacity-10 text-muted border'
          }" id="badge_save_${prefix}" style="font-size:10px;">
            ${isSaved ? '<i class="bi bi-check2-all me-1"></i>Tersimpan' : 'Belum Disimpan'}
          </span>
        </div>

        <!-- Baris 3: Grup Tombol Status Kehadiran & Kolom Keterangan Opsional -->
        <div class="row g-2 align-items-center">
          <div class="col-12 col-md-7">
            <div class="btn-group btn-group-sm w-100" role="group">
              <button type="button"
                      class="btn btn-status-sesi ${statusAktif === 'Hadir' ? 'btn-success fw-bold text-white' : 'btn-outline-success'}"
                      id="btn_st_hadir_${prefix}"
                      onclick="window.pilihStatusSesi(${jam}, ${idx}, 'Hadir')">
                ${statusAktif === 'Hadir' ? '<i class="bi bi-check2 me-1"></i>' : ''}Hadir
              </button>
              <button type="button"
                      class="btn btn-status-sesi ${statusAktif === 'Izin' ? 'btn-primary fw-bold text-white' : 'btn-outline-primary'}"
                      id="btn_st_izin_${prefix}"
                      onclick="window.pilihStatusSesi(${jam}, ${idx}, 'Izin')">
                Izin
              </button>
              <button type="button"
                      class="btn btn-status-sesi ${statusAktif === 'Sakit' ? 'btn-warning fw-bold text-dark' : 'btn-outline-warning text-dark'}"
                      id="btn_st_sakit_${prefix}"
                      onclick="window.pilihStatusSesi(${jam}, ${idx}, 'Sakit')">
                Sakit
              </button>
              <button type="button"
                      class="btn btn-status-sesi ${statusAktif === 'Alfa' ? 'btn-danger fw-bold text-white' : 'btn-outline-danger'}"
                      id="btn_st_alfa_${prefix}"
                      onclick="window.pilihStatusSesi(${jam}, ${idx}, 'Alfa')">
                Alfa
              </button>
              <div class="btn-group btn-group-sm" role="group">
                <button type="button"
                        class="btn btn-status-sesi dropdown-toggle ${isStatusLain ? 'btn-dark fw-bold text-white' : 'btn-outline-secondary'}"
                        id="btn_st_lain_${prefix}"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                        title="Status Kehadiran Lainnya">
                  ${isStatusLain ? escHtmlFan_(statusAktif) : '...'}
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm" style="font-size:0.8rem;">
                  <li>
                    <a class="dropdown-item py-1 fw-semibold" href="javascript:void(0)" onclick="window.pilihStatusSesi(${jam}, ${idx}, 'Terlambat')">
                      <i class="bi bi-clock-history text-warning me-2"></i>Terlambat
                    </a>
                  </li>
                  <li>
                    <a class="dropdown-item py-1 fw-semibold" href="javascript:void(0)" onclick="window.pilihStatusSesi(${jam}, ${idx}, 'Digantikan')">
                      <i class="bi bi-arrow-left-right text-info me-2"></i>Digantikan (Badal)
                    </a>
                  </li>
                  <li>
                    <a class="dropdown-item py-1 fw-semibold" href="javascript:void(0)" onclick="window.pilihStatusSesi(${jam}, ${idx}, 'Tugas Lain')">
                      <i class="bi bi-briefcase text-secondary me-2"></i>Tugas Lain
                    </a>
                  </li>
                  <li>
                    <a class="dropdown-item py-1 fw-semibold" href="javascript:void(0)" onclick="window.pilihStatusSesi(${jam}, ${idx}, 'Jadwal Kosong')">
                      <i class="bi bi-slash-circle text-muted me-2"></i>Jadwal Kosong
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div class="col-12 col-md-5">
            <input type="text"
                   class="form-control form-control-sm"
                   id="ket_${prefix}"
                   placeholder="Keterangan opsional..."
                   value="${escHtmlFan_(stData.keterangan || '')}"
                   oninput="window.onInputFieldSesi(${jam}, ${idx}, 'keterangan', this.value)">
          </div>
        </div>

        <!-- Baris 4 (Kondisional): Input Menit Terlambat & Nama Asatidz Pengganti -->
        <div class="row g-2 mt-1 ${showMenit || showPengganti ? '' : 'd-none'}" id="wrap_extra_${prefix}">
          <div class="col-12 col-sm-6 ${showMenit ? '' : 'd-none'}" id="wrap_menit_${prefix}">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-warning bg-opacity-10 text-dark border-warning"><i class="bi bi-stopwatch me-1"></i>Menit</span>
              <input type="number"
                     min="1"
                     class="form-control border-warning"
                     id="menit_${prefix}"
                     placeholder="Jml menit terlambat..."
                     value="${escHtmlFan_(stData.menitTerlambat || '')}"
                     oninput="window.onInputFieldSesi(${jam}, ${idx}, 'menitTerlambat', this.value)">
            </div>
          </div>
          <div class="col-12 col-sm-6 ${showPengganti ? '' : 'd-none'}" id="wrap_pengganti_${prefix}">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-info bg-opacity-10 text-dark border-info"><i class="bi bi-person-plus me-1"></i>Badal</span>
              <input type="text"
                     class="form-control border-info"
                     id="pengganti_${prefix}"
                     list="dl_asatidz_pengganti"
                     placeholder="Nama Asatidz Pengganti..."
                     value="${escHtmlFan_(stData.namaPengganti || '')}"
                     oninput="window.onInputFieldSesi(${jam}, ${idx}, 'namaPengganti', this.value)">
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 5. INTERAKSI KARTU SESI, FILTER, SORTING, & PENYIMPANAN PER JAM
// ============================================================================

/**
 * Membuka kunci secara paksa pada Jam Ke-2, 3, atau 4
 */
export function bukaPaksaKunciJam(jam) {
  store.absensiState.unlockedJams[jam] = true;
  renderFormAbsensiBertahap();
}

/**
 * Memperbarui tampilan tombol status pada 1 kartu tanpa me-render ulang seluruh blok jam
 */
function perbaruiVisualKartuSesi(jam, idx) {
  const sesi = store.absensiState.sesiHariIni[jam]?.[idx];
  if (!sesi) return;
  const stData = getSesiStatusData(sesi);
  const statusAktif = stData.status || 'Hadir';
  const prefix = `sesi_${jam}_${idx}`;

  const btnHadir = document.getElementById(`btn_st_hadir_${prefix}`);
  const btnIzin = document.getElementById(`btn_st_izin_${prefix}`);
  const btnSakit = document.getElementById(`btn_st_sakit_${prefix}`);
  const btnAlfa = document.getElementById(`btn_st_alfa_${prefix}`);
  const btnLain = document.getElementById(`btn_st_lain_${prefix}`);

  if (btnHadir) {
    btnHadir.className = `btn btn-status-sesi ${statusAktif === 'Hadir' ? 'btn-success fw-bold text-white' : 'btn-outline-success'}`;
    btnHadir.innerHTML = `${statusAktif === 'Hadir' ? '<i class="bi bi-check2 me-1"></i>' : ''}Hadir`;
  }
  if (btnIzin) {
    btnIzin.className = `btn btn-status-sesi ${statusAktif === 'Izin' ? 'btn-primary fw-bold text-white' : 'btn-outline-primary'}`;
  }
  if (btnSakit) {
    btnSakit.className = `btn btn-status-sesi ${statusAktif === 'Sakit' ? 'btn-warning fw-bold text-dark' : 'btn-outline-warning text-dark'}`;
  }
  if (btnAlfa) {
    btnAlfa.className = `btn btn-status-sesi ${statusAktif === 'Alfa' ? 'btn-danger fw-bold text-white' : 'btn-outline-danger'}`;
  }

  const statusLainList = ['Terlambat', 'Digantikan', 'Tugas Lain', 'Jadwal Kosong'];
  const isStatusLain = statusLainList.includes(statusAktif);
  if (btnLain) {
    btnLain.className = `btn btn-status-sesi dropdown-toggle ${isStatusLain ? 'btn-dark fw-bold text-white' : 'btn-outline-secondary'}`;
    btnLain.textContent = isStatusLain ? statusAktif : '...';
  }

  const showMenit = statusAktif === 'Terlambat';
  const showPengganti = ['Digantikan', 'Izin', 'Sakit'].includes(statusAktif);

  $(`#wrap_extra_${prefix}`).toggleClass('d-none', !(showMenit || showPengganti));
  $(`#wrap_menit_${prefix}`).toggleClass('d-none', !showMenit);
  $(`#wrap_pengganti_${prefix}`).toggleClass('d-none', !showPengganti);
}

/**
 * Handler saat salah satu tombol status kehadiran pada kartu sesi diklik
 */
export function pilihStatusSesi(jam, idx, status) {
  const sesi = store.absensiState.sesiHariIni[jam]?.[idx];
  if (!sesi) return;
  setSesiStatusData(sesi, { status, isSaved: false }, false);
  perbaruiVisualKartuSesi(jam, idx);
}

/**
 * Handler saat pengguna mengetik Keterangan, Menit Terlambat, atau Nama Pengganti
 */
export function onInputFieldSesi(jam, idx, field, val) {
  const sesi = store.absensiState.sesiHariIni[jam]?.[idx];
  if (!sesi) return;
  setSesiStatusData(sesi, { [field]: val, isSaved: false }, true);
}

/**
 * Handler saat checkbox pada pojok kiri atas kartu sesi dicentang/dilepas
 */
export function onToggleCheckboxSesiJam(jam, idx, checked) {
  const sesi = store.absensiState.sesiHariIni[jam]?.[idx];
  if (!sesi) return;
  const key = getSesiKey(sesi);
  if (!selectedKeysPerJam[jam]) selectedKeysPerJam[jam] = new Set();

  if (checked) {
    selectedKeysPerJam[jam].add(key);
    $(`#card_sesi_${jam}_${idx}`).addClass('sesi-card-selected');
  } else {
    selectedKeysPerJam[jam].delete(key);
    $(`#card_sesi_${jam}_${idx}`).removeClass('sesi-card-selected');
  }

  updateToolbarMassalJam(jam);
}

/**
 * Menampilkan/menyembunyikan toolbar aksi massal (Izin, Sakit, Alfa) pada header blok jam
 */
export function updateToolbarMassalJam(jam) {
  const count = selectedKeysPerJam[jam] ? selectedKeysPerJam[jam].size : 0;
  const toolbar = document.getElementById(`toolbar_massal_jam_${jam}`);
  const badgeCount = document.getElementById(`count_pilih_jam_${jam}`);
  if (badgeCount) badgeCount.textContent = `${count} Dipilih`;
  if (toolbar) {
    if (count > 0) {
      toolbar.classList.remove('d-none');
      toolbar.classList.add('d-flex');
    } else {
      toolbar.classList.remove('d-flex');
      toolbar.classList.add('d-none');
    }
  }
}

/**
 * Menerapkan status massal (Izin / Sakit / Alfa) ke seluruh kartu yang dicentang pada jam tertentu
 */
export function terapkanStatusMassal(jam, status) {
  const list = store.absensiState.sesiHariIni[jam] || [];
  const setPilih = selectedKeysPerJam[jam];
  if (!setPilih || setPilih.size === 0) return;

  list.forEach((sesi, idx) => {
    const key = getSesiKey(sesi);
    if (setPilih.has(key)) {
      setSesiStatusData(sesi, { status, isSaved: false }, true);
      perbaruiVisualKartuSesi(jam, idx);
    }
  });

  batalkanPilihanKartuJam(jam);
  updateStatistikRingkas();
}

/**
 * Membatalkan seluruh pilihan checkbox kartu pada blok jam tertentu
 */
export function batalkanPilihanKartuJam(jam) {
  if (selectedKeysPerJam[jam]) selectedKeysPerJam[jam].clear();
  $(`.chk-pilih-sesi-jam-${jam}`).prop('checked', false);
  $(`#row_container_jam_${jam} .sesi-card-item`).removeClass('sesi-card-selected');
  updateToolbarMassalJam(jam);
}

/**
 * Menandai seluruh sesi pada blok jam tertentu menjadi 'Hadir'
 */
export function tandaiSemuaHadirJam(jam) {
  const list = store.absensiState.sesiHariIni[jam] || [];
  list.forEach((sesi, idx) => {
    setSesiStatusData(sesi, { status: 'Hadir', isSaved: false }, true);
    perbaruiVisualKartuSesi(jam, idx);
  });
  updateStatistikRingkas();

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: `Seluruh sesi Jam Ke-${jam} ditandai Hadir. Klik "Simpan Jam Ini" untuk menyimpan.`,
    showConfirmButton: false,
    timer: 2200
  });
}

/**
 * Menyaring kartu sesi pada blok jam tertentu berdasarkan input pencarian & dropdown Blok
 */
export function filterSesiAbsenJam(jam) {
  const kw = ($(`#cari_absen_jam_${jam}`).val() || '').trim().toLowerCase();
  const blokFlt = ($(`#filter_blok_jam_${jam}`).val() || '').trim();
  const totalSesi = (store.absensiState.sesiHariIni[jam] || []).length;
  let tampilCount = 0;

  $(`#row_container_jam_${jam} .item-sesi-col`).each(function () {
    const sText = $(this).attr('data-search') || '';
    const sBlok = $(this).attr('data-blok') || '';
    const matchKw = !kw || sText.includes(kw);
    const matchBlok = !blokFlt || sBlok === blokFlt;

    if (matchKw && matchBlok) {
      $(this).removeClass('d-none');
      tampilCount++;
    } else {
      $(this).addClass('d-none');
    }
  });

  $(`#info_filter_jam_${jam}`).html(
    `Menampilkan: <b class="text-success">${tampilCount}</b> dari ${totalSesi} Sesi`
  );
  $(`#pesan_kosong_jam_${jam}`).toggleClass('d-none', totalSesi === 0 || tampilCount > 0);
}

/**
 * Mengurutkan posisi kartu sesi pada blok jam tertentu (Kelas A-Z, Blok Kecil-Besar, Blok Besar-Kecil, Nama A-Z)
 */
export function sortSesiAbsenJam(jam) {
  const mode = $(`#sort_jam_${jam}`).val() || 'kelas_asc';
  const rowContainer = document.getElementById(`row_container_jam_${jam}`);
  if (!rowContainer) return;

  const cols = Array.from(rowContainer.querySelectorAll('.item-sesi-col'));
  cols.sort((a, b) => {
    const klsA = a.getAttribute('data-kelas') || '';
    const klsB = b.getAttribute('data-kelas') || '';
    const blkA = a.getAttribute('data-blok') || '';
    const blkB = b.getAttribute('data-blok') || '';
    const namaA = a.getAttribute('data-nama') || '';
    const namaB = b.getAttribute('data-nama') || '';

    if (mode === 'nama_asc') {
      return namaA.localeCompare(namaB, undefined, { sensitivity: 'base' });
    }
    if (mode === 'blok_asc') {
      const cmp = bandingkanBlokHariKBM(blkA, blkB);
      if (cmp !== 0) return cmp;
      return klsA.localeCompare(klsB, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (mode === 'blok_desc') {
      const cmp = bandingkanBlokHariKBM(blkB, blkA);
      if (cmp !== 0) return cmp;
      return klsA.localeCompare(klsB, undefined, { numeric: true, sensitivity: 'base' });
    }
    return klsA.localeCompare(klsB, undefined, { numeric: true, sensitivity: 'base' });
  });

  cols.forEach(col => rowContainer.appendChild(col));
}

/**
 * Menyimpan data absensi untuk 1 blok Jam (Jam 1 / 2 / 3 / 4)
 */
export function simpanAbsensiJam(jam) {
  const listSesi = store.absensiState.sesiHariIni[jam] || [];
  if (listSesi.length === 0) return;

  const records = [];
  let adaYangKosong = false;

  listSesi.forEach(sesi => {
    const d = getSesiStatusData(sesi);
    if (!d.status) adaYangKosong = true;

    records.push({
      tanggal: store.absensiState.tanggal,
      hari: store.absensiState.hari,
      jamKe: sesi.jamKe,
      nama: sesi.nama,
      gender: sesi.gender || '',
      nia: sesi.nia || '',
      tingkat: sesi.tingkat || '',
      dinKls: sesi.dinKls || '',
      dinBag: sesi.dinBag || '',
      blok: sesi.blok || '',
      kelasMengajar: sesi.kelasMengajar || '',
      fan: sesi.fan || '',
      lokasi: sesi.lokasi || '',
      status: d.status || 'Alfa',
      keterangan: d.keterangan || '',
      menitTerlambat: d.menitTerlambat || '',
      namaPengganti: d.namaPengganti || ''
    });
  });

  if (adaYangKosong) {
    Swal.fire({
      title: 'Ada Sesi Belum Diisi',
      text: 'Beberapa Asatidz belum dipilih status kehadirannya. Sesi yang kosong akan otomatis ditandai sebagai Alfa. Lanjutkan?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#0f766e',
      confirmButtonText: 'Ya, Simpan'
    }).then(r => {
      if (r.isConfirmed) doEksekusiSimpanJam(jam, records);
    });
  } else {
    doEksekusiSimpanJam(jam, records);
  }
}

/**
 * Eksekusi penyimpanan batch 1 jam ke `store.absensiMapByDate` dan Supabase
 */
export async function doEksekusiSimpanJam(jam, records) {
  const btns = document.querySelectorAll(`.btn-simpan-jam-${jam}`);
  btns.forEach(b => {
    b.disabled = true;
    b.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';
  });

  try {
    const nowStr = formatWaktuSekarangWIB();
    const actorName = store.currentUser?.nama || 'Master Administrator';
    const targetTanggal = store.absensiState.tanggal;
    const targetHari = store.absensiState.hari;
    const targetJamKe = `Jam ${jam}`;
    const bucketKey = `${targetTanggal}|${targetJamKe}`;

    if (!store.absensiMapByDate) store.absensiMapByDate = {};
    const existingBucket = store.absensiMapByDate[bucketKey];
    let existingRecords = [];

    if (existingBucket && Array.isArray(existingBucket.data)) {
      existingRecords = existingBucket.data.map(arr =>
        unpackCompactArrayToSesi_(arr, targetTanggal, targetHari, targetJamKe)
      );
    }

    const mapExisting = {};
    existingRecords.forEach((r, idx) => {
      const k = `${r.nama}|${r.kelasMengajar}|${r.fan}`.trim().toLowerCase();
      mapExisting[k] = idx;
    });

    records.forEach(r => {
      const k = `${r.nama}|${r.kelasMengajar}|${r.fan}`.trim().toLowerCase();
      const prev = mapExisting[k] !== undefined ? existingRecords[mapExisting[k]] : null;

      const finalRecord = {
        id:
          prev?.id ||
          'ABS-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        timestamp: prev?.timestamp || nowStr,
        tanggal: targetTanggal,
        hari: targetHari,
        jamke: targetJamKe,
        jamKe: targetJamKe,
        nama: r.nama,
        nia: r.nia || '',
        tingkat: r.tingkat || '',
        dinKls: r.dinKls || '',
        dinBag: r.dinBag || '',
        blok: r.blok || '',
        gender: r.gender || '',
        kelasMengajar: r.kelasMengajar || '',
        fan: r.fan || '',
        lokasi: r.lokasi || '',
        status: r.status || 'Hadir',
        keterangan: r.keterangan || '',
        menitTerlambat: r.menitTerlambat || '',
        namaPengganti: r.namaPengganti || '',
        diinputOleh: actorName,
        waktuUpdate: nowStr
      };

      if (mapExisting[k] !== undefined) {
        existingRecords[mapExisting[k]] = finalRecord;
      } else {
        existingRecords.push(finalRecord);
        mapExisting[k] = existingRecords.length - 1;
      }

      // Sinkronkan ke savedRecords & bersihkan pendingStatus
      const fullKey = `${targetTanggal}|${finalRecord.nama}|${targetJamKe}|${finalRecord.kelasMengajar}|${finalRecord.fan}`
        .trim()
        .toLowerCase();
      store.absensiState.savedRecords[fullKey] = finalRecord;
      delete store.absensiState.pendingStatus[fullKey];
    });

    store.absensiMapByDate[bucketKey] = {
      tanggal: targetTanggal,
      hari: targetHari,
      jamKe: targetJamKe,
      waktuUpdate: nowStr,
      diinputOleh: actorName,
      data: existingRecords.map(r => packSesiToCompactArray_(r))
    };

    await saveAbsensiToSupabase(
      `Menyimpan ${records.length} sesi absensi pada ${targetTanggal} (${targetHari}) - ${targetJamKe}`
    );

    // Buka otomatis jam berikutnya jika ada
    if (jam < 4) {
      store.absensiState.unlockedJams[jam + 1] = true;
    }

    renderFormAbsensiBertahap();
    updateStatistikRingkas();

    Swal.fire({
      icon: 'success',
      title: `Jam Ke-${jam} Tersimpan!`,
      text: `${records.length} rekaman sesi absensi berhasil disimpan.`,
      timer: 1600,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Menyimpan Absensi',
      text: err.message
    });
  } finally {
    btns.forEach(b => {
      b.disabled = false;
      b.innerHTML = '<i class="bi bi-save2 me-1"></i> Simpan Jam Ini';
    });
  }
}

// ============================================================================
// 6. PENGATURAN HARI LIBUR / KEGIATAN KHUSUS (#modalAturLibur)
// ============================================================================

/**
 * Membuka Modal Pengaturan Hari Libur / Event untuk tanggal yang sedang dipilih
 */
export function bukaModalPengaturanLibur() {
  const tgl = store.absensiState.tanggal || document.getElementById('inputTglAbsensi')?.value || '';
  if (!tgl) {
    return Swal.fire({
      icon: 'warning',
      title: 'Pilih Tanggal',
      text: 'Silakan pilih tanggal absensi terlebih dahulu.'
    });
  }

  const hari = store.absensiState.hari || getNamaHariDariTgl(tgl);
  const info = store.absensiState.infoLibur || (store.liburMapByDate && store.liburMapByDate[tgl]) || null;

  $('#modal_libur_tgl').val(`${hari}, ${tgl}`);
  $('#modal_libur_kategori').val(info?.kategori || '');
  $('#modal_libur_keterangan').val(info?.keterangan || '');

  $('#modalAturLibur').modal('show');
}

/**
 * Menyimpan status Hari Libur / Kegiatan Khusus ke Supabase (`app_settings`)
 */
export async function aksiSimpanStatusLibur(e) {
  if (e) e.preventDefault();

  const tgl = store.absensiState.tanggal || document.getElementById('inputTglAbsensi')?.value || '';
  const hari = store.absensiState.hari || getNamaHariDariTgl(tgl);
  const kategori = ($('#modal_libur_kategori').val() || '').trim();
  const keterangan = ($('#modal_libur_keterangan').val() || '').trim();

  if (!tgl || !kategori) {
    return Swal.fire({
      icon: 'warning',
      title: 'Data Belum Lengkap',
      text: 'Silakan pilih kategori status libur/kegiatan.'
    });
  }

  const btn = document.getElementById('btnSimpanLibur');
  const oriText = btn ? btn.innerHTML : 'Simpan Status Libur';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';
  }

  try {
    if (!store.liburMapByDate) store.liburMapByDate = {};
    store.liburMapByDate[tgl] = {
      tanggal: tgl,
      hari,
      kategori,
      keterangan,
      oleh: store.currentUser?.nama || 'Master Administrator',
      timestamp: formatWaktuSekarangWIB()
    };

    await saveLiburToSupabase(`Menandai tanggal ${tgl} (${hari}) sebagai ${kategori}: ${keterangan || '-'}`);

    $('#modalAturLibur').modal('hide');
    await muatAbsensiTanggalTerpilih(true);

    Swal.fire({
      icon: 'success',
      title: 'Status Libur Disimpan',
      text: `Tanggal ${tgl} (${hari}) ditandai sebagai ${kategori}.`,
      timer: 1600,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Menyimpan Status Libur',
      text: err.message
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oriText;
    }
  }
}

/**
 * Membatalkan / menghapus status Hari Libur pada tanggal aktif
 */
export function hapusStatusLibur() {
  const tgl = store.absensiState.tanggal || document.getElementById('inputTglAbsensi')?.value || '';
  if (!tgl) return;

  Swal.fire({
    title: 'Batalkan Status Libur?',
    text: `Aktifkan kembali kegiatan pembelajaran normal pada tanggal ${tgl}?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#0f766e',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: 'Ya, Aktifkan KBM',
    cancelButtonText: 'Batal'
  }).then(async r => {
    if (!r.isConfirmed) return;

    try {
      if (store.liburMapByDate && store.liburMapByDate[tgl]) {
        delete store.liburMapByDate[tgl];
      }
      await saveLiburToSupabase(`Membatalkan status libur pada tanggal ${tgl}`);
      await muatAbsensiTanggalTerpilih(true);

      Swal.fire({
        icon: 'success',
        title: 'Status Libur Dibatalkan',
        text: 'Form presensi harian kembali aktif.',
        timer: 1400,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Membatalkan Libur',
        text: err.message
      });
    }
  });
}

// ============================================================================
// 7. POP-UP DETAIL DAFTAR ASATIDZ DARI 5 KARTU KPI (#modalListStatusKPI)
// ============================================================================

/**
 * Menampilkan daftar sesi Asatidz hari ini berdasarkan kartu KPI yang diklik
 * ('SEMUA' | 'Hadir' | 'IZIN_SAKIT' | 'ALFA' | 'TERLAMBAT_GANTI')
 */
export function bukaModalListStatusKPI(tipeKategori) {
  const listSesiTarget = [];
  const titleMap = {
    SEMUA: 'Semua Pengajar Hari Ini',
    Hadir: 'Daftar Pengajar Hadir',
    IZIN_SAKIT: 'Daftar Pengajar Izin & Sakit',
    ALFA: 'Daftar Pengajar Alfa / Kosong',
    TERLAMBAT_GANTI: 'Daftar Pengajar Terlambat & Digantikan'
  };

  [1, 2, 3, 4].forEach(j => {
    const sesiList = store.absensiState.sesiHariIni[j] || [];
    sesiList.forEach(s => {
      const key = getSesiKey(s);
      const saved = store.absensiState.savedRecords[key];
      const pending = store.absensiState.pendingStatus[key];
      const r = pending || saved || {};
      const status = (saved || pending) && r.status ? r.status : 'Belum Diabsen';
      let cocok = false;

      if (tipeKategori === 'SEMUA') {
        cocok = true;
      } else if (tipeKategori === 'Hadir' && status === 'Hadir') {
        cocok = true;
      } else if (tipeKategori === 'IZIN_SAKIT' && (status === 'Izin' || status === 'Sakit')) {
        cocok = true;
      } else if (
        tipeKategori === 'ALFA' &&
        (status === 'Alfa' || status === 'Jadwal Kosong' || status === 'Belum Diabsen')
      ) {
        cocok = true;
      } else if (
        tipeKategori === 'TERLAMBAT_GANTI' &&
        (status === 'Terlambat' || status === 'Digantikan' || status === 'Tugas Lain')
      ) {
        cocok = true;
      }

      if (cocok) {
        let ketTampil = r.keterangan || '';
        if (!ketTampil) {
          if (status === 'Terlambat') ketTampil = `Terlambat ${r.menitTerlambat || 0} mnt`;
          else if (status === 'Digantikan') ketTampil = `Diganti: ${r.namaPengganti || '-'}`;
          else ketTampil = '-';
        }

        listSesiTarget.push({
          jam: s.jamKe,
          nama: s.nama,
          nia: s.nia,
          kelas: s.kelasMengajar,
          fan: s.fan,
          blok: formatLabelBlokHariKBM(s.blok),
          status,
          keterangan: ketTampil
        });
      }
    });
  });

  $('#mdlKpiTitle').html(
    `<i class="bi bi-people-fill me-2"></i> ${escHtmlFan_(titleMap[tipeKategori] || 'Daftar Asatidz')}`
  );
  $('#mdlKpiSub').text(
    `Tanggal: ${store.absensiState.tanggal || '-'} (${store.absensiState.hari || '-'})`
  );
  $('#mdlKpiBadgeCount').text(`${listSesiTarget.length} Sesi`);

  const tbody = $('#mdlKpiBody');
  tbody.empty();

  if (listSesiTarget.length === 0) {
    tbody.html(
      '<tr><td colspan="7" class="text-center py-4 text-muted fst-italic">Tidak ada data untuk status ini.</td></tr>'
    );
  } else {
    listSesiTarget.forEach((item, idx) => {
      let badgeClass = 'badge-status-kosong';
      if (item.status === 'Hadir') badgeClass = 'badge-status-hadir';
      else if (item.status === 'Izin') badgeClass = 'badge-status-izin';
      else if (item.status === 'Sakit') badgeClass = 'badge-status-sakit';
      else if (item.status === 'Alfa') badgeClass = 'badge-status-alfa';
      else if (item.status === 'Terlambat') badgeClass = 'badge-status-terlambat';
      else if (item.status === 'Digantikan') badgeClass = 'badge-status-digantikan';
      else if (item.status === 'Tugas Lain') badgeClass = 'badge-status-tugaslain';

      tbody.append(`
        <tr>
          <td class="text-center fw-bold text-muted">${idx + 1}</td>
          <td><span class="badge bg-light text-dark border">${escHtmlFan_(item.jam)}</span></td>
          <td>
            <div class="fw-bold text-dark">${escHtmlFan_(item.nama)}</div>
            <small class="text-muted font-monospace">${escHtmlFan_(item.nia || '-')}</small>
          </td>
          <td>
            <div class="fw-semibold text-success">${escHtmlFan_(item.kelas)}</div>
            <small class="text-muted">${escHtmlFan_(item.fan)}</small>
          </td>
          <td class="text-center">
            <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2">${escHtmlFan_(item.blok)}</span>
          </td>
          <td class="text-center"><span class="badge ${badgeClass}">${escHtmlFan_(item.status)}</span></td>
          <td><small class="text-muted">${escHtmlFan_(item.keterangan || '-')}</small></td>
        </tr>
      `);
    });
  }

  $('#modalListStatusKPI').modal('show');
}

// ============================================================================
// 8. GENERATOR FORMAT LAPORAN CHAT WHATSAPP (#modalGeneratorWA)
// ============================================================================

/**
 * Membuka Modal Generator Laporan Chat WhatsApp
 */
export function bukaModalGeneratorWA() {
  $('#modalGeneratorWA').modal('show');
  updatePreviewWA();
}

/**
 * Memetakan status kehadiran ke simbol emoji WhatsApp
 */
export function getEmojiStatusWA(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'hadir') return '✅';
  if (s === 'alfa' || s === 'jadwal kosong') return '🅰️';
  if (s === 'izin') return 'ℹ️';
  if (s === 'sakit') return '🤒';
  if (s === 'terlambat') return '⏳';
  if (s === 'digantikan') return '🔄';
  if (s === 'tugas lain') return '📋';
  return '❓';
}

/**
 * Menyusun pratinjau laporan WhatsApp berdasarkan Sesi Jam & Kategori Gender yang dipilih
 */
export function updatePreviewWA() {
  const selectedJams = [];
  $('.chk-pilih-jam-wa:checked').each(function () {
    const val = String($(this).val() || '');
    if (val.includes(',')) {
      val.split(',').forEach(v => selectedJams.push(parseInt(v.trim(), 10)));
    } else {
      selectedJams.push(parseInt(val, 10));
    }
  });

  const filterGender = $('input[name="wa_filter_gender"]:checked').val() || 'SEMUA';

  if (selectedJams.length === 0) {
    $('#txtPreviewWA').val('Silakan pilih minimal satu Sesi Jam di atas.');
    $('#waTextLength').text('0 Karakter');
    return;
  }

  const tanggalRaw = store.absensiState.tanggal || '';
  const hariRaw = String(store.absensiState.hari || '').toUpperCase();

  let tglHeader = tanggalRaw;
  if (tanggalRaw.includes('-')) {
    const p = tanggalRaw.split('-');
    const BULAN_IND = [
      'JANUARI',
      'FEBRUARI',
      'MARET',
      'APRIL',
      'MEI',
      'JUNI',
      'JULI',
      'AGUSTUS',
      'SEPTEMBER',
      'OKTOBER',
      'NOVEMBER',
      'DESEMBER'
    ];
    const blnNama = BULAN_IND[parseInt(p[1], 10) - 1] || p[1];
    tglHeader = `${hariRaw}, ${parseInt(p[2], 10)} ${blnNama} ${p[0]}`;
  }

  const mapBlok = {};
  const allGuruStatusMap = {};

  selectedJams.forEach(j => {
    const sesiList = store.absensiState.sesiHariIni[j] || [];
    sesiList.forEach(s => {
      // Deteksi gender sesi (PA / PI)
      let genderSesi = String(s.gender || '').trim().toUpperCase();
      if (!genderSesi) {
        const klsGabung = `${s.kelasMengajar} ${s.lokasiGabungan || ''}`.toUpperCase();
        if (klsGabung.includes('(PA)') || /\bPA\b/.test(klsGabung)) genderSesi = 'PA';
        else if (klsGabung.includes('(PI)') || /\bPI\b/.test(klsGabung)) genderSesi = 'PI';
      }

      if (filterGender !== 'SEMUA' && genderSesi && genderSesi !== filterGender) {
        return;
      }

      const key = getSesiKey(s);
      const saved = store.absensiState.savedRecords[key];
      const pending = store.absensiState.pendingStatus[key];
      const r = pending || saved || {};
      const status = (saved || pending) && r.status ? r.status : 'Alfa';
      const emoji = getEmojiStatusWA(status);

      const blokBersih = String(s.blok || '')
        .replace(/^blok\s*/i, '')
        .trim()
        .toUpperCase();
      const blokNama =
        !blokBersih || blokBersih === '-' || blokBersih === 'BELUM DIATUR'
          ? 'INDUK'
          : blokBersih;

      if (!mapBlok[blokNama]) mapBlok[blokNama] = {};

      // Bersihkan label (PA) / (PI) dari nama kelas agar tampilan laporan rapi
      const klsKey = String(s.kelasMengajar || 'Lain-lain')
        .replace(/\s*\((PA|PI)\)\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!mapBlok[blokNama][klsKey]) mapBlok[blokNama][klsKey] = {};

      const guruKey = s.nama.trim();
      if (!mapBlok[blokNama][klsKey][guruKey]) {
        mapBlok[blokNama][klsKey][guruKey] = {
          guru: s.nama,
          sessions: []
        };
      }
      mapBlok[blokNama][klsKey][guruKey].sessions.push({
        jam: j,
        status,
        emoji
      });

      if (!allGuruStatusMap[guruKey]) allGuruStatusMap[guruKey] = [];
      allGuruStatusMap[guruKey].push(status);
    });
  });

  // Hitung statistik guru unik
  const totalGuru = Object.keys(allGuruStatusMap).length;
  let hadirCount = 0;
  let alpaCount = 0;
  let izinCount = 0;

  Object.values(allGuruStatusMap).forEach(statusArr => {
    if (statusArr.every(st => st === 'Hadir' || st === 'Terlambat')) {
      hadirCount++;
    } else if (statusArr.some(st => st === 'Izin' || st === 'Sakit')) {
      izinCount++;
    } else {
      alpaCount++;
    }
  });

  let labelKategori = '';
  if (filterGender === 'PA') labelKategori = ' (PUTRA / PA)';
  else if (filterGender === 'PI') labelKategori = ' (PUTRI / PI)';

  const listJudul = [];
  if ($('#wa_jam_1_2').is(':checked')) listJudul.push('DINIYYAH');
  if ($('#wa_jam_3').is(':checked')) listJudul.push('BANDONGAN & SYAWIR');
  if ($('#wa_jam_4').is(':checked')) listJudul.push('TAKROR');

  const judulAbsensi =
    listJudul.length > 0 ? 'ABSENSI ' + listJudul.join(' & ') : 'ABSENSI DINIYYAH';

  let out = `${judulAbsensi}${labelKategori} ${tglHeader}\n`;
  out += `JUMLAH GURU: ${totalGuru}\n`;
  out += `HADIR: ${hadirCount}\n`;
  out += `ALPA: ${alpaCount}\n`;
  out += `IZIN: ${izinCount}\n\n`;

  const blokKeys = Object.keys(mapBlok).sort((a, b) => bandingkanBlokHariKBM(a, b));

  if (blokKeys.length === 0) {
    out += `_Tidak ada data jadwal pengajar untuk kategori ${filterGender} pada jam yang dipilih._\n`;
  } else {
    blokKeys.forEach(bKey => {
      const emojiBlok = bKey.includes('9') ? '🏢' : '🏠';
      out += `${emojiBlok} BLOK ${bKey.replace(/^BLOK\s*/i, '').trim()}\n`;

      const kelasMap = mapBlok[bKey];
      const kelasKeys = Object.keys(kelasMap).sort((a, b) => {
        const parseKelasWA = str => {
          const upper = String(str || '').toUpperCase();
          let tingkatOrder = 99;
          if (/\bULA\b/.test(upper)) tingkatOrder = 1;
          else if (/\b(WUSTHO|WUSTHA)\b/.test(upper)) tingkatOrder = 2;
          else if (/\bULYA\b/.test(upper)) tingkatOrder = 3;
          else if (/\b(ISTI['’]?DAD|IST)\b/.test(upper)) tingkatOrder = 4;

          const matchAngka = upper.match(/\b(\d+)\b/);
          const angka = matchAngka ? parseInt(matchAngka[1], 10) : 0;

          const bagian = upper
            .replace(/\b(ULA|WUSTHO|WUSTHA|ULYA|ISTI['’]?DAD|IST)\b/g, '')
            .replace(/\b\d+\b/g, '')
            .replace(/[^A-Z0-9]/g, '')
            .trim();

          return { tingkatOrder, angka, bagian };
        };

        const infA = parseKelasWA(a);
        const infB = parseKelasWA(b);
        if (infA.tingkatOrder !== infB.tingkatOrder) return infA.tingkatOrder - infB.tingkatOrder;
        if (infA.angka !== infB.angka) return infA.angka - infB.angka;
        if (infA.bagian !== infB.bagian) {
          return infA.bagian.localeCompare(infB.bagian, undefined, { numeric: true });
        }
        return a.localeCompare(b);
      });

      let noUrut = 1;
      kelasKeys.forEach(kKey => {
        const guruMap = kelasMap[kKey];
        const listGuruTeks = [];

        Object.values(guruMap).forEach(gItem => {
          const firstEmoji = gItem.sessions[0].emoji;
          const isSemuaSama = gItem.sessions.every(se => se.emoji === firstEmoji);
          if (isSemuaSama) {
            listGuruTeks.push(`${gItem.guru} ${firstEmoji}`);
          } else {
            const detailJam = gItem.sessions.map(se => `J${se.jam}:${se.emoji}`).join(' ');
            listGuruTeks.push(`${gItem.guru} (${detailJam})`);
          }
        });

        const guruStr = listGuruTeks.join(' & ');
        out += `${noUrut}. ${kKey} ${guruStr}\n`;
        noUrut++;
      });

      out += `\n`;
    });
  }

  const hasilFinal = out.trim();
  $('#txtPreviewWA').val(hasilFinal);
  $('#waTextLength').text(`${hasilFinal.length} Karakter`);
}

/**
 * Menyalin teks laporan WhatsApp ke clipboard
 */
export function salinTeksWA() {
  const txt = document.getElementById('txtPreviewWA');
  if (!txt) return;
  txt.select();
  txt.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(txt.value).then(() => {
    Swal.fire({
      icon: 'success',
      title: 'Tersalin!',
      text: 'Format laporan absensi berhasil disalin ke clipboard.',
      timer: 1500,
      showConfirmButton: false
    });
  });
}

/**
 * Membuka aplikasi WhatsApp dengan teks laporan yang sudah disusun
 */
export function kirimLangsungKeWA() {
  const pesan = $('#txtPreviewWA').val();
  if (!pesan) return;
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(pesan)}`;
  window.open(url, '_blank');
}

// ============================================================================
// 9. TAB 2: RIWAYAT & REKAP DATA (#pills-riwayat — PERSIS GAMBAR 2)
// ============================================================================

/**
 * Membangun array 2D Riwayat Absensi (21 kolom standar) dari `store.absensiMapByDate`
 * dan mengurutkannya dari yang terbaru (Descending)
 */
export function bangunArrayRiwayatDariMap() {
  const array2D = [];
  const map = store.absensiMapByDate || {};

  // Buat kamus profil Asatidz untuk melengkapi blok bila kosong
  const mapProfil = {};
  (store.globalDataAsatidz || []).forEach(a => {
    const n = String(a.nama_asatidz || '').trim().toUpperCase();
    if (n) mapProfil[n] = a;
  });

  Object.keys(map).forEach(bucketKey => {
    const bucket = map[bucketKey];
    if (!bucket || !Array.isArray(bucket.data)) return;

    const tanggalClean = String(bucket.tanggal || bucketKey.split('|')[0] || '').trim();
    const hari = String(bucket.hari || getNamaHariDariTgl(tanggalClean) || '').trim();
    const jamKe = String(bucket.jamKe || bucketKey.split('|')[1] || '').trim();

    bucket.data.forEach(compactArr => {
      const r = unpackCompactArrayToSesi_(compactArr, tanggalClean, hari, jamKe);
      const profil = mapProfil[String(r.nama || '').trim().toUpperCase()];

      let blokVal = String(r.blok || '').trim();
      if (!blokVal || blokVal === '-') {
        blokVal = dapatkanBlokDariSesiMengajar(
          [{ kelas: r.kelasMengajar, lokasi: r.lokasi }],
          profil
        );
      }
      const blokFormatted = formatLabelBlokHariKBM(blokVal);

      // 21 kolom standar (indeks 0..20)
      array2D.push([
        r.id || '',                             // [0]  id
        r.timestamp || bucket.waktuUpdate || '', // [1]  timestamp
        tanggalClean,                           // [2]  tanggal (YYYY-MM-DD)
        hari,                                   // [3]  hari
        jamKe,                                  // [4]  jamKe ("Jam 1".."Jam 4")
        r.nama || '',                           // [5]  nama
        r.nia || profil?.nia || '',             // [6]  nia
        r.tingkat || profil?.tingkat_asatidz || '', // [7]  tingkat
        r.dinKls || profil?.din_kls_asatidz || '',  // [8]  dinKls
        r.dinBag || profil?.din_bag_asatidz || '',  // [9]  dinBag
        r.kelasMengajar || '',                  // [10] kelasMengajar
        r.fan || '',                            // [11] fan
        r.lokasi || '',                         // [12] lokasi
        r.status || 'Hadir',                    // [13] status
        r.keterangan || '',                     // [14] keterangan
        r.menitTerlambat || '',                 // [15] menitTerlambat
        r.namaPengganti || '',                  // [16] namaPengganti
        r.diinputOleh || bucket.diinputOleh || 'Master Administrator', // [17] diinputOleh
        r.waktuUpdate || bucket.waktuUpdate || '', // [18] waktuUpdate
        blokFormatted,                          // [19] blok
        r.gender || profil?.pa_pi || ''         // [20] gender
      ]);
    });
  });

  // Urutkan berdasarkan Tanggal Descending, lalu Jam Ke Descending
  array2D.sort((a, b) => {
    if (a[2] !== b[2]) return String(b[2]).localeCompare(String(a[2]));
    return String(b[4]).localeCompare(String(a[4]), undefined, { numeric: true });
  });

  store.rawRiwayatAbsensi = array2D;
  return array2D;
}

/**
 * Mengisi opsi dropdown `#flt_rw_blok` pada panel Filter Pencarian Riwayat
 */
export function isiOpsiFilterRiwayatBlok() {
  const sel = document.getElementById('flt_rw_blok');
  if (!sel) return;
  const curVal = sel.value;

  const setBlok = new Set();
  (store.rawRiwayatAbsensi || []).forEach(r => {
    const blk = formatLabelBlokHariKBM(r[19]);
    if (blk) setBlok.add(blk);
  });
  (store.globalDataFormasi || []).forEach(f => {
    if (f.blok && String(f.blok).trim() !== '-') {
      setBlok.add(formatLabelBlokHariKBM(f.blok));
    }
  });

  const sorted = Array.from(setBlok).sort((a, b) => bandingkanBlokHariKBM(a, b));
  let html = '<option value="">Semua Blok</option>';
  sorted.forEach(b => {
    html += `<option value="${escHtmlFan_(b)}">${escHtmlFan_(b)}</option>`;
  });

  sel.innerHTML = html;
  if (curVal && sorted.includes(curVal)) {
    sel.value = curVal;
  }
}

/**
 * Memuat & menampilkan tabel/kartu Riwayat Absensi saat Tab 2 dibuka
 */
export async function muatTabelRiwayatAbsensi(forceRefresh = false) {
  await loadAbsensiFromSupabase(forceRefresh);
  bangunArrayRiwayatDariMap();
  isiOpsiFilterRiwayatBlok();
  terapkanFilterRiwayat();
}

/**
 * Menyaring data Riwayat Absensi berdasarkan Rentang Tanggal, Hari, Jam Ke, Blok, Status, dan Nama Asatidz
 */
export function terapkanFilterRiwayat() {
  if (!store.rawRiwayatAbsensi || store.rawRiwayatAbsensi.length === 0) {
    bangunArrayRiwayatDariMap();
  }

  const tglDari = ($('#flt_rw_tgl_dari').val() || '').trim();
  const tglSampai = ($('#flt_rw_tgl_sampai').val() || '').trim();
  const fHari = ($('#flt_rw_hari').val() || '').trim();
  const fJam = ($('#flt_rw_jam').val() || '').trim();
  const fBlok = ($('#flt_rw_blok').val() || '').trim();
  const fStatus = ($('#flt_rw_status').val() || '').trim();
  const fNama = ($('#flt_rw_nama').val() || '').trim().toLowerCase();

  const filtered = (store.rawRiwayatAbsensi || []).filter(r => {
    const tgl = String(r[2] || '').trim();
    const hari = String(r[3] || '').trim();
    const jam = String(r[4] || '').trim();
    const nama = String(r[5] || '').toLowerCase();
    const nia = String(r[6] || '').toLowerCase();
    const status = String(r[13] || '').trim();
    const blok = formatLabelBlokHariKBM(r[19]);

    if (tglDari && tgl < tglDari) return false;
    if (tglSampai && tgl > tglSampai) return false;
    if (fHari && hari.toLowerCase() !== fHari.toLowerCase()) return false;
    if (fJam && jam.toLowerCase() !== fJam.toLowerCase()) return false;
    if (fBlok && blok.toLowerCase() !== fBlok.toLowerCase()) return false;
    if (fStatus && status.toLowerCase() !== fStatus.toLowerCase()) return false;
    if (fNama && !nama.includes(fNama) && !nia.includes(fNama)) return false;

    return true;
  });

  store.lastRiwayatRowsFiltered = filtered;
  renderTableRiwayat(filtered);
  renderCardViewRiwayat(filtered);
}

/**
 * Mereset seluruh input filter pencarian riwayat ke kondisi awal
 */
export function resetFilterRiwayat() {
  $('#flt_rw_tgl_dari').val('');
  $('#flt_rw_tgl_sampai').val('');
  $('#flt_rw_hari').val('');
  $('#flt_rw_jam').val('');
  $('#flt_rw_blok').val('');
  $('#flt_rw_status').val('');
  $('#flt_rw_nama').val('');
  terapkanFilterRiwayat();
}

/**
 * Mengganti mode tampilan Riwayat Absensi antara 'table' dan 'card'
 */
export function setRiwayatViewMode(mode) {
  store.riwayatViewMode = mode === 'card' ? 'card' : 'table';

  const btnTabel = document.getElementById('btnViewTabelRiwayat');
  const btnKartu = document.getElementById('btnViewKartuRiwayat');

  if (btnTabel && btnKartu) {
    if (store.riwayatViewMode === 'table') {
      btnTabel.classList.remove('btn-outline-success');
      btnTabel.classList.add('btn-success');
      btnKartu.classList.remove('btn-success');
      btnKartu.classList.add('btn-outline-success');
    } else {
      btnKartu.classList.remove('btn-outline-success');
      btnKartu.classList.add('btn-success');
      btnTabel.classList.remove('btn-success');
      btnTabel.classList.add('btn-outline-success');
    }
  }

  if (store.riwayatViewMode === 'table') {
    $('#cardRiwayatWrapper').hide();
    $('#tableRiwayatWrapper').show();
    if (store.dataTableRiwayatAbsensi) {
      setTimeout(() => store.dataTableRiwayatAbsensi.columns.adjust(), 100);
    }
  } else {
    $('#tableRiwayatWrapper').hide();
    $('#cardRiwayatWrapper').show();
    renderCardViewRiwayat(store.lastRiwayatRowsFiltered || store.rawRiwayatAbsensi || []);
  }
}

/**
 * Merender DataTables `#dataTableRiwayatAbsensi` (12 Kolom — Persis Tangkapan Layar Gambar 2)
 */
export function renderTableRiwayat(dataRows) {
  if (store.dataTableRiwayatAbsensi) {
    store.dataTableRiwayatAbsensi.destroy();
    $('#tableBodyRiwayatAbsensi').empty();
  }

  const canEdit = !store.currentUser || store.currentUser.canEdit !== false;
  const rows = [];

  (dataRows || []).forEach((r, i) => {
    const idAbs = r[0];
    const tgl = r[2] || '-';
    const hari = r[3] || '-';
    const jamKe = r[4] || '-';
    const nama = r[5] || '-';
    const nia = r[6] || '-';
    const kelasTampil = formatTampilanKelas(r[10] || '-');
    const fan = r[11] || '-';
    const lokasi = r[12] || '-';
    const status = r[13] || 'Hadir';
    const ket = r[14] || '';
    const menit = r[15] || '';
    const pengganti = r[16] || '';
    const petugas = r[17] || 'Master Administrator';
    const blokVal = formatLabelBlokHariKBM(r[19]);

    const stSlug = String(status).toLowerCase().replace(/\s+/g, '');
    const statusBadge = `<span class="badge badge-status-${stSlug} px-2 py-1">${escHtmlFan_(status)}</span>`;

    const detailKeterangan = [];
    if (ket) detailKeterangan.push(escHtmlFan_(ket));
    if (menit) detailKeterangan.push(`Terlambat: ${escHtmlFan_(menit)} mnt`);
    if (pengganti) detailKeterangan.push(`Pengganti: ${escHtmlFan_(pengganti)}`);
    const infoTambahan = detailKeterangan.join(' | ') || '-';

    const safeId = encodeURIComponent(idAbs).replace(/'/g, '%27');
    const btnAksi = canEdit
      ? `
      <div class="d-flex justify-content-center gap-1">
        <button class="btn btn-sm btn-outline-success py-1 px-2" onclick="window.bukaModalEditAbsensiSatuan('${safeId}')" title="Edit Data Absensi">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger py-1 px-2" onclick="window.konfirmasiHapusAbsensiSatuan('${safeId}')" title="Hapus Data Absensi">
          <i class="bi bi-trash"></i>
        </button>
      </div>`
      : '<span class="text-muted small">-</span>';

    rows.push([
      i + 1,
      `<strong>${escHtmlFan_(tgl)}</strong><br><small class="text-muted">${escHtmlFan_(hari)}</small>`,
      escHtmlFan_(jamKe),
      `<div class="fw-bold text-dark">${escHtmlFan_(nama)}</div><small class="text-muted font-monospace">${escHtmlFan_(nia)}</small>`,
      `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2 py-1">${escHtmlFan_(blokVal)}</span>`,
      `<span class="badge bg-light text-dark border px-2 py-1 fw-semibold">${escHtmlFan_(kelasTampil)}</span>`,
      escHtmlFan_(fan),
      escHtmlFan_(lokasi),
      statusBadge,
      `<span class="small text-muted">${infoTambahan}</span>`,
      `<span class="small">${escHtmlFan_(petugas)}</span>`,
      btnAksi
    ]);
  });

  store.dataTableRiwayatAbsensi = $('#dataTableRiwayatAbsensi').DataTable({
    data: rows,
    scrollX: true,
    scrollCollapse: true,
    autoWidth: true,
    pageLength: 25,
    lengthMenu: [
      [10, 25, 50, 100],
      [10, 25, 50, 100]
    ],
    language: {
      search: 'Cari Cepat:',
      lengthMenu: 'Tampil _MENU_ baris',
      info: 'Menampilkan _START_ - _END_ dari _TOTAL_ rekaman',
      emptyTable: 'Belum ada riwayat absensi yang tercatat.'
    },
    columnDefs: [
      { className: 'text-center', targets: [0, 2, 4, 5, 8, 10, 11] },
      { orderable: false, searchable: false, targets: [0, 11] }
    ],
    order: [],
    initComplete: function () {
      const api = this.api();
      setTimeout(() => api.columns.adjust(), 150);
    },
    drawCallback: function () {
      const api = this.api();
      setTimeout(() => api.columns.adjust(), 100);
    }
  });
}

/**
 * Merender tampilan Mode Kartu pada tab Riwayat & Rekap Data (`#cardRiwayatWrapper`)
 */
export function renderCardViewRiwayat(dataRows) {
  const container = document.getElementById('cardRiwayatWrapper');
  if (!container) return;

  if (!dataRows || dataRows.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-5 text-muted">
        <i class="bi bi-inbox fs-2 d-block mb-2"></i>
        Tidak ada data riwayat absensi yang cocok dengan filter.
      </div>`;
    return;
  }

  const canEdit = !store.currentUser || store.currentUser.canEdit !== false;
  let html = '';

  dataRows.slice(0, 200).forEach(r => {
    const idAbs = r[0];
    const tgl = r[2] || '-';
    const hari = r[3] || '-';
    const jamKe = r[4] || '-';
    const nama = r[5] || '-';
    const nia = r[6] || '-';
    const kelasTampil = formatTampilanKelas(r[10] || '-');
    const fan = r[11] || '-';
    const lokasi = r[12] || '-';
    const status = r[13] || 'Hadir';
    const ket = r[14] || '';
    const menit = r[15] || '';
    const pengganti = r[16] || '';
    const petugas = r[17] || 'Master Administrator';
    const blokVal = formatLabelBlokHariKBM(r[19]);

    const stSlug = String(status).toLowerCase().replace(/\s+/g, '');
    const safeId = encodeURIComponent(idAbs).replace(/'/g, '%27');

    const detailKeterangan = [];
    if (ket) detailKeterangan.push(ket);
    if (menit) detailKeterangan.push(`Terlambat ${menit} mnt`);
    if (pengganti) detailKeterangan.push(`Diganti: ${pengganti}`);

    html += `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card-panel p-3 h-100 d-flex flex-column justify-content-between shadow-xs">
          <div>
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <div class="fw-bold text-dark">${escHtmlFan_(nama)}</div>
                <small class="text-muted font-monospace">NIA: ${escHtmlFan_(nia)}</small>
              </div>
              <span class="badge badge-status-${stSlug} px-2 py-1">${escHtmlFan_(status)}</span>
            </div>

            <div class="d-flex flex-wrap gap-1 mb-2">
              <span class="badge bg-light text-dark border">${escHtmlFan_(hari)}, ${escHtmlFan_(tgl)}</span>
              <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">${escHtmlFan_(jamKe)}</span>
              <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">${escHtmlFan_(blokVal)}</span>
              <span class="badge bg-light text-dark border">${escHtmlFan_(kelasTampil)}</span>
            </div>

            <div class="small text-muted mb-1"><i class="bi bi-book me-1"></i>Fan: <b class="text-dark">${escHtmlFan_(fan)}</b></div>
            <div class="small text-muted mb-1"><i class="bi bi-geo-alt me-1"></i>Lokasi: <b>${escHtmlFan_(lokasi)}</b></div>
            ${
              detailKeterangan.length > 0
                ? `<div class="small text-secondary fst-italic mt-1">${escHtmlFan_(detailKeterangan.join(' • '))}</div>`
                : ''
            }
          </div>

          <div class="d-flex justify-content-between align-items-center border-top pt-2 mt-3">
            <small class="text-muted" style="font-size:11px;">Petugas: ${escHtmlFan_(petugas)}</small>
            ${
              canEdit
                ? `
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-success py-0 px-2" onclick="window.bukaModalEditAbsensiSatuan('${safeId}')">
                <i class="bi bi-pencil-square"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="window.konfirmasiHapusAbsensiSatuan('${safeId}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>`
                : ''
            }
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ============================================================================
// 10. EDIT & HAPUS RIWAYAT ABSENSI SATUAN + EXPORT EXCEL & CETAK REKAP
// ============================================================================

/**
 * Membuka Modal Edit Absensi Satuan (`#modalEditAbsensi`) berdasarkan ID Absensi
 */
export function bukaModalEditAbsensiSatuan(idEncoded) {
  const idAbsensi = decodeURIComponent(idEncoded || '');
  if (!idAbsensi) return;

  const row = (store.rawRiwayatAbsensi || []).find(r => r[0] === idAbsensi);
  if (!row) {
    return Swal.fire({
      icon: 'warning',
      title: 'Data Tidak Ditemukan',
      text: 'Rekaman absensi tersebut tidak ditemukan.'
    });
  }

  populateDatalistPengganti();

  $('#edit_abs_id').val(row[0]);
  $('#edit_abs_nama').text(`${row[5]} (${row[6] || '-'})`);
  $('#edit_abs_detail').text(
    `${row[3]}, ${row[2]} • ${row[4]} • Kelas: ${formatTampilanKelas(row[10] || '-')} • Fan: ${row[11] || '-'}`
  );
  $('#edit_abs_status').val(row[13] || 'Hadir');
  $('#edit_abs_keterangan').val(row[14] || '');
  $('#edit_abs_menit').val(row[15] || '');
  $('#edit_abs_pengganti').val(row[16] || '');

  toggleFormEditAdditionalFields();
  $('#modalEditAbsensi').modal('show');
}

// Alias agar tetap kompatibel dengan pemanggilan fungsi nama lama
export const bukaModalEditAbsensi = bukaModalEditAbsensiSatuan;

/**
 * Menampilkan/menyembunyikan input Menit Terlambat & Nama Pengganti pada `#modalEditAbsensi`
 */
export function toggleFormEditAdditionalFields() {
  const st = $('#edit_abs_status').val() || 'Hadir';
  $('#wrap_edit_terlambat').toggleClass('d-none', st !== 'Terlambat');
  $('#wrap_edit_pengganti').toggleClass('d-none', !['Digantikan', 'Izin', 'Sakit'].includes(st));
}

/**
 * Menyimpan perubahan Edit Absensi Satuan dari `#modalEditAbsensi` ke Supabase
 */
export async function aksiSimpanEditAbsensiSatuan(e) {
  if (e) e.preventDefault();

  const idTarget = $('#edit_abs_id').val();
  const statusBaru = $('#edit_abs_status').val();
  const ketBaru = ($('#edit_abs_keterangan').val() || '').trim();
  const menitBaru = statusBaru === 'Terlambat' ? ($('#edit_abs_menit').val() || '').trim() : '';
  const penggantiBaru = ['Digantikan', 'Izin', 'Sakit'].includes(statusBaru)
    ? ($('#edit_abs_pengganti').val() || '').trim()
    : '';

  if (!idTarget) return;

  const btn = document.getElementById('btnSimpanEditAbs');
  const oriText = btn ? btn.innerHTML : 'Simpan Perubahan';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';
  }

  try {
    const nowStr = formatWaktuSekarangWIB();
    const actorName = store.currentUser?.nama || 'Master Administrator';
    let ditemukan = false;

    Object.keys(store.absensiMapByDate || {}).forEach(bucketKey => {
      if (ditemukan) return;
      const bucket = store.absensiMapByDate[bucketKey];
      if (!bucket || !Array.isArray(bucket.data)) return;

      const idx = bucket.data.findIndex(arr => Array.isArray(arr) && arr[0] === idTarget);
      if (idx > -1) {
        bucket.data[idx][12] = statusBaru;
        bucket.data[idx][13] = ketBaru;
        bucket.data[idx][14] = menitBaru;
        bucket.data[idx][15] = penggantiBaru;
        bucket.data[idx][16] = actorName;
        bucket.data[idx][17] = nowStr;
        bucket.waktuUpdate = nowStr;
        bucket.diinputOleh = actorName;
        ditemukan = true;
      }
    });

    if (!ditemukan) {
      throw new Error('ID rekaman absensi tidak ditemukan di penyimpanan.');
    }

    await saveAbsensiToSupabase(`Mengedit rekaman absensi ID ${idTarget} menjadi status ${statusBaru}`);

    $('#modalEditAbsensi').modal('hide');
    await muatTabelRiwayatAbsensi(false);
    if (store.absensiState.tanggal) {
      await muatAbsensiTanggalTerpilih(true);
    }

    Swal.fire({
      icon: 'success',
      title: 'Berhasil Diperbarui',
      text: 'Data riwayat absensi telah diperbarui.',
      timer: 1400,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Memperbarui',
      text: err.message
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oriText;
    }
  }
}

/**
 * Konfirmasi & hapus 1 rekaman absensi dari Riwayat berdasarkan ID
 */
export function konfirmasiHapusAbsensiSatuan(idEncoded) {
  const idTarget = decodeURIComponent(idEncoded || '');
  if (!idTarget) return;

  const row = (store.rawRiwayatAbsensi || []).find(r => r[0] === idTarget);
  const infoNama = row ? `${row[5]} (${row[2]} - ${row[4]})` : idTarget;

  Swal.fire({
    title: 'Hapus Rekaman Absensi?',
    html: `Apakah Anda yakin ingin menghapus data absensi:<br><b>${escHtmlFan_(infoNama)}</b>?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: '<i class="bi bi-trash me-1"></i> Ya, Hapus',
    cancelButtonText: 'Batal'
  }).then(async r => {
    if (!r.isConfirmed) return;

    try {
      let terhapus = false;
      Object.keys(store.absensiMapByDate || {}).forEach(bucketKey => {
        if (terhapus) return;
        const bucket = store.absensiMapByDate[bucketKey];
        if (!bucket || !Array.isArray(bucket.data)) return;

        const lenAwal = bucket.data.length;
        bucket.data = bucket.data.filter(arr => !Array.isArray(arr) || arr[0] !== idTarget);
        if (bucket.data.length < lenAwal) {
          terhapus = true;
          if (bucket.data.length === 0) {
            delete store.absensiMapByDate[bucketKey];
          }
        }
      });

      if (!terhapus) {
        throw new Error('Data absensi tidak ditemukan.');
      }

      await saveAbsensiToSupabase(`Menghapus rekaman absensi ${infoNama} (ID: ${idTarget})`);
      await muatTabelRiwayatAbsensi(false);
      if (store.absensiState.tanggal) {
        await muatAbsensiTanggalTerpilih(true);
      }

      Swal.fire({
        icon: 'success',
        title: 'Terhapus!',
        text: 'Rekaman absensi berhasil dihapus.',
        timer: 1400,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menghapus',
        text: err.message
      });
    }
  });
}

// Alias kompatibilitas
export const aksiHapusAbsensi = konfirmasiHapusAbsensiSatuan;

/**
 * Mengekspor data Riwayat Absensi yang sedang tampil (terfilter) ke file Excel (.xlsx)
 */
export function exportRiwayatExcel() {
  const rows = store.lastRiwayatRowsFiltered || store.rawRiwayatAbsensi || [];
  if (rows.length === 0) {
    return Swal.fire({
      icon: 'warning',
      title: 'Data Kosong',
      text: 'Tidak ada data riwayat absensi untuk diexport.'
    });
  }

  const wsData = [
    [
      'NO',
      'TANGGAL',
      'HARI',
      'JAM KE',
      'NAMA ASATIDZ',
      'NIA',
      'BLOK',
      'TINGKAT/KELAS',
      'FAN / MAPEL',
      'LOKASI',
      'STATUS',
      'MENIT TERLAMBAT',
      'PENGGANTI',
      'KETERANGAN',
      'PETUGAS INPUT',
      'WAKTU UPDATE'
    ]
  ];

  rows.forEach((r, i) => {
    wsData.push([
      i + 1,
      r[2] || '-',
      r[3] || '-',
      r[4] || '-',
      r[5] || '-',
      r[6] || '-',
      formatLabelBlokHariKBM(r[19]),
      formatTampilanKelas(r[10] || '-'),
      r[11] || '-',
      r[12] || '-',
      r[13] || '-',
      r[15] || '',
      r[16] || '',
      r[14] || '',
      r[17] || '-',
      r[18] || r[1] || '-'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Riwayat_Absensi');
  const tglLabel = store.absensiState.tanggal || new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Riwayat_Absensi_Madin_${tglLabel}.xlsx`);
}

/**
 * Mencetak tabel Riwayat & Rekap Absensi secara terisolasi menggunakan `body.printing-rekap-absensi`
 */
export function cetakRekapAbsensi() {
  document.body.classList.add('printing-rekap-absensi');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-rekap-absensi');
  }, 600);
}
