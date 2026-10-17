import { store } from '../../state/store.js';
import { fetchAllAsatidzFromSupabase } from '../asatidz/asatidz.js';
import {
  loadFanSettingsFromSupabase,
  getMasterGrupAsal,
  sortAsatidzByKodeNatural,
  escHtmlFan_
} from '../fan/fan.js';
import {
  loadJadwalKbmFromSupabase,
  getJadwalGuru,
  formatTampilanKelas,
  parseJadwalCell_Client,
  LIST_HARI
} from '../jadwal-kbm/jadwal-kbm.js';
import { bukaDetailAsatidzDariHariKBM } from '../hari-kbm/hari-kbm.js';

// ============================================================================
// 1. STATE PENCARIAN & DEBOUNCE DAFTAR PENDIDIK
// ============================================================================
let timerCariPendidik = null;
let isSedangMemuatPendidik = false;

export function cariDaftarPendidikDebounce(val) {
  clearTimeout(timerCariPendidik);
  timerCariPendidik = setTimeout(function () {
    cariDaftarPendidik(val);
  }, 200);
}

export function cariDaftarPendidik(val) {
  store.keywordCariPendidik = String(val || '').toLowerCase().replace(/\s+/g, ' ').trim();
  $('#btnHapusCariPendidik').toggleClass('d-none', !store.keywordCariPendidik);
  renderTabelDaftarPendidik(true);
}

export function resetCariDaftarPendidik() {
  $('#inputCariPendidik').val('');
  cariDaftarPendidik('');
}

// ============================================================================
// 2. PARSING JAM I & II PER HARI DAN DISTRIBUSI JAM PER TINGKAT (ULA/WST/ULYA)
// ============================================================================

/**
 * Memeriksa string sel jadwal harian Asatidz dan mengembalikan tanda 'X'
 * apabila terdapat jadwal mengajar pada Jam 1 (I) dan/atau Jam 2 (II)
 */
export function getStatusJam1Dan2Hari(cellStr) {
  const res = { j1: '', j2: '' };
  if (!cellStr || !String(cellStr).trim()) return res;

  const lines = String(cellStr)
    .split(/\r?\n|;;/)
    .map(s => s.trim())
    .filter(Boolean);

  lines.forEach(l => {
    const p = l.split(' | ');
    const jamStr = p[0] || '';
    const m = jamStr.match(/\d+/);
    if (m) {
      const j = parseInt(m[0], 10);
      if (j === 1) res.j1 = 'X';
      if (j === 2) res.j2 = 'X';
    }
  });

  return res;
}

/**
 * Menghitung distribusi total jam mengajar Jam 1 & Jam 2 seorang Asatidz
 * pada masing-masing jenjang dan kelas: ULA (I-IV), WST (I-II), ULYA (I-II), serta JML
 */
export function hitungDistribusiJam12Tingkat(asatidzObj, jdwObj) {
  const counts = {
    ula: { 1: 0, 2: 0, 3: 0, 4: 0 },
    wst: { 1: 0, 2: 0 },
    ulya: { 1: 0, 2: 0 },
    totalJml: 0
  };

  const jadwal = jdwObj || getJadwalGuru(asatidzObj?.nama_asatidz);

  LIST_HARI.forEach(hari => {
    const val = jadwal[hari.toLowerCase()] || '';
    if (!String(val).trim()) return;

    const lines = String(val)
      .split(/\r?\n|;;/)
      .map(s => s.trim())
      .filter(Boolean);

    lines.forEach(line => {
      const p = line.split(' | ');
      const jamStr = p[0] || '';
      const matchJam = jamStr.match(/\d+/);
      const jamNum = matchJam ? parseInt(matchJam[0], 10) : 0;

      if (jamNum === 1 || jamNum === 2) {
        counts.totalJml++;
        const lok = formatTampilanKelas(p[2] || '');
        const match = lok.match(/(\d+)\s+[A-Za-z0-9]+\s+(ULA|WUSTHO|WUSTHA|ULYA)/i);

        if (match) {
          const kls = parseInt(match[1], 10);
          const tkt = match[2].toUpperCase();
          if (tkt === 'ULA' && counts.ula[kls] !== undefined) counts.ula[kls]++;
          else if ((tkt === 'WUSTHO' || tkt === 'WUSTHA') && counts.wst[kls] !== undefined) counts.wst[kls]++;
          else if (tkt === 'ULYA' && counts.ulya[kls] !== undefined) counts.ulya[kls]++;
        } else {
          // Fallback: gunakan tingkat & kelas Diniyyah milik Asatidz itu sendiri
          const mTkt = String(asatidzObj?.tingkat_asatidz || '').toUpperCase();
          const mKls = parseInt(asatidzObj?.din_kls_asatidz, 10) || 0;
          if (mTkt === 'ULA' && counts.ula[mKls] !== undefined) counts.ula[mKls]++;
          else if (mTkt.includes('WUSTH') && counts.wst[mKls] !== undefined) counts.wst[mKls]++;
          else if (mTkt === 'ULYA' && counts.ulya[mKls] !== undefined) counts.ulya[mKls]++;
        }
      }
    });
  });

  return counts;
}

// ============================================================================
// 3. RENDER TABEL UTAMA DAFTAR TENAGA PENDIDIK (25 KOLOM)
// ============================================================================

/**
 * Merender Tabel Daftar Tenaga Pendidik (#tableDaftarPendidik) lengkap dengan
 * pengelompokan Grup Asal (rowspan vertikal), Natural Sort NIA, simbol 'X' interaktif,
 * serta rekapitulasi jam per tingkat dan kelas
 */
export async function renderTabelDaftarPendidik(alreadyFetched = false) {
  const tbody = document.getElementById('tbodyDaftarPendidik');
  if (!tbody) return;

  // Pastikan data Asatidz, Pengaturan Grup Asal, & Jadwal KBM sudah dimuat dari Supabase
  if (
    !alreadyFetched &&
    (!store.globalDataAsatidz ||
      store.globalDataAsatidz.length === 0 ||
      !store.jadwalMengajarMap ||
      Object.keys(store.jadwalMengajarMap).length === 0)
  ) {
    if (isSedangMemuatPendidik) return;
    isSedangMemuatPendidik = true;

    tbody.innerHTML = `
      <tr>
        <td colspan="25" class="text-center py-4 text-muted">
          <div class="spinner-border spinner-border-sm text-success me-2"></div>Memuat data Daftar Tenaga Pendidik...
        </td>
      </tr>`;

    try {
      if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
        store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
      }
      if (!store.masterGrupAsal || store.masterGrupAsal.length === 0) {
        await loadFanSettingsFromSupabase();
      }
      await loadJadwalKbmFromSupabase();
    } catch (err) {
      isSedangMemuatPendidik = false;
      tbody.innerHTML = `
        <tr>
          <td colspan="25" class="text-center py-4 text-danger">
            <i class="bi bi-exclamation-triangle-fill me-1"></i> Gagal memuat data: ${escHtmlFan_(err.message)}
          </td>
        </tr>`;
      return;
    }

    isSedangMemuatPendidik = false;
  }

  const masterGrup = getMasterGrupAsal();
  const asatidzAssigned = new Set();
  let kelompokTampil = [];

  // 1. Susun Asatidz yang terdaftar di dalam Grup Asal
  masterGrup.forEach(g => {
    let anggotaList = [];
    (g.anggota || []).forEach(nama => {
      const found = (store.globalDataAsatidz || []).find(
        a => String(a.nama_asatidz || '').trim().toUpperCase() === String(nama || '').trim().toUpperCase()
      );
      if (found) {
        anggotaList.push(found);
        asatidzAssigned.add(String(found.nama_asatidz || '').trim().toUpperCase());
      }
    });
    anggotaList = sortAsatidzByKodeNatural(anggotaList);
    if (anggotaList.length > 0) {
      kelompokTampil.push({ namaGrup: g.namaGrup, asatidzList: anggotaList });
    }
  });

  // 2. Susun Asatidz yang belum masuk ke Grup Asal mana pun (diurutkan Natural Sort NIA)
  let nonGrup = (store.globalDataAsatidz || []).filter(
    a => !asatidzAssigned.has(String(a.nama_asatidz || '').trim().toUpperCase())
  );
  nonGrup = sortAsatidzByKodeNatural(nonGrup);
  if (nonGrup.length > 0) {
    kelompokTampil.push({ namaGrup: '', asatidzList: nonGrup });
  }

  // 3. Terapkan Filter Pencarian Cepat
  const kw = store.keywordCariPendidik || '';
  if (kw) {
    kelompokTampil = kelompokTampil
      .map(grp => {
        const grupCocok = String(grp.namaGrup || '').toLowerCase().includes(kw);
        const listCocok = grupCocok
          ? grp.asatidzList
          : grp.asatidzList.filter(a => {
              const teks = `${a.nia || ''} ${a.nama_asatidz || ''} ${a.jah_asatidz || ''} ${a.nis || ''}`.toLowerCase();
              return teks.includes(kw);
            });
        return { namaGrup: grp.namaGrup, asatidzList: listCocok };
      })
      .filter(grp => grp.asatidzList.length > 0);
  }

  const totalPendidikTampil = kelompokTampil.reduce((s, g) => s + g.asatidzList.length, 0);
  const infoCariPendidik = document.getElementById('infoHasilCariPendidik');
  if (infoCariPendidik) {
    infoCariPendidik.innerHTML = kw
      ? `Ditemukan: <b class="text-success">${totalPendidikTampil}</b> Asatidz`
      : '';
  }

  // 4. Render Baris Tabel 25 Kolom
  let html = '';
  const fallbackCounter = { n: 0 };
  store.barisTampilDaftarPendidik = [];

  kelompokTampil.forEach(grp => {
    const isGrouped = !!grp.namaGrup;
    const rowCount = grp.asatidzList.length;

    grp.asatidzList.forEach((a, idxInGroup) => {
      let kode = String(a.nia || '').trim();
      if (!kode) {
        fallbackCounter.n = (fallbackCounter.n || 0) + 1;
        kode = 'D' + fallbackCounter.n;
      }
      const nama = String(a.nama_asatidz || '').trim();
      const jah = String(a.jah_asatidz || '').trim();
      const jdw = getJadwalGuru(nama);

      // Parsing Jam 1 & 2 (Sabtu s/d Kamis)
      const sbt = getStatusJam1Dan2Hari(jdw.sabtu);
      const ahd = getStatusJam1Dan2Hari(jdw.ahad);
      const sen = getStatusJam1Dan2Hari(jdw.senin);
      const sel = getStatusJam1Dan2Hari(jdw.selasa);
      const rab = getStatusJam1Dan2Hari(jdw.rabu);
      const kam = getStatusJam1Dan2Hari(jdw.kamis);

      // Distribusi Tingkat ULA (I-IV), WST (I-II), ULYA (I-II) & JML
      const dist = hitungDistribusiJam12Tingkat(a, jdw);

      // Simpan untuk keperluan Export Excel
      store.barisTampilDaftarPendidik.push({
        kode,
        nama,
        asal: isGrouped ? grp.namaGrup : '-',
        jah: jah || '-',
        sbt,
        ahd,
        sen,
        sel,
        rab,
        kam,
        dist
      });

      const safeNamaEnc = encodeURIComponent(nama).replace(/'/g, '%27');

      const renderSelJamKBM = (statusVal, hariNama, jamNum) => {
        if (statusVal !== 'X') {
          return `<td class="cell-x-jam text-center"></td>`;
        }
        return `<td class="cell-x-jam cell-x-jam-klik text-center"
          onclick="window.bukaModalDetailSelJadwalKBM('${safeNamaEnc}','${hariNama}',${jamNum})"
          title="${hariNama} - Jam ${jamNum === 1 ? 'I' : 'II'} — Klik untuk lihat detail">X</td>`;
      };

      html += `<tr>`;
      html += `<td class="font-monospace text-center fw-bold">${escHtmlFan_(kode)}</td>`;
      html += `<td class="nama-pendidik nama-pendidik-click"
        onclick="window.bukaDetailAsatidzDariDaftarPendidik('${safeNamaEnc}')"
        title="Klik untuk lihat detail profil &amp; jadwal ${escHtmlFan_(nama)}">${escHtmlFan_(nama)}</td>`;

      // Kolom ASAL: Merge vertikal (rowspan) jika tergabung dalam Grup Asal
      if (isGrouped) {
        if (idxInGroup === 0) {
          html += `<td class="cell-asal-grup" rowspan="${rowCount}">${escHtmlFan_(grp.namaGrup)}</td>`;
        }
      } else {
        html += `<td class="text-center text-muted">-</td>`;
      }

      html += `<td class="text-center">${escHtmlFan_(jah || '-')}</td>`;

      // Sub-kolom Hari & Jam (Sabtu I-II s/d Kamis I-II)
      html += renderSelJamKBM(sbt.j1, 'Sabtu', 1) + renderSelJamKBM(sbt.j2, 'Sabtu', 2);
      html += renderSelJamKBM(ahd.j1, 'Ahad', 1) + renderSelJamKBM(ahd.j2, 'Ahad', 2);
      html += renderSelJamKBM(sen.j1, 'Senin', 1) + renderSelJamKBM(sen.j2, 'Senin', 2);
      html += renderSelJamKBM(sel.j1, 'Selasa', 1) + renderSelJamKBM(sel.j2, 'Selasa', 2);
      html += renderSelJamKBM(rab.j1, 'Rabu', 1) + renderSelJamKBM(rab.j2, 'Rabu', 2);
      html += renderSelJamKBM(kam.j1, 'Kamis', 1) + renderSelJamKBM(kam.j2, 'Kamis', 2);

      // Sub-kolom ULA (I, II, III, IV)
      html += `<td class="text-center">${dist.ula[1] || ''}</td>`;
      html += `<td class="text-center">${dist.ula[2] || ''}</td>`;
      html += `<td class="text-center">${dist.ula[3] || ''}</td>`;
      html += `<td class="text-center">${dist.ula[4] || ''}</td>`;

      // Sub-kolom WST (I, II)
      html += `<td class="text-center">${dist.wst[1] || ''}</td>`;
      html += `<td class="text-center">${dist.wst[2] || ''}</td>`;

      // Sub-kolom ULYA (I, II)
      html += `<td class="text-center">${dist.ulya[1] || ''}</td>`;
      html += `<td class="text-center">${dist.ulya[2] || ''}</td>`;

      // Kolom JML
      html += `<td class="cell-jam-total text-center">${dist.totalJml || 0}</td>`;
      html += `</tr>`;
    });
  });

  tbody.innerHTML =
    html ||
    (kw
      ? `<tr><td colspan="25" class="text-center py-4 text-muted"><i class="bi bi-search me-1"></i>Tidak ditemukan hasil untuk "<b>${escHtmlFan_(kw)}</b>".</td></tr>`
      : `<tr><td colspan="25" class="text-center py-4 text-muted">Tidak ada data asatidz.</td></tr>`);
}

// ============================================================================
// 4. INTERAKSI KLIK NAMA ASATIDZ & KLIK SEL 'X' (#modalDetailSelJadwalKBM)
// ============================================================================

/**
 * Membuka Pop-Up Detail Profil & Jadwal Mingguan Asatidz saat Nama diklik
 */
export function bukaDetailAsatidzDariDaftarPendidik(namaEncoded) {
  bukaDetailAsatidzDariHariKBM(namaEncoded);
}

/**
 * Helper memformat tampilan rincian jadwal multi-jam di dalam tabel ringkasan mingguan
 */
function formatJadwalHariDetailPendidik(val) {
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
 * Menampilkan detail 1 sel jadwal (Hari & Jam) yang diklik pada Tabel Daftar Pendidik,
 * beserta ringkasan jadwal lengkap mingguan (Sabtu s/d Kamis) di `#modalDetailSelJadwalKBM`
 */
export function bukaModalDetailSelJadwalKBM(namaEncoded, hariNama, jamNum) {
  const nama = decodeURIComponent(namaEncoded || '').trim();
  if (!nama) return;

  const targetJam = parseInt(jamNum, 10);
  const jdw = getJadwalGuru(nama);
  const cellVal = jdw[String(hariNama || '').toLowerCase()] || '';

  let fan = '-';
  let kelas = '-';
  let lokasi = '-';

  const slots = parseJadwalCell_Client(cellVal);
  slots.forEach(s => {
    if (s.jam === targetJam) {
      fan = s.fan && s.fan !== '-' ? s.fan : '-';
      const rawLok = s.lokasi && s.lokasi !== '-' ? s.lokasi : '-';
      const matchLok = rawLok.match(/^(.*?)\s*\(([^()]*)\)$/);
      if (matchLok) {
        const isiKurung = matchLok[2].trim().toUpperCase();
        if (isiKurung === 'PA' || isiKurung === 'PI' || isiKurung === 'UG') {
          kelas = formatTampilanKelas(rawLok) || '-';
          lokasi = '-';
        } else {
          kelas = formatTampilanKelas(matchLok[1].trim()) || '-';
          lokasi = matchLok[2].trim() || '-';
        }
      } else {
        kelas = formatTampilanKelas(rawLok) || '-';
        lokasi = '-';
      }
    }
  });

  $('#selKbm_title').text(`${hariNama} - Jam ${targetJam === 1 ? 'I' : 'II'}`);
  $('#selKbm_nama').text(nama);
  $('#selKbm_fan').text(fan);
  $('#selKbm_kelas').text(kelas);
  $('#selKbm_lokasi').text(lokasi);

  let htmlMingguan = '';
  LIST_HARI.forEach(h => {
    const val = jdw[h.toLowerCase()] || '';
    const isRowAktif = h.toLowerCase() === String(hariNama || '').toLowerCase();
    htmlMingguan += `
      <tr class="${isRowAktif ? 'table-success bg-opacity-25' : ''}">
        <td class="fw-bold text-success text-center align-top" style="width:90px;">${h}</td>
        <td>${formatJadwalHariDetailPendidik(val)}</td>
      </tr>`;
  });
  $('#selKbm_body_mingguan').html(htmlMingguan);

  $('#modalDetailSelJadwalKBM').modal('show');
}

// ============================================================================
// 5. SEGARKAN DATA, EXPORT EXCEL (25 KOLOM), & CETAK DOKUMEN RESMI
// ============================================================================

/**
 * Menyegarkan data Asatidz, Grup Asal, dan Jadwal KBM langsung dari Supabase
 */
export async function muatUlangDaftarPendidik() {
  const tbody = document.getElementById('tbodyDaftarPendidik');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="25" class="text-center py-4 text-muted">
          <div class="spinner-border spinner-border-sm text-success me-2"></div>Menyegarkan data terbaru dari Supabase...
        </td>
      </tr>`;
  }

  try {
    store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    await loadFanSettingsFromSupabase();
    await loadJadwalKbmFromSupabase(true);
    await renderTabelDaftarPendidik(true);
    Swal.fire({ icon: 'success', title: 'Data Diperbarui', timer: 1000, showConfirmButton: false });
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Menyegarkan',
      text: err.message,
      confirmButtonColor: '#0f766e'
    });
  }
}

/**
 * Mengekspor tabel Daftar Tenaga Pendidik (25 kolom) ke berkas Excel (.xlsx)
 */
export function exportDaftarPendidikExcel() {
  if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
    return Swal.fire({ icon: 'warning', title: 'Data belum dimuat!' });
  }

  const rows = [
    [
      'KODE',
      'NAMA',
      'ASAL',
      'JAH',
      'SABTU I',
      'SABTU II',
      'AHAD I',
      'AHAD II',
      'SENIN I',
      'SENIN II',
      'SELASA I',
      'SELASA II',
      'RABU I',
      'RABU II',
      'KAMIS I',
      'KAMIS II',
      'ULA I',
      'ULA II',
      'ULA III',
      'ULA IV',
      'WST I',
      'WST II',
      'ULYA I',
      'ULYA II',
      'JML'
    ]
  ];

  // Gunakan urutan yang sedang tampil pada tabel (sudah terkelompok Grup Asal & Natural Sort NIA)
  const listSumber =
    store.barisTampilDaftarPendidik && store.barisTampilDaftarPendidik.length > 0
      ? store.barisTampilDaftarPendidik
      : [];

  if (listSumber.length > 0) {
    listSumber.forEach(item => {
      rows.push([
        item.kode,
        item.nama,
        item.asal,
        item.jah,
        item.sbt.j1,
        item.sbt.j2,
        item.ahd.j1,
        item.ahd.j2,
        item.sen.j1,
        item.sen.j2,
        item.sel.j1,
        item.sel.j2,
        item.rab.j1,
        item.rab.j2,
        item.kam.j1,
        item.kam.j2,
        item.dist.ula[1] || '',
        item.dist.ula[2] || '',
        item.dist.ula[3] || '',
        item.dist.ula[4] || '',
        item.dist.wst[1] || '',
        item.dist.wst[2] || '',
        item.dist.ulya[1] || '',
        item.dist.ulya[2] || '',
        item.dist.totalJml || 0
      ]);
    });
  } else {
    const masterGrup = getMasterGrupAsal();
    let fallbackN = 0;

    sortAsatidzByKodeNatural(store.globalDataAsatidz || []).forEach(a => {
      const nama = String(a.nama_asatidz || '').trim();
      const kode = String(a.nia || '').trim() || 'D' + ++fallbackN;
      const jah = String(a.jah_asatidz || '').trim();
      const grup = masterGrup.find(g =>
        (g.anggota || []).some(m => String(m).trim().toUpperCase() === nama.toUpperCase())
      );
      const asal = grup ? grup.namaGrup : '-';

      const jdw = getJadwalGuru(nama);
      const sbt = getStatusJam1Dan2Hari(jdw.sabtu);
      const ahd = getStatusJam1Dan2Hari(jdw.ahad);
      const sen = getStatusJam1Dan2Hari(jdw.senin);
      const sel = getStatusJam1Dan2Hari(jdw.selasa);
      const rab = getStatusJam1Dan2Hari(jdw.rabu);
      const kam = getStatusJam1Dan2Hari(jdw.kamis);
      const dist = hitungDistribusiJam12Tingkat(a, jdw);

      rows.push([
        kode,
        nama,
        asal,
        jah,
        sbt.j1,
        sbt.j2,
        ahd.j1,
        ahd.j2,
        sen.j1,
        sen.j2,
        sel.j1,
        sel.j2,
        rab.j1,
        rab.j2,
        kam.j1,
        kam.j2,
        dist.ula[1] || '',
        dist.ula[2] || '',
        dist.ula[3] || '',
        dist.ula[4] || '',
        dist.wst[1] || '',
        dist.wst[2] || '',
        dist.ulya[1] || '',
        dist.ulya[2] || '',
        dist.totalJml || 0
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Pendidik');
  XLSX.writeFile(wb, 'Daftar_Tenaga_Pendidik_Madin.xlsx');
}

/**
 * Mencetak Dokumen Resmi Daftar Tenaga Pendidik secara Landscape Terisolasi
 */
export function cetakDaftarPendidik() {
  document.body.classList.add('printing-daftar-pendidik');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-daftar-pendidik');
  }, 600);
}
