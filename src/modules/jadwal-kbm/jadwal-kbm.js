import { supabase } from '../../lib/supabase.js';
import { store } from '../../state/store.js';
import { logActivity } from '../audit/audit.js';
import { fetchAllAsatidzFromSupabase } from '../asatidz/asatidz.js';
import { loadFormasiData } from '../formasi/formasi.js';
import {
  loadFanSettingsFromSupabase,
  simpanFanConfigKeServer,
  simpanFanPelajaranDetailKeServer,
  parseFanItemString,
  isKelasUnggulan,
  escHtmlFan_,
  cekKategoriJahAsatidz,
  URUTAN_TINGKAT
} from '../fan/fan.js';

// ============================================================================
// 1. STATE LOKAL & PENYIMPANAN JADWAL KBM KE SUPABASE (TABEL `app_settings`)
// ============================================================================
const KEY_DB_JADWAL_ASATIDZ = 'JADWAL_MENGAJAR_ASATIDZ';
const LS_JADWAL_ASATIDZ = 'MADIN_JADWAL_MENGAJAR_ASATIDZ';

export const LIST_HARI = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'];

let isSedangMemuatKBM = false;
let jadwalKbmLoaded = false;
let currentSwitchKbmMode = 'semua'; // 'semua' | 'reguler' | 'unggulan'
let _timerKlikKlsKBM = null;

// State bersama untuk Klik Kanan KG & Mode Pindah (Cut / Paste) di Bagian 2
let stateContextKG = null;
let stateClipboardKG = null;

/**
 * Membuat objek jadwal kosong standar untuk satu Asatidz
 */
function createEmptyJadwalObj() {
  return {
    mengajar: '',
    sabtu: '',
    ahad: '',
    senin: '',
    selasa: '',
    rabu: '',
    kamis: '',
    totalJam: '0'
  };
}

/**
 * Mengambil objek jadwal milik seorang Asatidz berdasarkan namanya (Case-Insensitive)
 */
export function getJadwalGuru(namaGuru) {
  const key = String(namaGuru || '').trim().toUpperCase();
  if (!key) return createEmptyJadwalObj();
  if (!store.jadwalMengajarMap) store.jadwalMengajarMap = {};
  const existing = store.jadwalMengajarMap[key];
  if (!existing || typeof existing !== 'object') {
    return createEmptyJadwalObj();
  }
  return {
    mengajar: String(existing.mengajar || ''),
    sabtu: String(existing.sabtu || ''),
    ahad: String(existing.ahad || ''),
    senin: String(existing.senin || ''),
    selasa: String(existing.selasa || ''),
    rabu: String(existing.rabu || ''),
    kamis: String(existing.kamis || ''),
    totalJam: String(existing.totalJam || '0')
  };
}

/**
 * Menyimpan objek jadwal seorang Asatidz ke memori `store.jadwalMengajarMap`
 */
export function setJadwalGuru(namaGuru, objJadwal) {
  const key = String(namaGuru || '').trim().toUpperCase();
  if (!key) return;
  if (!store.jadwalMengajarMap) store.jadwalMengajarMap = {};
  store.jadwalMengajarMap[key] = {
    nama_asatidz: String(namaGuru || '').trim(),
    mengajar: String(objJadwal?.mengajar || ''),
    sabtu: String(objJadwal?.sabtu || ''),
    ahad: String(objJadwal?.ahad || ''),
    senin: String(objJadwal?.senin || ''),
    selasa: String(objJadwal?.selasa || ''),
    rabu: String(objJadwal?.rabu || ''),
    kamis: String(objJadwal?.kamis || ''),
    totalJam: String(objJadwal?.totalJam || '0')
  };
}

/**
 * Memuat seluruh data Jadwal Mengajar Asatidz dari tabel `app_settings` di Supabase
 * dengan fallback instan dari localStorage
 */
export async function loadJadwalKbmFromSupabase(forceRefresh = false) {
  if (jadwalKbmLoaded && !forceRefresh) return store.jadwalMengajarMap;

  // 1. Muat dari localStorage terlebih dahulu sebagai fallback cepat
  try {
    const rawLs = localStorage.getItem(LS_JADWAL_ASATIDZ);
    if (rawLs) {
      const parsed = JSON.parse(rawLs);
      if (parsed && typeof parsed === 'object') {
        store.jadwalMengajarMap = parsed;
      }
    }
  } catch (e) {}

  if (!supabase) {
    jadwalKbmLoaded = true;
    return store.jadwalMengajarMap;
  }

  // 2. Ambil data terbaru dari tabel `app_settings` Supabase
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', KEY_DB_JADWAL_ASATIDZ)
      .maybeSingle();

    if (error) throw error;

    if (data && data.value) {
      let val = data.value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) {}
      }
      if (val && typeof val === 'object') {
        store.jadwalMengajarMap = val;
        try {
          localStorage.setItem(LS_JADWAL_ASATIDZ, JSON.stringify(val));
        } catch (e) {}
      }
    }
    jadwalKbmLoaded = true;
  } catch (err) {
    console.error('Gagal memuat Jadwal KBM dari Supabase:', err.message);
  }

  return store.jadwalMengajarMap;
}

/**
 * Menyimpan perubahan jadwal untuk satu atau banyak Asatidz sekaligus secara atomik ke Supabase
 * @param {Object} mapPerubahan - Objek { "NAMA_UPPER": { nama_asatidz, mengajar, sabtu..kamis, totalJam } }
 * @param {String} logDesc - Deskripsi log aktivitas
 */
export async function simpanBatchJadwalAsatidzKeServer(mapPerubahan = {}, logDesc = '') {
  if (!store.jadwalMengajarMap) store.jadwalMengajarMap = {};

  Object.keys(mapPerubahan).forEach(k => {
    const keyUpper = String(k || '').trim().toUpperCase();
    if (!keyUpper) return;
    const item = mapPerubahan[k];
    setJadwalGuru(item.nama_asatidz || keyUpper, item);
  });

  try {
    localStorage.setItem(LS_JADWAL_ASATIDZ, JSON.stringify(store.jadwalMengajarMap));
  } catch (e) {}

  if (!supabase) return true;

  const { error } = await supabase
    .from('app_settings')
    .upsert([{ key: KEY_DB_JADWAL_ASATIDZ, value: store.jadwalMengajarMap }], { onConflict: 'key' });

  if (error) throw error;

  if (logDesc) {
    await logActivity('UPDATE JADWAL KBM', logDesc);
  }
  return true;
}

// ============================================================================
// 2. HELPER STRING, PARSING SEL JADWAL & FORMAT NAMA FAN
// ============================================================================

/**
 * Normalisasi nama kelas universal agar kebal terhadap perbedaan tanda kurung, spasi, dan huruf kapital
 */
export function normalisasiNamaKelas(str) {
  if (!str) return '';
  return String(str).replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Memformat penulisan kelas lama (misal: "ULA 1-B" -> "1 B ULA")
 */
export function formatTampilanKelas(str) {
  if (!str) return '';
  return String(str).replace(/\b(ULA|WUSTHO|ULYA)\s+(\d+)[-\s]+([A-Za-z0-9]+)\b/gi, '$2 $3 $1');
}

/**
 * Memecah sel jadwal guru ("Jam 1 | Fiqih | 1 A ULA (PA) (Gedung)") menjadi array objek slot
 */
export function parseJadwalCell_Client(cellStr) {
  if (!cellStr) return [];
  return String(cellStr)
    .split(/\r?\n|;;/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(line => {
      const p = line.split(' | ');
      let jamNum = 0;
      const m = (p[0] || '').match(/\d+/);
      if (m) jamNum = parseInt(m[0], 10);
      return {
        raw: line,
        jam: jamNum,
        fan: (p[1] && p[1] !== '-') ? p[1].trim() : '',
        lokasi: (p[2] && p[2] !== '-') ? p[2].trim() : ''
      };
    });
}

/**
 * Merakit kembali array objek slot menjadi string sel jadwal guru
 */
export function stringifyJadwalCell_Client(slots) {
  const validSlots = (slots || []).slice().sort((a, b) => a.jam - b.jam);
  return validSlots
    .map(s => `Jam ${s.jam} | ${s.fan || '-'} | ${s.lokasi || '-'}`)
    .join('\n');
}

/**
 * Mengambil nama Fan singkat (contoh: "FIQIH", "TAJWID", "AKHLAQ") untuk ditampilkan di sel Tabel KBM
 * dari teks Fan mentah (contoh: "(Fiqih) Mabadi Fiqih Juz I II III" atau nama kitabnya)
 */
export function ambilNamaFanSingkat(fanRaw, tingkat, kls) {
  if (!fanRaw || fanRaw === '-') return '-';
  const str = String(fanRaw).trim();

  // 1. Jika sudah berformat "(NamaFan) Nama Kitab", ambil NamaFan di dalam kurung
  const parsed = parseFanItemString(str);
  if (parsed.fan && parsed.fan !== '-') {
    return parsed.fan;
  }

  // 2. Cari kecocokan di store.fanConfig pada kelas reguler ("1 ULA")
  const strLower = str.toLowerCase();
  const keyReg = `${String(kls || '').trim()} ${String(tingkat || '').trim().toUpperCase()}`.trim();
  const kandidatList = [...(store.fanConfig?.[keyReg] || [])];

  // Sertakan juga item dari kelas unggulan pada tingkat & kelas yang sama bila ada
  Object.keys(store.fanConfig || {}).forEach(k => {
    if (/\(Ug\)\s*$/i.test(k) && k.toUpperCase().startsWith(String(kls || '').trim().toUpperCase() + ' ')) {
      kandidatList.push(...(store.fanConfig[k] || []));
    }
  });

  for (const item of kandidatList) {
    const p = parseFanItemString(item);
    if (p.fan && p.fan !== '-') {
      if (
        p.fan.toLowerCase() === strLower ||
        p.mapel.toLowerCase() === strLower ||
        String(item).toLowerCase() === strLower
      ) {
        return p.fan;
      }
    }
  }

  return str;
}

/**
 * Pencocokan apakah sebuah teks lokasi slot ("1 A ULA (PA) (Asrama ...)") adalah milik kelas tertentu
 */
export function isSlotMilikKelas(sLokasi, namaKelasLengkap, klsTanpaGender) {
  if (!sLokasi) return false;
  const sNorm = normalisasiNamaKelas(sLokasi);
  const targetNorm = normalisasiNamaKelas(namaKelasLengkap);
  const tanpaNorm = klsTanpaGender ? normalisasiNamaKelas(klsTanpaGender) : '';

  if (sNorm === targetNorm || sNorm.startsWith(targetNorm + ' ')) return true;
  if (tanpaNorm && (sNorm === tanpaNorm || sNorm.startsWith(tanpaNorm + ' '))) return true;
  return false;
}

/**
 * Menghitung label Tahun Ajaran berjalan secara otomatis
 */
export function dapatkanTahunAjaranKBM() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const masehiStart = month >= 6 ? year : year - 1;
  const masehiEnd = masehiStart + 1;
  const hijriStart = masehiStart - 579;
  const hijriEnd = hijriStart + 1;
  return `TAHUN AJARAN ${masehiStart}-${masehiEnd} M / ${hijriStart}-${hijriEnd} H`;
}

// ============================================================================
// 3. ENGINE PENYUSUNAN MATRIKS KELAS & RENDER TABEL JADWAL KBM PER KELAS
// ============================================================================

/**
 * Tombol Segarkan Data Jadwal KBM (Memuat ulang data teraktual dari Supabase)
 */
export async function muatUlangJadwalKBM() {
  if (isSedangMemuatKBM) return;
  isSedangMemuatKBM = true;

  const tbody = document.getElementById('tbodyJadwalKBM');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="21" class="text-center py-5 text-muted">
          <div class="spinner-border text-success spinner-border-sm me-2" role="status"></div>
          <span class="fw-semibold">Menyinkronkan data jadwal KBM terbaru dari Supabase...</span>
        </td>
      </tr>`;
  }

  try {
    store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    await loadFormasiData();
    await loadFanSettingsFromSupabase();
    await loadJadwalKbmFromSupabase(true);
    isSedangMemuatKBM = false;
    await renderJadwalKBM(true);
    Swal.fire({ icon: 'success', title: 'Data Diperbarui', timer: 1000, showConfirmButton: false });
  } catch (err) {
    isSedangMemuatKBM = false;
    Swal.fire({ icon: 'error', title: 'Gagal Menyegarkan', text: err.message, confirmButtonColor: '#0f766e' });
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="21" class="text-center py-4 text-danger">
            <i class="bi bi-exclamation-triangle me-1"></i> Gagal memuat data: ${escHtmlFan_(err.message)}
          </td>
        </tr>`;
    }
  }
}

/**
 * Membangun `store.masterStrukturKelasKBM` dari gabungan `store.globalDataFormasi`,
 * `store.globalDataAsatidz`, dan `store.jadwalMengajarMap`, lalu merender tabel KBM
 */
export async function renderJadwalKBM(alreadyFetched = false) {
  const tbody = document.getElementById('tbodyJadwalKBM');
  if (!tbody) return;

  const labelThn = document.getElementById('kbmTahunAjaran');
  if (labelThn) labelThn.textContent = dapatkanTahunAjaranKBM();

  // Pastikan data Asatidz, Formasi, Fan, & Jadwal sudah dimuat
  if (
    ((!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) &&
      (!store.globalDataFormasi || store.globalDataFormasi.length === 0)) ||
    !jadwalKbmLoaded
  ) {
    if (!alreadyFetched) {
      if (isSedangMemuatKBM) return;
      isSedangMemuatKBM = true;

      tbody.innerHTML = `
        <tr>
          <td colspan="21" class="text-center py-5 text-muted">
            <div class="spinner-border text-success spinner-border-sm me-2" role="status"></div>
            <span class="fw-semibold">Menyiapkan dan menyusun Jadwal KBM per Kelas...</span>
          </td>
        </tr>`;

      try {
        if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
          store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
        }
        if (!store.globalDataFormasi || store.globalDataFormasi.length === 0) {
          await loadFormasiData();
        }
        if (!store.fanConfig || Object.keys(store.fanConfig).length === 0) {
          await loadFanSettingsFromSupabase();
        }
        await loadJadwalKbmFromSupabase();
      } catch (err) {
        isSedangMemuatKBM = false;
        tbody.innerHTML = `
          <tr>
            <td colspan="21" class="text-center py-4 text-danger">
              <i class="bi bi-exclamation-triangle-fill me-1"></i> Gagal memuat data dari server: ${escHtmlFan_(err.message)}
            </td>
          </tr>`;
        return;
      }

      isSedangMemuatKBM = false;
      return renderJadwalKBM(true);
    }
  }

  // 1. Buat kamus profil Asatidz berdasarkan Nama Upper
  const mapAsatidzByName = {};
  (store.globalDataAsatidz || []).forEach(a => {
    const nama = String(a.nama_asatidz || '').trim();
    if (nama) {
      mapAsatidzByName[nama.toUpperCase()] = a;
    }
  });

  const buatObjekKelasKosong = (key, tingkat, kls, bag, papi, lokal = '-') => ({
    key,
    tingkat,
    kls,
    bag,
    papi,
    mustahiqNama: '-',
    mustahiqKG: '-',
    mustahiqJah: '-',
    lokal: lokal || '-',
    jadwal: {
      Sabtu: { 1: [], 2: [] },
      Ahad: { 1: [], 2: [] },
      Senin: { 1: [], 2: [] },
      Selasa: { 1: [], 2: [] },
      Rabu: { 1: [], 2: [] },
      Kamis: { 1: [], 2: [] }
    }
  });

  const mapKelas = {};

  // 2A. Ekstraksi struktur kelas dari Master Formasi Kelas (`store.globalDataFormasi`)
  (store.globalDataFormasi || []).forEach(f => {
    const tingkat = String(f.tingkat || '').trim().toUpperCase();
    const bag = String(f.din_bag || '').trim().toUpperCase();
    const kls = String(f.din_kls || '').trim();
    const papi = String(f.pa_pi || '').trim().toUpperCase();
    const lokal = String(f.lokasi_diniyyah || '').trim();

    if (tingkat && kls && bag) {
      const key = `${kls} ${bag} ${tingkat} ${papi}`.trim();
      if (!mapKelas[key]) {
        mapKelas[key] = buatObjekKelasKosong(key, tingkat, kls, bag, papi, lokal || '-');
      } else if (lokal) {
        mapKelas[key].lokal = lokal;
      }

      // Jika di Formasi ada id_mustahiq, isi sebagai nilai awal (akan disinkronkan dengan data Asatidz)
      if (f.id_mustahiq && String(f.id_mustahiq).trim()) {
        const namaM = String(f.id_mustahiq).trim();
        const profilM = mapAsatidzByName[namaM.toUpperCase()];
        mapKelas[key].mustahiqNama = namaM;
        if (profilM) {
          mapKelas[key].mustahiqKG = String(profilM.nia || '-').trim() || '-';
          mapKelas[key].mustahiqJah = String(profilM.jah_asatidz || '-').trim() || '-';
          if ((!mapKelas[key].lokal || mapKelas[key].lokal === '-') && profilM.lokasi_diniyyah) {
            mapKelas[key].lokal = String(profilM.lokasi_diniyyah).trim();
          }
        }
      }
    }
  });

  // 2B. Ekstraksi & sinkronisasi Mustahiq dari Master Data Asatidz (`store.globalDataAsatidz`)
  (store.globalDataAsatidz || []).forEach(a => {
    const tingkat = String(a.tingkat_asatidz || '').trim().toUpperCase();
    const bag = String(a.din_bag_asatidz || '').trim().toUpperCase();
    const kls = String(a.din_kls_asatidz || '').trim();
    const papi = String(a.pa_pi || '').trim().toUpperCase();
    const namaGuru = String(a.nama_asatidz || '').trim();
    const niaGuru = String(a.nia || '').trim();
    const jahRaw = String(a.jah_asatidz || '').trim();
    const jahLower = jahRaw.toLowerCase();
    const lokal = String(a.lokasi_diniyyah || '').trim();

    if (tingkat && kls && bag) {
      const key = `${kls} ${bag} ${tingkat} ${papi}`.trim();
      if (!mapKelas[key]) {
        mapKelas[key] = buatObjekKelasKosong(key, tingkat, kls, bag, papi, lokal || '-');
      }

      const isMustahiq =
        jahLower.includes('mustahiq') ||
        jahLower.includes('ms & koor') ||
        jahLower.includes("isti'dad") ||
        jahLower === 'ist';

      if (isMustahiq && namaGuru) {
        mapKelas[key].mustahiqNama = namaGuru;
        mapKelas[key].mustahiqKG = niaGuru || '-';
        mapKelas[key].mustahiqJah = jahRaw || '-';
        if (lokal && (!mapKelas[key].lokal || mapKelas[key].lokal === '-')) {
          mapKelas[key].lokal = lokal;
        }
      }
    }
  });

  // 3. Petakan jadwal seluruh Asatidz ke dalam matriks kelas (Jam 1 & Jam 2, Sabtu s/d Kamis)
  const semuaNamaGuruSet = new Set();
  (store.globalDataAsatidz || []).forEach(a => {
    const n = String(a.nama_asatidz || '').trim();
    if (n) semuaNamaGuruSet.add(n);
  });
  Object.keys(store.jadwalMengajarMap || {}).forEach(k => {
    const item = store.jadwalMengajarMap[k];
    const n = String(item?.nama_asatidz || k || '').trim();
    if (n) semuaNamaGuruSet.add(n);
  });

  semuaNamaGuruSet.forEach(namaGuru => {
    const profil = mapAsatidzByName[namaGuru.toUpperCase()];
    const namaResmi = profil ? String(profil.nama_asatidz || namaGuru).trim() : namaGuru;
    const niaGuru = profil ? String(profil.nia || '').trim() : '-';
    const jahGuru = profil ? String(profil.jah_asatidz || '').trim() : '-';
    const jdwObj = getJadwalGuru(namaResmi);

    LIST_HARI.forEach(hari => {
      const hariKey = hari.toLowerCase();
      const valJadwal = jdwObj[hariKey] || '';
      if (!String(valJadwal).trim()) return;

      const lines = formatTampilanKelas(valJadwal)
        .split(/\r?\n|;;/)
        .map(s => s.trim())
        .filter(Boolean);

      lines.forEach(line => {
        const p = line.split(' | ');
        const jamStr = p[0] || '';
        const fan = (p[1] && p[1] !== '-') ? p[1].trim() : '';
        const rawLok = (p[2] && p[2] !== '-') ? p[2].trim() : '';

        const matchJam = jamStr.match(/\d+/);
        const jamNum = matchJam ? parseInt(matchJam[0], 10) : 0;
        if (jamNum !== 1 && jamNum !== 2) return;

        // Buang nama gedung/ruang paling akhir di dalam tanda kurung
        // Contoh: "1 A ULA (PA) (Asrama Al-Barokah Bawah)" -> "1 A ULA (PA)"
        let klsMurniDariRawLok = rawLok;
        const matchStripLokasi = rawLok.match(/^(.*?)\s*\(([^()]*)\)$/);
        if (matchStripLokasi) {
          const isiKurungAkhir = matchStripLokasi[2].trim().toUpperCase();
          if (isiKurungAkhir !== 'PA' && isiKurungAkhir !== 'PI' && isiKurungAkhir !== 'UG') {
            klsMurniDariRawLok = matchStripLokasi[1].trim();
          }
        }
        const klsMurniNorm = normalisasiNamaKelas(klsMurniDariRawLok);

        Object.keys(mapKelas).forEach(kKey => {
          const itemKls = mapKelas[kKey];
          const genderTagItem = itemKls.papi ? ` (${itemKls.papi})` : '';
          const formatFullKelas = `${itemKls.kls} ${itemKls.bag} ${itemKls.tingkat}${genderTagItem}`.trim();
          const fullKelasNorm = normalisasiNamaKelas(formatFullKelas);

          if (klsMurniNorm === fullKelasNorm) {
            const fanTampil = ambilNamaFanSingkat(fan, itemKls.tingkat, itemKls.kls);
            // Batasi Jam 1 & 2 hanya 1 Asatidz per slot kelas
            if (mapKelas[kKey].jadwal[hari][jamNum].length === 0) {
              mapKelas[kKey].jadwal[hari][jamNum].push({
                kg: niaGuru || '-',
                fan: fanTampil || '-',
                fanAsli: fan,
                guru: namaResmi,
                jah: jahGuru,
                lokasiGabungan: rawLok
              });
            }
          }
        });
      });
    });
  });

  // 4. Urutkan kelas secara rapi: Tingkat (ULA -> WUSTHO -> ULYA -> ISTI'DAD) -> PA/PI -> Kelas -> Bagian
  store.masterStrukturKelasKBM = Object.values(mapKelas).sort((a, b) => {
    const ordA = URUTAN_TINGKAT[a.tingkat] || 99;
    const ordB = URUTAN_TINGKAT[b.tingkat] || 99;
    if (ordA !== ordB) return ordA - ordB;
    if (a.papi !== b.papi) return a.papi.localeCompare(b.papi);
    if (a.kls !== b.kls) return a.kls.localeCompare(b.kls, undefined, { numeric: true });
    return a.bag.localeCompare(b.bag);
  });

  filterTabelKBM();
}

/**
 * Handler tombol switch kategori Jadwal KBM ('semua' | 'reguler' | 'unggulan')
 */
export function setSwitchJadwalKBM(mode) {
  currentSwitchKbmMode = mode;
  $('#btnSwitchKbmSemua').attr(
    'class',
    mode === 'semua' ? 'btn btn-success fw-bold px-3 py-1' : 'btn btn-outline-success fw-bold px-3 py-1'
  );
  $('#btnSwitchKbmReguler').attr(
    'class',
    mode === 'reguler' ? 'btn btn-success fw-bold px-3 py-1' : 'btn btn-outline-success fw-bold px-3 py-1'
  );
  $('#btnSwitchKbmUnggulan').attr(
    'class',
    mode === 'unggulan' ? 'btn btn-success fw-bold px-3 py-1' : 'btn btn-outline-success fw-bold px-3 py-1'
  );

  const labelStatus =
    mode === 'semua'
      ? 'Semua Kelas'
      : mode === 'reguler'
        ? 'Kelas Reguler Saja'
        : 'Kelas Unggulan (Ug) Saja';
  $('#badgeStatusKbmFilter').html(`Kategori: <b>${labelStatus}</b>`);
  filterTabelKBM();
}

/**
 * Menyaring dan merender isi `#tbodyJadwalKBM` (2 baris per kelas: Jam 1 dan Jam 2)
 */
export function filterTabelKBM() {
  const tbody = document.getElementById('tbodyJadwalKBM');
  if (!tbody) return;

  const fltTingkat = document.getElementById('flt_kbm_tingkat')?.value || '';
  const fltGender = document.getElementById('flt_kbm_gender')?.value || '';
  const fltSearch = (document.getElementById('flt_kbm_search')?.value || '').toLowerCase().trim();

  const listTampil = (store.masterStrukturKelasKBM || []).filter(k => {
    if (fltTingkat && k.tingkat !== fltTingkat) return false;
    if (fltGender && k.papi !== fltGender) return false;

    const namaKelasMurni = `${k.kls} ${k.bag} ${k.tingkat}`.trim();
    const isUg = isKelasUnggulan(namaKelasMurni);
    if (currentSwitchKbmMode === 'reguler' && isUg) return false;
    if (currentSwitchKbmMode === 'unggulan' && !isUg) return false;

    if (fltSearch) {
      let textToSearch = `${k.kls} ${k.bag} ${k.tingkat} ${k.mustahiqNama} ${k.mustahiqKG} ${k.mustahiqJah || ''} ${k.lokal || ''}`.toLowerCase();
      LIST_HARI.forEach(hari => {
        [1, 2].forEach(jam => {
          const sesiList = k.jadwal[hari]?.[jam] || [];
          sesiList.forEach(s => {
            textToSearch += ` ${s.guru} ${s.kg} ${s.fan} ${s.fanAsli || ''} ${s.jah || ''}`.toLowerCase();
          });
        });
      });
      if (!textToSearch.includes(fltSearch)) return false;
    }
    return true;
  });

  if (listTampil.length === 0) {
    let pesanKosong = 'Tidak ada data kelas yang cocok dengan filter.';
    if (currentSwitchKbmMode === 'unggulan') {
      pesanKosong = '<i class="bi bi-star text-warning me-1"></i> Tidak ada kelas berlabel Unggulan yang cocok. Tetapkan status unggulan pada menu Formasi Kelas.';
    }
    tbody.innerHTML = `<tr><td colspan="21" class="text-center py-4 text-muted">${pesanKosong}</td></tr>`;
    return;
  }

  let html = '';
  listTampil.forEach((k, idx) => {
    const no = idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`;
    let klsDisplay = `${escHtmlFan_(k.kls)} ${escHtmlFan_(k.bag)}`;
    const namaKelasMurni = `${k.kls} ${k.bag} ${k.tingkat}`.trim();
    const isUg = isKelasUnggulan(namaKelasMurni);

    if (isUg) {
      klsDisplay += ` <span class="badge bg-warning text-dark border ms-1" style="font-size:9px;" title="Kelas Unggulan"><i class="bi bi-star-fill text-danger me-1"></i>Ug</span>`;
    }

    let badgeTingkatClass = 'badge-tingkat-ula';
    if (k.tingkat === 'WUSTHO') badgeTingkatClass = 'badge-tingkat-wustho';
    else if (k.tingkat === 'ULYA') badgeTingkatClass = 'badge-tingkat-ulya';

    const encKey = encodeURIComponent(k.key).replace(/'/g, '%27');

    const renderCellKBM = (sesiList, hari, jam) => {
      const isCutCell = !!(
        stateClipboardKG &&
        stateClipboardKG.kelasKey === k.key &&
        stateClipboardKG.hari === hari &&
        parseInt(stateClipboardKG.jam, 10) === parseInt(jam, 10)
      );
      const cutClass = isCutCell ? 'cell-kg-cut-active' : '';

      if (!sesiList || sesiList.length === 0) {
        return `
          <td class="cell-kg cell-kg-clickable text-muted ${cutClass}"
              data-kelas="${encKey}" data-hari="${hari}" data-jam="${jam}" data-guru="" data-kg="" data-fan=""
              oncontextmenu="window.handleContextMenuKG(event, this)"
              ontouchstart="window.handleTouchStartKG(event, this)"
              ontouchmove="window.handleTouchMoveKG(event, this)"
              ontouchend="window.handleTouchEndKG(event, this)"
              ondblclick="window.handleDblClickKG(event, this)"
              title="[Kosong] Klik kanan / Ketuk 2x di HP untuk atur jadwal">-</td>
          <td class="text-center text-muted">-</td>`;
      }

      const j = sesiList[0];
      const safeGuru = encodeURIComponent(j.guru || '');
      const safeKg = encodeURIComponent(j.kg || '');
      const safeFan = encodeURIComponent(j.fanAsli || j.fan || '');

      return `
        <td class="cell-kg cell-kg-clickable text-dark ${cutClass}"
            data-kelas="${encKey}" data-hari="${hari}" data-jam="${jam}"
            data-guru="${safeGuru}" data-kg="${safeKg}" data-fan="${safeFan}"
            oncontextmenu="window.handleContextMenuKG(event, this)"
            ontouchstart="window.handleTouchStartKG(event, this)"
            ontouchmove="window.handleTouchMoveKG(event, this)"
            ontouchend="window.handleTouchEndKG(event, this)"
            ondblclick="window.handleDblClickKG(event, this)"
            title="Asatidz: ${escHtmlFan_(j.guru)} (${escHtmlFan_(j.kg)}) &#10;Klik Kanan di PC / Ketuk 2x di HP untuk opsi">${escHtmlFan_(j.kg)}</td>
        <td class="fw-semibold text-uppercase text-center" style="font-size:11px;" title="Kitab: ${escHtmlFan_(j.fanAsli || j.fan)}">${escHtmlFan_(j.fan)}</td>`;
    };

    // Baris Jam 1
    html += `<tr>`;
    html += `<td rowspan="2" class="text-center fw-bold cell-klik-kelas" onclick="window.bukaDetailKelasKBM('${encKey}')" title="Klik untuk lihat detail kelas">${no}</td>`;
    html += `<td rowspan="2" class="text-center fw-bold text-success cell-klik-kelas" onclick="window.handleKlikKlsKBM('${encKey}', event)" ondblclick="window.bukaModalInputJadwalKelas('${encKey}', 1)" title="Klik 2x: Isi Jadwal Kelas | Klik 1x: Detail Kelas">${klsDisplay} <i class="bi bi-pencil-square text-muted" style="font-size:9px;"></i></td>`;
    html += `<td rowspan="2" class="text-center cell-klik-kelas" onclick="window.bukaDetailKelasKBM('${encKey}')">${escHtmlFan_(k.papi)}</td>`;
    html += `<td rowspan="2" class="text-center cell-klik-kelas" onclick="window.bukaDetailKelasKBM('${encKey}')"><span class="${badgeTingkatClass}">${escHtmlFan_(k.tingkat)}</span></td>`;
    html += `<td class="text-center fw-bold bg-light">1</td>`;

    LIST_HARI.forEach(hari => {
      html += renderCellKBM(k.jadwal[hari][1], hari, 1);
    });

    html += `<td rowspan="2" class="fw-semibold">${escHtmlFan_(k.mustahiqNama)}</td>`;
    html += `<td rowspan="2" class="cell-kg" title="Mustahiq: ${escHtmlFan_(k.mustahiqNama)}">${escHtmlFan_(k.mustahiqKG)}</td>`;
    html += `<td rowspan="2" class="small">${escHtmlFan_(k.lokal)}</td>`;
    html += `</tr>`;

    // Baris Jam 2
    html += `<tr>`;
    html += `<td class="text-center fw-bold bg-light">2</td>`;
    LIST_HARI.forEach(hari => {
      html += renderCellKBM(k.jadwal[hari][2], hari, 2);
    });
    html += `</tr>`;
  });

  tbody.innerHTML = html;
}

/**
 * Mendeteksi Klik 1x (Buka Detail Kelas) vs Klik 2x dalam < 280ms (Buka Isi Jadwal Kelas) pada kolom KLS
 */
export function handleKlikKlsKBM(kelasKeyEncoded, event) {
  if (event) {
    event.stopPropagation();
  }

  if (_timerKlikKlsKBM) {
    clearTimeout(_timerKlikKlsKBM);
    _timerKlikKlsKBM = null;
    if (typeof window.bukaModalInputJadwalKelas === 'function') {
      window.bukaModalInputJadwalKelas(kelasKeyEncoded, 1);
    }
  } else {
    _timerKlikKlsKBM = setTimeout(function () {
      _timerKlikKlsKBM = null;
      bukaDetailKelasKBM(kelasKeyEncoded);
    }, 280);
  }
}

// ============================================================================
// 4. MODAL DETAIL KELAS, HAPUS JADWAL PER JAM, EXPORT EXCEL & CETAK
// ============================================================================

/**
 * Menampilkan Pop-Up Modal Detail Kelas KBM (#modalDetailKelasKBM)
 */
export function bukaDetailKelasKBM(encodedKey) {
  const key = decodeURIComponent(encodedKey);
  const k = (store.masterStrukturKelasKBM || []).find(item => item.key === key);
  if (!k) return;

  $('#mdl_kelas_title').html(`Detail Kelas: <span class="text-warning">${escHtmlFan_(k.kls)} ${escHtmlFan_(k.bag)} ${escHtmlFan_(k.tingkat)} (${escHtmlFan_(k.papi)})</span>`);
  $('#mdl_kelas_mustahiq').text(k.mustahiqNama || '-');
  $('#mdl_kelas_kg').text(k.mustahiqKG || '-');
  $('#mdl_kelas_lokal').text(k.lokal || 'Belum diatur');

  // Kumpulkan seluruh Asatidz yang mengajar di kelas ini
  const mapGuru = {};
  LIST_HARI.forEach(hari => {
    [1, 2].forEach(jam => {
      const rawSesi = k.jadwal[hari]?.[jam];
      const sesiList = Array.isArray(rawSesi) ? rawSesi : rawSesi ? [rawSesi] : [];
      sesiList.forEach(sesi => {
        if (sesi && sesi.guru && sesi.guru !== '-') {
          if (!mapGuru[sesi.guru]) {
            mapGuru[sesi.guru] = {
              nama: sesi.guru,
              kg: sesi.kg || '-',
              mapel: new Set()
            };
          }
          mapGuru[sesi.guru].mapel.add(`${sesi.fan} (${hari} J${jam})`);
        }
      });
    });
  });

  let htmlGuru = '';
  const guruKeys = Object.keys(mapGuru);
  if (guruKeys.length === 0) {
    htmlGuru = '<span class="text-muted fst-italic small">Belum ada data asatidz mengajar yang dijadwalkan di kelas ini.</span>';
  } else {
    guruKeys.forEach(nama => {
      const g = mapGuru[nama];
      const listMapel = Array.from(g.mapel).join(', ');
      htmlGuru += `
        <div class="border rounded p-2 px-3 bg-light d-flex flex-column" style="min-width: 220px;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-bold text-dark small">${escHtmlFan_(g.nama)}</span>
            <span class="badge bg-secondary font-monospace" style="font-size:10px;">${escHtmlFan_(g.kg)}</span>
          </div>
          <small class="text-success fw-semibold" style="font-size:11px;">Mengajar: ${escHtmlFan_(listMapel)}</small>
        </div>`;
    });
  }
  $('#mdl_kelas_daftar_guru').html(htmlGuru);

  // Render tabel rincian jadwal harian Jam 1 & Jam 2
  const encKeySafe = encodeURIComponent(k.key).replace(/'/g, '%27');
  let htmlJadwal = '';
  [1, 2].forEach(jam => {
    htmlJadwal += `<tr>
      <td class="bg-light p-2 text-center" style="vertical-align: middle; min-width: 95px;">
        <div class="d-flex flex-column align-items-center justify-content-center gap-1">
          <button type="button" class="btn btn-sm btn-outline-success fw-bold py-1 px-2 w-100 shadow-xs" style="font-size:11px;"
            onclick="window.bukaModalInputJadwalKelas('${encKeySafe}', ${jam})"
            title="Klik untuk isi / atur Asatidz &amp; Fan Jam 1 &amp; Jam 2">
            <i class="bi bi-pencil-square me-1"></i>Jam ${jam}
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 w-100 mt-1" style="font-size:11px;"
            onclick="window.konfirmasiHapusJadwalJamKelas('${encKeySafe}', ${jam})"
            title="Hapus seluruh pengajar dan fan Jam ${jam} (Sabtu s/d Kamis)">
            <i class="bi bi-trash3 me-1"></i>Hapus
          </button>
        </div>
      </td>`;

    LIST_HARI.forEach(hari => {
      const rawSesi = k.jadwal[hari]?.[jam];
      const sesiList = Array.isArray(rawSesi) ? rawSesi : rawSesi ? [rawSesi] : [];
      if (sesiList.length > 0) {
        const s = sesiList[0];
        htmlJadwal += `
          <td>
            <div>
              <div class="fw-bold text-dark">${escHtmlFan_(s.fan || '-')}</div>
              <div class="small text-muted" style="font-size:10px;">
                ${escHtmlFan_(s.guru)} <b class="text-primary">(${escHtmlFan_(s.kg || '-')})</b>
              </div>
            </div>
          </td>`;
      } else {
        htmlJadwal += `<td class="text-muted">-</td>`;
      }
    });
    htmlJadwal += `</tr>`;
  });
  $('#mdl_kelas_body_jadwal').html(htmlJadwal);

  $('#modalDetailKelasKBM').modal('show');
}

/**
 * Menghapus seluruh jadwal (Pengajar & Fan) pada Jam 1 atau Jam 2 (Sabtu s/d Kamis) untuk kelas tertentu
 */
export async function konfirmasiHapusJadwalJamKelas(kelasKeyEncoded, jamNum) {
  if (store.currentUser && store.currentUser.canEdit === false) {
    return Swal.fire({
      icon: 'error',
      title: 'Akses Ditolak',
      text: 'Anda tidak memiliki hak akses untuk menghapus jadwal.'
    });
  }

  const kelasKey = decodeURIComponent(kelasKeyEncoded);
  const k = (store.masterStrukturKelasKBM || []).find(item => item.key === kelasKey);
  if (!k) return;

  const targetJam = parseInt(jamNum, 10);
  const genderTag = k.papi ? `(${k.papi})` : '';
  const namaKelasLengkap = `${k.kls} ${k.bag} ${k.tingkat} ${genderTag}`.trim();
  const klsTanpaGender = `${k.kls} ${k.bag} ${k.tingkat}`.trim();

  const asatidzAffected = new Set();
  LIST_HARI.forEach(hari => {
    const sesiHari = k.jadwal[hari]?.[targetJam];
    const sesiList = Array.isArray(sesiHari) ? sesiHari : sesiHari ? [sesiHari] : [];
    sesiList.forEach(s => {
      if (s.guru && s.guru !== '-') asatidzAffected.add(s.guru);
    });
  });

  Object.keys(store.jadwalMengajarMap || {}).forEach(keyUpper => {
    const jdw = getJadwalGuru(keyUpper);
    for (const hari of LIST_HARI) {
      const slots = parseJadwalCell_Client(jdw[hari.toLowerCase()]);
      if (slots.some(s => s.jam === targetJam && isSlotMilikKelas(s.lokasi, namaKelasLengkap, klsTanpaGender))) {
        asatidzAffected.add(store.jadwalMengajarMap[keyUpper]?.nama_asatidz || keyUpper);
        break;
      }
    }
  });

  if (asatidzAffected.size === 0) {
    return Swal.fire({
      icon: 'info',
      title: 'Jadwal Sudah Kosong',
      text: `Tidak ada jadwal pengajar pada Jam ${targetJam} di kelas ini.`
    });
  }

  const confirmRes = await Swal.fire({
    title: `Hapus Jadwal Jam ${targetJam}?`,
    html: `Apakah Anda yakin ingin menghapus seluruh pengajar dan fan pada <b>Jam ${targetJam}</b> untuk kelas <b>${escHtmlFan_(namaKelasLengkap)}</b> (Sabtu s/d Kamis)?<br><br><span class="text-danger fw-bold">Semua data pada jam ini akan dikosongkan.</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: '<i class="bi bi-trash3-fill me-1"></i> Ya, Hapus Semua',
    cancelButtonText: 'Batal'
  });

  if (!confirmRes.isConfirmed) return;

  Swal.fire({ title: 'Menghapus Jadwal...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const mapPerubahan = {};

    asatidzAffected.forEach(guruNama => {
      const jdw = getJadwalGuru(guruNama);
      const dayValues = {};

      LIST_HARI.forEach(hari => {
        const hLower = hari.toLowerCase();
        let slots = parseJadwalCell_Client(jdw[hLower]);
        slots = slots.filter(s => {
          if (s.jam !== targetJam) return true;
          return !isSlotMilikKelas(s.lokasi, namaKelasLengkap, klsTanpaGender);
        });
        dayValues[hLower] = stringifyJadwalCell_Client(slots);
      });

      let totalJam = 0;
      LIST_HARI.forEach(hari => {
        totalJam += parseJadwalCell_Client(dayValues[hari.toLowerCase()]).length;
      });

      let mengajarArr = formatTampilanKelas(jdw.mengajar || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const masihAdaSlotDiKelasIni = LIST_HARI.some(hari =>
        parseJadwalCell_Client(dayValues[hari.toLowerCase()]).some(s =>
          isSlotMilikKelas(s.lokasi, namaKelasLengkap, klsTanpaGender)
        )
      );
      if (!masihAdaSlotDiKelasIni) {
        mengajarArr = mengajarArr.filter(m => !isSlotMilikKelas(m, namaKelasLengkap, klsTanpaGender));
      }

      mapPerubahan[guruNama.toUpperCase()] = {
        nama_asatidz: guruNama,
        mengajar: mengajarArr.join(', '),
        sabtu: dayValues.sabtu,
        ahad: dayValues.ahad,
        senin: dayValues.senin,
        selasa: dayValues.selasa,
        rabu: dayValues.rabu,
        kamis: dayValues.kamis,
        totalJam: String(totalJam)
      };
    });

    await simpanBatchJadwalAsatidzKeServer(
      mapPerubahan,
      `Menghapus jadwal Jam ${targetJam} kelas ${namaKelasLengkap}`
    );

    await renderJadwalKBM(true);
    bukaDetailKelasKBM(kelasKeyEncoded);

    Swal.fire({
      icon: 'success',
      title: 'Berhasil Dikosongkan!',
      text: `Seluruh jadwal Jam ${targetJam} kelas ${namaKelasLengkap} telah dihapus.`,
      timer: 1500,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: err.message });
  }
}

/**
 * Export Excel Tabel Jadwal KBM Per Kelas (.xlsx)
 */
export function exportJadwalKBMExcel() {
  if (!store.masterStrukturKelasKBM || store.masterStrukturKelasKBM.length === 0) {
    return Swal.fire('Data Kosong', 'Jadwal KBM belum selesai dimuat.', 'warning');
  }

  const header1 = ['NO', 'KLS', 'PI/PA', 'TINGKAT', 'JAM'];
  LIST_HARI.forEach(h => {
    header1.push(h.toUpperCase(), '');
  });
  header1.push('MUSTAHIQ', 'KG', 'LOKAL');

  const header2 = ['', '', '', '', ''];
  LIST_HARI.forEach(() => {
    header2.push('KG', 'FAN/KITAB');
  });
  header2.push('', '', '');

  const aoaData = [header1, header2];

  store.masterStrukturKelasKBM.forEach((k, idx) => {
    const noStr = idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`;
    const klsDisplay = `${k.kls} ${k.bag}`;

    // Baris Jam 1
    const rowJ1 = [noStr, klsDisplay, k.papi, k.tingkat, '1'];
    LIST_HARI.forEach(h => {
      const sesi = k.jadwal[h]?.[1] || [];
      if (sesi.length > 0) {
        rowJ1.push(sesi.map(s => s.kg).join(' / '), sesi.map(s => s.fan).join(' / '));
      } else {
        rowJ1.push('-', '-');
      }
    });
    rowJ1.push(k.mustahiqNama, k.mustahiqKG, k.lokal);
    aoaData.push(rowJ1);

    // Baris Jam 2
    const rowJ2 = ['', '', '', '', '2'];
    LIST_HARI.forEach(h => {
      const sesi = k.jadwal[h]?.[2] || [];
      if (sesi.length > 0) {
        rowJ2.push(sesi.map(s => s.kg).join(' / '), sesi.map(s => s.fan).join(' / '));
      } else {
        rowJ2.push('-', '-');
      }
    });
    rowJ2.push('', '', '');
    aoaData.push(rowJ2);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoaData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Jadwal_KBM');
  XLSX.writeFile(wb, 'Jadwal_KBM_Madrasah_Diniyyah.xlsx');
}

/**
 * Cetak Dokumen Resmi Jadwal KBM Per Kelas (Landscape Terisolasi)
 */
export function cetakJadwalKBM() {
  document.body.classList.add('printing-jadwal-kbm');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-jadwal-kbm');
  }, 600);
}

// ============================================================================
// 5. HELPER MANIPULASI OBJEK JADWAL GURU (REMOVE, ADD, & SYNC TOTAL JAM)
// ============================================================================

/**
 * Menghapus 1 slot jadwal milik kelas tertentu pada hari & jam tertentu dari objek jadwal guru
 */
export function removeSlotFromGuruObj(jdwObj, hari, jam, kelasMurniNorm) {
  const dayIdx = LIST_HARI.findIndex(h => h.toLowerCase() === String(hari || '').toLowerCase());
  if (dayIdx === -1) return;
  const hKey = HARI_KEYS_LOWER[dayIdx];
  const targetJam = parseInt(jam, 10);

  let slots = parseJadwalCell_Client(jdwObj[hKey]);
  slots = slots.filter(s => {
    if (s.jam !== targetJam) return true;
    const sLokNorm = normalisasiNamaKelas(s.lokasi);
    return sLokNorm !== kelasMurniNorm && !sLokNorm.startsWith(kelasMurniNorm);
  });
  jdwObj[hKey] = stringifyJadwalCell_Client(slots);
}

/**
 * Menambahkan / menimpa 1 slot jadwal pada hari & jam tertentu ke dalam objek jadwal guru
 */
export function addSlotToGuruObj(jdwObj, hari, jam, fan, lokasiGabungan) {
  const dayIdx = LIST_HARI.findIndex(h => h.toLowerCase() === String(hari || '').toLowerCase());
  if (dayIdx === -1) return;
  const hKey = HARI_KEYS_LOWER[dayIdx];
  const targetJam = parseInt(jam, 10);

  let slots = parseJadwalCell_Client(jdwObj[hKey]);
  slots = slots.filter(s => s.jam !== targetJam);
  slots.push({
    jam: targetJam,
    fan: fan || '-',
    lokasi: lokasiGabungan || '-'
  });
  slots.sort((a, b) => a.jam - b.jam);
  jdwObj[hKey] = stringifyJadwalCell_Client(slots);
}

/**
 * Menghitung ulang daftar kelas `mengajar` dan `totalJam` pada objek jadwal guru
 */
export function syncGuruMengajarAndTotalObj(jdwObj) {
  let total = 0;
  const classesSet = new Set();

  HARI_KEYS_LOWER.forEach(hKey => {
    const slots = parseJadwalCell_Client(jdwObj[hKey]);
    total += slots.length;
    slots.forEach(s => {
      if (s.lokasi && s.lokasi !== '-') {
        const m = s.lokasi.match(/^(.*?)\s*\(([^()]*)\)$/);
        classesSet.add(m ? m[1].trim() : s.lokasi.trim());
      }
    });
  });

  jdwObj.totalJam = String(total);

  let existing = formatTampilanKelas(jdwObj.mengajar || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  classesSet.forEach(cls => {
    if (!existing.some(ex => normalisasiNamaKelas(ex) === normalisasiNamaKelas(cls))) {
      existing.push(cls);
    }
  });

  // Cek apakah guru ini adalah Mustahiq (memiliki kelas asal di master Asatidz)
  const namaUpper = String(jdwObj.nama_asatidz || '').trim().toUpperCase();
  const rowAsatidz = (store.globalDataAsatidz || []).find(
    a => String(a.nama_asatidz || '').trim().toUpperCase() === namaUpper
  );
  const isMustahiq = rowAsatidz
    ? String(rowAsatidz.jah_asatidz || '').toLowerCase().includes('mustahiq')
    : false;
  const ownClass =
    isMustahiq && rowAsatidz
      ? `${rowAsatidz.din_kls_asatidz || ''} ${rowAsatidz.din_bag_asatidz || ''} ${rowAsatidz.tingkat_asatidz || ''}`.trim()
      : '';

  existing = existing.filter(cls => {
    if (isMustahiq && ownClass && normalisasiNamaKelas(cls) === normalisasiNamaKelas(ownClass)) {
      return true;
    }
    return (
      classesSet.has(cls) ||
      Array.from(classesSet).some(cs => normalisasiNamaKelas(cs) === normalisasiNamaKelas(cls))
    );
  });

  jdwObj.mengajar = existing.join(', ');
}

// ============================================================================
// 6. ENGINE PRE-CACHING & MODAL "ISI JADWAL KELAS" (#modalInputJadwalKelas)
// ============================================================================
let _cacheModalJik = {
  kelasKey: '',
  primaryFanKey: '',
  fallbackFanKey: '',
  listFanKelas: [],
  listSemuaFan: [],
  mapFanKeAsatidz: {},
  mapAsatidzKeFan: {},
  setSemuaAsatidz: new Set(),
  mapBusyAll: {}
};
let _timerDebounceJik = null;

/**
 * Mengecek apakah sebuah Fan berstatus pengajar === 'MS' pada kelasKey yang diberikan
 */
export function cekFanMSuntukKelas(primaryFanKey, fallbackFanKey, valFan) {
  if (!valFan || !store.fanPelajaranDetail || !store.fanPelajaranDetail.item) return false;
  const valLower = String(valFan).trim().toLowerCase();
  if (!valLower) return false;

  function cariDiKey(key) {
    if (!key) return false;
    let ditemukan = false;
    Object.keys(store.fanPelajaranDetail.item).forEach(iKey => {
      if (ditemukan) return;
      if (iKey.indexOf(key + '||') !== 0) return;
      const rawItem = iKey.substring((key + '||').length);
      const parsed = parseFanItemString(rawItem);
      const fanName = parsed.fan && parsed.fan !== '-' ? parsed.fan : parsed.mapel;
      const cocok =
        rawItem.toLowerCase() === valLower ||
        (fanName && fanName.toLowerCase() === valLower) ||
        (parsed.mapel && parsed.mapel.toLowerCase() === valLower);
      if (cocok) {
        const det = store.fanPelajaranDetail.item[iKey];
        if (det && det.pengajar === 'MS') ditemukan = true;
      }
    });
    return ditemukan;
  }

  return cariDiKey(primaryFanKey) || cariDiKey(fallbackFanKey);
}

/**
 * Mengambil informasi batas jam maksimal mingguan suatu Fan dari `store.fanPelajaranDetail`
 */
export function dapatkanBatasJamFan(kelasKey, fanInput) {
  if (!fanInput || !String(fanInput).trim()) return null;
  const fanInputClean = String(fanInput).replace(/[()]/g, '').trim().toLowerCase();
  const listConfig = (store.fanConfig && store.fanConfig[kelasKey]) || [];

  const targetRawItem = listConfig.find(item => {
    const rawClean = String(item).replace(/[()]/g, '').trim().toLowerCase();
    const parsed = parseFanItemString(item);
    return (
      rawClean === fanInputClean ||
      parsed.fan.toLowerCase() === fanInputClean ||
      parsed.mapel.toLowerCase() === fanInputClean ||
      rawClean.includes(fanInputClean) ||
      fanInputClean.includes(parsed.mapel.toLowerCase())
    );
  });

  if (!targetRawItem) return null;

  const itemKey = `${kelasKey}||${targetRawItem}`;
  const itemDetail = store.fanPelajaranDetail?.item?.[itemKey];
  const maxJam =
    itemDetail && itemDetail.jam !== undefined && itemDetail.jam !== ''
      ? parseInt(itemDetail.jam, 10)
      : null;

  return {
    rawItem: targetRawItem,
    maxJam: isNaN(maxJam) || maxJam === null ? null : maxJam
  };
}

/**
 * Membangun cache Fan kelas, relasi Fan <-> Asatidz, dan peta guru sibuk dalam 1x pemindaian
 */
export function siapkanCacheModalJadwalKelas(k) {
  _cacheModalJik.kelasKey = k.key;
  const namaKelasMurni = `${k.kls} ${k.bag} ${k.tingkat}`.trim();
  const isUg = isKelasUnggulan(namaKelasMurni);
  _cacheModalJik.primaryFanKey = isUg ? `${namaKelasMurni} (Ug)` : `${k.kls} ${k.tingkat}`;
  _cacheModalJik.fallbackFanKey = `${k.kls} ${k.tingkat}`;
  _cacheModalJik.listFanKelas = [];
  _cacheModalJik.listSemuaFan = [];
  _cacheModalJik.mapFanKeAsatidz = {};
  _cacheModalJik.mapAsatidzKeFan = {};
  _cacheModalJik.setSemuaAsatidz = new Set();

  function ekstrakFanDariKey(targetKey) {
    if (!store.fanPelajaranDetail || !store.fanPelajaranDetail.item) return;
    Object.keys(store.fanPelajaranDetail.item).forEach(iKey => {
      if (iKey.startsWith(targetKey + '||')) {
        const itemDetail = store.fanPelajaranDetail.item[iKey];
        const rawItem = iKey.substring(targetKey.length + 2);
        const parsed = parseFanItemString(rawItem);
        const fanName = parsed.fan && parsed.fan !== '-' ? parsed.fan : parsed.mapel || rawItem;
        const gurus = Array.isArray(itemDetail.asatidz) ? itemDetail.asatidz : [];

        if (!_cacheModalJik.listFanKelas.some(f => f.fan === fanName || f.rawItem === rawItem)) {
          _cacheModalJik.listFanKelas.push({
            fan: fanName,
            mapel: parsed.mapel || '',
            rawItem,
            asatidz: gurus
          });
          if (!_cacheModalJik.listSemuaFan.includes(fanName)) {
            _cacheModalJik.listSemuaFan.push(fanName);
          }

          gurus.forEach(g => {
            const gNama = String(g || '').trim();
            if (gNama) {
              _cacheModalJik.setSemuaAsatidz.add(gNama);
              const gUpper = gNama.toUpperCase();
              if (!_cacheModalJik.mapAsatidzKeFan[gUpper]) _cacheModalJik.mapAsatidzKeFan[gUpper] = [];
              if (!_cacheModalJik.mapAsatidzKeFan[gUpper].includes(fanName)) {
                _cacheModalJik.mapAsatidzKeFan[gUpper].push(fanName);
              }
            }
          });

          const fLower = fanName.toLowerCase();
          _cacheModalJik.mapFanKeAsatidz[fLower] = gurus;
          if (parsed.mapel) _cacheModalJik.mapFanKeAsatidz[parsed.mapel.toLowerCase()] = gurus;
        }
      }
    });
  }

  ekstrakFanDariKey(_cacheModalJik.primaryFanKey);
  if (isUg) ekstrakFanDariKey(_cacheModalJik.fallbackFanKey);

  const configFans =
    store.fanConfig[_cacheModalJik.primaryFanKey] ||
    (isUg ? store.fanConfig[_cacheModalJik.fallbackFanKey] : null) ||
    [];

  configFans.forEach(rawItem => {
    const parsed = parseFanItemString(rawItem);
    const fanName = parsed.fan && parsed.fan !== '-' ? parsed.fan : parsed.mapel || rawItem;
    if (!_cacheModalJik.listSemuaFan.includes(fanName)) {
      _cacheModalJik.listSemuaFan.push(fanName);
      _cacheModalJik.listFanKelas.push({
        fan: fanName,
        mapel: parsed.mapel || '',
        rawItem,
        asatidz: []
      });
    }
  });

  // Pindai seluruh guru yang sudah terjadwal di kelas lain pada 6 Hari x 2 Jam
  _cacheModalJik.mapBusyAll = {};
  LIST_HARI.forEach(h => {
    _cacheModalJik.mapBusyAll[`${h}_1`] = {};
    _cacheModalJik.mapBusyAll[`${h}_2`] = {};
  });

  (store.masterStrukturKelasKBM || []).forEach(kOther => {
    if (kOther.key === k.key) return;
    LIST_HARI.forEach(h => {
      [1, 2].forEach(j => {
        const sesiList = (kOther.jadwal && kOther.jadwal[h] && kOther.jadwal[h][j]) || [];
        sesiList.forEach(s => {
          if (s.guru && s.guru !== '-') {
            const labelKls = `${kOther.kls} ${kOther.bag || ''} ${kOther.tingkat} (${kOther.papi})`
              .replace(/\s+/g, ' ')
              .trim();
            _cacheModalJik.mapBusyAll[`${h}_${j}`][s.guru.trim().toUpperCase()] = labelKls;
          }
        });
      });
    });
  });
}

export function onInputDebounceJik(el, jam, hari, sumber) {
  clearTimeout(_timerDebounceJik);
  _timerDebounceJik = setTimeout(() => {
    sinkronkanJadwalKelasHari(jam, hari, sumber, false);
  }, 220);
}

export function onChangeJik(el, jam, hari, sumber) {
  clearTimeout(_timerDebounceJik);
  if (sumber === 'asatidz') {
    cekBentrokAsatidz(el);
  } else if (sumber === 'fan') {
    validasiInputFanJadwalKelas(el);
  }
  sinkronkanJadwalKelasHari(jam, hari, sumber, true);
}

/**
 * Sinkronisasi dua arah Datalist Asatidz <-> Fan/Mapel pada Modal Isi Jadwal Kelas
 */
export function sinkronkanJadwalKelasHari(jam, hari, sumber, isChangeEvent = false) {
  const jamNum = parseInt(jam, 10);
  const k = (store.masterStrukturKelasKBM || []).find(item => item.key === _cacheModalJik.kelasKey);
  if (!k) return;

  const suffix = `${jamNum}_${hari}`;
  const inputAsatidz = document.getElementById('jik_asatidz_' + suffix);
  const inputFan = document.getElementById('jik_fan_' + suffix);
  const dlAsatidz = document.getElementById('dl_jik_asatidz_' + suffix);
  const dlFan = document.getElementById('dl_jik_fan_' + suffix);
  if (!inputAsatidz || !inputFan || !dlAsatidz || !dlFan) return;

  const rawAsatidz = (inputAsatidz.value || '').trim();
  const cleanAsatidz = rawAsatidz.replace(/^\[TERPAKAI di [^\]]+\]\s*/i, '').trim().toUpperCase();
  const valFan = (inputFan.value || '').trim();
  const mapBusy = _cacheModalJik.mapBusyAll[`${hari}_${jamNum}`] || {};

  const renderDatalistAsatidz = arrNamaGuru => {
    const namaMS = k.mustahiqNama && k.mustahiqNama !== '-' ? k.mustahiqNama.trim() : '';
    const listPakai =
      arrNamaGuru && arrNamaGuru.length > 0
        ? arrNamaGuru
        : _cacheModalJik.setSemuaAsatidz.size > 0
        ? Array.from(_cacheModalJik.setSemuaAsatidz)
        : (store.globalDataAsatidz || []).map(a => a.nama_asatidz).filter(Boolean);

    let html = '';
    if (namaMS) {
      html += `<option value="${escHtmlFan_(namaMS)}" label="⭐ [MUSTAHIQ KELAS] ${escHtmlFan_(namaMS)}"></option>`;
    }
    listPakai.forEach(namaGuru => {
      if (namaMS && String(namaGuru).trim().toUpperCase() === namaMS.toUpperCase()) return;
      const namaUpper = String(namaGuru).trim().toUpperCase();
      const kelasLain = mapBusy[namaUpper];
      if (kelasLain) {
        html += `<option value="[TERPAKAI di ${escHtmlFan_(kelasLain)}] ${escHtmlFan_(namaGuru)}"></option>`;
      } else {
        html += `<option value="${escHtmlFan_(namaGuru)}"></option>`;
      }
    });

    if (dlAsatidz.getAttribute('data-last-html') !== html) {
      dlAsatidz.innerHTML = html;
      dlAsatidz.setAttribute('data-last-html', html);
    }
  };

  // SKENARIO A: Perubahan kolom ASATIDZ
  if (sumber === 'asatidz' || sumber === 'init') {
    if (cleanAsatidz) {
      const fansGuru = _cacheModalJik.mapAsatidzKeFan[cleanAsatidz] || [];
      if (fansGuru.length > 0) {
        const htmlFan = fansGuru.map(f => `<option value="${escHtmlFan_(f)}"></option>`).join('');
        if (dlFan.getAttribute('data-last-html') !== htmlFan) {
          dlFan.innerHTML = htmlFan;
          dlFan.setAttribute('data-last-html', htmlFan);
        }
        inputFan.placeholder = 'Pilih Fan yang diajar...';
        if (isChangeEvent && fansGuru.length === 1 && !valFan) {
          inputFan.value = fansGuru[0];
          validasiInputFanJadwalKelas(inputFan);
        }
      } else {
        const htmlFan = _cacheModalJik.listSemuaFan.map(f => `<option value="${escHtmlFan_(f)}"></option>`).join('');
        if (dlFan.getAttribute('data-last-html') !== htmlFan) {
          dlFan.innerHTML = htmlFan;
          dlFan.setAttribute('data-last-html', htmlFan);
        }
        inputFan.placeholder = 'Ketik / Pilih Fan...';
      }
    } else {
      const htmlFan = _cacheModalJik.listSemuaFan.map(f => `<option value="${escHtmlFan_(f)}"></option>`).join('');
      if (dlFan.getAttribute('data-last-html') !== htmlFan) {
        dlFan.innerHTML = htmlFan;
        dlFan.setAttribute('data-last-html', htmlFan);
      }
      inputFan.placeholder = 'Ketik / Pilih Fan / Mapel...';
    }
  }

  // SKENARIO B: Perubahan kolom FAN / MAPEL
  if (sumber === 'fan' || sumber === 'init') {
    if (valFan) {
      const valFanLower = valFan.toLowerCase();
      let guruFan = _cacheModalJik.mapFanKeAsatidz[valFanLower] || [];
      if (guruFan.length === 0) {
        const matchItem = _cacheModalJik.listFanKelas.find(
          f =>
            f.fan.toLowerCase() === valFanLower ||
            f.mapel.toLowerCase() === valFanLower ||
            f.rawItem.toLowerCase().includes(valFanLower) ||
            valFanLower.includes(f.fan.toLowerCase())
        );
        if (matchItem) guruFan = matchItem.asatidz || [];
      }

      if (guruFan.length > 0) {
        renderDatalistAsatidz(guruFan);
        inputAsatidz.placeholder = 'Pilih Asatidz pengajar fan ini...';
        if (isChangeEvent && guruFan.length === 1 && !cleanAsatidz) {
          const calonGuru = guruFan[0];
          const calonUpper = calonGuru.trim().toUpperCase();
          if (!mapBusy[calonUpper]) {
            inputAsatidz.value = calonGuru;
            cekBentrokAsatidz(inputAsatidz);
          }
        }
      } else {
        renderDatalistAsatidz([]);
        inputAsatidz.placeholder = 'Belum ada asatidz diatur untuk fan ini...';
      }
    } else {
      renderDatalistAsatidz(Array.from(_cacheModalJik.setSemuaAsatidz));
      inputAsatidz.placeholder = 'Ketik / Pilih Asatidz...';
    }

    // Auto-Assign Mustahiq jika Fan berstatus wajib MS
    if (isChangeEvent && sumber === 'fan' && valFan) {
      const isMSFan = cekFanMSuntukKelas(_cacheModalJik.primaryFanKey, _cacheModalJik.fallbackFanKey, valFan);
      const namaMS = k.mustahiqNama && k.mustahiqNama !== '-' ? k.mustahiqNama.trim() : '';
      if (isMSFan && namaMS) {
        inputAsatidz.value = namaMS;
        cekBentrokAsatidz(inputAsatidz);
        $(inputAsatidz).css({
          'border-color': '#16a34a',
          'box-shadow': '0 0 0 3px rgba(22,163,74,0.25)',
          transition: 'box-shadow 0.35s ease, border-color 0.35s ease'
        });
        setTimeout(() => {
          $(inputAsatidz).css({ 'border-color': '', 'box-shadow': '' });
        }, 1300);
      }
    }
  }
}

/**
 * Validasi batas jam maksimal Fan mingguan pada Modal Isi Jadwal Kelas
 */
export function validasiInputFanJadwalKelas(inputEl) {
  const fanVal = ($(inputEl).val() || '').trim();
  if (!fanVal) return;

  const kelasKey = $('#jik_kelas_key').val();
  const k = (store.masterStrukturKelasKBM || []).find(item => item.key === kelasKey);
  if (!k) return;

  const namaKelasMurni = `${k.kls} ${k.bag} ${k.tingkat}`.trim();
  const isUg = isKelasUnggulan(namaKelasMurni);
  const keyUtama = isUg ? `${namaKelasMurni} (Ug)` : `${k.kls} ${k.tingkat}`;
  const keyCadangan = `${k.kls} ${k.tingkat}`;

  const resolveFan = nilai => {
    let info = dapatkanBatasJamFan(keyUtama, nilai);
    if (!info && isUg) info = dapatkanBatasJamFan(keyCadangan, nilai);
    return info;
  };

  const fanInfo = resolveFan(fanVal);
  if (!fanInfo || fanInfo.maxJam === null) return;
  const maxBatas = fanInfo.maxJam;

  let totalPakai = 0;
  [1, 2].forEach(j => {
    LIST_HARI.forEach(h => {
      const v = ($(`#jik_fan_${j}_${h}`).val() || '').trim();
      if (!v) return;
      const mi = resolveFan(v);
      if (mi && mi.rawItem === fanInfo.rawItem) totalPakai++;
    });
  });

  if (totalPakai > maxBatas) {
    Swal.fire({
      icon: 'warning',
      title: '⚠️ MELEBIHI BATAS JAM!',
      html:
        `Fan/Mata Pelajaran <b>"${escHtmlFan_(fanVal)}"</b> hanya dialokasikan maksimal <b>${maxBatas} Jam</b> tiap minggu untuk kelas ini.<br><br>` +
        `Total jam yang Anda masukkan (Jam 1 &amp; Jam 2) sudah mencapai <b>${totalPakai} Jam</b>.`,
      confirmButtonColor: '#0f766e'
    });
    $(inputEl).val('');
    $(inputEl).focus();
  }
}

/**
 * Mencegah pemilihan Asatidz yang sedang mengajar di kelas lain pada hari & jam yang sama
 */
export function cekBentrokAsatidz(inputEl) {
  if (!inputEl) return;
  const val = inputEl.value || '';
  const match = val.match(/^\[TERPAKAI di (.+?)\]\s*(.+)$/);

  if (match) {
    const namaKelasLain = match[1];
    const namaAsatidz = match[2];
    const hari = inputEl.getAttribute('data-hari') || '-';
    const jamBadge = inputEl.getAttribute('data-jam') || '-';

    Swal.fire({
      icon: 'warning',
      title: '⚠️ TIDAK BISA DIPILIH!',
      html: `<b>${escHtmlFan_(namaAsatidz)}</b> sudah memiliki jadwal mengajar di <b class="text-danger">${escHtmlFan_(namaKelasLain)}</b> pada hari <b>${escHtmlFan_(hari)}</b> Jam <b>${escHtmlFan_(jamBadge)}</b>.`,
      confirmButtonColor: '#0f766e',
      confirmButtonText: 'Mengerti'
    });

    inputEl.value = '';
    inputEl.focus();
  }
}

/**
 * Membuka Modal "Isi Jadwal Kelas" (`#modalInputJadwalKelas`) untuk Jam 1 & Jam 2 sekaligus
 */
export function bukaModalInputJadwalKelas(kelasKeyEncoded, jamNum) {
  if (store.currentUser && store.currentUser.canEdit === false) {
    Swal.fire({
      icon: 'info',
      title: 'Hanya Melihat',
      text: 'Peran Anda hanya memiliki izin untuk melihat Jadwal KBM.',
      timer: 1800,
      showConfirmButton: false
    });
    return;
  }

  const kelasKey = decodeURIComponent(kelasKeyEncoded || '');
  const jamFokus = parseInt(jamNum, 10) === 2 ? 2 : 1;
  const k = (store.masterStrukturKelasKBM || []).find(item => item.key === kelasKey);
  if (!k) return;

  siapkanCacheModalJadwalKelas(k);

  const genderTag = k.papi ? `(${k.papi})` : '';
  const namaKelasLengkap = `${k.kls} ${k.bag} ${k.tingkat} ${genderTag}`.trim();
  $('#jik_kelas_key').val(kelasKey);
  $('#jik_jam_fokus').val(jamFokus);
  $('#jik_kelas_nama').text(namaKelasLengkap);

  [1, 2].forEach(jam => {
    let htmlBaris = '';
    LIST_HARI.forEach(hari => {
      const sesiHari = k.jadwal[hari] && k.jadwal[hari][jam];
      const sesiList = Array.isArray(sesiHari) ? sesiHari : sesiHari ? [sesiHari] : [];
      let namaTerisi = '';
      let fanTerisi = '';
      if (sesiList.length > 0) {
        namaTerisi = sesiList[0].guru || '';
        fanTerisi = sesiList[0].fanAsli || sesiList[0].fan || '';
        if (fanTerisi === '-') fanTerisi = '';
      }

      htmlBaris += `
        <tr>
          <td class="text-center fw-bold text-success align-middle">${hari}</td>
          <td>
            <input type="text" class="form-control form-control-sm" id="jik_asatidz_${jam}_${hari}"
              value="${escHtmlFan_(namaTerisi)}" list="dl_jik_asatidz_${jam}_${hari}"
              placeholder="Ketik / Pilih Asatidz..."
              data-hari="${hari}" data-jam="${jam}" autocomplete="off"
              oninput="window.onInputDebounceJik(this, ${jam}, '${hari}', 'asatidz')"
              onchange="window.onChangeJik(this, ${jam}, '${hari}', 'asatidz')">
            <datalist id="dl_jik_asatidz_${jam}_${hari}"></datalist>
          </td>
          <td>
            <input type="text" class="form-control form-control-sm" id="jik_fan_${jam}_${hari}"
              value="${escHtmlFan_(fanTerisi)}" list="dl_jik_fan_${jam}_${hari}"
              placeholder="Ketik / Pilih Fan / Mapel..."
              data-hari="${hari}" data-jam="${jam}" autocomplete="off"
              oninput="window.onInputDebounceJik(this, ${jam}, '${hari}', 'fan')"
              onchange="window.onChangeJik(this, ${jam}, '${hari}', 'fan')">
            <datalist id="dl_jik_fan_${jam}_${hari}"></datalist>
          </td>
          <td class="text-center align-middle">
            <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1"
              onclick="window.hapusInputJikHari(${jam}, '${hari}')" title="Kosongkan ${hari} Jam ${jam}">
              <i class="bi bi-x-lg"></i>
            </button>
          </td>
        </tr>`;
    });
    $(`#jik_body_jam_${jam}`).html(htmlBaris);
  });

  [1, 2].forEach(jam => {
    LIST_HARI.forEach(hari => sinkronkanJadwalKelasHari(jam, hari, 'init', false));
  });

  $('#jik_box_jam_1, #jik_box_jam_2').removeClass('border-success border-2');
  $(`#jik_box_jam_${jamFokus}`).addClass('border-success border-2');
  $('#modalInputJadwalKelas').modal('show');

  setTimeout(() => {
    const el = document.getElementById(`jik_box_jam_${jamFokus}`);
    if (el && window.innerWidth < 1200) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 350);
}

export function hapusInputJikHari(jam, hari) {
  const inputAsatidz = document.getElementById(`jik_asatidz_${jam}_${hari}`);
  const inputFan = document.getElementById(`jik_fan_${jam}_${hari}`);

  if (inputAsatidz) {
    inputAsatidz.value = '';
    inputAsatidz.placeholder = 'Ketik / Pilih Asatidz...';
  }
  if (inputFan) {
    inputFan.value = '';
    inputFan.placeholder = 'Ketik / Pilih Fan / Mapel...';
  }

  sinkronkanJadwalKelasHari(jam, hari, 'init');
}

export function kosongkanSemuaJadwalKelas() {
  Swal.fire({
    title: 'Kosongkan Semua Jadwal?',
    text: 'Kosongkan seluruh isian Fan & Asatidz untuk Jam 1 dan Jam 2 dari Sabtu s/d Kamis?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: '<i class="bi bi-trash3 me-1"></i> Ya, Kosongkan',
    cancelButtonText: 'Batal'
  }).then(r => {
    if (!r.isConfirmed) return;

    [1, 2].forEach(jam => {
      LIST_HARI.forEach(hari => hapusInputJikHari(jam, hari));
    });

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Semua isian Jam 1 & 2 dikosongkan. Tekan "Simpan Jadwal" untuk menerapkan.',
      showConfirmButton: false,
      timer: 2600
    });
  });
}

/**
 * Menyimpan seluruh input jadwal Jam 1 & Jam 2 (Sabtu s/d Kamis) dari `#modalInputJadwalKelas`
 * secara atomik ke Supabase
 */
export async function simpanJadwalDariKelas() {
  const kelasKey = $('#jik_kelas_key').val();
  const k = (store.masterStrukturKelasKBM || []).find(item => item.key === kelasKey);
  if (!k) return;

  const JAM_LIST = [1, 2];
  const genderTag = k.papi ? `(${k.papi})` : '';
  const namaKelasLengkap = `${k.kls} ${k.bag} ${k.tingkat} ${genderTag}`.trim();
  const klsTanpaGender = `${k.kls} ${k.bag} ${k.tingkat}`.trim();
  const lokasiKelas = k.lokal && k.lokal !== '-' ? k.lokal : '-';
  const lokasiGabungan = `${namaKelasLengkap} (${lokasiKelas})`;

  // 1. Baca seluruh input Jam 1 & Jam 2 (Sabtu s/d Kamis)
  const assignmentBaru = { 1: {}, 2: {} };
  let adaInputTerblokir = false;
  const namaTakDikenal = [];

  JAM_LIST.forEach(jam => {
    LIST_HARI.forEach(hari => {
      let rawAsatidz = ($(`#jik_asatidz_${jam}_${hari}`).val() || '').trim();
      if (/^\[TERPAKAI di /i.test(rawAsatidz)) {
        adaInputTerblokir = true;
        rawAsatidz = '';
        $(`#jik_asatidz_${jam}_${hari}`).val('');
      }
      const fan = ($(`#jik_fan_${jam}_${hari}`).val() || '').trim();

      let namaFinal = rawAsatidz;
      if (rawAsatidz) {
        const rowMaster = (store.globalDataAsatidz || []).find(
          a => String(a.nama_asatidz || '').trim().toUpperCase() === rawAsatidz.toUpperCase()
        );
        if (rowMaster) namaFinal = String(rowMaster.nama_asatidz).trim();
        else namaTakDikenal.push(`${hari} Jam ${jam}: ${rawAsatidz}`);
      }
      assignmentBaru[jam][hari] = { asatidz: namaFinal, fan };
    });
  });

  if (adaInputTerblokir) {
    return Swal.fire({
      icon: 'error',
      title: 'Input Tidak Valid',
      text: 'Terdapat input Asatidz yang masih berstatus bentrok. Silakan perbaiki dahulu sebelum menyimpan.',
      confirmButtonColor: '#0f766e'
    });
  }

  if (namaTakDikenal.length > 0) {
    return Swal.fire({
      icon: 'error',
      title: 'Nama Asatidz Tidak Dikenal',
      html: `Nama berikut tidak ditemukan di Database Asatidz:<br><div class="text-start small mt-2">${namaTakDikenal
        .map(n => '• ' + escHtmlFan_(n))
        .join('<br>')}</div>`,
      confirmButtonColor: '#0f766e'
    });
  }

  // 2. Kumpulkan seluruh Asatidz yang terdampak (baik pengajar lama maupun baru)
  const affected = new Map();
  const tambahAffected = n => {
    const s = String(n || '').trim();
    if (s && s !== '-') affected.set(s.toUpperCase(), s);
  };

  JAM_LIST.forEach(jam => {
    LIST_HARI.forEach(hari => {
      const sesiHari = k.jadwal[hari] && k.jadwal[hari][jam];
      const sesiList = Array.isArray(sesiHari) ? sesiHari : sesiHari ? [sesiHari] : [];
      sesiList.forEach(s => tambahAffected(s.guru));
      tambahAffected(assignmentBaru[jam][hari].asatidz);
    });
  });

  Object.values(store.jadwalMengajarMap || {}).forEach(jdw => {
    const guruNama = String(jdw?.nama_asatidz || '').trim();
    if (!guruNama) return;
    for (const hKey of HARI_KEYS_LOWER) {
      const slots = parseJadwalCell_Client(jdw[hKey]);
      if (
        slots.some(
          s => JAM_LIST.includes(s.jam) && isSlotMilikKelas(s.lokasi, namaKelasLengkap, klsTanpaGender)
        )
      ) {
        tambahAffected(guruNama);
        break;
      }
    }
  });

  if (affected.size === 0) {
    $('#modalInputJadwalKelas').modal('hide');
    return;
  }

  // 3. Susun payload baru & validasi tidak ada bentrok
  const payloads = [];
  const daftarBentrok = [];

  affected.forEach((namaAsli, keyUpper) => {
    const jdwObj = getJadwalGuru(namaAsli);

    LIST_HARI.forEach((hari, idx) => {
      const hKey = HARI_KEYS_LOWER[idx];
      let slots = parseJadwalCell_Client(jdwObj[hKey] || '');

      // Hapus slot lama kelas ini pada Jam 1 & Jam 2
      slots = slots.filter(s => {
        if (!JAM_LIST.includes(s.jam)) return true;
        return !isSlotMilikKelas(s.lokasi, namaKelasLengkap, klsTanpaGender);
      });

      // Masukkan slot baru jika guru ini ditugaskan pada form
      JAM_LIST.forEach(jam => {
        const a = assignmentBaru[jam][hari];
        if (a.asatidz && a.asatidz.toUpperCase() === keyUpper) {
          if (slots.some(s => s.jam === jam)) {
            daftarBentrok.push(`${namaAsli} sudah mengajar di kelas lain pada ${hari} Jam ${jam}`);
          } else {
            slots.push({ jam, fan: a.fan || '-', lokasi: lokasiGabungan });
          }
        }
      });

      slots.sort((a, b) => a.jam - b.jam);
      jdwObj[hKey] = stringifyJadwalCell_Client(slots);
    });

    syncGuruMengajarAndTotalObj(jdwObj);
    payloads.push(jdwObj);
  });

  if (daftarBentrok.length > 0) {
    return Swal.fire({
      icon: 'error',
      title: 'Jadwal Bentrok',
      html: `<div class="text-start small">${daftarBentrok.map(b => '• ' + escHtmlFan_(b)).join('<br>')}</div>`,
      confirmButtonColor: '#0f766e'
    });
  }

  // 4. Simpan ke Supabase dalam satu batch atomik
  const btn = document.getElementById('btnSimpanJadwalKelas');
  const oriText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';
    btn.disabled = true;
  }

  try {
    await simpanBatchJadwalAsatidzKeServer(
      payloads,
      `Memperbarui jadwal Jam 1 & 2 kelas ${namaKelasLengkap}`
    );

    $('#modalInputJadwalKelas').modal('hide');
    await renderJadwalKBM(true);

    Swal.fire({
      icon: 'success',
      title: 'Tersimpan!',
      text: `Jadwal Jam 1 & 2 kelas ${namaKelasLengkap} berhasil diperbarui.`,
      timer: 1500,
      showConfirmButton: false
    });

    if ($('#modalDetailKelasKBM').hasClass('show')) {
      setTimeout(() => {
        bukaDetailKelasKBM(encodeURIComponent(kelasKey));
      }, 300);
    }
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Menyimpan',
      text: err.message
    });
  } finally {
    if (btn) {
      btn.innerHTML = oriText;
      btn.disabled = false;
    }
  }
}

// ============================================================================
// 7. ENGINE KLIK KANAN SEL KG, MODE PINDAH (CUT & PASTE), & SMART AUTO-SYNC FAN
// ============================================================================
let kgLastTapTime = 0;
let kgLastTapElem = null;
let kgTouchStartX = 0;
let kgTouchStartY = 0;
let kgIsTouchScrolling = false;
let _timerDebounceSlotKG = null;

/**
 * Memastikan elemen Floating Bar Mode Pindah tersedia di DOM
 */
export function ensureFloatingBarClipboardKG() {
  let bar = document.getElementById('floatingBarClipboardKG');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'floatingBarClipboardKG';
    bar.className = 'floating-bar-clipboard-kg no-print-kbm';
    document.body.appendChild(bar);
  }
  return bar;
}

/**
 * Menerapkan highlight berkedip kuning-merah pada sel KG sumber yang sedang di-Cut
 */
export function terapkanHighlightClipboardKG() {
  $('.tabel-kbm-resmi .cell-kg-clickable').removeClass('cell-kg-cut-active');
  if (!stateClipboardKG) return;
  $('.tabel-kbm-resmi .cell-kg-clickable').each(function () {
    const kKey = decodeURIComponent(this.getAttribute('data-kelas') || '');
    const h = this.getAttribute('data-hari') || '';
    const j = parseInt(this.getAttribute('data-jam') || '0', 10);
    if (
      kKey === stateClipboardKG.kelasKey &&
      h === stateClipboardKG.hari &&
      j === parseInt(stateClipboardKG.jam, 10)
    ) {
      $(this).addClass('cell-kg-cut-active');
    }
  });
}

/**
 * Mengaktifkan Mode Pindah (Cut) saat tombol "Pindah Ke" pada Context Menu diklik
 */
export function mulaiModePindahKG() {
  $('#contextMenuKG').hide();
  if (!stateContextKG || !stateContextKG.guru) return;

  stateClipboardKG = {
    kelasKey: stateContextKG.kelasKey,
    classObj: stateContextKG.classObj,
    hari: stateContextKG.hari,
    jam: parseInt(stateContextKG.jam, 10),
    guru: stateContextKG.guru,
    kg: stateContextKG.kg,
    fan: stateContextKG.fan || '-'
  };

  terapkanHighlightClipboardKG();

  const k = stateClipboardKG.classObj;
  const fanTampil = ambilNamaFanSingkat(stateClipboardKG.fan, k.tingkat, k.kls);
  const labelKelas = `${k.kls} ${k.bag} ${k.tingkat} (${k.papi})`;

  const bar = ensureFloatingBarClipboardKG();
  bar.innerHTML = `
    <div class="d-flex align-items-center gap-2 text-truncate">
      <span class="badge bg-warning text-dark fw-bold"><i class="bi bi-scissors me-1"></i>CUT</span>
      <span class="fw-semibold text-truncate">
        Mode Pindah: <b class="text-warning">${escHtmlFan_(stateClipboardKG.guru)}</b>
        (${escHtmlFan_(fanTampil)}) - ${escHtmlFan_(labelKelas)} ${escHtmlFan_(stateClipboardKG.hari)} Jam ${stateClipboardKG.jam}
      </span>
    </div>
    <button type="button" class="btn btn-sm btn-danger fw-bold py-1 px-3 rounded-pill flex-shrink-0" onclick="window.batalkanModePindahKG()">
      <i class="bi bi-x-circle me-1"></i>Batal (Esc)
    </button>
  `;
  bar.style.display = 'flex';
}

/**
 * Membatalkan Mode Pindah (Cut) & membersihkan highlight
 */
export function batalkanModePindahKG() {
  stateClipboardKG = null;
  $('.tabel-kbm-resmi .cell-kg-clickable').removeClass('cell-kg-cut-active');
  const bar = document.getElementById('floatingBarClipboardKG');
  if (bar) bar.style.display = 'none';
  $('#contextMenuKG').hide();
}

/**
 * Membuka Context Menu KG (Mode Normal maupun Pop-Up Tempel saat Cut aktif)
 */
export function bukaContextMenuKG(tdEl, clientX, clientY) {
  if (store.currentUser && store.currentUser.canEdit === false) return;

  const kelasKey = decodeURIComponent(tdEl.getAttribute('data-kelas') || '');
  const hari = tdEl.getAttribute('data-hari') || '';
  const jam = parseInt(tdEl.getAttribute('data-jam') || '1', 10);
  const guru = decodeURIComponent(tdEl.getAttribute('data-guru') || '');
  const kg = decodeURIComponent(tdEl.getAttribute('data-kg') || '');
  const fan = decodeURIComponent(tdEl.getAttribute('data-fan') || '');

  const k = (store.masterStrukturKelasKBM || []).find(item => item.key === kelasKey);
  if (!k) return;

  stateContextKG = {
    kelasKey,
    classObj: k,
    hari,
    jam,
    guru,
    kg,
    fan
  };

  const menu = $('#contextMenuKG');
  const isSameAsSource = !!(
    stateClipboardKG &&
    stateClipboardKG.kelasKey === kelasKey &&
    stateClipboardKG.hari === hari &&
    parseInt(stateClipboardKG.jam, 10) === jam
  );

  // SKENARIO 1: POP-UP MENU TEMPEL (Saat stateClipboardKG aktif & bukan slot sumber)
  if (stateClipboardKG && !isSameAsSource) {
    const srcK = stateClipboardKG.classObj;
    const srcFanShort = ambilNamaFanSingkat(stateClipboardKG.fan, srcK.tingkat, srcK.kls);
    const tgtFanShort = guru ? ambilNamaFanSingkat(fan, k.tingkat, k.kls) : '-';

    let htmlTempel = `
      <div class="px-2 py-1 border-bottom mb-1 bg-warning bg-opacity-10 rounded-top">
        <div class="dropdown-header p-0 text-warning-emphasis" style="font-size:10px;">
          <i class="bi bi-clipboard-check-fill me-1"></i>POP-UP TEMPEL JADWAL
        </div>
        <div class="small fw-bold text-dark text-truncate" title="${escHtmlFan_(stateClipboardKG.guru)} (${escHtmlFan_(srcFanShort)})">
          Dari: ${escHtmlFan_(stateClipboardKG.guru)} (${escHtmlFan_(srcFanShort)})
        </div>
        <div class="text-muted" style="font-size:10.5px;">
          Ke: <b>${escHtmlFan_(`${k.kls} ${k.bag} ${k.tingkat} (${k.papi}) • ${hari} Jam ${jam}`)}</b>
          ${
            guru
              ? `<br>Isi Saat Ini: <b class="text-primary">${escHtmlFan_(guru)} (${escHtmlFan_(tgtFanShort)})</b>`
              : '<br>Status: <b class="text-success">Slot Kosong (-)</b>'
          }
        </div>
      </div>
    `;

    if (!guru) {
      htmlTempel += `
        <a class="dropdown-item py-2" href="javascript:void(0)" onclick="window.eksekusiTempelKG('langsung_pindah')">
          <i class="bi bi-box-arrow-in-right text-success fs-6"></i>
          <div>
            <div>Langsung Pindah</div>
            <small class="text-muted fw-normal d-block" style="font-size:10px;">Pindahkan Asatidz &amp; Fan ke slot kosong ini</small>
          </div>
        </a>
      `;
    } else {
      htmlTempel += `
        <a class="dropdown-item" href="javascript:void(0)" onclick="window.eksekusiTempelKG('tukar_semua')">
          <i class="bi bi-arrow-left-right text-success"></i>
          <span>1. Tukar (Asatidz &amp; Fan)</span>
        </a>
        <a class="dropdown-item" href="javascript:void(0)" onclick="window.eksekusiTempelKG('tukar_asatidz')">
          <i class="bi bi-people-fill text-primary"></i>
          <span>2. Tukar Asatidz <small class="text-muted fw-normal">(Fan Tetap)</small></span>
        </a>
        <a class="dropdown-item" href="javascript:void(0)" onclick="window.eksekusiTempelKG('tukar_fan')">
          <i class="bi bi-journal-arrow-up text-info"></i>
          <span>3. Tukar Fan <small class="text-muted fw-normal">(Asatidz Tetap)</small></span>
        </a>
        <a class="dropdown-item" href="javascript:void(0)" onclick="window.eksekusiTempelKG('pindah_hapus')">
          <i class="bi bi-file-earmark-minus text-danger"></i>
          <span>4. Pindah dan Hapus</span>
        </a>
        <a class="dropdown-item" href="javascript:void(0)" onclick="window.eksekusiTempelKG('ganti_asatidz')">
          <i class="bi bi-person-bounding-box text-warning"></i>
          <span>5. Ganti Asatidz <small class="text-muted fw-normal">(Fan Tujuan Tetap)</small></span>
        </a>
        <a class="dropdown-item" href="javascript:void(0)" onclick="window.eksekusiTempelKG('ganti_fan')">
          <i class="bi bi-book-half text-secondary"></i>
          <span>6. Ganti Fan <small class="text-muted fw-normal">(Asatidz Tujuan Tetap)</small></span>
        </a>
      `;
    }

    htmlTempel += `
      <hr class="dropdown-divider my-1">
      <a class="dropdown-item text-danger fw-bold" href="javascript:void(0)" onclick="window.batalkanModePindahKG()">
        <i class="bi bi-x-octagon-fill text-danger"></i>
        <span>Batalkan Pindah</span>
      </a>
    `;

    menu.html(htmlTempel);
  }
  // SKENARIO 2: MENU KLIK KANAN STANDAR
  else {
    const headerTitle = guru ? `${guru} (${kg})` : `[Slot Kosong] ${k.kls} ${k.bag}`;
    const subTitle = `${k.kls} ${k.bag} ${k.tingkat} • ${hari} Jam ${jam}`;
    const disabledClass = !guru ? 'disabled text-muted' : '';
    const labelIsiSlot = !guru ? 'Isi Slot Ini' : 'Isi / Ganti Slot Ini';

    const htmlMenu = `
      <div class="px-2 py-1 border-bottom mb-1 bg-light rounded-top">
        <div class="dropdown-header p-0 text-truncate" id="cmkg_header">${escHtmlFan_(headerTitle)}</div>
        <small class="text-muted d-block" style="font-size:10.5px;" id="cmkg_sub">${escHtmlFan_(subTitle)}</small>
      </div>
      ${
        guru
          ? `
      <a class="dropdown-item text-warning-emphasis" href="javascript:void(0)" id="cmkg_btn_pindah_ke" onclick="window.mulaiModePindahKG()" style="background-color:#fffbeb;">
        <i class="bi bi-scissors text-warning"></i> <span>Pindah Ke</span>
      </a>`
          : ''
      }
      <a class="dropdown-item cmkg-item-pindah ${disabledClass}" href="javascript:void(0)" onclick="window.bukaModalAksiKG('hari')">
        <i class="bi bi-calendar-range text-success"></i> <span>Ganti Hari</span>
      </a>
      <a class="dropdown-item cmkg-item-pindah ${disabledClass}" href="javascript:void(0)" onclick="window.bukaModalAksiKG('jam')">
        <i class="bi bi-clock-history text-primary"></i> <span>Ganti Jam</span>
      </a>
      <a class="dropdown-item cmkg-item-pindah ${disabledClass}" href="javascript:void(0)" onclick="window.bukaModalAksiKG('kelas')">
        <i class="bi bi-door-open-fill text-warning"></i> <span>Ganti Kelas</span>
      </a>
      <hr class="dropdown-divider my-1">
      <a class="dropdown-item" href="javascript:void(0)" onclick="window.bukaModalAksiKG('asatidz')">
        <i class="bi bi-person-plus-fill text-info"></i> <span id="cmkg_btn_asatidz_text">${labelIsiSlot}</span>
      </a>
      ${
        stateClipboardKG
          ? `
      <hr class="dropdown-divider my-1">
      <a class="dropdown-item text-danger fw-bold" href="javascript:void(0)" onclick="window.batalkanModePindahKG()">
        <i class="bi bi-x-octagon-fill text-danger"></i> <span>Batalkan Pindah</span>
      </a>`
          : ''
      }
    `;

    menu.html(htmlMenu);
  }

  menu.css({ display: 'block', visibility: 'hidden' });
  const menuWidth = menu.outerWidth() || 250;
  const menuHeight = menu.outerHeight() || 280;
  const posX = Math.max(10, Math.min(clientX - 15, window.innerWidth - menuWidth - 12));
  const posY = Math.max(10, Math.min(clientY - 10, window.innerHeight - menuHeight - 12));
  menu.css({ top: posY + 'px', left: posX + 'px', visibility: 'visible' }).show();
}

export function handleContextMenuKG(e, tdEl) {
  e.preventDefault();
  e.stopPropagation();
  bukaContextMenuKG(tdEl, e.clientX, e.clientY);
}

export function handleDblClickKG(e, tdEl) {
  e.preventDefault();
  e.stopPropagation();
  bukaContextMenuKG(tdEl, e.clientX, e.clientY);
}

export function handleTouchStartKG(e, tdEl) {
  if (e.touches && e.touches.length === 1) {
    kgTouchStartX = e.touches[0].clientX;
    kgTouchStartY = e.touches[0].clientY;
    kgIsTouchScrolling = false;
  }
}

export function handleTouchMoveKG(e, tdEl) {
  if (e.touches && e.touches.length === 1) {
    const dx = Math.abs(e.touches[0].clientX - kgTouchStartX);
    const dy = Math.abs(e.touches[0].clientY - kgTouchStartY);
    if (dx > 8 || dy > 8) {
      kgIsTouchScrolling = true;
    }
  }
}

export function handleTouchEndKG(e, tdEl) {
  if (kgIsTouchScrolling) {
    kgLastTapTime = 0;
    kgLastTapElem = null;
    return;
  }

  const currentTime = Date.now();
  const timeDifference = currentTime - kgLastTapTime;

  if (kgLastTapElem === tdEl && timeDifference > 0 && timeDifference < 350) {
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches ? e.changedTouches[0] : null;
    const clientX = touch ? touch.clientX : tdEl.getBoundingClientRect().left + tdEl.offsetWidth / 2;
    const clientY = touch ? touch.clientY : tdEl.getBoundingClientRect().top + tdEl.offsetHeight / 2;

    bukaContextMenuKG(tdEl, clientX, clientY);

    kgLastTapTime = 0;
    kgLastTapElem = null;
  } else {
    kgLastTapTime = currentTime;
    kgLastTapElem = tdEl;
  }
}

/**
 * Mendapatkan kunci kelas efektif untuk `store.fanConfig` & `store.fanPelajaranDetail`
 */
export function dapatkanKelasKeyFanDariObj(k) {
  const namaKelasMurni = `${k.kls} ${k.bag} ${k.tingkat}`.trim();
  const isUg = isKelasUnggulan(namaKelasMurni);
  const keyUg = `${namaKelasMurni} (Ug)`;
  const keyReg = `${k.kls} ${k.tingkat}`;
  if (isUg && store.fanConfig && Array.isArray(store.fanConfig[keyUg]) && store.fanConfig[keyUg].length > 0) {
    return { effectiveKey: keyUg, primaryKey: keyUg, fallbackKey: keyReg, isUg: true };
  }
  return { effectiveKey: keyReg, primaryKey: isUg ? keyUg : keyReg, fallbackKey: keyReg, isUg };
}

/**
 * Mencari rawItem di `store.fanConfig[kelasKey]` yang cocok dengan string fan
 */
export function cariRawItemFanPadaKelasKey(kelasKey, fanInput) {
  if (!kelasKey || !fanInput || fanInput === '-') return null;
  const list = (store.fanConfig && store.fanConfig[kelasKey]) || [];
  const fStr = String(fanInput).trim();
  const fLower = fStr.toLowerCase();
  const fClean = fStr.replace(/[()]/g, '').trim().toLowerCase();
  const pInput = parseFanItemString(fStr);
  const inFan = pInput.fan && pInput.fan !== '-' ? pInput.fan.toLowerCase() : '';
  const inMapel = pInput.mapel && pInput.mapel !== '-' ? pInput.mapel.toLowerCase() : '';

  return (
    list.find(raw => {
      const rStr = String(raw || '').trim();
      const rLower = rStr.toLowerCase();
      const rClean = rStr.replace(/[()]/g, '').trim().toLowerCase();
      const p = parseFanItemString(rStr);
      const pFan = p.fan && p.fan !== '-' ? p.fan.toLowerCase() : '';
      const pMapel = p.mapel && p.mapel !== '-' ? p.mapel.toLowerCase() : '';

      return (
        rLower === fLower ||
        rClean === fClean ||
        (pFan && (pFan === fLower || pFan === inFan)) ||
        (pMapel && (pMapel === fLower || pMapel === inMapel))
      );
    }) || null
  );
}

/**
 * Mengecek bentrok fisik seorang Asatidz pada Hari & Jam di `store.masterStrukturKelasKBM`
 */
export function cekBentrokFisikHariJamKBM(namaGuru, hari, jam, excludeSlots = []) {
  if (!namaGuru || namaGuru === '-') return null;
  const guruUpper = String(namaGuru).trim().toUpperCase();
  const jamNum = parseInt(jam, 10);

  for (let i = 0; i < (store.masterStrukturKelasKBM || []).length; i++) {
    const kOther = store.masterStrukturKelasKBM[i];
    const isExcluded = excludeSlots.some(
      ex => ex.kelasKey === kOther.key && ex.hari === hari && parseInt(ex.jam, 10) === jamNum
    );
    if (isExcluded) continue;

    const sesiList = (kOther.jadwal && kOther.jadwal[hari] && kOther.jadwal[hari][jamNum]) || [];
    for (const s of sesiList) {
      if (s.guru && String(s.guru).trim().toUpperCase() === guruUpper) {
        return `${kOther.kls} ${kOther.bag} ${kOther.tingkat} (${kOther.papi})`;
      }
    }
  }
  return null;
}

/**
 * Menghitung label pengajar ('MS', 'MB', atau 'MS, MB') dari daftar nama Asatidz
 */
export function hitungLabelPengajarDariListAsatidz(listAsatidz, existingLabel = '') {
  let hasMS = String(existingLabel || '').includes('MS');
  let hasMB = String(existingLabel || '').includes('MB');

  (listAsatidz || []).forEach(nama => {
    const row = (store.globalDataAsatidz || []).find(
      a => String(a.nama_asatidz || '').trim().toUpperCase() === String(nama || '').trim().toUpperCase()
    );
    if (row) {
      const kat = cekKategoriJahAsatidz(row.jah_asatidz);
      if (kat.isMS) hasMS = true;
      if (kat.isMB) hasMB = true;
    }
  });

  if (hasMS && hasMB) return 'MS, MB';
  if (hasMS) return 'MS';
  if (hasMB) return 'MB';
  return existingLabel || 'MB';
}

/**
 * Eksekusi Utama Pop-Up Menu Tempel (7 Opsi Transisi + Validasi Bentrok + Smart Auto-Sync 4 Poin ke Fan Pelajaran)
 */
export async function eksekusiTempelKG(modeTempel) {
  $('#contextMenuKG').hide();
  if (!stateClipboardKG || !stateContextKG) return;

  const src = Object.assign({}, stateClipboardKG);
  const tgt = Object.assign({}, stateContextKG);

  let srcAfter = { guru: src.guru, fan: src.fan };
  let tgtAfter = { guru: tgt.guru, fan: tgt.fan };

  if (modeTempel === 'langsung_pindah') {
    srcAfter = { guru: '', fan: '-' };
    tgtAfter = { guru: src.guru, fan: src.fan };
  } else if (modeTempel === 'tukar_semua') {
    srcAfter = { guru: tgt.guru, fan: tgt.fan };
    tgtAfter = { guru: src.guru, fan: src.fan };
  } else if (modeTempel === 'tukar_asatidz') {
    srcAfter = { guru: tgt.guru, fan: src.fan };
    tgtAfter = { guru: src.guru, fan: tgt.fan };
  } else if (modeTempel === 'tukar_fan') {
    srcAfter = { guru: src.guru, fan: tgt.fan };
    tgtAfter = { guru: tgt.guru, fan: src.fan };
  } else if (modeTempel === 'pindah_hapus') {
    srcAfter = { guru: '', fan: '-' };
    tgtAfter = { guru: src.guru, fan: src.fan };
  } else if (modeTempel === 'ganti_asatidz') {
    srcAfter = { guru: '', fan: '-' };
    tgtAfter = { guru: src.guru, fan: tgt.fan };
  } else if (modeTempel === 'ganti_fan') {
    srcAfter = { guru: src.guru, fan: src.fan };
    tgtAfter = { guru: tgt.guru, fan: src.fan };
  } else {
    return;
  }

  // Validasi Bentrok Fisik Hari & Jam
  const excludeForTgt = [{ kelasKey: tgt.kelasKey, hari: tgt.hari, jam: tgt.jam }];
  if ((srcAfter.guru || '').trim().toUpperCase() !== (tgtAfter.guru || '').trim().toUpperCase()) {
    excludeForTgt.push({ kelasKey: src.kelasKey, hari: src.hari, jam: src.jam });
  }
  if (tgtAfter.guru) {
    const bentrokTgt = cekBentrokFisikHariJamKBM(tgtAfter.guru, tgt.hari, tgt.jam, excludeForTgt);
    if (bentrokTgt) {
      return Swal.fire({
        icon: 'warning',
        title: '⚠️ BENTROK JADWAL FISIK!',
        html: `Asatidz <b>${escHtmlFan_(tgtAfter.guru)}</b> sudah tercatat mengajar di kelas <b class="text-danger">${escHtmlFan_(bentrokTgt)}</b> pada hari <b>${tgt.hari} Jam Ke-${tgt.jam}</b>.<br><br>Aksi dibatalkan untuk mencegah bentrok.`,
        confirmButtonColor: '#0f766e'
      });
    }
  }

  if (srcAfter.guru && srcAfter.guru.trim().toUpperCase() !== (src.guru || '').trim().toUpperCase()) {
    const excludeForSrc = [
      { kelasKey: src.kelasKey, hari: src.hari, jam: src.jam },
      { kelasKey: tgt.kelasKey, hari: tgt.hari, jam: tgt.jam }
    ];
    const bentrokSrc = cekBentrokFisikHariJamKBM(srcAfter.guru, src.hari, src.jam, excludeForSrc);
    if (bentrokSrc) {
      return Swal.fire({
        icon: 'warning',
        title: '⚠️ BENTROK JADWAL FISIK (TUKAR)!',
        html: `Asatidz <b>${escHtmlFan_(srcAfter.guru)}</b> tidak dapat ditukar ke slot sumber karena sudah mengajar di kelas <b class="text-danger">${escHtmlFan_(bentrokSrc)}</b> pada hari <b>${src.hari} Jam Ke-${src.jam}</b>.`,
        confirmButtonColor: '#0f766e'
      });
    }
  }

  // Deteksi & Solusi Sinkronisasi Otomatis ke Menu "Fan Pelajaran"
  const slotsToInspect = [];
  if (tgtAfter.guru && tgtAfter.fan && tgtAfter.fan !== '-') {
    slotsToInspect.push({
      id: 'tgt',
      labelSlot: `Tujuan (${tgt.classObj.kls} ${tgt.classObj.bag} ${tgt.classObj.tingkat} • ${tgt.hari} Jam ${tgt.jam})`,
      classObj: tgt.classObj,
      otherClassObj: src.classObj,
      hari: tgt.hari,
      jam: tgt.jam,
      guru: tgtAfter.guru,
      fan: tgtAfter.fan,
      refAfter: tgtAfter
    });
  }

  const isSrcChanged =
    (srcAfter.guru || '').trim().toUpperCase() !== (src.guru || '').trim().toUpperCase() ||
    (srcAfter.fan || '').trim().toUpperCase() !== (src.fan || '').trim().toUpperCase();

  if (isSrcChanged && srcAfter.guru && srcAfter.fan && srcAfter.fan !== '-') {
    slotsToInspect.push({
      id: 'src',
      labelSlot: `Sumber (${src.classObj.kls} ${src.classObj.bag} ${src.classObj.tingkat} • ${src.hari} Jam ${src.jam})`,
      classObj: src.classObj,
      otherClassObj: tgt.classObj,
      hari: src.hari,
      jam: src.jam,
      guru: srcAfter.guru,
      fan: srcAfter.fan,
      refAfter: srcAfter
    });
  }

  const syncPlan = {
    hasChanges: false,
    addFanItems: [],
    msPrompts: [],
    registerAsatidz: [],
    updateJamQuotas: []
  };

  slotsToInspect.forEach(sItem => {
    const k = sItem.classObj;
    const otherK = sItem.otherClassObj;
    const keyInfo = dapatkanKelasKeyFanDariObj(k);
    const otherKeyInfo = dapatkanKelasKeyFanDariObj(otherK);
    const kelasKey = keyInfo.effectiveKey;

    // Poin 1: Cek apakah Fan sudah terdaftar di `store.fanConfig[kelasKey]`
    let rawItem = cariRawItemFanPadaKelasKey(kelasKey, sItem.fan);
    if (!rawItem) {
      const rawFromOther =
        cariRawItemFanPadaKelasKey(otherKeyInfo.effectiveKey, sItem.fan) ||
        cariRawItemFanPadaKelasKey(otherKeyInfo.fallbackKey, sItem.fan);
      if (rawFromOther) {
        rawItem = rawFromOther;
      } else if (/^\s*\([^)]+\)/.test(sItem.fan)) {
        rawItem = sItem.fan.trim();
      } else {
        rawItem = `(${sItem.fan.trim()}) ${sItem.fan.trim()}`;
      }

      if (!syncPlan.addFanItems.some(a => a.kelasKey === kelasKey && a.rawItem === rawItem)) {
        syncPlan.addFanItems.push({
          kelasKey,
          rawItem,
          fanShort: ambilNamaFanSingkat(rawItem, k.tingkat, k.kls)
        });
        syncPlan.hasChanges = true;
      }
    }

    const fanShort = ambilNamaFanSingkat(rawItem, k.tingkat, k.kls);
    const itemKey = `${kelasKey}||${rawItem}`;
    const itemDet = (store.fanPelajaranDetail.item && store.fanPelajaranDetail.item[itemKey]) || {
      pengajar: '',
      asatidz: []
    };

    // Poin 2: Cek apakah Fan berstatus khusus Mustahiq (MS)
    const isFanMS = cekFanMSuntukKelas(keyInfo.primaryKey, keyInfo.fallbackKey, rawItem);
    const namaMS = k.mustahiqNama && k.mustahiqNama !== '-' ? k.mustahiqNama.trim() : '';
    let triggeredMSPrompt = false;

    if (isFanMS && namaMS && sItem.guru.trim().toUpperCase() !== namaMS.toUpperCase()) {
      triggeredMSPrompt = true;
      syncPlan.msPrompts.push({
        slotId: sItem.id,
        labelSlot: sItem.labelSlot,
        classObj: k,
        hari: sItem.hari,
        jam: sItem.jam,
        kelasKey,
        itemKey,
        rawItem,
        fanShort,
        currentGuru: sItem.guru,
        mustahiqNama: namaMS,
        refAfter: sItem.refAfter
      });
      syncPlan.hasChanges = true;
    }

    // Poin 3: Cek apakah Asatidz sudah terdaftar di daftar PENGAJAR Fan
    const currentAsatidzList = Array.isArray(itemDet.asatidz) ? itemDet.asatidz : [];
    const sudahTerdaftar = currentAsatidzList.some(
      g => String(g || '').trim().toUpperCase() === sItem.guru.trim().toUpperCase()
    );
    if (!sudahTerdaftar && !triggeredMSPrompt) {
      const mergedList = [...currentAsatidzList, sItem.guru];
      const newLabel = hitungLabelPengajarDariListAsatidz(mergedList, itemDet.pengajar);
      if (
        !syncPlan.registerAsatidz.some(
          r => r.itemKey === itemKey && r.guru.toUpperCase() === sItem.guru.toUpperCase()
        )
      ) {
        syncPlan.registerAsatidz.push({
          slotId: sItem.id,
          itemKey,
          kelasKey,
          rawItem,
          fanShort,
          guru: sItem.guru,
          newPengajarLabel: newLabel
        });
        syncPlan.hasChanges = true;
      }
    }

    // Poin 4: Cek kuota jam mingguan Fan
    const batasInfo =
      dapatkanBatasJamFan(keyInfo.primaryKey, rawItem) ||
      (keyInfo.isUg ? dapatkanBatasJamFan(keyInfo.fallbackKey, rawItem) : null);
    let maxJam = batasInfo && batasInfo.maxJam !== null ? batasInfo.maxJam : null;
    if (maxJam === null && itemDet.jam !== undefined && itemDet.jam !== '') {
      const parsedJam = parseInt(itemDet.jam, 10);
      if (!isNaN(parsedJam)) maxJam = parsedJam;
    }

    if (maxJam !== null) {
      let totalPakaiMingguan = 0;
      const targetParsed = parseFanItemString(rawItem);
      const targetShortLower = (
        targetParsed.fan !== '-' ? targetParsed.fan : targetParsed.mapel
      ).toLowerCase();

      LIST_HARI.forEach(h => {
        [1, 2].forEach(j => {
          let fVal = '';
          if (k.key === tgt.kelasKey && h === tgt.hari && j === parseInt(tgt.jam, 10)) {
            fVal = tgtAfter.guru ? tgtAfter.fan || '' : '';
          } else if (k.key === src.kelasKey && h === src.hari && j === parseInt(src.jam, 10)) {
            fVal = srcAfter.guru ? srcAfter.fan || '' : '';
          } else {
            const sArr = (k.jadwal && k.jadwal[h] && k.jadwal[h][j]) || [];
            if (sArr.length > 0 && sArr[0].guru && sArr[0].guru !== '-') {
              fVal = sArr[0].fanAsli || sArr[0].fan || '';
            }
          }

          if (fVal && fVal !== '-') {
            const matchedRaw = cariRawItemFanPadaKelasKey(kelasKey, fVal);
            const fShortLower = ambilNamaFanSingkat(fVal, k.tingkat, k.kls).toLowerCase();
            if (matchedRaw === rawItem || fShortLower === targetShortLower) {
              totalPakaiMingguan++;
            }
          }
        });
      });

      if (totalPakaiMingguan > maxJam) {
        const newQuota = Math.min(6, totalPakaiMingguan);
        if (newQuota > maxJam && !syncPlan.updateJamQuotas.some(u => u.itemKey === itemKey)) {
          syncPlan.updateJamQuotas.push({
            itemKey,
            kelasKey,
            rawItem,
            fanShort,
            oldJam: maxJam,
            newJam: newQuota,
            totalPakai: totalPakaiMingguan
          });
          syncPlan.hasChanges = true;
        }
      }
    }
  });

  // Konfirmasi SweetAlert2 bila ada penyesuaian otomatis Fan Pelajaran
  let pilihanMSMap = {};
  if (syncPlan.hasChanges) {
    let rincianHtml = `<div class="text-start small">`;
    rincianHtml += `<p class="mb-2 text-muted">Sistem mendeteksi penyesuaian otomatis ke menu <b>Fan Pelajaran</b> agar data tetap 100% sinkron:</p>`;
    rincianHtml += `<ul class="ps-3 mb-2">`;

    syncPlan.addFanItems.forEach(a => {
      rincianHtml += `<li class="mb-1"><span class="badge bg-info text-dark me-1">Atur Item Fan</span> Menambahkan Fan <b>${escHtmlFan_(a.rawItem)}</b> ke konfigurasi kelas <b>${escHtmlFan_(a.kelasKey)}</b>.</li>`;
    });

    syncPlan.registerAsatidz.forEach(r => {
      rincianHtml += `<li class="mb-1"><span class="badge bg-primary me-1">Pengajar Fan</span> Mendaftarkan <b>${escHtmlFan_(r.guru)}</b> sebagai pengajar Fan <b>${escHtmlFan_(r.fanShort)}</b> di kelas <b>${escHtmlFan_(r.kelasKey)}</b> (Kategori: <b>${escHtmlFan_(r.newPengajarLabel)}</b>).</li>`;
    });

    syncPlan.updateJamQuotas.forEach(u => {
      rincianHtml += `<li class="mb-1"><span class="badge bg-warning text-dark me-1">Kuota Jam Fan</span> Menaikkan kuota jam Fan <b>${escHtmlFan_(u.fanShort)}</b> (${escHtmlFan_(u.kelasKey)}) dari <b>${u.oldJam} Jam</b> menjadi <b>${u.newJam} Jam</b>/minggu.</li>`;
    });

    rincianHtml += `</ul>`;

    if (syncPlan.msPrompts.length > 0) {
      syncPlan.msPrompts.forEach((mp, idx) => {
        rincianHtml += `
          <div class="p-2 px-3 rounded border border-warning bg-warning bg-opacity-10 mt-2 mb-1">
            <div class="fw-bold text-dark mb-1">
              <i class="bi bi-person-check-fill text-success me-1"></i>Fan Khusus Mustahiq (MS) Terdeteksi — ${escHtmlFan_(mp.labelSlot)}
            </div>
            <div class="text-muted mb-2" style="font-size:11.5px;">
              Fan <b>${escHtmlFan_(mp.fanShort)}</b> berstatus wajib <b>MS</b>, sedangkan Asatidz yang ditempel adalah <b>${escHtmlFan_(mp.currentGuru)}</b>. Pilih tindakan:
            </div>
            <div class="form-check mb-1">
              <input class="form-check-input" type="radio" name="swal_ms_choice_${idx}" id="swal_ms_opt1_${idx}" value="use_ms" checked>
              <label class="form-check-label fw-semibold text-success" for="swal_ms_opt1_${idx}">
                Otomatis gunakan Mustahiq Kelas (<b>${escHtmlFan_(mp.mustahiqNama)}</b>)
              </label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="radio" name="swal_ms_choice_${idx}" id="swal_ms_opt2_${idx}" value="keep_guru">
              <label class="form-check-label fw-semibold text-primary" for="swal_ms_opt2_${idx}">
                Tetap gunakan <b>${escHtmlFan_(mp.currentGuru)}</b> &amp; tambahkan ke Pengajar Fan
              </label>
            </div>
          </div>
        `;
      });
    }

    rincianHtml += `</div>`;

    const confirmRes = await Swal.fire({
      title: 'Sinkronisasi Otomatis Fan Pelajaran',
      html: rincianHtml,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0f766e',
      cancelButtonColor: '#64748b',
      confirmButtonText: '<i class="bi bi-check2-all me-1"></i> Ya, Sinkronkan & Simpan',
      cancelButtonText: 'Batal',
      preConfirm: () => {
        const resChoices = {};
        syncPlan.msPrompts.forEach((mp, idx) => {
          const val = $(`input[name="swal_ms_choice_${idx}"]:checked`).val() || 'use_ms';
          resChoices[mp.slotId] = val;
        });
        return resChoices;
      }
    });

    if (!confirmRes.isConfirmed) return;
    pilihanMSMap = confirmRes.value || {};
  }

  let needSaveFanConfig = false;
  let needSaveFanDetail = false;

  if (!store.fanPelajaranDetail) store.fanPelajaranDetail = { kelas: {}, item: {} };
  if (!store.fanPelajaranDetail.item) store.fanPelajaranDetail.item = {};

  syncPlan.addFanItems.forEach(a => {
    if (!Array.isArray(store.fanConfig[a.kelasKey])) store.fanConfig[a.kelasKey] = [];
    if (!store.fanConfig[a.kelasKey].includes(a.rawItem)) {
      store.fanConfig[a.kelasKey].push(a.rawItem);
      needSaveFanConfig = true;
    }
  });

  for (const mp of syncPlan.msPrompts) {
    const choice = pilihanMSMap[mp.slotId] || 'use_ms';
    if (!store.fanPelajaranDetail.item[mp.itemKey]) {
      store.fanPelajaranDetail.item[mp.itemKey] = { pengajar: 'MS', asatidz: [] };
    }
    const det = store.fanPelajaranDetail.item[mp.itemKey];
    if (!Array.isArray(det.asatidz)) det.asatidz = [];

    if (choice === 'use_ms') {
      const excludeMS = [
        { kelasKey: tgt.kelasKey, hari: tgt.hari, jam: tgt.jam },
        { kelasKey: src.kelasKey, hari: src.hari, jam: src.jam }
      ];
      const bentrokMS = cekBentrokFisikHariJamKBM(mp.mustahiqNama, mp.hari, mp.jam, excludeMS);
      if (bentrokMS) {
        return Swal.fire({
          icon: 'warning',
          title: 'Mustahiq Kelas Sedang Mengajar di Kelas Lain!',
          html: `Mustahiq <b>${escHtmlFan_(mp.mustahiqNama)}</b> sudah mengajar di <b>${escHtmlFan_(bentrokMS)}</b> pada <b>${mp.hari} Jam Ke-${mp.jam}</b>.`,
          confirmButtonColor: '#0f766e'
        });
      }
      mp.refAfter.guru = mp.mustahiqNama;
      if (!det.asatidz.some(g => String(g).trim().toUpperCase() === mp.mustahiqNama.toUpperCase())) {
        det.asatidz.push(mp.mustahiqNama);
      }
      det.pengajar = hitungLabelPengajarDariListAsatidz(det.asatidz, det.pengajar || 'MS');
      needSaveFanDetail = true;
    } else {
      if (!det.asatidz.some(g => String(g).trim().toUpperCase() === mp.currentGuru.toUpperCase())) {
        det.asatidz.push(mp.currentGuru);
      }
      det.pengajar = hitungLabelPengajarDariListAsatidz(det.asatidz, det.pengajar);
      needSaveFanDetail = true;
    }
  }

  syncPlan.registerAsatidz.forEach(r => {
    if (!store.fanPelajaranDetail.item[r.itemKey]) {
      store.fanPelajaranDetail.item[r.itemKey] = { pengajar: '', asatidz: [] };
    }
    const det = store.fanPelajaranDetail.item[r.itemKey];
    if (!Array.isArray(det.asatidz)) det.asatidz = [];
    if (!det.asatidz.some(g => String(g).trim().toUpperCase() === r.guru.toUpperCase())) {
      det.asatidz.push(r.guru);
    }
    det.pengajar = hitungLabelPengajarDariListAsatidz(det.asatidz, det.pengajar);
    needSaveFanDetail = true;
  });

  syncPlan.updateJamQuotas.forEach(u => {
    if (!store.fanPelajaranDetail.item[u.itemKey]) {
      store.fanPelajaranDetail.item[u.itemKey] = { pengajar: '', asatidz: [] };
    }
    store.fanPelajaranDetail.item[u.itemKey].jam = String(Math.min(6, u.newJam));
    needSaveFanDetail = true;
  });

  // Simpan perubahan jadwal guru ke memori & Supabase
  Swal.fire({
    title: 'Menyimpan & Menyinkronkan Jadwal...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const srcK = src.classObj;
  const srcGenderTag = srcK.papi ? `(${srcK.papi})` : '';
  const srcKelasMurni = `${srcK.kls} ${srcK.bag} ${srcK.tingkat} ${srcGenderTag}`.trim();
  const srcLokasiGabungan = `${srcKelasMurni} (${srcK.lokal || '-'})`;
  const srcKelasMurniNorm = normalisasiNamaKelas(srcKelasMurni);

  const tgtK = tgt.classObj;
  const tgtGenderTag = tgtK.papi ? `(${tgtK.papi})` : '';
  const tgtKelasMurni = `${tgtK.kls} ${tgtK.bag} ${tgtK.tingkat} ${tgtGenderTag}`.trim();
  const tgtLokasiGabungan = `${tgtKelasMurni} (${tgtK.lokal || '-'})`;
  const tgtKelasMurniNorm = normalisasiNamaKelas(tgtKelasMurni);

  const mapGuruWork = {};
  const ambilObjGuruWork = nama => {
    const clean = String(nama || '').trim();
    if (!clean || clean === '-') return null;
    const key = clean.toUpperCase();
    if (!mapGuruWork[key]) {
      mapGuruWork[key] = getJadwalGuru(clean);
    }
    return mapGuruWork[key];
  };

  if (src.guru) {
    const gOldSrc = ambilObjGuruWork(src.guru);
    if (gOldSrc) removeSlotFromGuruObj(gOldSrc, src.hari, parseInt(src.jam, 10), srcKelasMurniNorm);
  }
  if (tgt.guru) {
    const gOldTgt = ambilObjGuruWork(tgt.guru);
    if (gOldTgt) removeSlotFromGuruObj(gOldTgt, tgt.hari, parseInt(tgt.jam, 10), tgtKelasMurniNorm);
  }

  if (srcAfter.guru) {
    const gNewSrc = ambilObjGuruWork(srcAfter.guru);
    if (gNewSrc) {
      addSlotToGuruObj(gNewSrc, src.hari, parseInt(src.jam, 10), srcAfter.fan || '-', srcLokasiGabungan);
    }
  }
  if (tgtAfter.guru) {
    const gNewTgt = ambilObjGuruWork(tgtAfter.guru);
    if (gNewTgt) {
      addSlotToGuruObj(gNewTgt, tgt.hari, parseInt(tgt.jam, 10), tgtAfter.fan || '-', tgtLokasiGabungan);
    }
  }

  Object.values(mapGuruWork).forEach(gObj => {
    syncGuruMengajarAndTotalObj(gObj);
  });

  try {
    if (needSaveFanConfig) {
      await simpanFanConfigKeServer(store.fanConfig);
    }
    if (needSaveFanDetail) {
      simpanFanPelajaranDetailKeServer();
    }

    await simpanBatchJadwalAsatidzKeServer(
      Object.values(mapGuruWork),
      `Mode Pindah/Tukar KG (${modeTempel}): ${srcKelasMurni} -> ${tgtKelasMurni}`
    );

    batalkanModePindahKG();
    await renderJadwalKBM(true);

    if (typeof window.renderFanPelajaran === 'function' && $('#page-fan-pelajaran').is(':visible')) {
      window.renderFanPelajaran(true);
    }
    if (typeof window.renderTabelPengajarFan === 'function' && $('#page-pengajar-fan').is(':visible')) {
      window.renderTabelPengajarFan(true);
    }

    Swal.fire({
      icon: 'success',
      title: 'Berhasil Dipindahkan & Disinkronkan!',
      text: 'Jadwal KBM serta konfigurasi Fan Pelajaran telah diperbarui.',
      timer: 1700,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Menyimpan Perubahan',
      text: err.message || 'Terjadi kesalahan saat menyimpan ke Supabase.'
    });
  }
}

// ============================================================================
// 8. ENGINE MODAL AKSI KLIK KANAN KG (#modalAksiKlikKananKG)
// ============================================================================

/**
 * Membuka Pop-Up Modal Aksi Cepat Sel KG ('hari' | 'jam' | 'kelas' | 'asatidz')
 */
export function bukaModalAksiKG(actionType) {
  $('#contextMenuKG').hide();
  if (!stateContextKG) return;

  if (!stateContextKG.guru && actionType !== 'asatidz') {
    Swal.fire({
      icon: 'info',
      title: 'Slot Masih Kosong',
      text: 'Slot ini belum ada pengajarnya. Gunakan opsi "Isi Slot Ini".',
      confirmButtonColor: '#0f766e'
    });
    return;
  }

  stateContextKG.actionType = actionType;
  const k = stateContextKG.classObj;
  const genderTag = k.papi ? `(${k.papi})` : '';

  const modalDialog = $('#modalAksiKlikKananKG .modal-dialog');
  if (actionType === 'asatidz') {
    modalDialog.addClass('modal-lg');
  } else {
    modalDialog.removeClass('modal-lg');
  }

  $('#akg_info_kelas').text(`${k.kls} ${k.bag} ${k.tingkat} ${genderTag}`);
  $('#akg_info_hari_jam').text(`${stateContextKG.hari} • Jam ${stateContextKG.jam}`);
  $('#akg_info_guru').text(
    stateContextKG.guru ? `${stateContextKG.guru} (${stateContextKG.kg})` : 'Belum Ada Asatidz'
  );
  $('#akg_info_fan').text(stateContextKG.fan ? `Fan: ${stateContextKG.fan}` : 'Fan: -');

  const container = $('#akg_dynamic_fields');
  container.empty();

  // 1. OPSI: GANTI HARI
  if (actionType === 'hari') {
    $('#mdlAksiKG_Title').html('<i class="bi bi-calendar-range me-2"></i> Ganti Hari Mengajar');
    container.html(`
      <div class="row g-2">
        <div class="col-7">
          <label class="form-label small fw-bold text-dark">Ganti Hari:</label>
          <select class="form-select form-select-sm" id="akg_pilih_hari" onchange="window.updateStatusPreviewTargetKG()">
            ${LIST_HARI.map(
              h => `<option value="${h}" ${h === stateContextKG.hari ? 'disabled' : ''}>${h}</option>`
            ).join('')}
          </select>
        </div>
        <div class="col-5">
          <label class="form-label small fw-bold text-dark">Jam Ke:</label>
          <select class="form-select form-select-sm" id="akg_pilih_jam" onchange="window.updateStatusPreviewTargetKG()">
            <option value="1" ${stateContextKG.jam === 1 ? 'selected' : ''}>Jam Ke-1</option>
            <option value="2" ${stateContextKG.jam === 2 ? 'selected' : ''}>Jam Ke-2</option>
          </select>
        </div>
      </div>
    `);
  }
  // 2. OPSI: GANTI JAM
  else if (actionType === 'jam') {
    $('#mdlAksiKG_Title').html('<i class="bi bi-clock-history me-2"></i> Ganti Jam Mengajar');
    const targetJamDefault = stateContextKG.jam === 1 ? 2 : 1;
    container.html(`
      <div class="mb-2">
        <label class="form-label small fw-bold text-dark">Ganti Jam Ke:</label>
        <select class="form-select form-select-sm" id="akg_pilih_jam" onchange="window.updateStatusPreviewTargetKG()">
          <option value="1" ${targetJamDefault === 1 ? 'selected' : ''}>Jam Ke-1</option>
          <option value="2" ${targetJamDefault === 2 ? 'selected' : ''}>Jam Ke-2</option>
        </select>
        <input type="hidden" id="akg_pilih_hari" value="${stateContextKG.hari}">
      </div>
    `);
  }
  // 3. OPSI: GANTI KELAS
  else if (actionType === 'kelas') {
    $('#mdlAksiKG_Title').html('<i class="bi bi-door-open-fill me-2"></i> Ganti Kelas Mengajar');
    container.html(`
      <div class="mb-2">
        <label class="form-label small fw-bold text-dark">Ganti ke Kelas:</label>
        <select class="form-select form-select-sm" id="akg_pilih_kelas" onchange="window.updateStatusPreviewTargetKG()">
          ${(store.masterStrukturKelasKBM || [])
            .map(
              c => `
            <option value="${escHtmlFan_(c.key)}" ${c.key === stateContextKG.kelasKey ? 'disabled' : ''}>
              ${escHtmlFan_(`${c.kls} ${c.bag} ${c.tingkat} ${c.papi ? `(${c.papi})` : ''}`)}
            </option>
          `
            )
            .join('')}
        </select>
      </div>
      <div class="row g-2">
        <div class="col-7">
          <label class="form-label small fw-bold text-dark">Ganti Hari:</label>
          <select class="form-select form-select-sm" id="akg_pilih_hari" onchange="window.updateStatusPreviewTargetKG()">
            ${LIST_HARI.map(
              h => `<option value="${h}" ${h === stateContextKG.hari ? 'selected' : ''}>${h}</option>`
            ).join('')}
          </select>
        </div>
        <div class="col-5">
          <label class="form-label small fw-bold text-dark">Jam Ke:</label>
          <select class="form-select form-select-sm" id="akg_pilih_jam" onchange="window.updateStatusPreviewTargetKG()">
            <option value="1" ${stateContextKG.jam === 1 ? 'selected' : ''}>Jam Ke-1</option>
            <option value="2" ${stateContextKG.jam === 2 ? 'selected' : ''}>Jam Ke-2</option>
          </select>
        </div>
      </div>
    `);
  }
  // 4. OPSI: ISI / EDIT SLOT INI (1 HARI)
  else if (actionType === 'asatidz') {
    const isKosong = !stateContextKG.guru;
    $('#mdlAksiKG_Title').html(
      isKosong
        ? '<i class="bi bi-calendar-plus me-2"></i> Isi Slot Ini'
        : '<i class="bi bi-pencil-square me-2"></i> Isi / Edit Slot Ini'
    );

    siapkanCacheModalJadwalKelas(k);

    const hari = stateContextKG.hari;
    const jam = stateContextKG.jam;
    const namaTerisi = stateContextKG.guru || '';
    const fanTerisi = stateContextKG.fan && stateContextKG.fan !== '-' ? stateContextKG.fan : '';

    const isJam1 = jam === 1;
    const borderClass = isJam1 ? 'border-success' : 'border-primary';
    const headerBgClass = isJam1 ? 'bg-success bg-opacity-10' : 'bg-primary bg-opacity-10';
    const textColorClass = isJam1 ? 'text-success' : 'text-primary';
    const badgeBgClass = isJam1 ? 'bg-success' : 'bg-primary';
    const iconCircleClass = isJam1 ? 'bi-1-circle-fill' : 'bi-2-circle-fill';

    container.html(`
      <div class="card border ${borderClass} border-2 shadow-sm" style="border-radius:12px; overflow:hidden;">
        <div class="card-header ${headerBgClass} py-2 d-flex justify-content-between align-items-center">
          <span class="fw-bold ${textColorClass}"><i class="bi ${iconCircleClass} me-1"></i> Jam Ke-${jam}</span>
          <span class="badge ${badgeBgClass}">Hari ${hari}</span>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-bordered align-middle mb-0 bg-white" style="font-size:12px;">
            <thead class="table-light text-center">
              <tr>
                <th style="width: 75px;">HARI</th>
                <th>ASATIDZ</th>
                <th>FAN / MAPEL</th>
                <th style="width: 40px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-center fw-bold text-success align-middle">${hari}</td>
                <td>
                  <input type="text" class="form-control form-control-sm" id="akg_slot_asatidz"
                    value="${escHtmlFan_(namaTerisi)}" list="dl_akg_slot_asatidz"
                    placeholder="Ketik / Pilih Asatidz..."
                    data-hari="${hari}" data-jam="${jam}" autocomplete="off"
                    oninput="window.onInputDebounceSlotKG(this, 'asatidz')"
                    onchange="window.onChangeSlotKG(this, 'asatidz')">
                  <datalist id="dl_akg_slot_asatidz"></datalist>
                </td>
                <td>
                  <input type="text" class="form-control form-control-sm" id="akg_slot_fan"
                    value="${escHtmlFan_(fanTerisi)}" list="dl_akg_slot_fan"
                    placeholder="Ketik / Pilih Fan / Mapel..."
                    data-hari="${hari}" data-jam="${jam}" autocomplete="off"
                    oninput="window.onInputDebounceSlotKG(this, 'fan')"
                    onchange="window.onChangeSlotKG(this, 'fan')">
                  <datalist id="dl_akg_slot_fan"></datalist>
                </td>
                <td class="text-center align-middle">
                  <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1"
                    onclick="window.hapusInputSlotKG()" title="Kosongkan ${hari} Jam ${jam}">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `);

    sinkronkanSlotTunggalKG('init', false);
  }

  updateStatusPreviewTargetKG();
  $('#modalAksiKlikKananKG').modal('show');
}

export function onInputDebounceSlotKG(el, sumber) {
  clearTimeout(_timerDebounceSlotKG);
  _timerDebounceSlotKG = setTimeout(() => {
    sinkronkanSlotTunggalKG(sumber, false);
    updateStatusPreviewTargetKG();
  }, 200);
}

export function onChangeSlotKG(el, sumber) {
  clearTimeout(_timerDebounceSlotKG);
  if (sumber === 'asatidz') {
    cekBentrokAsatidz(el);
  } else if (sumber === 'fan') {
    validasiInputFanSlotKG(el);
  }
  sinkronkanSlotTunggalKG(sumber, true);
  updateStatusPreviewTargetKG();
}

export function hapusInputSlotKG() {
  const inputAsatidz = document.getElementById('akg_slot_asatidz');
  const inputFan = document.getElementById('akg_slot_fan');
  if (inputAsatidz) {
    inputAsatidz.value = '';
    inputAsatidz.placeholder = 'Ketik / Pilih Asatidz...';
  }
  if (inputFan) {
    inputFan.value = '';
    inputFan.placeholder = 'Ketik / Pilih Fan / Mapel...';
  }
  sinkronkanSlotTunggalKG('init', false);
  updateStatusPreviewTargetKG();
}

export function validasiInputFanSlotKG(inputEl) {
  const fanVal = ($(inputEl).val() || '').trim();
  if (!fanVal || !stateContextKG) return;

  const k = stateContextKG.classObj;
  if (!k) return;

  const namaKelasMurni = `${k.kls} ${k.bag} ${k.tingkat}`.trim();
  const isUg = isKelasUnggulan(namaKelasMurni);
  const keyUtama = isUg ? `${namaKelasMurni} (Ug)` : `${k.kls} ${k.tingkat}`;
  const keyCadangan = `${k.kls} ${k.tingkat}`;

  const resolveFan = nilai => {
    let info = dapatkanBatasJamFan(keyUtama, nilai);
    if (!info && isUg) info = dapatkanBatasJamFan(keyCadangan, nilai);
    return info;
  };

  const fanInfo = resolveFan(fanVal);
  if (!fanInfo || fanInfo.maxJam === null) return;
  const maxBatas = fanInfo.maxJam;

  let totalPakai = 1;
  [1, 2].forEach(j => {
    LIST_HARI.forEach(h => {
      if (h === stateContextKG.hari && j === stateContextKG.jam) return;
      const sesiHari = k.jadwal[h] && k.jadwal[h][j];
      const sesiList = Array.isArray(sesiHari) ? sesiHari : sesiHari ? [sesiHari] : [];
      if (sesiList.length > 0) {
        const v = (sesiList[0].fanAsli || sesiList[0].fan || '').trim();
        if (v && v !== '-') {
          const mi = resolveFan(v);
          if (mi && mi.rawItem === fanInfo.rawItem) totalPakai++;
        }
      }
    });
  });

  if (totalPakai > maxBatas) {
    Swal.fire({
      icon: 'warning',
      title: '⚠️ MELEBIHI BATAS JAM!',
      html:
        `Fan/Mata Pelajaran <b>"${escHtmlFan_(fanVal)}"</b> hanya dialokasikan maksimal <b>${maxBatas} Jam</b> tiap minggu untuk kelas ini.<br><br>` +
        `Total jam untuk fan ini sudah mencapai <b>${totalPakai} Jam</b>.`,
      confirmButtonColor: '#0f766e'
    });
    $(inputEl).val('');$(inputEl).focus();
  }
}

export function sinkronkanSlotTunggalKG(sumber, isChangeEvent = false) {
  if (!stateContextKG) return;
  const k = stateContextKG.classObj;
  if (!k) return;

  const hari = stateContextKG.hari;
  const jamNum = parseInt(stateContextKG.jam, 10);
  const inputAsatidz = document.getElementById('akg_slot_asatidz');
  const inputFan = document.getElementById('akg_slot_fan');
  const dlAsatidz = document.getElementById('dl_akg_slot_asatidz');
  const dlFan = document.getElementById('dl_akg_slot_fan');
  if (!inputAsatidz || !inputFan || !dlAsatidz || !dlFan) return;

  const rawAsatidz = (inputAsatidz.value || '').trim();
  const cleanAsatidz = rawAsatidz.replace(/^\[TERPAKAI di [^\]]+\]\s*/i, '').trim().toUpperCase();
  const valFan = (inputFan.value || '').trim();
  const mapBusy = _cacheModalJik.mapBusyAll[`${hari}_${jamNum}`] || {};

  const renderDatalistAsatidz = arrNamaGuru => {
    const namaMS = k.mustahiqNama && k.mustahiqNama !== '-' ? k.mustahiqNama.trim() : '';
    const listPakai =
      arrNamaGuru && arrNamaGuru.length > 0
        ? arrNamaGuru
        : _cacheModalJik.setSemuaAsatidz.size > 0
        ? Array.from(_cacheModalJik.setSemuaAsatidz)
        : (store.globalDataAsatidz || []).map(a => a.nama_asatidz).filter(Boolean);

    let html = '';
    if (namaMS) {
      html += `<option value="${escHtmlFan_(namaMS)}" label="⭐ [MUSTAHIQ KELAS] ${escHtmlFan_(namaMS)}"></option>`;
    }
    listPakai.forEach(namaGuru => {
      if (namaMS && String(namaGuru).trim().toUpperCase() === namaMS.toUpperCase()) return;
      const namaUpper = String(namaGuru).trim().toUpperCase();
      const kelasLain = mapBusy[namaUpper];
      if (kelasLain) {
        html += `<option value="[TERPAKAI di ${escHtmlFan_(kelasLain)}] ${escHtmlFan_(namaGuru)}"></option>`;
      } else {
        html += `<option value="${escHtmlFan_(namaGuru)}"></option>`;
      }
    });

    if (dlAsatidz.getAttribute('data-last-html') !== html) {
      dlAsatidz.innerHTML = html;
      dlAsatidz.setAttribute('data-last-html', html);
    }
  };

  if (sumber === 'asatidz' || sumber === 'init') {
    if (cleanAsatidz) {
      const fansGuru = _cacheModalJik.mapAsatidzKeFan[cleanAsatidz] || [];
      if (fansGuru.length > 0) {
        const htmlFan = fansGuru.map(f => `<option value="${escHtmlFan_(f)}"></option>`).join('');
        if (dlFan.getAttribute('data-last-html') !== htmlFan) {
          dlFan.innerHTML = htmlFan;
          dlFan.setAttribute('data-last-html', htmlFan);
        }
        inputFan.placeholder = 'Pilih Fan yang diajar...';
        if (
          isChangeEvent &&
          fansGuru.length === 1 &&
          (!valFan || !fansGuru.some(f => f.toLowerCase() === valFan.toLowerCase()))
        ) {
          inputFan.value = fansGuru[0];
          validasiInputFanSlotKG(inputFan);
        }
      } else {
        const htmlFan = _cacheModalJik.listSemuaFan.map(f => `<option value="${escHtmlFan_(f)}"></option>`).join('');
        if (dlFan.getAttribute('data-last-html') !== htmlFan) {
          dlFan.innerHTML = htmlFan;
          dlFan.setAttribute('data-last-html', htmlFan);
        }
        inputFan.placeholder = 'Ketik / Pilih Fan...';
      }
    } else {
      const htmlFan = _cacheModalJik.listSemuaFan.map(f => `<option value="${escHtmlFan_(f)}"></option>`).join('');
      if (dlFan.getAttribute('data-last-html') !== htmlFan) {
        dlFan.innerHTML = htmlFan;
        dlFan.setAttribute('data-last-html', htmlFan);
      }
      inputFan.placeholder = 'Ketik / Pilih Fan / Mapel...';
    }
  }

  if (sumber === 'fan' || sumber === 'init') {
    if (valFan) {
      const valFanLower = valFan.toLowerCase();
      let guruFan = _cacheModalJik.mapFanKeAsatidz[valFanLower] || [];
      if (guruFan.length === 0) {
        const matchItem = _cacheModalJik.listFanKelas.find(
          f =>
            f.fan.toLowerCase() === valFanLower ||
            f.mapel.toLowerCase() === valFanLower ||
            f.rawItem.toLowerCase().includes(valFanLower) ||
            valFanLower.includes(f.fan.toLowerCase())
        );
        if (matchItem) guruFan = matchItem.asatidz || [];
      }

      if (guruFan.length > 0) {
        renderDatalistAsatidz(guruFan);
        inputAsatidz.placeholder = 'Pilih Asatidz pengajar fan ini...';
        if (isChangeEvent && guruFan.length === 1 && !cleanAsatidz) {
          const calonGuru = guruFan[0];
          const calonUpper = calonGuru.trim().toUpperCase();
          if (!mapBusy[calonUpper]) {
            inputAsatidz.value = calonGuru;
            cekBentrokAsatidz(inputAsatidz);
          }
        }
      } else {
        renderDatalistAsatidz([]);
        inputAsatidz.placeholder = 'Ketik / Pilih Asatidz...';
      }
    } else {
      renderDatalistAsatidz(Array.from(_cacheModalJik.setSemuaAsatidz));
      inputAsatidz.placeholder = 'Ketik / Pilih Asatidz...';
    }

    if (isChangeEvent && sumber === 'fan' && valFan) {
      const isMSFan = cekFanMSuntukKelas(_cacheModalJik.primaryFanKey, _cacheModalJik.fallbackFanKey, valFan);
      const namaMS = k.mustahiqNama && k.mustahiqNama !== '-' ? k.mustahiqNama.trim() : '';
      if (isMSFan && namaMS) {
        inputAsatidz.value = namaMS;
        cekBentrokAsatidz(inputAsatidz);
        $(inputAsatidz).css({
          'border-color': '#16a34a',
          'box-shadow': '0 0 0 3px rgba(22,163,74,0.25)',
          transition: 'box-shadow 0.35s ease, border-color 0.35s ease'
        });
        setTimeout(() => {
          $(inputAsatidz).css({ 'border-color': '', 'box-shadow': '' });
        }, 1300);
      }
    }
  }
}

export function updateStatusPreviewTargetKG() {
  if (!stateContextKG) return;
  const actionType = stateContextKG.actionType;
  const boxPreview = $('#akg_status_preview');
  const btnSubmit = $('#akg_btn_submit');

  if (actionType === 'asatidz') {
    const guruBaru = ($('#akg_slot_asatidz').val() || '').trim();
    const fanBaru = ($('#akg_slot_fan').val() || '').trim();
    const guruLama = (stateContextKG.guru || '').trim();

    if (!guruBaru && !guruLama) {
      boxPreview.html(`
        <div class="alert alert-secondary py-2 small mb-0">
          <i class="bi bi-info-circle me-1"></i>
          Silakan isi kolom <b>Asatidz</b> dan <b>Fan / Mapel</b> untuk hari <b>${stateContextKG.hari} (Jam Ke-${stateContextKG.jam})</b>.
        </div>
      `);
      btnSubmit
        .prop('disabled', true)
        .html('<i class="bi bi-save-fill me-1"></i> Simpan Jadwal')
        .attr('class', 'btn btn-secondary fw-bold px-4');
    } else if (!guruBaru && guruLama) {
      boxPreview.html(`
        <div class="alert alert-danger py-2 small mb-0">
          <i class="bi bi-trash3-fill me-1"></i>
          Slot hari <b>${stateContextKG.hari} (Jam Ke-${stateContextKG.jam})</b> yang sebelumnya diisi oleh <b>${escHtmlFan_(guruLama)}</b> akan <b>dikosongkan</b>.
        </div>
      `);
      btnSubmit
        .prop('disabled', false)
        .html('<i class="bi bi-trash3-fill me-1"></i> Kosongkan & Simpan')
        .attr('class', 'btn btn-danger fw-bold px-4 shadow-sm');
    } else {
      boxPreview.html(`
        <div class="alert alert-success py-2 small mb-0">
          <i class="bi bi-check2-circle me-1"></i>
          Hari <b>${stateContextKG.hari} (Jam Ke-${stateContextKG.jam})</b> akan diisi Asatidz: <b>${escHtmlFan_(guruBaru)}</b> &bull; Fan/Mapel: <b>${escHtmlFan_(fanBaru || '-')}</b>.
        </div>
      `);
      btnSubmit
        .prop('disabled', false)
        .html(`<i class="bi bi-save-fill me-1"></i> Simpan Jadwal (${stateContextKG.hari})`)
        .attr('class', 'btn btn-success fw-bold px-4 shadow-sm');
    }
    return;
  }

  const targetKelasKey =
    actionType === 'kelas' ? $('#akg_pilih_kelas').val() : stateContextKG.kelasKey;
  const targetHari = $('#akg_pilih_hari').val() || stateContextKG.hari;
  const targetJam = parseInt($('#akg_pilih_jam').val() || stateContextKG.jam, 10);

  const targetKlsObj = (store.masterStrukturKelasKBM || []).find(c => c.key === targetKelasKey);
  if (!targetKlsObj) return;

  const sesiList = targetKlsObj.jadwal[targetHari]
    ? targetKlsObj.jadwal[targetHari][targetJam] || []
    : [];
  const adaGuru = sesiList.length > 0 && sesiList[0].guru && sesiList[0].guru !== '-';

  if (!adaGuru) {
    boxPreview.html(`
      <div class="alert alert-success py-2 small mb-0">
        <i class="bi bi-check-circle-fill text-success me-1"></i>
        Slot pada hari <b>${targetHari}</b> Jam Ke-<b>${targetJam}</b> di kelas ini <b>KOSONG</b> (Belum ada asatidz).
      </div>
    `);
    btnSubmit
      .prop('disabled', false)
      .text('Simpan')
      .attr('class', 'btn btn-success fw-bold px-4 shadow-sm');
  } else {
    const g = sesiList[0];
    boxPreview.html(`
      <div class="alert alert-warning py-2 small mb-0 text-dark">
        <i class="bi bi-arrow-left-right text-warning me-1"></i>
        Slot target <b>TERISI</b> oleh: <b>${escHtmlFan_(g.guru)}</b> [KG: ${escHtmlFan_(g.kg || '-')}] - Fan: <b>${escHtmlFan_(g.fan || '-')}</b>.<br>
        <small class="text-muted">*Aksi ini akan menukar posisi asatidz secara otomatis.</small>
      </div>
    `);
    btnSubmit
      .prop('disabled', false)
      .text('Ganti dan Simpan')
      .attr('class', 'btn btn-warning text-dark fw-bold px-4 shadow-sm');
  }
}

/**
 * Eksekusi Simpan / Ganti dan Simpan dari `#modalAksiKlikKananKG`
 */
export async function eksekusiAksiKlikKananKG() {
  if (!stateContextKG) return;
  const actionType = stateContextKG.actionType;
  const btnSubmit = $('#akg_btn_submit');
  const oriText = btnSubmit.html();

  const srcClass = stateContextKG.classObj;
  const srcGenderTag = srcClass.papi ? `(${srcClass.papi})` : '';
  const srcKelasMurni = `${srcClass.kls} ${srcClass.bag} ${srcClass.tingkat} ${srcGenderTag}`.trim();
  const srcLokasiGabungan = `${srcKelasMurni} (${srcClass.lokal || '-'})`;
  const srcKelasMurniNorm = normalisasiNamaKelas(srcKelasMurni);

  const srcHari = stateContextKG.hari;
  const srcJam = stateContextKG.jam;
  const srcGuru = stateContextKG.guru;
  let srcFan = stateContextKG.fan || '-';

  const mapGuruWork = {};
  const ambilObjGuruWork = nama => {
    const clean = String(nama || '').trim();
    if (!clean || clean === '-') return null;
    const key = clean.toUpperCase();
    if (!mapGuruWork[key]) {
      mapGuruWork[key] = getJadwalGuru(clean);
    }
    return mapGuruWork[key];
  };

  // KASUS 4: ISI / EDIT SLOT INI (ASATIDZ & FAN 1 HARI)
  if (actionType === 'asatidz') {
    const rawGuruBaru = ($('#akg_slot_asatidz').val() || '').trim();
    const fanInput = ($('#akg_slot_fan').val() || '').trim();

    if (/^\[TERPAKAI di /i.test(rawGuruBaru)) {
      cekBentrokAsatidz(document.getElementById('akg_slot_asatidz'));
      return;
    }

    let guruBaru = '';
    if (rawGuruBaru) {
      const rowMaster = (store.globalDataAsatidz || []).find(
        a => String(a.nama_asatidz || '').trim().toUpperCase() === rawGuruBaru.toUpperCase()
      );
      if (!rowMaster) {
        return Swal.fire({
          icon: 'error',
          title: 'Nama Asatidz Tidak Dikenal',
          text: `Nama "${rawGuruBaru}" tidak ditemukan pada Database Asatidz.`,
          confirmButtonColor: '#0f766e'
        });
      }
      guruBaru = String(rowMaster.nama_asatidz).trim();

      const mapBusy =
        (_cacheModalJik.mapBusyAll && _cacheModalJik.mapBusyAll[`${srcHari}_${srcJam}`]) || {};
      const kelasBentrok = mapBusy[guruBaru.toUpperCase()];
      if (kelasBentrok) {
        return Swal.fire({
          icon: 'warning',
          title: '⚠️ TIDAK BISA DIPILIH!',
          html: `<b>${escHtmlFan_(guruBaru)}</b> sudah memiliki jadwal mengajar di <b class="text-danger">${escHtmlFan_(kelasBentrok)}</b> pada hari <b>${srcHari}</b> Jam <b>${srcJam}</b>.`,
          confirmButtonColor: '#0f766e'
        });
      }
    }

    if (!guruBaru && !srcGuru) return;
    srcFan = fanInput || '-';

    if (srcGuru) {
      const gOld = ambilObjGuruWork(srcGuru);
      if (gOld) removeSlotFromGuruObj(gOld, srcHari, srcJam, srcKelasMurniNorm);
    }

    if (guruBaru) {
      const gNew = ambilObjGuruWork(guruBaru);
      if (gNew) addSlotToGuruObj(gNew, srcHari, srcJam, srcFan, srcLokasiGabungan);
    }
  }
  // KASUS 1, 2, 3: GANTI HARI, JAM, ATAU KELAS
  else {
    const targetKelasKey =
      actionType === 'kelas' ? $('#akg_pilih_kelas').val() : stateContextKG.kelasKey;
    const targetHari = $('#akg_pilih_hari').val() || srcHari;
    const targetJam = parseInt($('#akg_pilih_jam').val() || srcJam, 10);

    const targetKlsObj = (store.masterStrukturKelasKBM || []).find(c => c.key === targetKelasKey);
    if (!targetKlsObj) return;

    const tgtGenderTag = targetKlsObj.papi ? `(${targetKlsObj.papi})` : '';
    const tgtKelasMurni = `${targetKlsObj.kls} ${targetKlsObj.bag} ${targetKlsObj.tingkat} ${tgtGenderTag}`.trim();
    const tgtLokasiGabungan = `${tgtKelasMurni} (${targetKlsObj.lokal || '-'})`;
    const tgtKelasMurniNorm = normalisasiNamaKelas(tgtKelasMurni);

    const sesiTarget = targetKlsObj.jadwal[targetHari]
      ? targetKlsObj.jadwal[targetHari][targetJam] || []
      : [];
    const targetGuru =
      sesiTarget.length > 0 && sesiTarget[0].guru && sesiTarget[0].guru !== '-'
        ? sesiTarget[0].guru
        : '';
    const targetFan =
      sesiTarget.length > 0 ? sesiTarget[0].fanAsli || sesiTarget[0].fan || '-' : '-';

    // 1. Pindahkan Guru Sumber ke Slot Target
    if (srcGuru) {
      const gSrc = ambilObjGuruWork(srcGuru);
      if (gSrc) {
        removeSlotFromGuruObj(gSrc, srcHari, srcJam, srcKelasMurniNorm);
        addSlotToGuruObj(gSrc, targetHari, targetJam, srcFan, tgtLokasiGabungan);
      }
    }

    // 2. Jika Target Terisi -> Tukar Guru Target ke Slot Sumber
    if (targetGuru) {
      const gTgt = ambilObjGuruWork(targetGuru);
      if (gTgt) {
        removeSlotFromGuruObj(gTgt, targetHari, targetJam, tgtKelasMurniNorm);
        addSlotToGuruObj(gTgt, srcHari, srcJam, targetFan, srcLokasiGabungan);
      }
    }
  }

  Object.values(mapGuruWork).forEach(gObj => {
    syncGuruMengajarAndTotalObj(gObj);
  });

  btnSubmit
    .html('<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...')
    .prop('disabled', true);
  Swal.fire({
    title: 'Menyimpan Jadwal...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    await simpanBatchJadwalAsatidzKeServer(
      Object.values(mapGuruWork),
      `Aksi cepat KG (${actionType}) pada kelas ${srcKelasMurni} (${srcHari} Jam ${srcJam})`
    );

    $('#modalAksiKlikKananKG').modal('hide');
    btnSubmit.html(oriText).prop('disabled', false);

    await renderJadwalKBM(true);

    Swal.fire({
      icon: 'success',
      title: 'Jadwal Berhasil Diperbarui!',
      text: 'Perubahan asatidz dan jadwal telah tersimpan ke sistem.',
      timer: 1600,
      showConfirmButton: false
    });
  } catch (err) {
    btnSubmit.html(oriText).prop('disabled', false);
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err.message });
  }
}

// ============================================================================
// 9. INISIALISASI GLOBAL UI & EVENT LISTENER JADWAL KBM
// ============================================================================
let jadwalKbmUIInitialized = false;

export function initJadwalKbmUI() {
  if (jadwalKbmUIInitialized) return;
  jadwalKbmUIInitialized = true;

  // Tutup context menu klik kanan KG jika klik di luar menu
  $(document).on('click', function (e) {
    if (!$(e.target).closest('#contextMenuKG').length) {
      $('#contextMenuKG').hide();
    }
  });

  // Batalkan mode pindah (Cut) jika menekan tombol Escape (Esc)
  $(document).on('keydown', function (e) {
    if (e.key === 'Escape' && stateClipboardKG) {
      batalkanModePindahKG();
    }
  });
}
