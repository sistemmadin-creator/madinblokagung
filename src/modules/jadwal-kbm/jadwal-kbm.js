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
