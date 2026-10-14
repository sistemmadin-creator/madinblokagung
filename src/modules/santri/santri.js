import { supabase } from '../../lib/supabase.js';
import { store, SANTRI_DB_FIELDS, filterCategories, dbRowToArray } from '../../state/store.js';
import { forceSetSelect, populateSelect, resetSelects } from '../../utils/dom.js';
import { setPreviewFotoSantri, hapusFotoSantri } from '../../utils/camera.js';
import { logActivity } from '../audit/audit.js';

// =========================================================
// MODUL DATA SANTRI (FETCH, TABEL, FILTER, HIDE, EXCEL & CRUD)
// =========================================================
export async function fetchAllSantriFromSupabase() {
  if (!supabase) {
    console.warn('Supabase belum dikonfigurasi. Periksa VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY.');
    return [];
  }
  const pageSize = 1000;
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('santri')
      .select('*')
      .order('no_induk', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows.map(dbRowToArray);
}

export function initSantriUI() {
  // 1. Render Kategori Filter Lanjutan (16 Kategori)
  let filterHtml = '<div class="row g-3">';
  filterCategories.forEach(cat => {
    filterHtml += `
      <div class="col-md-4">
        <div class="token-wrapper">
          <input class="btn-check filter-cb" type="checkbox" id="cb_${cat.col}" value="${cat.col}">
          <label class="btn text-truncate" for="cb_${cat.col}" title="${cat.name}">${cat.name}</label>
        </div>
        <input list="dl_${cat.col}" type="text" class="form-control form-control-sm filter-input mt-2" id="in_${cat.col}" disabled placeholder="Pilih...">
        <datalist id="dl_${cat.col}"></datalist>
      </div>`;
  });
  const filterContainer = document.getElementById('filterFormCategories');
  if (filterContainer) filterContainer.innerHTML = filterHtml + '</div>';

  // 2. Render Modal Sembunyikan Kolom (34 Kolom, "Nama" dikunci)
  initHideModal();

  // 3. Toggle aktif/nonaktif input filter saat kapsul kategori dicentang
  $(document).on('change', '.filter-cb', function () {
    let inputId = '#in_' + $(this).val();$(inputId).prop('disabled', !this.checked);
    if (!this.checked) $(inputId).val('');
  });

  // 4. Inisialisasi Dropdown Tanggal (01-31) & Tahun Lahir (1990 - Sekarang)
  const tglSelect = document.getElementById('tgl_lahir');
  if (tglSelect && tglSelect.options.length === 0) {
    tglSelect.options.add(new Option('Pilih', ''));
    for (let i = 1; i <= 31; i++) {
      let val = i < 10 ? '0' + i : String(i);
      tglSelect.options.add(new Option(val, val));
    }
  }

  const thnSelect = document.getElementById('thn_lahir');
  if (thnSelect && thnSelect.options.length === 0) {
    thnSelect.options.add(new Option('Pilih', ''));
    for (let i = new Date().getFullYear(); i >= 1990; i--) {
      thnSelect.options.add(new Option(i, i));
    }
  }

  // 5. Checkbox Select All & Klik Baris Tabel Santri -> Modal Detail
  $(document).on('change', '#checkAll', function () {
    $('.row-check').prop('checked', this.checked);
  });

  $(document).off('click', '#dataTable tbody tr').on('click', '#dataTable tbody tr', function (e) {
    if ($(e.target).hasClass('row-check') || $(e.target).is(':checkbox') \vert{}\vert{}$(this).find('.dataTables_empty').length > 0) {
      return;
    }

    let noInduk = $(this).find('.row-check').val();
    if (!noInduk) return;

    let santri = store.globalDataSantri.find(r => String(r[1]) === String(noInduk));
    if (!santri) return;

    store.selectedRowData = [...santri];

    let ttl = `${santri[6] || '-'}, ${santri[7] || ''} ${santri[8] || ''} ${santri[9] || ''}`.trim();
    let alamat = `Dusun ${santri[10] || '-'}, Desa ${santri[11] || '-'}, Kec. ${santri[12] || '-'}, Kab. ${santri[13] || '-'}, Prov. ${santri[14] || '-'}`;
    let penempatan = `Blok ${santri[15] || '-'} - Asrama ${santri[16] || '-'} - Kode ${santri[17] || '-'} - Kamar ${santri[18] || '-'}`;

    let formalParts = [santri[23], santri[22], santri[21], santri[19], santri[20]]
      .map(s => (s || '').trim())
      .filter(s => s && s !== '-');
    let formal = formalParts.length > 0 ? formalParts.join(' - ') : '-';

    let diniyyahParts = [santri[24], santri[25], santri[26]]
      .map(s => (s || '').trim())
      .filter(s => s && s !== '-');
    let diniyyah = diniyyahParts.length > 0 ? diniyyahParts.join(' ') : '-';

    function buildDetailRow(label, value) {
      return `<div class="row mb-2">
        <div class="col-sm-4 text-muted">${label}</div>
        <div class="col-sm-8 text-dark"><span class="d-none d-sm-inline me-2">:</span> <span class="fw-bold">${value || '-'}</span></div>
      </div>`;
    }

    let fotoSantriUrl = santri[35] || '';
    let fotoDetailHtml = fotoSantriUrl
      ? `<img src="${fotoSantriUrl}" alt="Foto ${santri[5] || 'Santri'}"
              style="width: 110px; height: 140px; object-fit: cover; border-radius: 12px; cursor: zoom-in;"
              class="border shadow-sm"
              title="Klik untuk memperbesar foto"
              onclick="window.lihatFotoSantri('${fotoSantriUrl.replace(/'/g, "\\'")}', '${(santri[5] || '').replace(/'/g, "\\'")}')">`
      : `<div class="d-flex flex-column align-items-center justify-content-center border rounded-3 bg-light text-muted shadow-sm"
              style="width: 110px; height: 140px;">
           <i class="bi bi-person-circle" style="font-size: 3rem;"></i>
           <span style="font-size: 11px;">Belum ada foto</span>
         </div>`;

    let html = `
      <div class="bg-white p-3 rounded border shadow-sm mb-3">
        <h6 class="text-success fw-bold border-bottom pb-2 mb-3">Identitas Santri</h6>
        <div class="row align-items-center">
          <div class="col-sm-3 text-center mb-3 mb-sm-0 d-flex justify-content-center">
            ${fotoDetailHtml}
          </div>
          <div class="col-sm-9">
            ${buildDetailRow('No. Induk / NISN', (santri[1] || '-') + ' / ' + (santri[3] || '-'))}
            ${buildDetailRow('Nama Lengkap', santri[5])}
            ${buildDetailRow('Jenis Kelamin', santri[4] === 'PA' ? 'PA (Putra)' : (santri[4] === 'PI' ? 'PI (Putri)' : '-'))}
            ${buildDetailRow('Tempat, Tgl Lahir', ttl)}
            ${buildDetailRow('NIK / No. KK', (santri[28] || '-') + ' / ' + (santri[29] || '-'))}
          </div>
        </div>
      </div>
      <div class="bg-white p-3 rounded border shadow-sm mb-3">
        <h6 class="text-success fw-bold border-bottom pb-2 mb-3 mt-2">Alamat & Penempatan</h6>
        ${buildDetailRow('Penempatan Kamar', penempatan)}
        ${buildDetailRow('Alamat Lengkap', alamat)}
      </div>
      <div class="bg-white p-3 rounded border shadow-sm mb-3">
        <h6 class="text-success fw-bold border-bottom pb-2 mb-3 mt-2">Pendidikan</h6>
        ${buildDetailRow('Sekolah Formal', formal)}
        ${buildDetailRow('Madrasah Diniyyah', diniyyah)}
        ${buildDetailRow('ORDA', santri[27])}
      </div>
      <div class="bg-white p-3 rounded border shadow-sm">
        <h6 class="text-success fw-bold border-bottom pb-2 mb-3 mt-2">Data Orang Tua / Wali</h6>
        ${buildDetailRow('Nama Ayah (BIN)', santri[30])}
        ${buildDetailRow('Nama Ibu (BINTI)', santri[32])}
        ${buildDetailRow('No. Telepon / HP', santri[34])}
      </div>
    `;

    document.getElementById('detailContent').innerHTML = html;
    $('#detailModal').modal('show');
  });

  // 6. Pasang Tombol Edit & Hapus di Modal Detail Santri
  setupDetailModalButtons();
}

export function populateFilterDatalists() {
  filterCategories.forEach(cat => {
    let uniqueValues = [...new Set(store.globalDataSantri.map(r => r[cat.col - 1]))]
      .filter(v => v && v.toString().trim() !== '');
    let dataList = document.getElementById('dl_' + cat.col);
    if (dataList) {
      dataList.innerHTML = uniqueValues.sort().map(val => `<option value="${val}">`).join('');
    }
  });
}

export async function actionLoadSantri() {
  const btn = document.getElementById('btnLoadSantri');
  btn.classList.add('btn-loading-state');

  btn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
    <span>Menyiapkan Database Santri...</span>
  `;

  setTimeout(async () => {
    try {
      if (!store.globalDataSantri || store.globalDataSantri.length === 0) {
        store.globalDataSantri = await fetchAllSantriFromSupabase();
      }
      btn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>Memuat ${store.globalDataSantri.length.toLocaleString('id-ID')} Data Santri...</span>
      `;
      setTimeout(() => {
        renderTable(store.globalDataSantri);
      }, 80);
    } catch (err) {
      Swal.fire('Gagal Memuat Data', err.message, 'error');
      btn.classList.remove('btn-loading-state');
      btn.innerHTML = '<i class="bi bi-table me-2"></i> Memuat Halaman (Tabel Data)';
    }
  }, 60);
}

export function renderTable(data) {
  let btnContainer = document.getElementById('btnLoadSantriContainer');
  let tableWrapper = document.getElementById('tableSantriWrapper');
  if (btnContainer) btnContainer.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  if (store.dataTable) {
    store.dataTable.destroy();
    $('#dataTable').empty();
  }

  $('#dataTable').html(`
    <thead class="table-light">
      <tr>
        <th class="text-center" style="width: 40px;"><input type="checkbox" id="checkAll" class="form-check-input"></th>
        <th class="text-center">No</th>
        <th>No. Induk</th>
        <th>No. Biro</th>
        <th>NISN</th>
        <th class="text-center">Gender</th>
        <th>Nama Lengkap</th>
        <th>Tempat Lahir</th>
        <th class="text-center">Tgl</th>
        <th class="text-center">Bln</th>
        <th class="text-center">Thn</th>
        <th>Dusun</th>
        <th>Desa</th>
        <th>Kecamatan</th>
        <th>Kabupaten</th>
        <th>Provinsi</th>
        <th>Blok</th>
        <th>Asrama</th>
        <th>Kode</th>
        <th>Kamar</th>
        <th>Kelas</th>
        <th>Bag</th>
        <th>Semester</th>
        <th>Jurusan</th>
        <th>Unit</th>
        <th>Din. Kls</th>
        <th>Din. Bag</th>
        <th>Tingkat</th>
        <th>ORDA</th>
        <th>NIK Santri</th>
        <th>No. KK</th>
        <th>Nama Ayah</th>
        <th>NIK Ayah</th>
        <th>Nama Ibu</th>
        <th>NIK Ibu</th>
        <th>Telepon</th>
      </tr>
    </thead>
    <tbody id="tableBody"></tbody>
  `);

  store.globalDataSantri = Array.isArray(data) ? data : JSON.parse(data || '[]');

  const tableDataArray = [];
  for (let r = 0; r < store.globalDataSantri.length; r++) {
    const row = store.globalDataSantri[r];
    const genderBadge = row[4] === 'PA'
      ? '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2">PA</span>'
      : (row[4] === 'PI'
        ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2">PI</span>'
        : (row[4] || ''));

    tableDataArray.push([
      `<input type="checkbox" class="row-check form-check-input" value="${row[1]}">`,
      '',
      `<span class="fw-bold text-dark font-monospace">${row[1] || ''}</span>`,
      row[2] || '',
      row[3] || '',
      genderBadge,
      `<span class="fw-bold text-dark">${row[5] || ''}</span>`,
      row[6] || '',
      row[7] || '',
      row[8] || '',
      row[9] || '',
      row[10] || '',
      row[11] || '',
      row[12] || '',
      row[13] || '',
      row[14] || '',
      row[15] || '',
      row[16] || '',
      row[17] || '',
      row[18] || '',
      row[19] || '',
      row[20] || '',
      row[21] || '',
      row[22] || '',
      row[23] || '',
      row[24] || '',
      row[25] || '',
      row[26] || '',
      row[27] || '',
      `<span class="font-monospace text-secondary">${row[28] || ''}</span>`,
      `<span class="font-monospace text-secondary">${row[29] || ''}</span>`,
      row[30] || '',
      `<span class="font-monospace text-muted">${row[31] || ''}</span>`,
      row[32] || '',
      `<span class="font-monospace text-muted">${row[33] || ''}</span>`,
      row[34] || ''
    ]);
  }

  store.dataTable = $('#dataTable').DataTable({
    data: tableDataArray,
    scrollX: true,
    scrollCollapse: true,
    autoWidth: true,
    processing: true,
    deferRender: true,
    pageLength: 25,
    lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
    language: {
      search: 'Pencarian:',
      lengthMenu: 'Tampilkan _MENU_ data',
      info: 'Menampilkan _START_ - _END_ dari total _TOTAL_ santri',
      emptyTable: 'Data santri tidak ditemukan.'
    },
    columnDefs: [
      { searchable: false, orderable: false, targets: [0, 1], className: 'text-center' },
      { className: 'text-center', targets: [5, 8, 9, 10] }
    ],
    order: [[2, 'asc']],
    initComplete: function () {
      const api = this.api();
      setTimeout(() => api.columns.adjust(), 150);

      if ($('#actionGroup').length === 0) {
        $('#dataTable_filter').addClass('d-flex justify-content-end align-items-center gap-2 flex-wrap');
        $('#dataTable_filter label').addClass('mb-0 d-flex align-items-center gap-2');

        let actionBtns = $(`
          <div class="d-flex gap-2 flex-nowrap" id="actionGroup">
            <div class="dropdown">
              <button class="btn btn-outline-danger btn-sm dropdown-toggle text-nowrap border-0" type="button" data-bs-toggle="dropdown">
                <i class="bi bi-trash"></i> Hapus
              </button>
              <ul class="dropdown-menu shadow-sm border-0">
                <li><a class="dropdown-item" href="#" onclick="window.hapusTerpilih(); return false;"><i class="bi bi-check2-square text-danger me-2"></i> Hapus Terpilih</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item fw-bold text-danger" href="#" onclick="window.hapusSemuaData(); return false;"><i class="bi bi-exclamation-triangle-fill me-2"></i> Hapus Semua</a></li>
              </ul>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#hideModal"><i class="bi bi-eye-slash"></i> Sembunyikan</button>
            <button type="button" class="btn btn-outline-primary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#filterModal"><i class="bi bi-funnel"></i> Filter</button>
          </div>
        `);
        $('#dataTable_filter').prepend(actionBtns);
      }
    }
  });

  store.dataTable.on('order.dt search.dt', function () {
    let i = 1;
    store.dataTable.cells(null, 1, { search: 'applied', order: 'applied' }).every(function () {
      this.data(i++);
    });
  }).draw();

  setTimeout(() => {
    if (store.dataTable) store.dataTable.columns.adjust().draw(false);
  }, 300);

  applyHideColumns();
  populateFilterDatalists();
}

export function initHideModal() {
  let html = '';
  const colNames = [
    'No.Induk', 'No.Biro', 'NISN', 'PA/PI', 'Nama',
    'Tempat Lahir', 'Tgl Lahir', 'Bln Lahir', 'Thn Lahir',
    'Dusun', 'Desa', 'Kecamatan', 'Kabupaten', 'Provinsi',
    'Blok', 'Asrama', 'Kode', 'Kamar',
    'Kelas', 'Bag', 'Semester', 'Jurusan', 'Unit',
    'Din.Kls', 'Din.Bag', 'Tingkat', 'ORDA',
    'NIK', 'NO.KK', 'Nama Ayah', 'NIK Ayah', 'Nama Ibu', 'NIK Ibu', 'Telepon'
  ];

  colNames.forEach((name, i) => {
    let colIdx = i + 2;
    let isLockedName = (name === 'Nama');

    html += `
      <div class="col-md-3 col-sm-4 col-6 mb-2">
        <div class="token-wrapper">
          <input type="checkbox" class="btn-check hide-cb" id="hide_${colIdx}" value="${colIdx}" ${isLockedName ? 'disabled' : ''}>
          <label class="btn text-truncate" for="hide_${colIdx}" title="${name}">
            ${name}
          </label>
        </div>
      </div>`;
  });
  const container = document.getElementById('hideCheckboxes');
  if (container) container.innerHTML = html;
}

export function checkAllHide(status) {
  $('.hide-cb:not(:disabled)').prop('checked', status);
}

export function applyHideColumns() {
  store.hiddenColumnsGlobal = [];
  if (!store.dataTable) return;

  for (let i = 2; i <= 35; i++) {
    store.dataTable.column(i).visible(true, false);
  }

  $('.hide-cb:checked').each(function () {
    let colIdx = parseInt($(this).val(), 10);
    store.hiddenColumnsGlobal.push(colIdx);
    store.dataTable.column(colIdx).visible(false, false);
  });

  store.dataTable.columns.adjust().draw(false);
}

export function applyFilters() {
  if (!store.dataTable) return;
  store.dataTable.columns().search('');
  $('.filter-cb:checked').each(function () {
    let colIdx = $(this).val();
    let val = $('#in_' + colIdx).val();
    store.dataTable.column(colIdx).search(val);
  });
  store.dataTable.draw();
}

export function resetFilters() {
  $('.filter-cb').prop('checked', false);$('.filter-input').val('').prop('disabled', true);
  if (store.dataTable) store.dataTable.columns().search('').draw();
}

export function setupDetailModalButtons() {
  const btnHapus = document.getElementById('btnHapusDetail');
  const btnEdit = document.getElementById('btnEditDetail');
  if (!btnHapus || !btnEdit) return;

  btnHapus.addEventListener('click', async function () {
    const noInduk = store.selectedRowData[1];
    const namaSantri = store.selectedRowData[5] || '';
    if (!noInduk) return;

    const confirmRes = await Swal.fire({
      title: 'Hapus Data Santri?',
      text: `Yakin ingin menghapus santri ${namaSantri} (No. Induk: ${noInduk})?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal'
    });

    if (!confirmRes.isConfirmed) return;

    const btn = this;
    const prevHtml = btn.innerHTML;
    btn.innerHTML = 'Menghapus...';
    btn.disabled = true;

    try {
      const { error } = await supabase.from('santri').delete().eq('no_induk', String(noInduk));
      if (error) throw error;

      await logActivity('HAPUS SANTRI', `Menghapus santri: ${namaSantri} (No. Induk: ${noInduk})`);
      const freshData = await fetchAllSantriFromSupabase();
      renderTable(freshData);
      $('#detailModal').modal('hide');
      Swal.fire('Terhapus!', 'Data santri berhasil dihapus.', 'success');
    } catch (err) {
      Swal.fire('Gagal Menghapus', err.message, 'error');
    } finally {
      btn.innerHTML = prevHtml;
      btn.disabled = false;
    }
  });

  btnEdit.addEventListener('click', function () {
    if (!store.selectedRowData || !store.selectedRowData[1]) return;
    store.isEditMode = true;
    $('#detailModal').modal('hide');

    document.querySelector('#inputModal .modal-title').innerHTML = "<i class='bi bi-pencil-square me-2'></i> Edit Data Santri";
    document.getElementById('btnSubmit').innerText = 'Update Data';

    const form = document.getElementById('inputForm');
    form.reset();

    form.no_induk_lama.value = store.selectedRowData[1] || '';
    form.no_induk.value = store.selectedRowData[1] || '';
    form.no_biro.value = store.selectedRowData[2] || '';
    form.nisn.value = store.selectedRowData[3] || '';
    form.pa_pi.value = store.selectedRowData[4] || '';
    form.nama.value = store.selectedRowData[5] || '';
    form.tempat_lahir.value = store.selectedRowData[6] || '';
    forceSetSelect(form.tgl_lahir, store.selectedRowData[7]);
    forceSetSelect(form.bln_lahir, store.selectedRowData[8]);
    forceSetSelect(form.thn_lahir, store.selectedRowData[9]);

    form.dusun.value = store.selectedRowData[10] || '';
    forceSetSelect(form.provinsi, store.selectedRowData[14]);
    forceSetSelect(form.kabupaten, store.selectedRowData[13]);
    forceSetSelect(form.kecamatan, store.selectedRowData[12]);
    forceSetSelect(form.desa, store.selectedRowData[11]);

    const bVal = store.selectedRowData[15], aVal = store.selectedRowData[16], kdVal = store.selectedRowData[17], kmVal = store.selectedRowData[18];
    forceSetSelect(form.blok, bVal);
    if (bVal && store.tree1Data[bVal]) populateSelect('asrama', Object.keys(store.tree1Data[bVal]));
    forceSetSelect(form.asrama, aVal);
    if (bVal && aVal && store.tree1Data[bVal]?.[aVal]) populateSelect('kode', Object.keys(store.tree1Data[bVal][aVal]));
    forceSetSelect(form.kode, kdVal);
    if (bVal && aVal && kdVal && store.tree1Data[bVal]?.[aVal]?.[kdVal]) populateSelect('kamar', Object.keys(store.tree1Data[bVal][aVal][kdVal]));
    forceSetSelect(form.kamar, kmVal);

    const uVal = store.selectedRowData[23], jVal = store.selectedRowData[22], sVal = store.selectedRowData[21], klVal = store.selectedRowData[19], bgVal = store.selectedRowData[20];
    forceSetSelect(form.unit, uVal);
    if (uVal && store.tree2Data[uVal]) populateSelect('jurusan', Object.keys(store.tree2Data[uVal]));
    forceSetSelect(form.jurusan, jVal);
    if (uVal && jVal && store.tree2Data[uVal]?.[jVal]) populateSelect('semester', Object.keys(store.tree2Data[uVal][jVal]));
    forceSetSelect(form.semester, sVal);
    if (uVal && jVal && sVal && store.tree2Data[uVal]?.[jVal]?.[sVal]) populateSelect('kelas', Object.keys(store.tree2Data[uVal][jVal][sVal]));
    forceSetSelect(form.kelas, klVal);
    if (uVal && jVal && sVal && klVal && store.tree2Data[uVal]?.[jVal]?.[sVal]?.[klVal]) populateSelect('bag', Object.keys(store.tree2Data[uVal][jVal][sVal][klVal]));
    forceSetSelect(form.bag, bgVal);

    const tkVal = store.selectedRowData[26], dkVal = store.selectedRowData[24], dbVal = store.selectedRowData[25];
    let gender = form.pa_pi.value;
    if (gender) {
      let tOpts = [...new Set(store.globalDataFormasi.filter(f => f.pa_pi === gender).map(f => f.tingkat))];
      populateSelect('tingkat', tOpts);
    }
    forceSetSelect(form.tingkat, tkVal);

    if (tkVal && gender) {
      let dkOpts = [...new Set(store.globalDataFormasi.filter(f => f.tingkat === tkVal && f.pa_pi === gender).map(f => f.din_kls))];
      populateSelect('din_kls', dkOpts);
    }
    forceSetSelect(form.din_kls, dkVal);

    if (tkVal && dkVal && gender) {
      let dbOpts = [...new Set(store.globalDataFormasi.filter(f => f.tingkat === tkVal && f.pa_pi === gender && f.din_kls === dkVal).map(f => f.din_bag))];
      populateSelect('din_bag', dbOpts);
    }
    forceSetSelect(form.din_bag, dbVal);

    form.orda.value = store.selectedRowData[27] || '';
    form.nik.value = store.selectedRowData[28] || '';
    form.no_kk.value = store.selectedRowData[29] || '';
    form.nama_ayah.value = store.selectedRowData[30] || '';
    form.nik_ayah.value = store.selectedRowData[31] || '';
    form.nama_ibu.value = store.selectedRowData[32] || '';
    form.nik_ibu.value = store.selectedRowData[33] || '';
    form.telepon.value = store.selectedRowData[34] || '';

    setPreviewFotoSantri(store.selectedRowData[35] || '');

    $('#inputModal').modal('show');
  });
}

export function openAddModal() {
  store.isEditMode = false;
  document.getElementById('inputForm').reset();
  document.getElementById('no_induk_lama').value = '';
  hapusFotoSantri();
  resetSelects(['kabupaten', 'kecamatan', 'desa', 'asrama', 'kode', 'kamar', 'jurusan', 'semester', 'bag', 'kelas', 'din_bag', 'din_kls']);
  document.querySelector('#inputModal .modal-title').innerHTML = "<i class='bi bi-person-plus-fill me-2'></i> Form Data Santri";
  document.getElementById('btnSubmit').innerText = 'Simpan Data';
  $('#inputModal').modal('show');
}

export async function submitData(e) {
  e.preventDefault();
  const btnSubmit = document.getElementById('btnSubmit');
  const prevText = btnSubmit.innerText;
  btnSubmit.innerHTML = 'Menyimpan...';
  btnSubmit.disabled = true;

  const form = document.getElementById('inputForm');
  const payload = {};
  SANTRI_DB_FIELDS.forEach(field => {
    payload[field] = form[field] ? String(form[field].value || '').trim() : '';
  });
  payload.nama = payload.nama.toUpperCase();

  try {
    if (store.isEditMode) {
      const noIndukAcuan = String(form.no_induk_lama.value || payload.no_induk).trim();
      const { error } = await supabase
        .from('santri')
        .update(payload)
        .eq('no_induk', noIndukAcuan);

      if (error) throw error;
      await logActivity('UPDATE SANTRI', `Memperbarui data santri: ${payload.nama} (No. Induk: ${payload.no_induk})`);
    } else {
      const { error } = await supabase
        .from('santri')
        .insert([payload]);

      if (error) throw error;
      await logActivity('TAMBAH SANTRI', `Menambahkan santri: ${payload.nama} (No. Induk: ${payload.no_induk})`);
    }

    const freshData = await fetchAllSantriFromSupabase();
    renderTable(freshData);
    $('#inputModal').modal('hide');

    if (!store.isEditMode) {
      form.reset();
      resetSelects(['kabupaten', 'kecamatan', 'desa', 'asrama', 'kode', 'kamar', 'jurusan', 'semester', 'bag', 'kelas', 'din_bag', 'din_kls']);
    }

    Swal.fire({
      title: store.isEditMode ? 'Data Diperbarui!' : 'Data Tersimpan!',
      icon: 'success',
      timer: 1400,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire('Gagal Menyimpan Data', err.message, 'error');
  } finally {
    btnSubmit.innerHTML = prevText;
    btnSubmit.disabled = false;
  }
}

export async function hapusTerpilih() {
  let selected = [];
  $('.row-check:checked').each(function () {
    selected.push(String($(this).val()));
  });
  if (selected.length === 0) {
    return Swal.fire('Perhatian', 'Centang minimal satu data santri!', 'info');
  }

  const confirmRes = await Swal.fire({
    title: `Hapus ${selected.length} Santri?`,
    text: 'Data santri yang dicentang akan dihapus permanen dari database.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Ya, Hapus Terpilih',
    cancelButtonText: 'Batal'
  });

  if (!confirmRes.isConfirmed) return;

  $('#actionGroup button').prop('disabled', true);
  try {
    const { error } = await supabase.from('santri').delete().in('no_induk', selected);
    if (error) throw error;

    await logActivity('HAPUS BANYAK SANTRI', `Menghapus ${selected.length} santri terpilih`);
    const freshData = await fetchAllSantriFromSupabase();
    renderTable(freshData);
    $('#checkAll').prop('checked', false);
    Swal.fire('Berhasil!', `${selected.length} data santri berhasil dihapus.`, 'success');
  } catch (err) {
    Swal.fire('Gagal Menghapus', err.message, 'error');
  } finally {
    $('#actionGroup button').prop('disabled', false);
  }
}

export async function hapusSemuaData() {
  const firstConfirm = await Swal.fire({
    title: 'AWAS! Hapus SELURUH Data Santri?',
    text: 'Tindakan ini akan mengosongkan seluruh isi tabel santri di Supabase!',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Lanjutkan Konfirmasi Kedua',
    cancelButtonText: 'Batal'
  });
  if (!firstConfirm.isConfirmed) return;

  const secondConfirm = await Swal.fire({
    title: 'Konfirmasi Terakhir!',
    text: 'Ketik "HAPUS SEMUA" untuk mengonfirmasi pengosongan database santri:',
    input: 'text',
    inputPlaceholder: 'HAPUS SEMUA',
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    confirmButtonText: 'Kosongkan Database',
    cancelButtonText: 'Batal'
  });

  if (!secondConfirm.isConfirmed || secondConfirm.value !== 'HAPUS SEMUA') {
    return Swal.fire('Dibatalkan', 'Pengosongan database santri dibatalkan.', 'info');
  }

  $('#actionGroup button').prop('disabled', true);
  try {
    const { error } = await supabase.from('santri').delete().neq('no_induk', '');
    if (error) throw error;

    await logActivity('KOSONGKAN SANTRI', 'Menghapus SELURUH data santri di Database');
    const freshData = await fetchAllSantriFromSupabase();
    renderTable(freshData);
    Swal.fire('Database Dikosongkan', 'Seluruh data santri telah dihapus.', 'success');
  } catch (err) {
    Swal.fire('Gagal Mengosongkan Data', err.message, 'error');
  } finally {
    $('#actionGroup button').prop('disabled', false);
  }
}

export function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const jsonArray = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

    let headerRow = [];
    if (jsonArray.length > 0) {
      headerRow = jsonArray.shift();
    }
    if (jsonArray.length === 0) {
      return Swal.fire('File Kosong', 'File Excel kosong atau tidak terbaca.', 'warning');
    }

    const importBtn = document.getElementById('btnImportExcelSantri');
    const originalText = importBtn.innerHTML;
    importBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Mengimpor...';
    importBtn.disabled = true;

    try {
      const firstHeaderCell = String(headerRow[0] || '').trim().toLowerCase();
      const hasLeadingNoColumn = (firstHeaderCell === 'no' || firstHeaderCell === 'no.' || firstHeaderCell === '' || (jsonArray[0] && jsonArray[0].length >= 35));
      const offset = hasLeadingNoColumn ? 1 : 0;

      const recordsMap = new Map();
      jsonArray.forEach(row => {
        if (!row || row.join('').trim() === '') return;
        const noInduk = String(row[offset] ?? '').trim();
        if (!noInduk) return;

        const record = {};
        SANTRI_DB_FIELDS.forEach((fieldName, idx) => {
          let val = row[idx + offset];
          record[fieldName] = val !== undefined && val !== null ? String(val).trim() : '';
        });
        record.nama = (record.nama || '').toUpperCase();
        recordsMap.set(noInduk, record);
      });

      const recordsToInsert = Array.from(recordsMap.values());
      if (recordsToInsert.length === 0) {
        throw new Error('Tidak ditemukan baris dengan No. Induk yang valid pada file Excel.');
      }

      const chunkSize = 500;
      for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
        const chunk = recordsToInsert.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('santri')
          .upsert(chunk, { onConflict: 'no_induk' });
        if (error) throw error;
      }

      await logActivity('IMPOR EXCEL SANTRI', `Mengimpor ${recordsToInsert.length} santri melalui file Excel`);
      const freshData = await fetchAllSantriFromSupabase();
      renderTable(freshData);
      Swal.fire('Impor Berhasil!', `${recordsToInsert.length} data santri berhasil diimpor ke Supabase.`, 'success');
    } catch (err) {
      Swal.fire('Gagal Impor Excel', err.message, 'error');
    } finally {
      importBtn.innerHTML = originalText;
      importBtn.disabled = false;
      document.getElementById('excelFileInput').value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}
