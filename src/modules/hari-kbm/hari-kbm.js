import { store } from '../../state/store.js';
import { fetchAllAsatidzFromSupabase, renderDetailAsatidz } from '../asatidz/asatidz.js';
import { loadFormasiData } from '../formasi/formasi.js';
import {
  loadFanSettingsFromSupabase,
  compareNIANatural,
  escHtmlFan_
} from '../fan/fan.js';
import {
  loadJadwalKbmFromSupabase,
  getJadwalGuru,
  renderJadwalKBM,
  bukaDetailKelasKBM,
  normalisasiNamaKelas,
  formatTampilanKelas,
  ambilNamaFanSingkat,
  parseJadwalCell_Client,
  LIST_HARI
} from '../jadwal-kbm/jadwal-kbm.js';

// ============================================================================
// 1. HELPER DETEKSI HARI, FORMAT BLOK KELAS, & PENCARIAN MUSTAHIQ
// ============================================================================

let isSedangMemuatHariKBM = false;

/**
 * Deteksi hari aktif KBM secara otomatis berdasarkan hari ini
 * (Hari Jumat / libur Madin otomatis diarahkan ke hari Sabtu)
 */
export function deteksiHariIniKBM() {
  const dayNum = new Date().getDay();
  // 0: Ahad, 1: Senin, 2: Selasa, 3: Rabu, 4: Kamis, 5: Jumat, 6: Sabtu
  const mapDay = {
    0: 'Ahad',
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Sabtu',
    6: 'Sabtu'
  };
  return mapDay[dayNum] || 'Sabtu';
}

/**
 * Menyeragamkan label tampilan Blok Kelas
 * Contoh: "Induk" -> "Blok Induk", "4" -> "Blok 4", "-" / kosong -> "Blok Belum Diatur"
 */
export function formatLabelBlokHariKBM(blok) {
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
 * Pengurutan kelompok Blok Kelas:
 * 1. Blok Induk paling atas
 * 2. Blok bernomor/nama lainnya secara natural (1, 2, 3, dst.)
 * 3. Blok Belum Diatur paling bawah
 */
export function bandingkanBlokHariKBM(a, b) {
  const bersihkan = val =>
    String(val || '')
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

  const pA = peringkat(blokA);
  const pB = peringkat(blokB);
  if (pA !== pB) return pA - pB;

  return blokA.localeCompare(blokB, undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

/**
 * Mencari lokasi Diniyyah default sebuah kelas dari masterStrukturKelasKBM atau globalDataFormasi
 */
function cariLokasiKelasHariKBM(namaKelas) {
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
 * Menentukan Blok Kelas dari penugasan mengajar seorang Asatidz pada hari aktif:
 * 1. Cek kecocokan kelas atau lokasi di `store.globalDataFormasi` (`f.blok`)
 * 2. Cek `blok` milik Mustahiq kelas yang diajar pada `store.globalDataAsatidz`
 * 3. Fallback ke `asatidzObj.blok`
 */
export function dapatkanBlokDariSesiMengajar(slots, asatidzObj) {
  const firstSlot = Array.isArray(slots) && slots.length > 0 ? slots[0] : null;

  if (firstSlot) {
    const normKelas = normalisasiNamaKelas(firstSlot.kelas);
    const normLokasi = normalisasiNamaKelas(firstSlot.lokasi);

    // 1. Cek pada Master Formasi Kelas berdasarkan kecocokan Kelas atau Lokasi Diniyyah
    if (Array.isArray(store.globalDataFormasi) && store.globalDataFormasi.length > 0) {
      const matchFormasi = store.globalDataFormasi.find(f => {
        const fNorm = normalisasiNamaKelas(`${f.din_kls} ${f.din_bag} ${f.tingkat}`);
        const fNormGen = normalisasiNamaKelas(`${f.din_kls} ${f.din_bag} ${f.tingkat} (${f.pa_pi})`);
        const lokNorm = normalisasiNamaKelas(f.lokasi_diniyyah);
        return (
          (normKelas && (fNorm === normKelas || fNormGen === normKelas)) ||
          (normLokasi && normLokasi !== '-' && lokNorm === normLokasi)
        );
      });

      if (matchFormasi) {
        const blokF = String(matchFormasi.blok || '').trim();
        if (blokF && blokF !== '-') return blokF;
      }
    }

    // 2. Cek blok dari Mustahiq kelas yang sedang diajar
    if (normKelas && Array.isArray(store.globalDataAsatidz)) {
      const guruMustahiq = store.globalDataAsatidz.find(a => {
        const jah = String(a.jah_asatidz || '').toLowerCase();
        const isM =
          jah.includes('mustahiq') ||
          jah.includes('ms & koor') ||
          jah.includes("isti'dad") ||
          jah === 'ist';
        if (!isM) return false;
        const kNorm1 = normalisasiNamaKelas(
          `${a.din_kls_asatidz || ''} ${a.din_bag_asatidz || ''} ${a.tingkat_asatidz || ''}`
        );
        const kNorm2 = normalisasiNamaKelas(
          `${a.din_kls_asatidz || ''} ${a.din_bag_asatidz || ''} ${a.tingkat_asatidz || ''} (${a.pa_pi || ''})`
        );
        return kNorm1 === normKelas || kNorm2 === normKelas;
      });

      if (guruMustahiq && guruMustahiq.blok && String(guruMustahiq.blok).trim() !== '-') {
        return String(guruMustahiq.blok).trim();
      }
    }
  }

  // 3. Fallback ke blok profil Asatidz pengajar
  const blokPribadi = String(asatidzObj?.blok || '').trim();
  if (blokPribadi && blokPribadi !== '-') return blokPribadi;

  return 'Belum Diatur';
}

/**
 * Mencari nama Mustahiq / Wali Kelas berdasarkan string nama kelas
 */
export function cariMustahiqKelasHariKBM(namaKelas) {
  if (!namaKelas || namaKelas === '-') return '-';
  const normTarget = normalisasiNamaKelas(namaKelas);

  // 1. Cek dari store.masterStrukturKelasKBM
  if (Array.isArray(store.masterStrukturKelasKBM) && store.masterStrukturKelasKBM.length > 0) {
    const f = store.masterStrukturKelasKBM.find(k => {
      const kNorm = normalisasiNamaKelas(`${k.kls} ${k.bag} ${k.tingkat}`);
      const kNormGen = normalisasiNamaKelas(`${k.kls} ${k.bag} ${k.tingkat} (${k.papi})`);
      return kNorm === normTarget || kNormGen === normTarget;
    });
    if (f && f.mustahiqNama && f.mustahiqNama !== '-') {
      return f.mustahiqNama;
    }
  }

  // 2. Cek dari store.globalDataAsatidz
  if (Array.isArray(store.globalDataAsatidz) && store.globalDataAsatidz.length > 0) {
    const guruMustahiq = store.globalDataAsatidz.find(a => {
      const jah = String(a.jah_asatidz || '').toLowerCase();
      const isM =
        jah.includes('mustahiq') ||
        jah.includes('ms & koor') ||
        jah.includes("isti'dad") ||
        jah === 'ist';
      if (!isM) return false;

      const kls = String(a.din_kls_asatidz || '').trim();
      const bag = String(a.din_bag_asatidz || '').trim().toUpperCase();
      const tkt = String(a.tingkat_asatidz || '').trim().toUpperCase();
      const papi = String(a.pa_pi || '').trim().toUpperCase();

      const kNorm1 = normalisasiNamaKelas(`${kls} ${bag} ${tkt}`);
      const kNorm2 = normalisasiNamaKelas(`${kls} ${bag} ${tkt} (${papi})`);
      return kNorm1 === normTarget || kNorm2 === normTarget;
    });
    if (guruMustahiq && guruMustahiq.nama_asatidz) {
      return guruMustahiq.nama_asatidz;
    }
  }

  // 3. Cek dari store.globalDataFormasi (kolom id_mustahiq)
  if (Array.isArray(store.globalDataFormasi) && store.globalDataFormasi.length > 0) {
    const formasiItem = store.globalDataFormasi.find(f => {
      const fNorm1 = normalisasiNamaKelas(`${f.din_kls} ${f.din_bag} ${f.tingkat}`);
      const fNorm2 = normalisasiNamaKelas(`${f.din_kls} ${f.din_bag} ${f.tingkat} (${f.pa_pi})`);
      return fNorm1 === normTarget || fNorm2 === normTarget;
    });
    if (formasiItem && formasiItem.id_mustahiq) {
      return formasiItem.id_mustahiq;
    }
  }

  return '-';
}

// ============================================================================
// 2. PARSING SLOT JADWAL HARIAN & RENDER TABEL UTAMA HARI KBM
// ============================================================================

/**
 * Memecah teks jadwal sel harian Asatidz menjadi array objek slot terstruktur.
 * HANYA mengambil Jam 1 dan Jam 2 (Jam 3 & 4 diabaikan).
 */
export function parseSlotHariKBM(cellStr, defaultLokasiGuru, defaultTingkat = '', defaultKls = '') {
  if (!cellStr || !String(cellStr).trim()) return [];
  const lines = String(cellStr)
    .split(/\r?\n|;;/)
    .map(s => s.trim())
    .filter(Boolean);

  const slots = [];

  lines.forEach(line => {
    const p = line.split(' | ');
    let jamNum = 0;
    const m = (p[0] || '').match(/\d+/);
    if (m) jamNum = parseInt(m[0], 10);

    // HANYA AMBIL JAM 1 DAN JAM 2
    if (jamNum !== 1 && jamNum !== 2) return;

    const rawFan = p[1] && p[1] !== '-' ? p[1].trim() : '-';
    const rawLok = p[2] && p[2] !== '-' ? p[2].trim() : '';

    let namaKelas = '-';
    let lokasiRuang = '-';

    if (rawLok) {
      const match = rawLok.match(/^(.*?)\s*\(([^()]+)\)$/);
      if (match) {
        const isiKurungAkhir = match[2].trim();
        const upperKurung = isiKurungAkhir.toUpperCase();
        // Pastikan tanda kurung terakhir bukan penanda gender (PA/PI) atau Unggulan (Ug)
        if (upperKurung === 'PA' || upperKurung === 'PI' || upperKurung === 'UG') {
          namaKelas = formatTampilanKelas(rawLok);
          lokasiRuang = cariLokasiKelasHariKBM(namaKelas) || defaultLokasiGuru || '-';
        } else {
          namaKelas = formatTampilanKelas(match[1].trim());
          lokasiRuang =
            isiKurungAkhir && isiKurungAkhir !== '-'
              ? isiKurungAkhir
              : cariLokasiKelasHariKBM(namaKelas) || defaultLokasiGuru || '-';
        }
      } else {
        namaKelas = formatTampilanKelas(rawLok);
        lokasiRuang = cariLokasiKelasHariKBM(namaKelas) || defaultLokasiGuru || '-';
      }
    } else {
      lokasiRuang = defaultLokasiGuru || '-';
    }

    // Ekstrak tingkat & kelas dari namaKelas untuk mengambil nama Fan singkat yang presisi
    let tktSlot = defaultTingkat;
    let klsSlot = defaultKls;
    const matchKlsInfo = String(namaKelas).match(/^(\d+)\s+\S+\s+(ULA|WUSTHO|ULYA|ISTI'DAD|IST)/i);
    if (matchKlsInfo) {
      klsSlot = matchKlsInfo[1];
      tktSlot = matchKlsInfo[2].toUpperCase();
    }

    const fanSingkat = ambilNamaFanSingkat(rawFan, tktSlot, klsSlot);

    slots.push({
      jam: jamNum,
      fan: fanSingkat || '-',
      fanAsli: rawFan,
      kelas: namaKelas,
      lokasi: lokasiRuang
    });
  });

  return slots.sort((a, b) => a.jam - b.jam);
}

/**
 * Inisialisasi halaman Hari KBM saat menu dibuka
 */
export async function inisialisasiHalamanHariKBM() {
  const hariOtomatis = store.activeHariKBM || deteksiHariIniKBM();
  await setHariAktifKBM(hariOtomatis, true);
}

/**
 * Mengganti hari aktif pada halaman Hari KBM (Sabtu s/d Kamis)
 */
export async function setHariAktifKBM(hari, doRender = true) {
  store.activeHariKBM = hari;

  $('.btn-switch-hari').each(function () {
    const h = $(this).data('hari');
    if (h === hari) {
      $(this).removeClass('btn-outline-success').addClass('btn-success text-white');
    } else {
      $(this).removeClass('btn-success text-white').addClass('btn-outline-success');
    }
  });

  $('#badgeStatusHariAktif').html(`Hari Aktif: <b>${escHtmlFan_(hari)}</b>`);
  $('#labelCetakHariKBM').text(String(hari || '').toUpperCase());

  if (doRender !== false) {
    await renderTabelHariKBM();
  }
}

/**
 * Membersihkan kotak pencarian Hari KBM
 */
export function resetSearchHariKBM() {
  $('#flt_hkbm_search').val('');
  filterTabelHariKBM();
}

/**
 * Menyegarkan data Hari KBM langsung dari Supabase
 */
export async function muatUlangHariKBM() {
  if (isSedangMemuatHariKBM) return;
  isSedangMemuatHariKBM = true;

  const tbody = document.getElementById('tbodyHariKBM');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <div class="spinner-border spinner-border-sm text-success me-2"></div>Menyegarkan jadwal Hari KBM dari Supabase...
        </td>
      </tr>`;
  }

  try {
    store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    await loadFormasiData();
    await loadFanSettingsFromSupabase();
    await loadJadwalKbmFromSupabase(true);
    await renderJadwalKBM(true);
    isSedangMemuatHariKBM = false;
    await renderTabelHariKBM(true);
    Swal.fire({ icon: 'success', title: 'Data Diperbarui!', timer: 1200, showConfirmButton: false });
  } catch (err) {
    isSedangMemuatHariKBM = false;
    Swal.fire({
      icon: 'error',
      title: 'Gagal Menyegarkan',
      text: err.message,
      confirmButtonColor: '#0f766e'
    });
  }
}

/**
 * Mengekstrak daftar Asatidz yang aktif mengajar pada hari terpilih dan merender tabel/kartu Hari KBM
 */
export async function renderTabelHariKBM(alreadyFetched = false) {
  const tbody = document.getElementById('tbodyHariKBM');
  if (!tbody) return;

  // Pastikan seluruh sumber data siap
  if (
    !alreadyFetched &&
    (!store.globalDataAsatidz ||
      store.globalDataAsatidz.length === 0 ||
      !store.jadwalMengajarMap ||
      Object.keys(store.jadwalMengajarMap).length === 0)
  ) {
    if (isSedangMemuatHariKBM) return;
    isSedangMemuatHariKBM = true;

    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <div class="spinner-border spinner-border-sm text-success me-2"></div>Memuat master data jadwal hari KBM...
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
      if (!store.masterStrukturKelasKBM || store.masterStrukturKelasKBM.length === 0) {
        await renderJadwalKBM(true);
      }
    } catch (err) {
      isSedangMemuatHariKBM = false;
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-danger">
            <i class="bi bi-exclamation-triangle-fill me-1"></i> Gagal memuat data: ${escHtmlFan_(err.message)}
          </td>
        </tr>`;
      return;
    }

    isSedangMemuatHariKBM = false;
  } else if (!store.masterStrukturKelasKBM || store.masterStrukturKelasKBM.length === 0) {
    await renderJadwalKBM(true);
  }

  const hariAktif = store.activeHariKBM || 'Sabtu';
  const hariKey = hariAktif.toLowerCase();
  const listGuruAktif = [];

  (store.globalDataAsatidz || []).forEach(a => {
    const nama = String(a.nama_asatidz || '').trim();
    if (!nama) return;

    const jdwObj = getJadwalGuru(nama);
    const rawJadwalHari = jdwObj[hariKey] || '';
    const defaultLokasi = String(a.lokasi_diniyyah || '').trim();
    const defaultTingkat = String(a.tingkat_asatidz || '').trim().toUpperCase();
    const defaultKls = String(a.din_kls_asatidz || '').trim();

    const slots = parseSlotHariKBM(rawJadwalHari, defaultLokasi, defaultTingkat, defaultKls);

    if (slots.length > 0) {
      const blokTerdeteksi = dapatkanBlokDariSesiMengajar(slots, a);

      listGuruAktif.push({
        rawRow: a,
        nia: String(a.nia || '-').trim() || '-',
        nama,
        jah: String(a.jah_asatidz || '-').trim() || '-',
        tingkat: defaultTingkat,
        blok: blokTerdeteksi,
        lokasiDiniyyahMaster: defaultLokasi,
        slots
      });
    }
  });

  store.allHariKBMData = listGuruAktif;
  filterTabelHariKBM();
}

/**
 * Menyaring data Hari KBM berdasarkan pencarian teks, tingkat, & sesi jam,
 * mengelompokkan per Blok Kelas, serta menyinkronkan Mode Tabel & Mode Kartu
 */
export function filterTabelHariKBM() {
  const listSemua = store.allHariKBMData || [];
  const keyword = ($('#flt_hkbm_search').val() || '').trim().toLowerCase();
  const fTkt = ($('#flt_hkbm_tingkat').val() || '').trim().toUpperCase();
  const fJam = ($('#flt_hkbm_jam').val() || '').trim();

  $('#btnHapusSearchHKBM').toggleClass('d-none', !keyword);

  let totalJamTampil = 0;

  const filtered = listSemua.filter(item => {
    let validSlots = item.slots;
    if (fJam) {
      const targetJam = parseInt(fJam, 10);
      validSlots = validSlots.filter(s => s.jam === targetJam);
      if (validSlots.length === 0) return false;
    }

    if (fTkt) {
      const matchTkt =
        validSlots.some(s => String(s.kelas || '').toUpperCase().includes(fTkt)) ||
        item.tingkat === fTkt;
      if (!matchTkt) return false;
    }

    if (keyword) {
      const slotsText = validSlots
        .map(s => `${s.fan} ${s.fanAsli || ''} ${s.kelas} ${s.lokasi} ${cariMustahiqKelasHariKBM(s.kelas)}`)
        .join(' ')
        .toLowerCase();
      const fullText = `${item.nama} ${item.nia} ${item.jah} ${item.blok} ${slotsText}`.toLowerCase();
      if (!fullText.includes(keyword)) return false;
    }

    totalJamTampil += validSlots.length;
    return true;
  });

  store.dataHariKBMFiltered = filtered;

  // Perbarui badge indikator jumlah Asatidz & total jam
  $('#infoTotalAsatidzHariKBM').text(`${filtered.length} Asatidz Mengajar`);
  $('#infoTotalJamHariKBM').text(`${totalJamTampil} Total Jam (Jam 1 & 2)`);

  const tbody = document.getElementById('tbodyHariKBM');
  if (filtered.length === 0) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5 text-muted">
            <i class="bi bi-info-circle fs-3 d-block mb-2 text-warning"></i>
            Tidak ada data Asatidz mengajar pada hari <b>${escHtmlFan_(store.activeHariKBM)}</b> yang cocok dengan filter pencarian.
          </td>
        </tr>`;
    }
    if (typeof renderCardViewHariKBM === 'function') {
      renderCardViewHariKBM([]);
    }
    return;
  }

  // Kelompokkan berdasarkan Blok Kelas
  const mapKelompokBlok = {};
  filtered.forEach(item => {
    let blokAsli = String(item.blok || '').trim();
    if (!blokAsli || blokAsli === '-') blokAsli = 'Belum Diatur';
    const kunciBlok = blokAsli.replace(/^blok\s*/i, '').trim().toUpperCase();
    if (!mapKelompokBlok[kunciBlok]) {
      mapKelompokBlok[kunciBlok] = {
        namaBlok: blokAsli,
        daftarAsatidz: []
      };
    }
    mapKelompokBlok[kunciBlok].daftarAsatidz.push(item);
  });

  const daftarKelompok = Object.values(mapKelompokBlok).sort((a, b) =>
    bandingkanBlokHariKBM(a.namaBlok, b.namaBlok)
  );

  let html = '';
  let noUrut = 1;

  daftarKelompok.forEach(kelompok => {
    const labelBlok = formatLabelBlokHariKBM(kelompok.namaBlok);

    // Urutkan Asatidz di dalam setiap blok secara Natural Sort berdasarkan Kode/NIA
    kelompok.daftarAsatidz.sort((a, b) => compareNIANatural(a.nia, b.nia));

    // Baris Header Pemisah Blok (7 Kolom Penuh)
    html += `
      <tr class="table-group-divider" style="background: rgba(15, 118, 110, 0.08); border-top: 2px solid #0f766e; border-bottom: 1.5px solid #0f766e;">
        <td colspan="7" class="py-2 px-3">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-building-fill text-success fs-6"></i>
              <span class="fw-bold text-success text-uppercase" style="letter-spacing: 0.5px; font-size: 0.85rem;">
                ${escHtmlFan_(labelBlok)}
              </span>
            </div>
            <span class="badge bg-success rounded-pill px-3 py-1 shadow-xs font-monospace" style="font-size: 11px;">
              ${kelompok.daftarAsatidz.length} Asatidz
            </span>
          </div>
        </td>
      </tr>
    `;

    // Render Baris Asatidz di dalam Blok
    kelompok.daftarAsatidz.forEach(item => {
      const jahLower = item.jah.toLowerCase();
      const jahClass =
        jahLower.includes('mustahiq') || jahLower.includes('ms & koor')
          ? 'bg-success bg-opacity-10 text-success border-success'
          : 'bg-secondary bg-opacity-10 text-secondary border-secondary';

      let mengajarHtml = '';
      let kelasMustahiqHtml = '';
      let lokasiHtml = '';

      let slotsToShow = item.slots;
      if (fJam) {
        slotsToShow = slotsToShow.filter(s => s.jam === parseInt(fJam, 10));
      }

      slotsToShow.forEach((slot, sIdx) => {
        const borderTopClass = sIdx > 0 ? 'border-top pt-1 mt-1' : '';
        const jamBadge =
          slot.jam === 1
            ? '<span class="badge bg-success text-white py-0 px-2 me-1 font-monospace" style="font-size:10px;">Jam 1</span>'
            : '<span class="badge bg-primary text-white py-0 px-2 me-1 font-monospace" style="font-size:10px;">Jam 2</span>';

        // 1. Kolom Mengajar (Jam & Fan)
        mengajarHtml += `
          <div class="${borderTopClass} d-flex align-items-center">
            ${jamBadge} <span class="fw-semibold text-dark">${escHtmlFan_(slot.fan)}</span>
          </div>`;

        // 2. Kolom Kelas & Mustahiq (Interaktif: Klik untuk membuka Detail Kelas)
        const namaMustahiq = cariMustahiqKelasHariKBM(slot.kelas);
        const safeKelasEnc = encodeURIComponent(slot.kelas || '').replace(/'/g, '%27');
        kelasMustahiqHtml += `
          <div class="${borderTopClass} cell-klik-kelas rounded px-1"
               onclick="window.bukaDetailKelasDariHariKBM('${safeKelasEnc}')"
               title="Klik untuk melihat Detail Kelas ${escHtmlFan_(slot.kelas)}">
            <div class="fw-bold text-dark">${escHtmlFan_(slot.kelas)}</div>
            <small class="text-muted d-block" style="font-size:11px;">
              Mustahiq: <span class="text-success fw-semibold">${escHtmlFan_(namaMustahiq)}</span>
            </small>
          </div>`;

        // 3. Kolom Lokasi Diniyyah
        lokasiHtml += `
          <div class="${borderTopClass}">
            <i class="bi bi-geo-alt-fill text-danger me-1"></i><span class="text-secondary fw-semibold">${escHtmlFan_(slot.lokasi || '-')}</span>
          </div>`;
      });

      const safeNamaEnc = encodeURIComponent(item.nama).replace(/'/g, '%27');

      html += `
        <tr>
          <td class="text-center fw-bold text-muted">${noUrut++}</td>
          <td class="text-center font-monospace fw-bold text-dark">${escHtmlFan_(item.nia || '-')}</td>
          <td>
            <span class="fw-bold text-dark nama-pendidik-click"
                  style="cursor: pointer;"
                  onclick="window.bukaDetailAsatidzDariHariKBM('${safeNamaEnc}')"
                  title="Klik untuk lihat profil &amp; jadwal ${escHtmlFan_(item.nama)}">
              ${escHtmlFan_(item.nama)}
            </span>
          </td>
          <td class="text-center">
            <span class="badge ${jahClass} border px-2 py-1" style="font-size:10.5px;">${escHtmlFan_(item.jah)}</span>
          </td>
          <td>${mengajarHtml}</td>
          <td>${kelasMustahiqHtml}</td>
          <td>${lokasiHtml}</td>
        </tr>`;
    });
  });

  if (tbody) tbody.innerHTML = html;

  // Sinkronkan ke Mode Kartu
  if (typeof renderCardViewHariKBM === 'function') {
    renderCardViewHariKBM(filtered);
  }
}

// ============================================================================
// 3. TOGGLE MODE TAMPILAN (TABEL <-> KARTU) & RENDER MODE KARTU HARI KBM
// ============================================================================

/**
 * Mengubah mode tampilan antara Tabel ('table') dan Kartu ('card') pada halaman Hari KBM
 */
export function setHariKBMViewMode(mode) {
  store.hariKBMViewMode = mode === 'card' ? 'card' : 'table';

  const btnTabel = document.getElementById('btnViewTabelHariKBM');
  const btnKartu = document.getElementById('btnViewKartuHariKBM');

  if (btnTabel && btnKartu) {
    if (store.hariKBMViewMode === 'table') {
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

  const $tblWrap =$('#tableHariKBMWrapper');
  const $crdWrap =$('#cardHariKBMWrapper');

  if (store.hariKBMViewMode === 'table') {
    $crdWrap.hide();$tblWrap.show();
  } else {
    $tblWrap.hide();$crdWrap.show();
    renderCardViewHariKBM(store.dataHariKBMFiltered || []);
  }
}

/**
 * Merender data Hari KBM ke dalam Mode Kartu Grid Responsif (#cardHariKBMWrapper)
 * yang dikelompokkan berdasarkan Blok Kelas
 */
export function renderCardViewHariKBM(filteredData) {
  const container = document.getElementById('cardHariKBMWrapper');
  if (!container) return;

  if (!filteredData || filteredData.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-5 text-muted">
        <i class="bi bi-info-circle fs-3 d-block mb-2 text-warning"></i>
        Tidak ada data Asatidz mengajar pada hari <b>${escHtmlFan_(store.activeHariKBM)}</b> yang cocok dengan filter pencarian.
      </div>`;
    return;
  }

  const fJam = ($('#flt_hkbm_jam').val() || '').trim();

  // Kelompokkan berdasarkan Blok Kelas
  const mapKelompokBlok = {};
  filteredData.forEach(item => {
    let blokAsli = String(item.blok || '').trim();
    if (!blokAsli || blokAsli === '-') blokAsli = 'Belum Diatur';
    const kunciBlok = blokAsli.replace(/^blok\s*/i, '').trim().toUpperCase();
    if (!mapKelompokBlok[kunciBlok]) {
      mapKelompokBlok[kunciBlok] = {
        namaBlok: blokAsli,
        daftarAsatidz: []
      };
    }
    mapKelompokBlok[kunciBlok].daftarAsatidz.push(item);
  });

  const daftarKelompok = Object.values(mapKelompokBlok).sort((a, b) =>
    bandingkanBlokHariKBM(a.namaBlok, b.namaBlok)
  );

  let html = '';

  daftarKelompok.forEach(kelompok => {
    const labelBlok = formatLabelBlokHariKBM(kelompok.namaBlok);

    // Urutkan Asatidz secara Natural Sort berdasarkan Kode/NIA
    kelompok.daftarAsatidz.sort((a, b) => compareNIANatural(a.nia, b.nia));

    // Header Pemisah Blok untuk Mode Kartu
    html += `
      <div class="col-12 mt-2">
        <div class="d-flex justify-content-between align-items-center bg-success bg-opacity-10 border border-success border-opacity-25 rounded-3 px-3 py-2 shadow-xs">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-building-fill text-success fs-6"></i>
            <span class="fw-bold text-success text-uppercase" style="letter-spacing: 0.5px; font-size: 0.85rem;">
              ${escHtmlFan_(labelBlok)}
            </span>
          </div>
          <span class="badge bg-success rounded-pill px-3 py-1 font-monospace" style="font-size: 11px;">
            ${kelompok.daftarAsatidz.length} Asatidz
          </span>
        </div>
      </div>`;

    // Render Kartu per Asatidz
    kelompok.daftarAsatidz.forEach(item => {
      const jahLower = item.jah.toLowerCase();
      const jahClass =
        jahLower.includes('mustahiq') || jahLower.includes('ms & koor')
          ? 'bg-success bg-opacity-10 text-success border-success'
          : 'bg-secondary bg-opacity-10 text-secondary border-secondary';

      let slotsToShow = item.slots;
      if (fJam) {
        slotsToShow = slotsToShow.filter(s => s.jam === parseInt(fJam, 10));
      }

      let slotsHtml = '';
      slotsToShow.forEach((slot, sIdx) => {
        const jamBadge =
          slot.jam === 1
            ? '<span class="badge bg-success text-white py-1 px-2 font-monospace" style="font-size:10px;">Jam 1</span>'
            : '<span class="badge bg-primary text-white py-1 px-2 font-monospace" style="font-size:10px;">Jam 2</span>';
        const namaMustahiq = cariMustahiqKelasHariKBM(slot.kelas);
        const safeKelasEnc = encodeURIComponent(slot.kelas || '').replace(/'/g, '%27');

        slotsHtml += `
          <div class="p-2 rounded bg-light border ${sIdx > 0 ? 'mt-2' : ''}">
            <div class="d-flex justify-content-between align-items-center mb-1">
              ${jamBadge}
              <span class="fw-bold text-dark small text-truncate ms-2" title="${escHtmlFan_(slot.fan)}">${escHtmlFan_(slot.fan)}</span>
            </div>
            <div class="small text-muted d-flex justify-content-between align-items-center cell-klik-kelas rounded px-1 py-1"
                 onclick="window.bukaDetailKelasDariHariKBM('${safeKelasEnc}')"
                 title="Klik untuk melihat Detail Kelas ${escHtmlFan_(slot.kelas)}">
              <span>Kelas: <b class="text-success">${escHtmlFan_(slot.kelas)}</b></span>
              <span class="text-truncate ms-1" style="max-width: 135px;" title="Mustahiq: ${escHtmlFan_(namaMustahiq)}">
                <i class="bi bi-person-fill text-secondary me-1"></i>${escHtmlFan_(namaMustahiq)}
              </span>
            </div>
            <div class="small text-secondary mt-1 pt-1 border-top border-light-subtle d-flex align-items-center">
              <i class="bi bi-geo-alt-fill text-danger me-1"></i>
              <span class="fw-semibold text-truncate" title="Lokasi: ${escHtmlFan_(slot.lokasi || '-')}">${escHtmlFan_(slot.lokasi || '-')}</span>
            </div>
          </div>`;
      });

      const safeNamaEnc = encodeURIComponent(item.nama).replace(/'/g, '%27');
      const labelBlokKartu = formatLabelBlokHariKBM(item.blok);

      html += `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="card-panel asatidz-card-item h-100 p-3 d-flex flex-column justify-content-between shadow-xs">
            <div>
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div class="flex-grow-1 pe-2">
                  <h6 class="fw-bold text-dark mb-1 nama-pendidik-click text-truncate"
                      style="cursor: pointer;"
                      onclick="window.bukaDetailAsatidzDariHariKBM('${safeNamaEnc}')"
                      title="Klik untuk lihat profil &amp; jadwal ${escHtmlFan_(item.nama)}">
                    ${escHtmlFan_(item.nama)}
                  </h6>
                  <div class="d-flex flex-wrap gap-1 align-items-center mt-1">
                    <span class="badge bg-dark text-white font-monospace" style="font-size:10px;">${escHtmlFan_(item.nia || '-')}</span>
                    <span class="badge ${jahClass} border" style="font-size:10px;">${escHtmlFan_(item.jah || '-')}</span>
                    <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25" style="font-size:10px;">
                      <i class="bi bi-building me-1"></i>${escHtmlFan_(labelBlokKartu)}
                    </span>
                  </div>
                </div>
              </div>
              <div class="d-flex flex-column mt-2">
                ${slotsHtml || '<span class="text-muted small fst-italic">Tidak ada jam mengajar yang cocok.</span>'}
              </div>
            </div>
            <div class="text-center border-top pt-2 mt-3">
              <small class="text-success fst-italic"
                     style="cursor: pointer;"
                     onclick="window.bukaDetailAsatidzDariHariKBM('${safeNamaEnc}')">
                <i class="bi bi-eye me-1"></i>Klik untuk detail profil
              </small>
            </div>
          </div>
        </div>`;
    });
  });

  container.innerHTML = html;
}

// ============================================================================
// 4. INTERAKSI KLIK NAMA ASATIDZ & KLIK KELAS DARI HARI KBM
// ============================================================================

/**
 * Helper memformat rincian jadwal 1 hari pada Modal Detail Asatidz
 */
function formatJadwalHariDetailBadge(val) {
  if (!val || !String(val).trim()) {
    return '<span class="text-muted fst-italic small">Tidak ada jadwal</span>';
  }
  const slots = parseJadwalCell_Client(formatTampilanKelas(val));
  if (slots.length === 0) {
    return '<span class="text-muted fst-italic small">Tidak ada jadwal</span>';
  }

  return slots
    .map(s => {
      const fan = s.fan && s.fan !== '-' ? s.fan : '';
      const lok = s.lokasi && s.lokasi !== '-' ? `(${s.lokasi})` : '';
      const info = [fan, lok].filter(Boolean).join(' ');
      return `<span class="badge bg-white text-dark border me-1 mb-1 shadow-xs" style="font-size:11px;">
        <b class="text-success">Jam ${s.jam}:</b> ${escHtmlFan_(info || '-')}
      </span>`;
    })
    .join('');
}

/**
 * Membuka Pop-Up Modal Detail Profil & Jadwal Mingguan Asatidz (#detailModalAsatidz)
 * saat nama Asatidz pada tabel atau kartu Hari KBM diklik
 */
export function bukaDetailAsatidzDariHariKBM(namaEncoded) {
  const nama = decodeURIComponent(namaEncoded || '').trim();
  if (!nama) return;

  const asatidz = (store.globalDataAsatidz || []).find(
    a => String(a.nama_asatidz || '').trim().toUpperCase() === nama.toUpperCase()
  );

  if (!asatidz) {
    Swal.fire({
      icon: 'info',
      title: 'Profil Tidak Ditemukan',
      text: `Data profil untuk "${nama}" tidak ditemukan di Database Asatidz.`,
      timer: 1800,
      showConfirmButton: false
    });
    return;
  }

  store.selectedRowDataAsatidz = asatidz;
  renderDetailAsatidz(asatidz);

  // Tambahkan kartu Jadwal & Kelas Mengajar Mingguan (Sabtu s/d Kamis) ke dalam #detailContentAsatidz
  const detailContainer = document.getElementById('detailContentAsatidz');
  if (detailContainer) {
    const jdwObj = getJadwalGuru(asatidz.nama_asatidz);
    let kelasMengajarHtml = '<span class="text-muted fst-italic small">Belum ada kelas yang dipilih</span>';
    if (jdwObj.mengajar && String(jdwObj.mengajar).trim()) {
      kelasMengajarHtml = formatTampilanKelas(jdwObj.mengajar)
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
        .map(k => `<span class="badge bg-light text-dark border me-1 mb-1">${escHtmlFan_(k)}</span>`)
        .join('');
    }

    const rincianHariHtml = LIST_HARI.map(h => {
      const hVal = jdwObj[h.toLowerCase()] || '';
      const isHariAktif = h === store.activeHariKBM;
      return `
        <div class="d-flex align-items-start justify-content-between border-bottom py-2 gap-2 ${isHariAktif ? 'bg-success bg-opacity-10 px-2 rounded' : ''}">
          <div class="d-flex align-items-start flex-grow-1">
            <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 me-2 mt-1" style="min-width:65px; font-size:11px;">${h}</span>
            <div class="d-flex flex-wrap align-items-center flex-grow-1">
              ${formatJadwalHariDetailBadge(hVal)}
            </div>
          </div>
        </div>`;
    }).join('');

    const jadwalCardHtml = `
      <div class="bg-white p-3 rounded border shadow-sm mb-4">
        <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
          <h6 class="text-success fw-bold m-0">
            <i class="bi bi-calendar-week me-2"></i> Jadwal &amp; Kelas Mengajar
          </h6>
          <span class="badge bg-success rounded-pill px-3 py-1">${escHtmlFan_(jdwObj.totalJam || '0')} Jam Mengajar</span>
        </div>
        <div class="bg-light p-3 rounded border mb-3">
          <div class="small fw-bold text-muted mb-1">Kelas Mengajar:</div>
          <div>${kelasMengajarHtml}</div>
        </div>
        <div class="bg-light p-3 rounded border">
          <div class="small fw-bold text-muted mb-1">Rincian Jadwal Mengajar (Sabtu s/d Kamis):</div>
          <div class="d-flex flex-column">
            ${rincianHariHtml}
          </div>
        </div>
      </div>`;

    detailContainer.insertAdjacentHTML('beforeend', jadwalCardHtml);
  }

  $('#detailModalAsatidz').modal('show');
}

/**
 * Membuka Pop-Up Modal "Detail Kelas" (#modalDetailKelasKBM)
 * saat item Kelas pada kolom "KELAS & MUSTAHIQ" di halaman Hari KBM diklik
 */
export async function bukaDetailKelasDariHariKBM(namaKelasEncoded) {
  const namaKelas = decodeURIComponent(namaKelasEncoded || '').trim();
  if (!namaKelas || namaKelas === '-') return;

  if (!store.masterStrukturKelasKBM || store.masterStrukturKelasKBM.length === 0) {
    await renderJadwalKBM(true);
  }

  const targetNorm = normalisasiNamaKelas(namaKelas);
  const targetKelasObj = (store.masterStrukturKelasKBM || []).find(k => {
    const keyNorm = normalisasiNamaKelas(k.key);
    const klsTanpaGenderNorm = normalisasiNamaKelas(`${k.kls} ${k.bag} ${k.tingkat}`);
    return keyNorm === targetNorm || klsTanpaGenderNorm === targetNorm;
  });

  if (targetKelasObj) {
    bukaDetailKelasKBM(encodeURIComponent(targetKelasObj.key));
  } else {
    Swal.fire({
      icon: 'info',
      title: 'Detail Kelas Tidak Ditemukan',
      text: `Data struktur jadwal untuk kelas "${namaKelas}" belum tersedia.`,
      timer: 1800,
      showConfirmButton: false
    });
  }
}

// ============================================================================
// 5. FITUR EXPORT EXCEL & CETAK DOKUMEN RESMI HARI KBM
// ============================================================================

/**
 * Mengekspor data jadwal harian yang sedang tampil pada Hari KBM ke file Excel (.xlsx)
 */
export function exportHariKBMExcel() {
  const data = store.dataHariKBMFiltered || [];
  if (data.length === 0) {
    return Swal.fire({
      icon: 'warning',
      title: 'Data Kosong',
      text: 'Tidak ada data jadwal untuk diexport!'
    });
  }

  const hariAktif = store.activeHariKBM || 'Sabtu';
  const fJam = ($('#flt_hkbm_jam').val() || '').trim();

  const rows = [
    [`JADWAL MENGAJAR ASATIDZ - HARI ${hariAktif.toUpperCase()} (JAM 1 & JAM 2)`],
    ['MADRASAH DINIYYAH AL AMIRIYYAH'],
    [],
    [
      'NO',
      'BLOK',
      'KODE',
      'ASATIDZ',
      'JAH',
      'JAM',
      'MATA PELAJARAN (FAN)',
      'KELAS',
      'MUSTAHIQ',
      'LOKASI DINIYYAH'
    ]
  ];

  // Kelompokkan dan urutkan sama persis dengan urutan tampilan tabel
  const mapKelompokBlok = {};
  data.forEach(item => {
    let blokAsli = String(item.blok || '').trim();
    if (!blokAsli || blokAsli === '-') blokAsli = 'Belum Diatur';
    const kunciBlok = blokAsli.replace(/^blok\s*/i, '').trim().toUpperCase();
    if (!mapKelompokBlok[kunciBlok]) {
      mapKelompokBlok[kunciBlok] = {
        namaBlok: blokAsli,
        daftarAsatidz: []
      };
    }
    mapKelompokBlok[kunciBlok].daftarAsatidz.push(item);
  });

  const daftarKelompok = Object.values(mapKelompokBlok).sort((a, b) =>
    bandingkanBlokHariKBM(a.namaBlok, b.namaBlok)
  );

  let counter = 1;
  daftarKelompok.forEach(kelompok => {
    const labelBlok = formatLabelBlokHariKBM(kelompok.namaBlok);
    kelompok.daftarAsatidz.sort((a, b) => compareNIANatural(a.nia, b.nia));

    kelompok.daftarAsatidz.forEach(item => {
      let slots = item.slots;
      if (fJam) {
        slots = slots.filter(s => s.jam === parseInt(fJam, 10));
      }

      slots.forEach(s => {
        const mustahiq = cariMustahiqKelasHariKBM(s.kelas);
        rows.push([
          counter++,
          labelBlok,
          item.nia || '-',
          item.nama,
          item.jah || '-',
          `Jam ${s.jam}`,
          s.fan || '-',
          s.kelas || '-',
          mustahiq || '-',
          s.lokasi || '-'
        ]);
      });
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },  // NO
    { wch: 18 }, // BLOK
    { wch: 10 }, // KODE
    { wch: 30 }, // ASATIDZ
    { wch: 16 }, // JAH
    { wch: 10 }, // JAM
    { wch: 25 }, // FAN
    { wch: 18 }, // KELAS
    { wch: 28 }, // MUSTAHIQ
    { wch: 26 }  // LOKASI
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Hari_${hariAktif}`);
  XLSX.writeFile(wb, `Jadwal_Hari_${hariAktif}_Kurikulum_Madin.xlsx`);
}

/**
 * Mencetak dokumen resmi Hari KBM menggunakan class terisolasi `body.printing-hari-kbm`
 */
export function cetakHariKBM() {
  document.body.classList.add('printing-hari-kbm');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-hari-kbm');
  }, 600);
}
