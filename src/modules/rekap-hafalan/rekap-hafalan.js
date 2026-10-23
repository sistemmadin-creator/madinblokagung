import { store } from '../../state/store.js';
import { fetchAllSantriFromSupabase } from '../santri/santri.js';
import { loadSetoranFromSupabase } from '../setoran/setoran.js';

function norm(val) {
  return String(val || '').trim().toUpperCase();
}

function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function switchRekapMode(mode) {
  store.rekapActiveMode = mode;
  const btnWajib = document.getElementById('pill_rekap_wajib');
  const btnTahfidz = document.getElementById('pill_rekap_tahfidz');

  if (btnWajib && btnTahfidz) {
    if (mode === 'wajib') {
      btnWajib.classList.add('active');
      btnTahfidz.classList.remove('active');
    } else {
      btnTahfidz.classList.add('active');
      btnWajib.classList.remove('active');
    }
  }

  loadRekapData();
}

export async function loadRekapData() {
  const loadingEl = document.getElementById('rekapLoading');
  const containerEl = document.getElementById('rekapTableContainer');
  const tingkatSelect = document.getElementById('filterTingkat');
  const selectedTingkat = tingkatSelect ? tingkatSelect.value : 'ULA';

  if (loadingEl) loadingEl.style.display = 'block';
  if (containerEl) containerEl.innerHTML = '';

  try {
    if (!store.globalDataSantri || store.globalDataSantri.length === 0) {
      store.globalDataSantri = await fetchAllSantriFromSupabase();
    }
    if (!store.globalDataMuhafadzoh || store.globalDataMuhafadzoh.length === 0) {
      await loadSetoranFromSupabase();
    }
  } catch (err) {
    console.error('Gagal memuat data pendukung rekap hafalan:', err);
  }

  const activeMode = store.rekapActiveMode || 'wajib';

  if (activeMode === 'wajib') {
    renderRekapWajib(selectedTingkat, containerEl);
  } else {
    renderRekapTahfidz(selectedTingkat, containerEl);
  }

  if (loadingEl) loadingEl.style.display = 'none';
}

function renderRekapWajib(tingkat, container) {
  if (!container) return;

  const allSantri = store.globalDataSantri || [];
  const santriTingkat = allSantri.filter(s => norm(s[26]) === norm(tingkat));

  if (santriTingkat.length === 0) {
    container.innerHTML = `
      <div class="card-panel text-center py-5 text-muted border-0 shadow-sm rounded-3">
        <i class="bi bi-inbox fs-1 d-block mb-2 text-secondary"></i>
        <h6 class="fw-bold">Data Santri Tidak Ditemukan</h6>
        <p class="small mb-0">Belum ada data santri yang terdaftar pada Tingkat <b>${escHtml(tingkat)}</b>.</p>
      </div>`;
    store.currentRekapData = [];
    return;
  }

  // Petakan riwayat setoran per santri (no_induk -> Map(itemHafalanNorm -> tglSetor))
  const setoranMap = new Map();
  (store.globalDataMuhafadzoh || []).forEach(row => {
    const noInduk = norm(row[1]);
    const hafalan = norm(row[17]);
    const tgl = row[2] || '-';
    if (!noInduk || !hafalan) return;

    if (!setoranMap.has(noInduk)) {
      setoranMap.set(noInduk, new Map());
    }
    const m = setoranMap.get(noInduk);
    if (!m.has(hafalan)) {
      m.set(hafalan, tgl);
    }
  });

  // Tentukan daftar kelas sesuai tingkatan
  let kelasList = ['1', '2', '3', '4'];
  if (norm(tingkat) === 'WUSTHO' || norm(tingkat) === 'ULYA') {
    kelasList = ['1', '2'];
  }

  const hafWajibConfig = store.appSettingsGlobal?.hafWajib || {};
  const processedGroups = [];
  let html = '';

  kelasList.forEach(kls => {
    const santriKelas = santriTingkat
      .filter(s => String(s[24] || '').trim() === kls)
      .sort((a, b) => {
        const bagA = String(a[25] || '');
        const bagB = String(b[25] || '');
        if (bagA !== bagB) return bagA.localeCompare(bagB);
        return String(a[5] || '').localeCompare(String(b[5] || ''));
      });

    if (santriKelas.length === 0) return;

    const configKey = `${norm(tingkat)}_${kls}`;
    const requiredItems = Array.isArray(hafWajibConfig[configKey]) ? hafWajibConfig[configKey] : [];

    const groupData = {
      kls,
      tingkat,
      requiredList: requiredItems,
      rows: []
    };

    let rowsHtml = '';
    let totalTuntas = 0;

    santriKelas.forEach((s, idx) => {
      const noInduk = String(s[1] || '').trim();
      const nama = s[5] || '-';
      const dinBag = s[25] || '-';
      const gender = s[4] || '-';

      const santriSetoran = setoranMap.get(norm(noInduk)) || new Map();
      const itemStatus = {};
      let completedCount = 0;

      const itemColsHtml = requiredItems.map(item => {
        const itemNorm = norm(item);
        let completed = false;
        let tgl = '';

        if (santriSetoran.has(itemNorm)) {
          completed = true;
          tgl = santriSetoran.get(itemNorm);
        } else {
          for (const [k, v] of santriSetoran.entries()) {
            if (k.includes(itemNorm) || itemNorm.includes(k)) {
              completed = true;
              tgl = v;
              break;
            }
          }
        }

        if (completed) {
          completedCount++;
          itemStatus[item] = { completed: true, tgl };
          const shortDate = tgl.split(' ')[0] || tgl;
          return `
            <td class="text-center">
              <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1" title="Lulus pada ${escHtml(tgl)}">
                <i class="bi bi-check-circle-fill me-1"></i>${escHtml(shortDate)}
              </span>
            </td>`;
        } else {
          itemStatus[item] = { completed: false, tgl: '-' };
          return `<td class="text-center text-muted font-monospace">-</td>`;
        }
      }).join('');

      const isTuntas = requiredItems.length > 0 && completedCount >= requiredItems.length;
      if (isTuntas) totalTuntas++;

      let badgeStatusHtml = '';
      if (requiredItems.length === 0) {
        badgeStatusHtml = `<span class="badge bg-light text-muted border">Belum Dikonfigurasi</span>`;
      } else if (isTuntas) {
        badgeStatusHtml = `<span class="badge bg-success"><i class="bi bi-check2-all me-1"></i>Tuntas</span>`;
      } else if (completedCount > 0) {
        badgeStatusHtml = `<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>${completedCount}/${requiredItems.length}</span>`;
      } else {
        badgeStatusHtml = `<span class="badge bg-secondary bg-opacity-25 text-secondary">Belum Setor</span>`;
      }

      const rowClass = isTuntas ? 'class="highlight-progress"' : '';

      rowsHtml += `
        <tr ${rowClass}>
          <td class="text-center text-muted">${idx + 1}</td>
          <td class="font-monospace fw-semibold text-dark text-nowrap">${escHtml(noInduk)}</td>
          <td class="fw-semibold text-dark">${escHtml(nama)}</td>
          <td class="text-center fw-bold">${escHtml(dinBag)}</td>
          <td class="text-center">
            <span class="badge ${gender === 'PA' ? 'bg-primary' : 'bg-danger'} bg-opacity-10 ${gender === 'PA' ? 'text-primary' : 'text-danger'} border px-2">
              ${escHtml(gender)}
            </span>
          </td>
          ${itemColsHtml}
          <td class="text-center fw-bold">${completedCount} / ${requiredItems.length}</td>
          <td class="text-center">${badgeStatusHtml}</td>
        </tr>
      `;

      groupData.rows.push({
        noInduk,
        nama,
        dinKls: kls,
        dinBag,
        gender,
        itemStatus,
        completedCount,
        isTuntas
      });
    });

    processedGroups.push(groupData);

    const persenTuntas = santriKelas.length > 0
      ? Math.round((totalTuntas / santriKelas.length) * 100)
      : 0;

    html += `
      <div class="card-panel mb-4 p-3 border shadow-sm rounded-3">
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h6 class="fw-bold m-0 text-success text-uppercase">
              <i class="bi bi-mortarboard-fill me-2"></i>Kelas ${escHtml(kls)} - Tingkat ${escHtml(tingkat)}
            </h6>
            <small class="text-muted">Target Wajib: ${requiredItems.length > 0 ? escHtml(requiredItems.join(', ')) : '<span class="text-danger">Belum ada konfigurasi</span>'}</small>
          </div>
          <div class="d-flex gap-2 align-items-center">
            <span class="badge bg-light text-dark border">Total Santri: <b>${santriKelas.length}</b></span>
            <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">Tuntas: <b>${totalTuntas} (${persenTuntas}%)</b></span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table-rekap table table-bordered table-hover align-middle mb-0">
            <thead>
              <tr>
                <th style="width: 45px;">NO</th>
                <th style="width: 110px;">NO. INDUK</th>
                <th>NAMA SANTRI</th>
                <th style="width: 60px;">BAG</th>
                <th style="width: 65px;">GENDER</th>
                ${requiredItems.map(item => `<th class="th-wajib">${escHtml(item)}</th>`).join('')}
                <th style="width: 95px;">PROGRESS</th>
                <th style="width: 115px;">STATUS</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  store.currentRekapData = processedGroups;
  container.innerHTML = html;
}

function renderRekapTahfidz(tingkat, container) {
  if (!container) return;

  const allSantri = store.globalDataSantri || [];
  const santriTingkat = allSantri.filter(s => norm(s[26]) === norm(tingkat));

  if (santriTingkat.length === 0) {
    container.innerHTML = `
      <div class="card-panel text-center py-5 text-muted border-0 shadow-sm rounded-3">
        <i class="bi bi-inbox fs-1 d-block mb-2 text-secondary"></i>
        <h6 class="fw-bold">Data Santri Tidak Ditemukan</h6>
        <p class="small mb-0">Belum ada data santri yang terdaftar pada Tingkat <b>${escHtml(tingkat)}</b>.</p>
      </div>`;
    store.currentRekapTahfidzData = [];
    return;
  }

  // Petakan seluruh setoran santri kategori Tahfidz atau hafalan bertuliskan "Juz X"
  const tahfidzMap = new Map();
  (store.globalDataMuhafadzoh || []).forEach(row => {
    const noInduk = norm(row[1]);
    const hafalan = String(row[17] || '').trim();
    const kategori = norm(row[18]);
    const tgl = row[2] || '-';

    const isTahfidz = kategori.includes('TAHFIDZ') || norm(hafalan).startsWith('JUZ ');
    if (!noInduk || !isTahfidz) return;

    if (!tahfidzMap.has(noInduk)) {
      tahfidzMap.set(noInduk, {
        juzSet: new Set(),
        lastDate: tgl
      });
    }

    const entry = tahfidzMap.get(noInduk);
    entry.juzSet.add(hafalan);
    entry.lastDate = tgl;
  });

  const processedData = santriTingkat.map(s => {
    const noInduk = String(s[1] || '').trim();
    const nama = s[5] || '-';
    const dinKls = s[24] || '-';
    const dinBag = s[25] || '-';
    const gender = s[4] || '-';

    const entry = tahfidzMap.get(norm(noInduk));
    const rawJuzList = entry ? Array.from(entry.juzSet) : [];

    const sortedJuzList = rawJuzList.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return {
      noInduk,
      nama,
      dinKls,
      dinBag,
      gender,
      juzList: sortedJuzList,
      juzCount: sortedJuzList.length,
      lastDate: entry ? entry.lastDate : '-'
    };
  });

  // Urutkan santri berdasarkan jumlah juz terbanyak
  processedData.sort((a, b) => {
    if (b.juzCount !== a.juzCount) return b.juzCount - a.juzCount;
    return a.nama.localeCompare(b.nama);
  });

  store.currentRekapTahfidzData = processedData;

  const totalSantriTahfidz = processedData.filter(p => p.juzCount > 0).length;
  const totalKhatam = processedData.filter(p => p.juzCount >= 30).length;

  let rowsHtml = '';
  processedData.forEach((p, idx) => {
    const isKhatam = p.juzCount >= 30;
    const rowClass = isKhatam ? 'class="highlight-progress"' : '';

    const badgesJuz = p.juzList.length > 0
      ? p.juzList.map(j => `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 me-1 mb-1 font-monospace" style="font-size:11px;">${escHtml(j)}</span>`).join('')
      : '<span class="text-muted font-monospace">-</span>';

    let statusBadge = '';
    if (isKhatam) {
      statusBadge = '<span class="badge bg-success"><i class="bi bi-star-fill me-1"></i>Khatam 30 Juz</span>';
    } else if (p.juzCount > 0) {
      statusBadge = '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">Aktif Menghafal</span>';
    } else {
      statusBadge = '<span class="badge bg-light text-muted border">Belum Ada Setoran</span>';
    }

    rowsHtml += `
      <tr ${rowClass}>
        <td class="text-center text-muted">${idx + 1}</td>
        <td class="font-monospace fw-semibold text-dark text-nowrap">${escHtml(p.noInduk)}</td>
        <td class="fw-semibold text-dark">${escHtml(p.nama)}</td>
        <td class="text-center fw-bold">${escHtml(p.dinKls)} ${escHtml(p.dinBag)}</td>
        <td class="text-center">
          <span class="badge ${p.gender === 'PA' ? 'bg-primary' : 'bg-danger'} bg-opacity-10 ${p.gender === 'PA' ? 'text-primary' : 'text-danger'} border px-2">
            ${escHtml(p.gender)}
          </span>
        </td>
        <td><div class="d-flex flex-wrap gap-1">${badgesJuz}</div></td>
        <td class="text-center">
          <span class="badge ${p.juzCount > 0 ? 'bg-primary' : 'bg-secondary bg-opacity-25 text-secondary'} px-2 py-1 fs-6">
            ${p.juzCount} Juz
          </span>
        </td>
        <td class="text-center text-nowrap small text-muted">${escHtml(p.lastDate)}</td>
        <td class="text-center">${statusBadge}</td>
      </tr>
    `;
  });

  const html = `
    <div class="card-panel mb-4 p-3 border shadow-sm rounded-3">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h6 class="fw-bold m-0 text-success text-uppercase">
            <i class="bi bi-book-half me-2"></i>Rekapitulasi Hafalan Tahfidz Al-Qur'an - Tingkat ${escHtml(tingkat)}
          </h6>
          <small class="text-muted">Daftar capaian setoran juz Al-Qur'an santri madrasah diniyyah</small>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <span class="badge bg-light text-dark border">Total Santri: <b>${processedData.length}</b></span>
          <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">Aktif Tahfidz: <b>${totalSantriTahfidz}</b></span>
          <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">Khatam 30 Juz: <b>${totalKhatam}</b></span>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table-rekap table table-bordered table-hover align-middle mb-0">
          <thead>
            <tr>
              <th style="width: 45px;">NO</th>
              <th style="width: 110px;">NO. INDUK</th>
              <th>NAMA SANTRI</th>
              <th style="width: 80px;">KELAS</th>
              <th style="width: 65px;">GENDER</th>
              <th>DAFTAR JUZ YANG DISETORKAN</th>
              <th style="width: 100px;">TOTAL</th>
              <th style="width: 120px;">TGL TERAKHIR</th>
              <th style="width: 125px;">STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

export function cetakRekapHafalanA4() {
  const container = document.getElementById('rekapTableContainer');
  if (!container || !container.innerHTML.trim()) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('Data Kosong', 'Tidak ada data rekapitulasi hafalan untuk dicetak.', 'info');
    }
    return;
  }

  document.body.classList.add('printing-rekap-hafalan');
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-rekap-hafalan');
    }, 500);
  }, 200);
}

export function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    if (typeof Swal !== 'undefined') {
      Swal.fire('Gagal', 'Library SheetJS (XLSX) tidak tersedia.', 'error');
    }
    return;
  }

  const mode = store.rekapActiveMode || 'wajib';
  const tingkatSelect = document.getElementById('filterTingkat');
  const tingkat = tingkatSelect ? tingkatSelect.value : 'ULA';
  const wb = XLSX.utils.book_new();

  if (mode === 'wajib') {
    const groups = store.currentRekapData || [];
    if (groups.length === 0) {
      if (typeof Swal !== 'undefined') {
        Swal.fire('Data Kosong', 'Tidak ada data hafalan wajib untuk diekspor.', 'info');
      }
      return;
    }

    groups.forEach(group => {
      const aoa = [
        [`REKAPITULASI HAFALAN WAJIB - KELAS ${group.kls} TINGKAT ${tingkat}`],
        [`Madrasah Diniyyah Al Amiriyyah Blokagung`],
        [],
        ['No', 'No. Induk', 'Nama Santri', 'Bagian', 'Gender', ...group.requiredList, 'Total Selesai', 'Status']
      ];

      group.rows.forEach((r, idx) => {
        aoa.push([
          idx + 1,
          r.noInduk,
          r.nama,
          r.dinBag,
          r.gender,
          ...group.requiredList.map(item => r.itemStatus[item]?.completed ? r.itemStatus[item].tgl : '-'),
          `${r.completedCount} / ${group.requiredList.length}`,
          r.isTuntas ? 'TUNTAS' : (r.completedCount > 0 ? 'PROGRES' : 'BELUM SETOR')
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, `Kelas ${group.kls}`);
    });

    XLSX.writeFile(wb, `Rekap_Hafalan_Wajib_${tingkat}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } else {
    const list = store.currentRekapTahfidzData || [];
    if (list.length === 0) {
      if (typeof Swal !== 'undefined') {
        Swal.fire('Data Kosong', 'Tidak ada data hafalan tahfidz untuk diekspor.', 'info');
      }
      return;
    }

    const aoa = [
      [`REKAPITULASI HAFALAN TAHFIDZ AL-QUR'AN - TINGKAT ${tingkat}`],
      [`Madrasah Diniyyah Al Amiriyyah Blokagung`],
      [],
      ['No', 'No. Induk', 'Nama Santri', 'Kelas', 'Bagian', 'Gender', 'Daftar Juz Disetorkan', 'Total Juz', 'Tgl Terakhir Setor', 'Status']
    ];

    list.forEach((r, idx) => {
      aoa.push([
        idx + 1,
        r.noInduk,
        r.nama,
        r.dinKls,
        r.dinBag,
        r.gender,
        r.juzList.join(', '),
        r.juzCount,
        r.lastDate || '-',
        r.juzCount >= 30 ? 'KHATAM 30 JUZ' : (r.juzCount > 0 ? 'AKTIF' : 'BELUM SETOR')
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, `Tahfidz ${tingkat}`);
    XLSX.writeFile(wb, `Rekap_Hafalan_Tahfidz_${tingkat}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
