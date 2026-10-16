import { store } from '../../state/store.js';
import { fetchAllAsatidzFromSupabase } from '../asatidz/asatidz.js';
import { getJadwalGuru, renderJadwalKBM } from '../jadwal-kbm/jadwal-kbm.js';
import { getMasterGrupAsal, sortAsatidzByKodeNatural, compareNIANatural, parseFanItemString, escHtmlFan_ } from '../fan/fan.js';

let timerCariPendidik = null;
const URUTAN_TINGKAT_DP = { "ULA": 1, "WUSTHO": 2, "ULYA": 3, "ISTI'DAD": 4, "IST": 4 };
const LIST_HARI = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'];

export function cariDaftarPendidikDebounce(val) {
  clearTimeout(timerCariPendidik);
  timerCariPendidik = setTimeout(() => {
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

/**
 * Memeriksa jadwal harian seorang Asatidz dan mengembalikan { j1: 'X' | '', j2: 'X' | '' }
 */
export function getStatusJam1Dan2Hari(cellStr) {
  const res = { j1: '', j2: '' };
  if (!cellStr || !String(cellStr).trim()) return res;
  const lines = String(cellStr).split(/\r?\n|;;/).map(s => s.trim()).filter(Boolean);
  lines.forEach(line => {
    const p = line.split(' | ');
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
 * Menghitung total jam mengajar Jam 1 & Jam 2 per jenjang dan kelas
 */
export function hitungDistribusiJam12Tingkat(asatidzObj) {
  const counts = {
    ula: { 1: 0, 2: 0, 3: 0, 4: 0 },
    wst: { 1: 0, 2: 0 },
    ulya: { 1: 0, 2: 0 },
    totalJml: 0
  };

  const jdw = getJadwalGuru(asatidzObj.nama_asatidz);

  LIST_HARI.forEach(hari => {
    const val = jdw[hari.toLowerCase()] || '';
    if (!String(val).trim()) return;

    const lines = String(val).split(/\r?\n|;;/).map(s => s.trim()).filter(Boolean);
    lines.forEach(line => {
      const p = line.split(' | ');
      const jamStr = p[0] || '';
      const matchJam = jamStr.match(/\d+/);
      const jamNum = matchJam ? parseInt(matchJam[0], 10) : 0;

      if (jamNum === 1 || jamNum === 2) {
        counts.totalJml++;
        const lok = p[2] || '';
        const match = lok.match(/(\d+)\s+[A-Za-z]+\s+(ULA|WUSTHO|WUSTHA|ULYA|ISTI'DAD|IST)/i);
        if (match) {
          const kls = parseInt(match[1], 10);
          const tkt = match[2].toUpperCase();
          if (tkt === 'ULA' && counts.ula[kls] !== undefined) counts.ula[kls]++;
          else if ((tkt === 'WUSTHO' || tkt === 'WUSTHA') && counts.wst[kls] !== undefined) counts.wst[kls]++;
          else if (tkt === 'ULYA' && counts.ulya[kls] !== undefined) counts.ulya[kls]++;
        } else {
          const mTkt = String(asatidzObj.tingkat_asatidz || '').toUpperCase();
          const mKls = parseInt(asatidzObj.din_kls_asatidz, 10) || 0;
          if (mTkt === 'ULA' && counts.ula[mKls] !== undefined) counts.ula[mKls]++;
          else if (mTkt.includes('WUSTH') && counts.wst[mKls] !== undefined) counts.wst[mKls]++;
          else if (mTkt === 'ULYA' && counts.ulya[mKls] !== undefined) counts.ulya[mKls]++;
        }
      }
    });
  });

  return counts;
}

/**
 * Membuka detail slot jadwal pada hari & jam yang diklik di dalam #modalDetailSelJadwalKBM
 */
export function bukaModalDetailSelJadwalKBM(namaEncoded, hariNama, jamNum) {
  const nama = decodeURIComponent(namaEncoded || '').trim();
  const a = (store.globalDataAsatidz || []).find(
    item => String(item.nama_asatidz || '').trim().toUpperCase() === nama.toUpperCase()
  );
  if (!a) return;

  const jdw = getJadwalGuru(a.nama_asatidz);
  const cellVal = jdw[String(hariNama).toLowerCase()] || '';

  let fan = '-', kelas = '-', lokasi = '-';
  const lines = String(cellVal).split(/\r?\n|;;/).map(s => s.trim()).filter(Boolean);
  lines.forEach(line => {
    const p = line.split(' | ');
    const jamStr = p[0] || '';
    const m = jamStr.match(/\d+/);
    if (m && parseInt(m[0], 10) === parseInt(jamNum, 10)) {
      fan = (p[1] && p[1] !== '-') ? p[1].trim() : '-';
      const rawLok = (p[2] && p[2] !== '-') ? p[2].trim() : '-';
      const matchLok = rawLok.match(/^(.*?)\s*\(([^()]*)\)$/);
      if (matchLok) {
        kelas = matchLok[1].trim() || '-';
        lokasi = matchLok[2].trim() || '-';
      } else {
        kelas = rawLok || '-';
        lokasi = '-';
      }
    }
  });

  $('#selKbm_title').text(`${hariNama} - Jam ${parseInt(jamNum, 10) === 1 ? 'I' : 'II'}`);
  $('#selKbm_nama').text(a.nama_asatidz);
  $('#selKbm_fan').text(fan);
  $('#selKbm_kelas').text(kelas);
  $('#selKbm_lokasi').text(lokasi);

  let htmlMingguan = '';
  LIST_HARI.forEach(h => {
    const val = jdw[h.toLowerCase()] || '';
    const isRowAktif = h.toLowerCase() === String(hariNama).toLowerCase();
    htmlMingguan += `
      <tr class="${isRowAktif ? 'table-success bg-opacity-25' : ''}">
        <td class="fw-bold text-success text-center align-top" style="width:90px;">${h}</td>
        <td>${formatJadwalHariDetailBadge(val)}</td>
      </tr>`;
  });
  $('#selKbm_body_mingguan').html(htmlMingguan);

  $('#modalDetailSelJadwalKBM').modal('show');
}

function formatJadwalHariDetailBadge(val) {
  if (!val || !String(val).trim()) {
    return '<span class="text-muted fst-italic small">Tidak ada jadwal</span>';
  }
  const slots = parseJadwalCell_Client(val);
  if (slots.length === 0) {
    return '<span class="text-muted fst-italic small">Tidak ada jadwal</span>';
  }

  return slots
    .map(s => {
      const fan = s.fan && s.fan !== '-' ? s.fan : '';
      const lok = s.lokasi && s.lokasi !== '-' ? `(${s.lokasi})` : '';
      const info = [fan, lok].filter(Boolean).join(' ');
      return `
        <span class="badge bg-white text-dark border me-1 mb-1 shadow-xs" style="font-size:11px;">
          <b class="text-success">Jam ${s.jam}:</b> ${escHtmlFan_(info || '-')}
        </span>`;
    })
    .join('');
}

/**
 * Membuka Modal Detail Profil Asatidz saat nama diklik dari Tabel Daftar Pendidik
 */
export function bukaDetailAsatidzDariDaftarPendidik(namaEncoded) {
  const nama = decodeURIComponent(namaEncoded || '').trim().toUpperCase();
  const found = (store.globalDataAsatidz || []).find(
    a => String(a.nama_asatidz || '').trim().toUpperCase() === nama
  );
  if (!found) return;

  store.selectedRowDataAsatidz = found;
  if (typeof window.renderDetailAsatidz === 'function') {
    window.renderDetailAsatidz(found);

    const detailContainer = document.getElementById('detailContentAsatidz');
    if (detailContainer) {
      const jdwObj = getJadwalGuru(found.nama_asatidz);
      let kelasMengajarHtml = '<span class="text-muted fst-italic small">Belum ada kelas yang dipilih</span>';
      if (jdwObj.mengajar && String(jdwObj.mengajar).trim()) {
        kelasMengajarHtml = String(jdwObj.mengajar)
          .split(',')
          .map(k => `<span class="badge bg-light text-dark border me-1 mb-1">${escHtmlFan_(k.trim())}</span>`)
          .join('');
      }

      const rincianHariHtml = LIST_HARI.map(h => {
        const hVal = jdwObj[h.toLowerCase()] || '';
        return `
          <div class="d-flex align-items-start justify-content-between border-bottom py-2 gap-2">
            <div class="d-flex align-items-start flex-grow-1">
              <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 me-2 mt-1" style="min-width:65px; font-size:11px;">${h}</span>
              <div class="d-flex flex-wrap align-items-center flex-grow-1">
                ${formatJadwalHariDetailBadge(hVal)}
              </div>
            </div>
          </div>`;
      }).join('');

      detailContainer.insertAdjacentHTML('beforeend', `
        <div class="bg-white p-3 rounded border shadow-sm mb-4">
          <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
            <h6 class="text-success fw-bold m-0"><i class="bi bi-calendar-week me-2"></i> Jadwal &amp; Kelas Mengajar</h6>
            <span class="badge bg-success rounded-pill px-3 py-1">${escHtmlFan_(jdwObj.totalJam || '0')} Jam Mengajar</span>
          </div>
          <div class="bg-light p-3 rounded border mb-3">
            <div class="small fw-bold text-muted mb-1">Kelas Mengajar:</div>
            <div>${kelasMengajarHtml}</div>
          </div>
          <div class="bg-light p-3 rounded border">
            <div class="small fw-bold text-muted mb-1">Rincian Jadwal Mengajar (Sabtu s/d Kamis):</div>
            <div class="d-flex flex-column">${rincianHariHtml}</div>
          </div>
        </div>`);
    }

    $('#detailModalAsatidz').modal('show');
  }
}

/**
 * Render Tabel Utama Daftar Pendidik (25 Kolom, Grup Asal, Natural Sort NIA, X Klik)
 */
export async function renderTabelDaftarPendidik(alreadyFetched = false) {
  const tbody = document.getElementById('tbodyDaftarPendidik');
  if (!tbody) return;

  if ((!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) && !alreadyFetched) {
    tbody.innerHTML = `<tr><td colspan="25" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-success me-2"></div>Memuat data asatidz...</td></tr>`;
    try {
      store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
      await loadJadwalKbmFromSupabase();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="25" class="text-center py-4 text-danger">Gagal memuat data: ${escHtmlFan_(err.message)}</td></tr>`;
      return;
    }
    return renderTabelDaftarPendidik(true);
  }

  const masterGrup = getMasterGrupAsal();
  const asatidzAssigned = new Set();
  let kelompokTampil = [];

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

  let nonGrup = (store.globalDataAsatidz || []).filter(
    a => !asatidzAssigned.has(String(a.nama_asatidz || '').trim().toUpperCase())
  );
  nonGrup = sortAsatidzByKodeNatural(nonGrup);
  if (nonGrup.length > 0) {
    kelompokTampil.push({ namaGrup: '', asatidzList: nonGrup });
  }

  const kw = store.keywordCariPendidik || '';
  if (kw) {
    kelompokTampil = kelompokTampil.map(grp => {
      const grupCocok = String(grp.namaGrup || '').toLowerCase().includes(kw);
      const listCocok = grupCocok
        ? grp.asatidzList
        : grp.asatidzList.filter(a => {
            const teks = `${a.nia || ''} ${a.nama_asatidz || ''} ${a.jah_asatidz || ''} ${a.nis || ''}`.toLowerCase();
            return teks.includes(kw);
          });
      return { namaGrup: grp.namaGrup, asatidzList: listCocok };
    }).filter(grp => grp.asatidzList.length > 0);
  }

  const totalPendidikTampil = kelompokTampil.reduce((s, g) => s + g.asatidzList.length, 0);
  const infoCariPendidik = document.getElementById('infoHasilCariPendidik');
  if (infoCariPendidik) {
    infoCariPendidik.innerHTML = kw
      ? `Ditemukan: <b class="text-success">${totalPendidikTampil}</b> Asatidz`
      : '';
  }

  let html = '';
  let fallbackCounter = { n: 0 };

  kelompokTampil.forEach(grp => {
    const isGrouped = !!grp.namaGrup;
    const rowCount = grp.asatidzList.length;

    grp.asatidzList.forEach((a, idxInGroup) => {
      let kode = String(a.nia || '').trim();
      if (!kode) {
        fallbackCounter.n++;
        kode = 'D' + fallbackCounter.n;
      }
      const nama = String(a.nama_asatidz || '').trim();
      const jah = String(a.jah_asatidz || '').trim();

      const jdw = getJadwalGuru(nama);
      const sbt = getStatusJam1Dan2Hari(jdw.sabtu);
      const ahd = getStatusJam1Dan2Hari(jdw.ahad);
      const sen = getStatusJam1Dan2Hari(jdw.senin);
      const sel = getStatusJam1Dan2Hari(jdw.selasa);
      const rab = getStatusJam1Dan2Hari(jdw.rabu);
      const kam = getStatusJam1Dan2Hari(jdw.kamis);

      const dist = hitungDistribusiJam12Tingkat(a);

      const renderSelJamKBM = (statusVal, hariNama, jamNum) => {
        if (statusVal !== 'X') return `<td class="cell-x-jam text-center"></td>`;
        return `
          <td class="cell-x-jam cell-x-jam-klik text-center"
              onclick="window.bukaModalDetailSelJadwalKBM('${encodeURIComponent(nama).replace(/'/g, '%27')}', '${hariNama}', ${jamNum})"
              title="${hariNama} - Jam ${parseInt(jamNum, 10) === 1 ? 'I' : 'II'} — Klik untuk lihat detail">X</td>`;
      };

      html += `<tr>`;
      html += `<td class="font-monospace text-center fw-bold">${escHtmlFan_(kode)}</td>`;
      html += `
        <td class="nama-pendidik nama-pendidik-click"
            onclick="window.bukaDetailAsatidzDariDaftarPendidik('${encodeURIComponent(nama).replace(/'/g, '%27')}')"
            title="Klik untuk lihat profil &amp; jadwal ${escHtmlFan_(nama)}">
          ${escHtmlFan_(nama)}
        </td>`;

      if (isGrouped) {
        if (idxInGroup === 0) {
          html += `<td class="cell-asal-grup" rowspan="${rowCount}">${escHtmlFan_(grp.namaGrup)}</td>`;
        }
      } else {
        html += `<td class="text-center text-muted">-</td>`;
      }

      html += `<td class="text-center">${escHtmlFan_(jah || '-')}</td>`;

      html += renderSelJamKBM(sbt.j1, 'Sabtu', 1) + renderSelJamKBM(sbt.j2, 'Sabtu', 2);
      html += renderSelJamKBM(ahd.j1, 'Ahad', 1) + renderSelJamKBM(ahd.j2, 'Ahad', 2);
      html += renderSelJamKBM(sen.j1, 'Senin', 1) + renderSelJamKBM(sen.j2, 'Senin', 2);
      html += renderSelJamKBM(sel.j1, 'Selasa', 1) + renderSelJamKBM(sel.j2, 'Selasa', 2);
      html += renderSelJamKBM(rab.j1, 'Rabu', 1) + renderSelJamKBM(rab.j2, 'Rabu', 2);
      html += renderSelJamKBM(kam.j1, 'Kamis', 1) + renderSelJamKBM(kam.j2, 'Kamis', 2);

      html += `<td class="text-center">${dist.ula[1] || ''}</td>`;
      html += `<td class="text-center">${dist.ula[2] || ''}</td>`;
      html += `<td class="text-center">${dist.ula[3] || ''}</td>`;
      html += `<td class="text-center">${dist.ula[4] || ''}</td>`;
      html += `<td class="text-center">${dist.wst[1] || ''}</td>`;
      html += `<td class="text-center">${dist.wst[2] || ''}</td>`;
      html += `<td class="text-center">${dist.ulya[1] || ''}</td>`;
      html += `<td class="text-center">${dist.ulya[2] || ''}</td>`;
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

export async function muatUlangDaftarPendidik() {
  const tbody = document.getElementById('tbodyDaftarPendidik');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="25" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-success me-2"></div>Menyegarkan data terbaru...</td></tr>`;
  }
  try {
    store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    await loadJadwalKbmFromSupabase(true);
    await renderTabelDaftarPendidik(true);
    Swal.fire({ icon: 'success', title: 'Data Diperbarui', timer: 1000, showConfirmButton: false });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Gagal Menyegarkan', text: err.message, confirmButtonColor: '#0f766e' });
    renderTabelDaftarPendidik(true);
  }
}

export function exportDaftarPendidikExcel() {
  if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
    return Swal.fire({ icon: 'warning', title: 'Data belum dimuat!' });
  }

  const rows = [
    [
      "KODE", "NAMA", "ASAL", "JAH",
      "SABTU I", "SABTU II", "AHAD I", "AHAD II", "SENIN I", "SENIN II",
      "SELASA I", "SELASA II", "RABU I", "RABU II", "KAMIS I", "KAMIS II",
      "ULA I", "ULA II", "ULA III", "ULA IV", "WST I", "WST II", "ULYA I", "ULYA II", "JML"
    ]
  ];

  const masterGrup = getMasterGrupAsal();
  let fallbackCounter = { n: 0 };

  store.globalDataAsatidz.forEach(a => {
    if (!a) return;
    const nama = String(a.nama_asatidz || '').trim();
    const kode = String(a.nia || '').trim() || ('D' + (++fallbackCounter.n));
    const jah = String(a.jah_asatidz || '').trim();
    const grup = masterGrup.find(g => (g.anggota || []).includes(nama));
    const asal = grup ? grup.namaGrup : '-';

    const jdw = getJadwalGuru(nama);
    const sbt = getStatusJam1Dan2Hari(jdw.sabtu);
    const ahd = getStatusJam1Dan2Hari(jdw.ahad);
    const sen = getStatusJam1Dan2Hari(jdw.senin);
    const sel = getStatusJam1Dan2Hari(jdw.selasa);
    const rab = getStatusJam1Dan2Hari(jdw.rabu);
    const kam = getStatusJam1Dan2Hari(jdw.kamis);

    const dist = hitungDistribusiJam12Tingkat(a);

    rows.push([
      kode, nama, asal, jah,
      sbt.j1, sbt.j2, ahd.j1, ahd.j2, sen.j1, sen.j2, sel.j1, sel.j2, rab.j1, rab.j2, kam.j1, kam.j2,
      dist.ula[1] || '', dist.ula[2] || '', dist.ula[3] || '', dist.ula[4] || '',
      dist.wst[1] || '', dist.wst[2] || '',
      dist.ulya[1] || '', dist.ulya[2] || '',
      dist.totalJml || 0
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daftar Pendidik");
  XLSX.writeFile(wb, "Daftar_Tenaga_Pendidik_Madin.xlsx");
}

export function cetakDaftarPendidik() {
  document.body.classList.add('printing-daftar-pendidik');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-daftar-pendidik');
  }, 600);
}
