import { store } from '../../state/store.js';
import { fetchAllAsatidzFromSupabase } from '../asatidz/asatidz.js';
import { loadFormasiData } from '../formasi/formasi.js';
import { escHtmlFan_, isKelasUnggulan } from '../fan/fan.js';
import {
  loadJadwalKbmFromSupabase,
  getJadwalGuru,
  parseJadwalCell_Client,
  formatTampilanKelas,
  LIST_HARI
} from '../jadwal-kbm/jadwal-kbm.js';
import {
  dapatkanBlokDariSesiMengajar,
  formatLabelBlokHariKBM,
  bandingkanBlokHariKBM
} from '../hari-kbm/hari-kbm.js';
import {
  loadAbsensiFromSupabase,
  bangunArrayRiwayatDariMap,
  ARRAY_HARI_IND
} from '../absensi/absensi.js';

let drilldownRowClickBound = false;

// ============================================================================
// 1. INISIALISASI HALAMAN, BATASAN ROLE, & PINTASAN RENTANG TANGGAL
// ============================================================================

/**
 * Inisialisasi halaman Rekap Absensi Asatidz saat menu pertama kali dibuka
 */
export function inisialisasiHalamanRekapAbsensi() {
  terapkanBatasanRoleRekap();
  pasangListenerKlikBarisRekap();

  if (!store.rekapAbsensiInitialized) {
    store.rekapAbsensiInitialized = true;
    setRentangCepatRekap('bulan'); // otomatis memanggil muatDataRekapAbsensi()
  } else {
    muatDataRekapAbsensi();
  }
}

/**
 * Menerapkan batasan tampilan tombol berdasarkan peran pengguna (`store.currentUser`)
 */
export function terapkanBatasanRoleRekap() {
  const currentUser = store.currentUser;
  if (currentUser && currentUser.role === 'Asatidz') {
    $('#rk_flt_nama').val(currentUser.nama || '').prop('disabled', true);
    $('#btnExportRekap').addClass('d-none');
    $('#btnCetakRekap').addClass('d-none');
    $('#wrapTop10Alfa').addClass('d-none');
  } else {
    $('#rk_flt_nama').prop('disabled', false);
    $('#btnExportRekap').removeClass('d-none');
    $('#btnCetakRekap').removeClass('d-none');
    $('#wrapTop10Alfa').removeClass('d-none');
  }
}

/**
 * Memasang event listener klik pada baris `#dataTableRekapAbsensi` untuk membuka Modal Drill-Down
 */
function pasangListenerKlikBarisRekap() {
  if (drilldownRowClickBound) return;
  drilldownRowClickBound = true;

  $(document).on('click', '#dataTableRekapAbsensi tbody tr', function () {
    if (!store.dataTableRekapAbsensi) return;
    const rowData = store.dataTableRekapAbsensi.row(this).data();
    if (!rowData) return;

    const namaEncoded = $(rowData[1]).attr('data-nama') || '';
    const nama = decodeURIComponent(namaEncoded);
    const obj = (store.rekapAbsensiState?.dataPerAsatidzFiltered || []).find(
      o => o.nama === nama
    );
    if (obj) {
      bukaModalDrilldownRekap(obj);
    }
  });
}

/**
 * Pintasan rentang tanggal cepat ('minggu' | 'bulan' | 'lalu')
 */
export function setRentangCepatRekap(tipe) {
  const now = new Date();
  let dari;
  let sampai;

  if (tipe === 'minggu') {
    const day = now.getDay(); // 0=Ahad ... 6=Sabtu
    const diffToMonday = day === 0 ? 6 : day - 1;
    dari = new Date(now);
    dari.setDate(now.getDate() - diffToMonday);
    sampai = new Date(dari);
    sampai.setDate(dari.getDate() + 6);
  } else if (tipe === 'bulan') {
    dari = new Date(now.getFullYear(), now.getMonth(), 1);
    sampai = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (tipe === 'lalu') {
    dari = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    sampai = new Date(now.getFullYear(), now.getMonth(), 0);
  } else {
    return;
  }

  const fmt = d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  $('#rk_tgl_dari').val(fmt(dari));
  $('#rk_tgl_sampai').val(fmt(sampai));

  // Highlight tombol pintasan periode yang sedang aktif
  $('#page-rekap-absensi .btn-group button').removeClass('active');
  if (tipe === 'minggu') {
    $('#page-rekap-absensi .btn-group button:eq(0)').addClass('active');
  } else if (tipe === 'bulan') {
    $('#page-rekap-absensi .btn-group button:eq(1)').addClass('active');
  } else if (tipe === 'lalu') {
    $('#page-rekap-absensi .btn-group button:eq(2)').addClass('active');
  }

  muatDataRekapAbsensi();
}

/**
 * Mereset seluruh filter kriteria & mengembalikan rentang periode ke Bulan Ini
 */
export function resetFilterRekapAbsensi() {
  $('#rk_flt_blok').val('');
  $('#rk_flt_tingkat').val('');
  $('#rk_flt_jah').val('');
  if (!(store.currentUser && store.currentUser.role === 'Asatidz')) {
    $('#rk_flt_nama').val('');
  }
  setRentangCepatRekap('bulan');
}

// ============================================================================
// 2. HELPER PEMETAAN BLOK, PENGISIAN DROPDOWN FILTER, & KALKULASI REKAP
// ============================================================================

/**
 * Memformat label Blok pada Rekap Absensi (mengembalikan 'Belum Diatur' bila kosong / '-')
 */
export function formatLabelBlokRekap(blok) {
  const raw = String(blok || '').trim();
  if (
    !raw ||
    raw === '-' ||
    raw.toLowerCase() === 'belum diatur' ||
    raw.toLowerCase() === 'blok belum diatur'
  ) {
    return 'Belum Diatur';
  }
  return formatLabelBlokHariKBM(raw);
}

/**
 * Menentukan Blok Kelas Asatidz berdasarkan lokasi mengajar / lokasi Diniyyah & Takror pada Formasi Kelas
 * (Mengembalikan '-' bila lokasi belum dipetakan di Formasi sehingga tampil sebagai 'Belum Diatur')
 */
function dapatkanBlokRekapAsatidz(asatidzObj, lokasiOverride = '') {
  const lokTarget = String(
    lokasiOverride ||
      asatidzObj?.lokasi_diniyyah ||
      asatidzObj?.lokasi_takror ||
      ''
  ).trim();

  if (lokTarget && lokTarget !== '-') {
    const normLok = lokTarget.replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const foundFormasi = (store.globalDataFormasi || []).find(f => {
      const fDin = String(f.lokasi_diniyyah || '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      const fTak = String(f.lokasi_takror || '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      return (fDin && fDin === normLok) || (fTak && fTak === normLok);
    });
    if (foundFormasi && foundFormasi.blok && String(foundFormasi.blok).trim() !== '-') {
      return formatLabelBlokRekap(foundFormasi.blok);
    }
  }

  if (asatidzObj) {
    const dinKls = String(asatidzObj.din_kls_asatidz || '').trim();
    const dinBag = String(asatidzObj.din_bag_asatidz || '').trim().toUpperCase();
    const tingkat = String(asatidzObj.tingkat_asatidz || '').trim().toUpperCase();
    const papi = String(asatidzObj.pa_pi || '').trim().toUpperCase();

    if (dinKls && dinBag && tingkat) {
      const foundKelas = (store.globalDataFormasi || []).find(f => {
        return (
          String(f.din_kls || '').trim() === dinKls &&
          String(f.din_bag || '').trim().toUpperCase() === dinBag &&
          String(f.tingkat || '').trim().toUpperCase() === tingkat &&
          (!papi || String(f.pa_pi || '').trim().toUpperCase() === papi)
        );
      });
      if (foundKelas && foundKelas.blok && String(foundKelas.blok).trim() !== '-') {
        return formatLabelBlokRekap(foundKelas.blok);
      }
    }
  }

  return '-';
}

/**
 * Mengisi opsi dropdown `#rk_flt_blok`, `#rk_flt_tingkat`, dan `#rk_flt_jah`
 */
export function isiOpsiFilterRekap() {
  const setTingkat = new Set();
  const setJah = new Set();
  const setBlok = new Set();

  (store.globalDataFormasi || []).forEach(f => {
    const blk = String(f.blok || '').trim();
    if (blk && blk !== '-' && blk.toLowerCase() !== 'belum diatur') {
      setBlok.add(formatLabelBlokRekap(blk));
    }
  });

  (store.globalDataAsatidz || []).forEach(a => {
    const tkt = String(a.tingkat_asatidz || '').trim().toUpperCase();
    if (tkt && tkt !== '-') setTingkat.add(tkt);

    const jah = String(a.jah_asatidz || '').trim();
    if (jah && jah !== '-') setJah.add(jah);
  });

  // 1. Dropdown Blok
  const curBlok = $('#rk_flt_blok').val();
  let optsBlok = '<option value="">Semua Blok</option>';
  Array.from(setBlok)
    .sort((a, b) => bandingkanBlokHariKBM(a, b))
    .forEach(b => {
      optsBlok += `<option value="${escHtmlFan_(b)}">${escHtmlFan_(b)}</option>`;
    });
  optsBlok += '<option value="-">Belum Diatur</option>';
  $('#rk_flt_blok').html(optsBlok);
  if (curBlok) $('#rk_flt_blok').val(curBlok);

  // 2. Dropdown Tingkat
  const curTkt = $('#rk_flt_tingkat').val();
  let optsTkt = '<option value="">Semua</option>';
  Array.from(setTingkat)
    .sort()
    .forEach(t => {
      optsTkt += `<option value="${escHtmlFan_(t)}">${escHtmlFan_(t)}</option>`;
    });
  $('#rk_flt_tingkat').html(optsTkt);
  if (curTkt) $('#rk_flt_tingkat').val(curTkt);

  // 3. Dropdown Jah
  const curJah = $('#rk_flt_jah').val();
  let optsJah = '<option value="">Semua</option>';
  Array.from(setJah)
    .sort()
    .forEach(j => {
      optsJah += `<option value="${escHtmlFan_(j)}">${escHtmlFan_(j)}</option>`;
    });
  $('#rk_flt_jah').html(optsJah);
  if (curJah) $('#rk_flt_jah').val(curJah);
}

/**
 * Menghitung jumlah sesi jadwal mingguan per Asatidz per hari (Sabtu..Kamis)
 * dari `store.jadwalMengajarMap` (termasuk Jam 3 & Jam 4 otomatis untuk Mustahiq Kelas Asal)
 */
function bangunJadwalMingguanPerGuru() {
  const schedulePerGuruHari = {};

  (store.globalDataAsatidz || []).forEach(a => {
    const nama = String(a.nama_asatidz || '').trim();
    if (!nama) return;
    const key = nama.toUpperCase();
    schedulePerGuruHari[key] = {
      Sabtu: 0,
      Ahad: 0,
      Senin: 0,
      Selasa: 0,
      Rabu: 0,
      Kamis: 0
    };

    const jdwObj = getJadwalGuru(nama);
    const jahLower = String(a.jah_asatidz || '').trim().toLowerCase();
    const dinKls = String(a.din_kls_asatidz || '').trim();
    const dinBag = String(a.din_bag_asatidz || '').trim();
    const tingkat = String(a.tingkat_asatidz || '').trim();

    const isMustahiq =
      jahLower.includes('mustahiq') ||
      jahLower.includes('ms & koor') ||
      jahLower === 'ist' ||
      jahLower.includes("isti'dad");

    LIST_HARI.forEach(hari => {
      const hariLower = hari.toLowerCase();
      const cellStr = jdwObj[hariLower] || '';
      const slots = parseJadwalCell_Client(formatTampilanKelas(cellStr));
      const jamSet = new Set();

      slots.forEach(s => {
        if (s.jam >= 1 && s.jam <= 4) {
          jamSet.add(s.jam);
        }
      });

      // Jika Mustahiq memiliki Kelas Asal lengkap namun Jam 3 & 4 belum tertulis eksplisit di jadwalMengajarMap
      if (isMustahiq && dinKls && dinBag && tingkat && slots.length > 0) {
        jamSet.add(3);
        jamSet.add(4);
      }

      schedulePerGuruHari[key][hari] = jamSet.size;
    });
  });

  return schedulePerGuruHari;
}

/**
 * ENGINE UTAMA: Menghitung rekap kehadiran mengajar per Asatidz pada rentang tanggal terpilih
 */
export function hitungRekapAbsensi() {
  const tglDari = $('#rk_tgl_dari').val();
  const tglSampai = $('#rk_tgl_sampai').val();
  if (!tglDari || !tglSampai) return [];

  // 1. Peta jumlah sesi per guru per hari (Sabtu..Kamis)
  const schedulePerGuruHari = bangunJadwalMingguanPerGuru();

  // 2. Hitung berapa kali tiap nama hari (Sabtu..Kamis) muncul dalam rentang tanggal (kecuali hari libur)
  const weekdayCount = {
    Sabtu: 0,
    Ahad: 0,
    Senin: 0,
    Selasa: 0,
    Rabu: 0,
    Kamis: 0
  };
  const dCursor = new Date(tglDari + 'T00:00:00');
  const dEnd = new Date(tglSampai + 'T00:00:00');
  let pengaman = 0;

  while (dCursor <= dEnd && pengaman < 5000) {
    const yyyy = dCursor.getFullYear();
    const mm = String(dCursor.getMonth() + 1).padStart(2, '0');
    const dd = String(dCursor.getDate()).padStart(2, '0');
    const ymd = `${yyyy}-${mm}-${dd}`;

    const isHariLibur = !!(store.liburMapByDate && store.liburMapByDate[ymd]);
    if (!isHariLibur) {
      const namaHari = ARRAY_HARI_IND[dCursor.getDay()];
      if (Object.prototype.hasOwnProperty.call(weekdayCount, namaHari)) {
        weekdayCount[namaHari]++;
      }
    }
    dCursor.setDate(dCursor.getDate() + 1);
    pengaman++;
  }

  // 3. Saring data riwayat absensi sesuai rentang tanggal
  const riwayatFiltered = (store.rawRiwayatAbsensi || []).filter(r => {
    const tgl = String(r[2] || '').trim();
    return tgl >= tglDari && tgl <= tglSampai;
  });

  // 4. Inisialisasi rekap dari master Asatidz
  const mapAsatidz = {};
  (store.globalDataAsatidz || []).forEach(a => {
    const nama = String(a.nama_asatidz || '').trim();
    if (!nama) return;
    const key = nama.toUpperCase();
    const sch = schedulePerGuruHari[key] || {};

    let totalTerjadwal = 0;
    Object.keys(weekdayCount).forEach(hari => {
      totalTerjadwal += (sch[hari] || 0) * weekdayCount[hari];
    });

    mapAsatidz[key] = {
      nama,
      nia: a.nia || '-',
      blok: dapatkanBlokRekapAsatidz(a),
      jah: a.jah_asatidz || '-',
      tingkat: a.tingkat_asatidz || '-',
      totalTerjadwal,
      hadir: 0,
      izin: 0,
      sakit: 0,
      alfa: 0,
      terlambatCount: 0,
      terlambatMenit: 0,
      digantikan: 0,
      tugasLain: 0,
      jadwalKosong: 0,
      totalTercatat: 0,
      detail: []
    };
  });

  // 5. Masukkan rekaman absensi tersimpan ke masing-masing Asatidz
  riwayatFiltered.forEach(r => {
    const nama = String(r[5] || '').trim();
    if (!nama) return;
    const key = nama.toUpperCase();

    if (!mapAsatidz[key]) {
      mapAsatidz[key] = {
        nama,
        nia: r[6] || '-',
        blok: dapatkanBlokRekapAsatidz(null, r[12] || ''),
        jah: '-',
        tingkat: r[7] || '-',
        totalTerjadwal: 0,
        hadir: 0,
        izin: 0,
        sakit: 0,
        alfa: 0,
        terlambatCount: 0,
        terlambatMenit: 0,
        digantikan: 0,
        tugasLain: 0,
        jadwalKosong: 0,
        totalTercatat: 0,
        detail: []
      };
    }

    const obj = mapAsatidz[key];
    const status = r[13];
    obj.totalTercatat++;

    if (status === 'Hadir') obj.hadir++;
    else if (status === 'Izin') obj.izin++;
    else if (status === 'Sakit') obj.sakit++;
    else if (status === 'Alfa') obj.alfa++;
    else if (status === 'Terlambat') {
      obj.terlambatCount++;
      obj.terlambatMenit += parseInt(r[15], 10) || 0;
    } else if (status === 'Digantikan') obj.digantikan++;
    else if (status === 'Tugas Lain') obj.tugasLain++;
    else if (status === 'Jadwal Kosong') obj.jadwalKosong++;

    obj.detail.push({
      tanggal: r[2],
      hari: r[3],
      jam: r[4],
      kelas: r[10],
      fan: r[11],
      status,
      keterangan: r[14] || '',
      menitTerlambat: r[15] || '',
      pengganti: r[16] || ''
    });
  });

  // 6. Hitung metrik turunan: sesi tidak terlaksana, % kehadiran, dan predikat
  let rows = Object.values(mapAsatidz).map(o => {
    const kekuranganTanpaData = Math.max(0, o.totalTerjadwal - o.totalTercatat);
    const tidakTerlaksana = o.alfa + o.jadwalKosong + kekuranganTanpaData;
    const dasarHadir = o.hadir + o.terlambatCount; // Terlambat tetap dihitung hadir mengajar
    const pct = o.totalTerjadwal > 0 ? (dasarHadir / o.totalTerjadwal) * 100 : 0;
    const predikat =
      pct >= 95
        ? 'Sangat Baik'
        : pct >= 85
          ? 'Baik'
          : pct >= 70
            ? 'Perlu Perhatian'
            : 'Kritis';

    return Object.assign(o, { tidakTerlaksana, pct, predikat });
  });

  // 7. Saring baris yang memiliki kewajiban jadwal atau rekaman presensi
  rows = rows.filter(o => o.totalTerjadwal > 0 || o.totalTercatat > 0);

  return rows;
}

/**
 * Memuat data dari Supabase (bila diperlukan), menghitung rekap, menerapkan filter UI, & merender Tabel + KPI
 */
export async function muatDataRekapAbsensi(forceRefresh = false) {
  if (!$('#rk_tgl_dari').val() \vert{}\vert{} !$('#rk_tgl_sampai').val()) return;

  if (forceRefresh) {
    Swal.fire({
      title: 'Memuat Rekap...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  try {
    if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0 || forceRefresh) {
      store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    }
    if (!store.globalDataFormasi || store.globalDataFormasi.length === 0 || forceRefresh) {
      await loadFormasiData();
    }
    await loadJadwalKbmFromSupabase(forceRefresh);
    await loadAbsensiFromSupabase(forceRefresh);
    bangunArrayRiwayatDariMap();

    isiOpsiFilterRekap();
    let allRows = hitungRekapAbsensi();

    // Pembatasan akses berbasis role
    if (store.currentUser && store.currentUser.role === 'Asatidz') {
      allRows = allRows.filter(
        o => o.nama.trim().toUpperCase() === store.currentUser.nama.trim().toUpperCase()
      );
    }

    // Filter UI
    const fBlok = ($('#rk_flt_blok').val() || '').trim();
    const fTkt = ($('#rk_flt_tingkat').val() || '').trim().toUpperCase();
    const fJah = ($('#rk_flt_jah').val() || '').trim();
    const fNama = ($('#rk_flt_nama').val() || '').trim().toLowerCase();

    const filtered = allRows.filter(o => {
      if (fBlok) {
        if (fBlok === '-') {
          if (o.blok !== '-' && formatLabelBlokRekap(o.blok) !== 'Belum Diatur') return false;
        } else if (formatLabelBlokRekap(o.blok) !== fBlok) {
          return false;
        }
      }
      if (fTkt && String(o.tingkat || '').trim().toUpperCase() !== fTkt) return false;
      if (fJah && String(o.jah || '').trim() !== fJah) return false;
      if (
        fNama &&
        !o.nama.toLowerCase().includes(fNama) &&
        !String(o.nia || '').toLowerCase().includes(fNama)
      ) {
        return false;
      }
      return true;
    });

    store.rekapAbsensiState.dataPerAsatidz = allRows;
    store.rekapAbsensiState.dataPerAsatidzFiltered = filtered;

    renderTabelRekap(filtered);
    renderKpiRekap(filtered);

    if (forceRefresh) {
      Swal.close();
    }
  } catch (err) {
    if (forceRefresh) Swal.close();
    Swal.fire({
      icon: 'error',
      title: 'Gagal Memuat Rekap Absensi',
      text: err.message
    });
  }
}

// ============================================================================
// 3. RENDER TABEL DATATABLES (14 KOLOM), 4 KARTU KPI, & MODAL DRILL-DOWN
// ============================================================================

/**
 * Mengembalikan class warna badge berdasarkan Predikat kehadiran
 */
export function getBadgePredikatClass(predikat) {
  if (predikat === 'Sangat Baik') {
    return 'bg-success bg-opacity-10 text-success border border-success border-opacity-25';
  }
  if (predikat === 'Baik') {
    return 'bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25';
  }
  if (predikat === 'Perlu Perhatian') {
    return 'bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25';
  }
  return 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25';
}

/**
 * Merender tabel utama `#dataTableRekapAbsensi` (14 Kolom — Persis Tangkapan Layar)
 */
export function renderTabelRekap(rows) {
  if (store.dataTableRekapAbsensi) {
    store.dataTableRekapAbsensi.destroy();
    $('#tableBodyRekapAbsensi').empty();
  }

  const dtRows = (rows || []).map((o, i) => {
    const badgeClass = getBadgePredikatClass(o.predikat);
    const labelBlok = formatLabelBlokRekap(o.blok);

    return [
      i + 1,
      `<span class="fw-bold text-dark rk-link-nama" data-nama="${encodeURIComponent(o.nama)}">${escHtmlFan_(o.nama)}</span>`,
      escHtmlFan_(o.nia),
      `<span class="badge bg-light text-dark border">${escHtmlFan_(labelBlok)}</span>`,
      escHtmlFan_(o.jah),
      o.totalTerjadwal,
      `<span class="text-success fw-bold">${o.hadir}</span>`,
      o.izin,
      o.sakit,
      `<span class="text-danger fw-bold">${o.alfa}</span>`,
      `${o.terlambatCount}x <small class="text-muted">(${o.terlambatMenit} mnt)</small>`,
      o.digantikan,
      `<b>${o.pct.toFixed(1)}%</b>`,
      `<span class="badge ${badgeClass} px-2 py-1">${escHtmlFan_(o.predikat)}</span>`
    ];
  });

  store.dataTableRekapAbsensi = $('#dataTableRekapAbsensi').DataTable({
    data: dtRows,
    scrollX: true,
    scrollCollapse: true,
    autoWidth: true,
    processing: true,
    pageLength: 25,
    lengthMenu: [
      [10, 25, 50, 100],
      [10, 25, 50, 100]
    ],
    language: {
      search: 'Cari:',
      lengthMenu: 'Tampilkan _MENU_ data',
      info: 'Menampilkan _START_ - _END_ dari _TOTAL_ Asatidz',
      emptyTable: 'Tidak ada data pada periode/filter ini.'
    },
    columnDefs: [
      { className: 'text-center', targets: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] }
    ],
    order: [[12, 'asc']],
    initComplete: function () {
      const api = this.api();
      setTimeout(() => api.columns.adjust(), 150);
    },
    drawCallback: function () {
      const api = this.api();
      setTimeout(() => api.columns.adjust(), 100);
    }
  });

  // Penomoran otomatis kolom NO mengikuti pengurutan & pencarian aktif
  store.dataTableRekapAbsensi
    .on('order.dt search.dt', function () {
      let i = 1;
      store.dataTableRekapAbsensi
        .cells(null, 0, { search: 'applied', order: 'applied' })
        .every(function () {
          this.data(i++);
        });
    })
    .draw();
}

/**
 * Merender 4 Kartu KPI Ringkasan Global (`#rk_kpi_total`, `#rk_kpi_avg`, `#rk_kpi_tidak_terlaksana`, `#rk_kpi_terendah_nama`)
 */
export function renderKpiRekap(rows) {
  const list = rows || [];
  const total = list.length;
  $('#rk_kpi_total').text(total);

  if (total === 0) {
    $('#rk_kpi_avg').text('0%');
    $('#rk_kpi_tidak_terlaksana').text('0');
    $('#rk_kpi_terendah_nama').text('-');
    $('#rk_kpi_terendah_pct').text('0%');
    return;
  }

  let sumPct = 0;
  let sumTidakTerlaksana = 0;
  let terendah = list[0];

  list.forEach(o => {
    sumPct += o.pct;
    sumTidakTerlaksana += o.tidakTerlaksana;
    if (o.totalTerjadwal > 0 && o.pct < terendah.pct) {
      terendah = o;
    }
  });

  $('#rk_kpi_avg').text((sumPct / total).toFixed(1) + '%');
  $('#rk_kpi_tidak_terlaksana').text(sumTidakTerlaksana);
  $('#rk_kpi_terendah_nama').text(terendah.nama);
  $('#rk_kpi_terendah_pct').text(terendah.pct.toFixed(1) + '% Kehadiran');
}

/**
 * Membuka Modal Drill-Down (`#modalDrilldownRekap`): Menampilkan 8 Kartu Ringkasan & Rincian Harian per Asatidz
 */
export function bukaModalDrilldownRekap(obj) {
  if (!obj) return;

  $('#dd_rekap_title').html(
    `<i class="bi bi-person-badge me-2"></i> ${escHtmlFan_(obj.nama)} <small class="fw-normal opacity-75">(NIA: ${escHtmlFan_(obj.nia)})</small>`
  );

  const badgeClass = getBadgePredikatClass(obj.predikat);

  $('#dd_rekap_summary_cards').html(`
    <div class="col-6 col-md-3"><div class="p-2 bg-white rounded border text-center h-100"><div class="small text-muted">Sesi Terjadwal</div><div class="fw-bold fs-5">${obj.totalTerjadwal}</div></div></div>
    <div class="col-6 col-md-3"><div class="p-2 bg-white rounded border text-center h-100"><div class="small text-muted">Hadir</div><div class="fw-bold fs-5 text-success">${obj.hadir}</div></div></div>
    <div class="col-6 col-md-3"><div class="p-2 bg-white rounded border text-center h-100"><div class="small text-muted">Izin / Sakit</div><div class="fw-bold fs-5 text-primary">${obj.izin + obj.sakit}</div></div></div>
    <div class="col-6 col-md-3"><div class="p-2 bg-white rounded border text-center h-100"><div class="small text-muted">Alfa</div><div class="fw-bold fs-5 text-danger">${obj.alfa}</div></div></div>
    <div class="col-6 col-md-3"><div class="p-2 bg-white rounded border text-center h-100"><div class="small text-muted">Terlambat</div><div class="fw-bold fs-6">${obj.terlambatCount}x <br>(${obj.terlambatMenit} mnt)</div></div></div>
    <div class="col-6 col-md-3"><div class="p-2 bg-white rounded border text-center h-100"><div class="small text-muted">Digantikan</div><div class="fw-bold fs-5">${obj.digantikan}</div></div></div>
    <div class="col-6 col-md-3"><div class="p-2 bg-white rounded border text-center h-100"><div class="small text-muted">Tidak Terlaksana</div><div class="fw-bold fs-5 text-danger">${obj.tidakTerlaksana}</div></div></div>
    <div class="col-6 col-md-3"><div class="p-2 bg-white rounded border text-center h-100"><div class="small text-muted">% Kehadiran</div><div class="fw-bold fs-5">${obj.pct.toFixed(1)}%</div><span class="badge ${badgeClass}">${escHtmlFan_(obj.predikat)}</span></div></div>
  `);

  if ($.fn.DataTable.isDataTable('#dataTableDrilldownRekap')) {
    $('#dataTableDrilldownRekap').DataTable().destroy();
  }

  const tbody = $('#tbodyDrilldownRekap');
  tbody.empty();

  const sortedDetail = (obj.detail || [])
    .slice()
    .sort((a, b) => String(a.tanggal || '').localeCompare(String(b.tanggal || '')));

  if (sortedDetail.length === 0) {
    tbody.html(
      '<tr><td colspan="7" class="text-center text-muted py-3">Tidak ada rincian data absensi tersimpan pada periode ini.</td></tr>'
    );
  } else {
    sortedDetail.forEach(d => {
      const stLower = String(d.status || '')
        .toLowerCase()
        .replace(/\s+/g, '');
      const badgeStatus = `<span class="badge badge-status-${stLower}">${escHtmlFan_(d.status)}</span>`;
      const ket =
        d.keterangan ||
        (d.status === 'Terlambat'
          ? `Terlambat ${d.menitTerlambat} mnt`
          : d.status === 'Digantikan'
            ? `Diganti: ${d.pengganti}`
            : '-');

      tbody.append(`
        <tr>
          <td class="text-center">${escHtmlFan_(d.tanggal)}</td>
          <td class="text-center">${escHtmlFan_(d.hari)}</td>
          <td class="text-center">${escHtmlFan_(d.jam)}</td>
          <td>${escHtmlFan_(d.kelas || '-')}</td>
          <td>${escHtmlFan_(d.fan || '-')}</td>
          <td class="text-center">${badgeStatus}</td>
          <td><small class="text-muted">${escHtmlFan_(ket)}</small></td>
        </tr>
      `);
    });

    $('#dataTableDrilldownRekap').DataTable({
      pageLength: 10,
      scrollX: true,
      language: {
        search: 'Cari:',
        info: '_START_ - _END_ dari _TOTAL_',
        emptyTable: 'Tidak ada data'
      }
    });
  }

  $('#modalDrilldownRekap').modal('show');
}

// ============================================================================
// 4. EXPORT EXCEL (2 SHEET), CETAK REKAP RESMI, & TOP 10 ALFA TERBANYAK
// ============================================================================

/**
 * Memformat tanggal "YYYY-MM-DD" menjadi format Bahasa Indonesia (contoh: "1 Oktober 2026")
 */
export function formatTanggalIndoRekap(ymd) {
  if (!ymd) return '-';
  const BULAN_IND = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
  ];
  const p = String(ymd).split('-');
  if (p.length < 3) return ymd;
  return `${parseInt(p[2], 10)} ${BULAN_IND[parseInt(p[1], 10) - 1] || p[1]} ${p[0]}`;
}

/**
 * Mengekspor data Rekap Absensi ke file Excel 2 Sheet sekaligus ("Ringkasan" & "Detail")
 */
export function exportRekapAbsensiExcel() {
  const rows = store.rekapAbsensiState?.dataPerAsatidzFiltered || [];
  if (rows.length === 0) {
    return Swal.fire('Data Kosong', 'Tidak ada data rekap untuk diexport.', 'info');
  }

  const ringkasanHeader = [
    'No',
    'Asatidz',
    'NIA',
    'Blok',
    'Jah',
    'Sesi Terjadwal',
    'Hadir',
    'Izin',
    'Sakit',
    'Alfa',
    'Terlambat (Jml)',
    'Terlambat (Menit)',
    'Digantikan',
    'Sesi Tidak Terlaksana',
    '% Kehadiran',
    'Predikat'
  ];
  const ringkasanData = [ringkasanHeader];

  const detailHeader = [
    'Asatidz',
    'NIA',
    'Tanggal',
    'Hari',
    'Jam',
    'Kelas',
    'Fan',
    'Status',
    'Keterangan'
  ];
  const detailData = [detailHeader];

  rows.forEach((o, i) => {
    ringkasanData.push([
      i + 1,
      o.nama,
      o.nia,
      formatLabelBlokRekap(o.blok),
      o.jah,
      o.totalTerjadwal,
      o.hadir,
      o.izin,
      o.sakit,
      o.alfa,
      o.terlambatCount,
      o.terlambatMenit,
      o.digantikan,
      o.tidakTerlaksana,
      o.pct.toFixed(1) + '%',
      o.predikat
    ]);

    (o.detail || []).forEach(d => {
      detailData.push([
        o.nama,
        o.nia,
        d.tanggal,
        d.hari,
        d.jam,
        d.kelas,
        d.fan,
        d.status,
        d.keterangan
      ]);
    });
  });

  const ws1 = XLSX.utils.aoa_to_sheet(ringkasanData);
  const ws2 = XLSX.utils.aoa_to_sheet(detailData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan');
  XLSX.utils.book_append_sheet(wb, ws2, 'Detail');
  XLSX.writeFile(
    wb,
    `Rekap_Absensi_Asatidz_${$('#rk_tgl_dari').val()}_sd_${$('#rk_tgl_sampai').val()}.xlsx`
  );
}

/**
 * Mencetak Dokumen Rekap Resmi lengkap dengan Kop Madrasah serta area tanda tangan Kepala TU & Pengasuh
 */
export function cetakRekapResmi() {
  const rows = store.rekapAbsensiState?.dataPerAsatidzFiltered || [];
  if (rows.length === 0) {
    return Swal.fire('Data Kosong', 'Tidak ada data untuk dicetak.', 'info');
  }

  const tglDari = $('#rk_tgl_dari').val();
  const tglSampai = $('#rk_tgl_sampai').val();

  const bodyRows = rows
    .map(
      (o, i) => `
    <tr>
      <td class="text-center">${i + 1}</td>
      <td>${escHtmlFan_(o.nama)}</td>
      <td class="text-center">${escHtmlFan_(o.nia)}</td>
      <td class="text-center">${escHtmlFan_(formatLabelBlokRekap(o.blok))}</td>
      <td class="text-center">${o.totalTerjadwal}</td>
      <td class="text-center">${o.hadir}</td>
      <td class="text-center">${o.izin}</td>
      <td class="text-center">${o.sakit}</td>
      <td class="text-center">${o.alfa}</td>
      <td class="text-center">${o.terlambatCount} (${o.terlambatMenit} mnt)</td>
      <td class="text-center">${o.digantikan}</td>
      <td class="text-center">${o.pct.toFixed(1)}%</td>
      <td class="text-center">${escHtmlFan_(o.predikat)}</td>
    </tr>`
    )
    .join('');

  const html = `
    <div class="text-center mb-3">
      <h5 class="fw-bold text-uppercase m-0" style="letter-spacing:0.5px;">Rekap Absensi Asatidz</h5>
      <h6 class="fw-bold m-0 mt-1">Madrasah Diniyyah Al Amiriyyah</h6>
      <p class="m-0 small mt-1">Periode: ${formatTanggalIndoRekap(tglDari)} s/d ${formatTanggalIndoRekap(tglSampai)}</p>
    </div>
    <table class="table table-bordered table-sm tabel-cetak-resmi" style="font-size:11px;">
      <thead>
        <tr>
          <th>No</th><th>Asatidz</th><th>NIA</th><th>Blok</th><th>Sesi<br>Terjadwal</th>
          <th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alfa</th><th>Terlambat</th>
          <th>Digantikan</th><th>% Hadir</th><th>Predikat</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="row ttd-area-resmi">
      <div class="col-6 text-center">
        <p class="mb-0">Mengetahui,</p>
        <p class="mb-0">Kepala TU</p>
        <div class="garis-ttd mx-auto"></div>
        <p class="fw-bold mt-1">(...........................................)</p>
      </div>
      <div class="col-6 text-center">
        <p class="mb-0">${formatTanggalIndoRekap(new Date().toISOString().slice(0, 10))}</p>
        <p class="mb-0">Pengasuh</p>
        <div class="garis-ttd mx-auto"></div>
        <p class="fw-bold mt-1">(...........................................)</p>
      </div>
    </div>
  `;

  $('#areaCetakRekapResmi').html(html);
  document.body.classList.add('printing-rekap-resmi');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('printing-rekap-resmi'), 500);
  }, 200);
}

/**
 * Mengekstrak 10 Asatidz dengan jumlah status Alfa terbanyak pada periode/filter aktif
 */
export function getTop10AlfaData() {
  const state = store.rekapAbsensiState || {};
  const source =
    state.dataPerAsatidzFiltered && state.dataPerAsatidzFiltered.length > 0
      ? state.dataPerAsatidzFiltered
      : state.dataPerAsatidz || [];

  if (!source || source.length === 0) return [];

  return source
    .slice()
    .filter(o => (parseInt(o.alfa, 10) || 0) > 0)
    .sort((a, b) => {
      const selisihAlfa = (parseInt(b.alfa, 10) || 0) - (parseInt(a.alfa, 10) || 0);
      if (selisihAlfa !== 0) return selisihAlfa;
      return a.pct - b.pct;
    })
    .slice(0, 10);
}

/**
 * Mencetak Dokumen Resmi TOP 10 Asatidz Status Alfa Terbanyak
 */
export function cetakTop10Alfa() {
  const top10 = getTop10AlfaData();
  if (top10.length === 0) {
    return Swal.fire({
      icon: 'info',
      title: 'Data Alfa Bersih',
      text: 'Tidak ada Asatidz yang memiliki status Alfa pada rentang tanggal atau filter ini.',
      confirmButtonColor: '#0f766e'
    });
  }

  const tglDari = $('#rk_tgl_dari').val();
  const tglSampai = $('#rk_tgl_sampai').val();

  const bodyRows = top10
    .map(
      (o, i) => `
    <tr>
      <td class="text-center fw-bold">${i + 1}</td>
      <td class="fw-bold">${escHtmlFan_(o.nama)}</td>
      <td class="text-center font-monospace">${escHtmlFan_(o.nia || '-')}</td>
      <td class="text-center">${escHtmlFan_(formatLabelBlokRekap(o.blok))}</td>
      <td class="text-center">${escHtmlFan_(o.jah || '-')}</td>
      <td class="text-center">${o.totalTerjadwal}</td>
      <td class="text-center fw-bold text-danger" style="background:#fee2e2; font-size:12px;">${o.alfa} Sesi</td>
      <td class="text-center">${o.terlambatCount} (${o.terlambatMenit} mnt)</td>
      <td class="text-center text-success">${o.hadir}</td>
      <td class="text-center fw-bold">${o.pct.toFixed(1)}%</td>
      <td class="text-center">${escHtmlFan_(o.predikat)}</td>
    </tr>
  `
    )
    .join('');

  const html = `
    <div class="text-center mb-3">
      <h5 class="fw-bold text-uppercase m-0 text-danger" style="letter-spacing:0.5px;">TOP 10 ASATIDZ STATUS ALFA TERBANYAK</h5>
      <h6 class="fw-bold m-0 mt-1">MADRASAH DINIYYAH AL AMIRIYYAH</h6>
      <p class="m-0 small mt-1">Periode: ${formatTanggalIndoRekap(tglDari)} s/d ${formatTanggalIndoRekap(tglSampai)}</p>
    </div>
    <table class="table table-bordered table-sm tabel-cetak-resmi" style="font-size:11px;">
      <thead>
        <tr style="background-color: #f8fafc;">
          <th style="width: 35px;" class="text-center">RANK</th>
          <th>NAMA ASATIDZ</th>
          <th class="text-center">NIA</th>
          <th class="text-center">BLOK</th>
          <th class="text-center">JAH</th>
          <th class="text-center">TERJADWAL</th>
          <th class="text-center" style="background-color:#fecaca; color:#991b1b;">TOTAL ALFA</th>
          <th class="text-center">TERLAMBAT</th>
          <th class="text-center">HADIR</th>
          <th class="text-center">% HADIR</th>
          <th class="text-center">PREDIKAT</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="row ttd-area-resmi">
      <div class="col-6 text-center">
        <p class="mb-0">Mengetahui,</p>
        <p class="mb-0">Kepala Bagian Kesiswaan</p>
        <div class="garis-ttd mx-auto"></div>
        <p class="fw-bold mt-1">(...........................................)</p>
      </div>
      <div class="col-6 text-center">
        <p class="mb-0">${formatTanggalIndoRekap(new Date().toISOString().slice(0, 10))}</p>
        <p class="mb-0">Staf Kurikulum / TU</p>
        <div class="garis-ttd mx-auto"></div>
        <p class="fw-bold mt-1">(...........................................)</p>
      </div>
    </div>
  `;

  $('#areaCetakRekapResmi').html(html);
  document.body.classList.add('printing-rekap-resmi');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('printing-rekap-resmi'), 500);
  }, 200);
}

/**
 * Mengunduh Berkas Excel (.xlsx) TOP 10 Asatidz Status Alfa Terbanyak
 */
export function exportTop10AlfaExcel() {
  const top10 = getTop10AlfaData();
  if (top10.length === 0) {
    return Swal.fire({
      icon: 'info',
      title: 'Data Alfa Bersih',
      text: 'Tidak ada Asatidz yang memiliki status Alfa pada rentang tanggal atau filter ini.',
      confirmButtonColor: '#0f766e'
    });
  }

  const headers = [
    'Rank',
    'Nama Asatidz',
    'NIA',
    'Blok',
    'Jah',
    'Sesi Terjadwal',
    'Total Alfa',
    'Terlambat (Kali)',
    'Terlambat (Menit)',
    'Total Hadir',
    '% Kehadiran',
    'Predikat'
  ];
  const wsData = [headers];

  top10.forEach((o, i) => {
    wsData.push([
      i + 1,
      o.nama,
      o.nia || '-',
      formatLabelBlokRekap(o.blok),
      o.jah || '-',
      o.totalTerjadwal,
      o.alfa,
      o.terlambatCount,
      o.terlambatMenit,
      o.hadir,
      o.pct.toFixed(1) + '%',
      o.predikat
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Top_10_Alfa');
  XLSX.writeFile(
    wb,
    `Top_10_Alfa_Asatidz_${$('#rk_tgl_dari').val()}_sd_${$('#rk_tgl_sampai').val()}.xlsx`
  );
}
