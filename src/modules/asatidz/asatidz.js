import { supabase } from '../../lib/supabase.js';
import { store, ASATIDZ_DB_FIELDS, filterCategoriesAsatidz } from '../../state/store.js';
import { forceSetSelect, populateSelect, resetSelects } from '../../utils/dom.js';
import { setPreviewFotoAsatidz, hapusFotoAsatidz } from '../../utils/camera.js';
import { updateJahOptions } from '../settings/hierarchy.js';
import { logActivity } from '../audit/audit.js';

// =========================================================
// MODUL DATA ASATIDZ (FETCH, TABEL, FILTER, HIDE, NIA & CRUD)
// =========================================================
export async function fetchAllAsatidzFromSupabase() {
  if (!supabase) {
    console.warn('Supabase belum dikonfigurasi.');
    return [];
  }
  const pageSize = 1000;
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('asatidz')
      .select('*')
      .order('nama_asatidz', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

export function initAsatidzUI() {
  // 1. Render kategori Filter Lanjutan Asatidz
  let filterHtmlAsatidz = '<div class="row g-3">';
  filterCategoriesAsatidz.forEach(cat => {
    filterHtmlAsatidz += `
      <div class="col-md-4">
        <div class="token-wrapper">
          <input class="btn-check filter-cb-asatidz" type="checkbox" id="cba_${cat.col}" value="${cat.col}">
          <label class="btn text-truncate" for="cba_${cat.col}" title="${cat.name}">${cat.name}</label>
        </div>
        <input list="dla_${cat.col}" type="text" class="form-control form-control-sm filter-input-asatidz mt-2" id="ina_${cat.col}" disabled placeholder="Pilih...">
        <datalist id="dla_${cat.col}"></datalist>
      </div>`;
  });
  const filterContainerA = document.getElementById('filterFormCategoriesAsatidz');
  if (filterContainerA) filterContainerA.innerHTML = filterHtmlAsatidz + '</div>';

  $(document).on('change', '.filter-cb-asatidz', function () {
    let inputId = '#ina_' + $(this).val();
    $(inputId).prop('disabled', !this.checked);
    if (!this.checked) $(inputId).val('');
  });

  // 2. Render Modal Sembunyikan Kolom Asatidz
  initHideModalAsatidz();

  // 3. Dropdown Tanggal & Tahun Lahir Asatidz
  const tglSelectA = document.getElementById('tgl_lahir_asatidz');
  if (tglSelectA && tglSelectA.options.length === 0) {
    tglSelectA.options.add(new Option('Pilih', ''));
    for (let i = 1; i <= 31; i++) {
      let val = i < 10 ? '0' + i : String(i);
      tglSelectA.options.add(new Option(val, val));
    }
  }
  const thnSelectA = document.getElementById('thn_lahir_asatidz');
  if (thnSelectA && thnSelectA.options.length === 0) {
    thnSelectA.options.add(new Option('Pilih', ''));
    for (let i = new Date().getFullYear(); i >= 1950; i--) {
      thnSelectA.options.add(new Option(i, i));
    }
  }

  // 4. Checkbox Select All & Klik Baris Tabel Asatidz
  $(document).on('change', '#checkAllAsatidz', function () {
    $('.row-check-asatidz').prop('checked', this.checked);
  });
jQuery(document).off('click', '#dataTableAsatidz tbody tr').on('click', '#dataTableAsatidz tbody tr', function (e) {
    const isCheckbox = jQuery(e.target).hasClass('row-check-asatidz') || jQuery(e.target).is(':checkbox');
    const isEmptyRow = jQuery(this).find('.dataTables_empty').length > 0;
    if (isCheckbox || isEmptyRow) {
      return;
    }
    let id = $(this).find('.row-check-asatidz').val();
    if (!id) return;

    let asatidz = store.globalDataAsatidz.find(r => String(r.id) === String(id));
    if (!asatidz) return;

    store.selectedRowDataAsatidz = asatidz;
    renderDetailAsatidz(asatidz);
    $('#detailModalAsatidz').modal('show');
  });

  // 5. Tombol Edit & Hapus pada Modal Detail Asatidz
  setupDetailModalButtonsAsatidz();
}

export function populateFilterDatalistsAsatidz() {
  filterCategoriesAsatidz.forEach(cat => {
    let uniqueValues;
    if (cat.field) {
      uniqueValues = [...new Set(store.globalDataAsatidz.map(r => r[cat.field]))]
        .filter(v => v && String(v).trim() !== '');
    } else {
      uniqueValues = [...new Set(store.globalDataAsatidz.map(r =>
        `${r.din_kls_asatidz || ''} ${r.din_bag_asatidz || ''} ${r.tingkat_asatidz || ''}`.trim()
      ))].filter(Boolean);
    }
    let dataList = document.getElementById('dla_' + cat.col);
    if (dataList) {
      dataList.innerHTML = uniqueValues.sort().map(v => `<option value="${v}">`).join('');
    }
  });
}

export async function actionLoadAsatidz() {
  const btn = document.getElementById('btnLoadAsatidz');
  btn.classList.add('btn-loading-state');
  btn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
    <span>Menyiapkan Database Asatidz...</span>
  `;

  setTimeout(async () => {
    try {
      if (!store.globalDataAsatidz || store.globalDataAsatidz.length === 0) {
        store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
      }
      btn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>Memuat ${store.globalDataAsatidz.length.toLocaleString('id-ID')} Data Asatidz...</span>
      `;
      setTimeout(() => {
        renderTableAsatidz(store.globalDataAsatidz);
      }, 80);
    } catch (err) {
      Swal.fire('Gagal Memuat Data', err.message, 'error');
      btn.classList.remove('btn-loading-state');
      btn.innerHTML = '<i class="bi bi-table me-2"></i> Memuat Halaman (Tabel Data)';
    }
  }, 60);
}

export function renderTableAsatidz(data) {
  let btnContainer = document.getElementById('btnLoadAsatidzContainer');
  let tableWrapper = document.getElementById('tableAsatidzWrapper');
  if (btnContainer) btnContainer.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  if (store.dataTableAsatidz) {
    store.dataTableAsatidz.destroy();
    $('#dataTableAsatidz').empty();
  }

  $('#dataTableAsatidz').html(`
    <thead class="table-light">
      <tr>
        <th class="text-center" style="width: 40px;"><input type="checkbox" id="checkAllAsatidz" class="form-check-input"></th>
        <th class="text-center">NO</th>
        <th class="text-center">FOTO</th>
        <th class="text-center">NIS</th>
        <th class="text-center">NIA</th>
        <th class="text-center">PA/PI</th>
        <th>KELAS DINIYYAH</th>
        <th>BLOK</th>
        <th>NAMA ASATIDZ</th>
        <th class="text-center">JAH</th>
        <th>LOKASI DINIYYAH</th>
        <th>LOKASI TAKROR</th>
        <th>TTL</th>
        <th>PENEMPATAN KAMAR</th>
      </tr>
    </thead>
    <tbody id="tableBodyAsatidz"></tbody>
  `);

  store.globalDataAsatidz = Array.isArray(data) ? data : [];

  const tableDataArray = store.globalDataAsatidz.map(row => {
    const genderBadge = row.pa_pi === 'PA'
      ? '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2">PA</span>'
      : (row.pa_pi === 'PI'
        ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2">PI</span>'
        : (row.pa_pi || ''));

    const isMustahiq = /mustahiq/i.test(row.jah_asatidz || '');
    const jahBadge = row.jah_asatidz
      ? `<span class="badge ${isMustahiq ? 'bg-success' : 'bg-secondary'} bg-opacity-10 text-${isMustahiq ? 'success' : 'dark'} border px-2 py-1">${row.jah_asatidz}</span>`
      : '-';

    const kelasGabung = `${row.din_kls_asatidz || ''} ${row.din_bag_asatidz || ''} ${row.tingkat_asatidz || ''}`.trim();
    const ttlGabung = `${row.tempat_lahir || '-'}, ${row.tgl_lahir || ''} ${row.bln_lahir || ''} ${row.thn_lahir || ''}`.trim();
    const kamarGabung = `${row.blok || '-'} - ${row.asrama || '-'} - ${row.kode || '-'} - ${row.kamar || '-'}`;

    const fotoHtml = row.foto_asatidz
      ? `<img src="${row.foto_asatidz}" style="width:34px;height:34px;object-fit:cover;border-radius:50%;cursor:zoom-in;" class="border shadow-sm" title="Klik untuk memperbesar foto" onclick="event.stopPropagation(); window.lihatFotoAsatidz('${row.foto_asatidz}')" onerror="this.style.display='none';">`
      : '<i class="bi bi-person-circle text-muted fs-4"></i>';

    return [
      `<input type="checkbox" class="row-check-asatidz form-check-input" value="${row.id}">`,
      '',
      fotoHtml,
      `<span class="fw-bold text-secondary font-monospace">${row.nis || '-'}</span>`,
      `<span class="fw-bold text-secondary font-monospace">${row.nia || '-'}</span>`,
      genderBadge,
      `<span class="badge bg-success rounded-pill fw-normal px-2 py-1">${kelasGabung || '-'}</span>`,
      row.blok || '-',
      `<span class="fw-bold text-dark">${row.nama_asatidz || ''}</span>`,
      jahBadge,
      row.lokasi_diniyyah || '-',
      row.lokasi_takror || '-',
      ttlGabung,
      kamarGabung
    ];
  });

  store.dataTableAsatidz = $('#dataTableAsatidz').DataTable({
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
      info: 'Menampilkan _START_ - _END_ dari _TOTAL_ Asatidz',
      emptyTable: 'Data Asatidz tidak ditemukan.'
    },
    columnDefs: [
      { searchable: false, orderable: false, targets: [0, 1, 2], className: 'text-center' },
      { className: 'text-center', targets: [3, 4, 5, 9] }
    ],
    order: [[8, 'asc']],
   initComplete: function () {
      const api = this.api();
      setTimeout(() => api.columns.adjust(), 150);

      $('#dataTableAsatidz_length').closest('.col-md-6').removeClass('col-md-6').addClass('col-md-auto');
      $('#dataTableAsatidz_filter').closest('.col-md-6').removeClass('col-md-6').addClass('col-md');

      if ($('#actionGroupAsatidz').length === 0) {
        $('#dataTableAsatidz_filter').addClass('d-flex justify-content-end align-items-center gap-2 flex-wrap flex-md-nowrap');
        $('#dataTableAsatidz_filter label').addClass('mb-0 d-inline-flex align-items-center gap-2 text-nowrap');
        let actionBtns = $(`
          <div class="d-flex align-items-center gap-1 flex-nowrap me-1" id="actionGroupAsatidz">
            <div class="dropdown">
              <button class="btn btn-outline-danger btn-sm dropdown-toggle text-nowrap border-0" type="button" data-bs-toggle="dropdown">
                <i class="bi bi-trash"></i> Hapus
              </button>
              <ul class="dropdown-menu shadow-sm border-0">
                <li><a class="dropdown-item" href="#" onclick="window.hapusTerpilihAsatidz(); return false;"><i class="bi bi-check2-square text-danger me-2"></i> Hapus Terpilih</a></li>
              </ul>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#hideModalAsatidz"><i class="bi bi-eye-slash"></i> Sembunyikan</button>
            <button type="button" class="btn btn-outline-primary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#filterModalAsatidz"><i class="bi bi-funnel"></i> Filter</button>
          </div>
        `);
        $('#dataTableAsatidz_filter').prepend(actionBtns);
      }
    }
  });

  store.dataTableAsatidz.on('order.dt search.dt', function () {
    let i = 1;
    store.dataTableAsatidz.cells(null, 1, { search: 'applied', order: 'applied' }).every(function () {
      this.data(i++);
    });
  }).draw();

  setTimeout(() => {
    if (store.dataTableAsatidz) store.dataTableAsatidz.columns.adjust().draw(false);
  }, 300);

  populateFilterDatalistsAsatidz();
}

export function initHideModalAsatidz() {
  let html = '';
  const colNames = ['NO', 'FOTO', 'NIS', 'NIA', 'PA/PI', 'KELAS DINIYYAH', 'BLOK', 'NAMA ASATIDZ', 'JAH', 'LOKASI DINIYYAH', 'LOKASI TAKROR', 'TTL', 'PENEMPATAN KAMAR'];
  colNames.forEach((name, i) => {
    let colIdx = i + 1;
    let isLocked = (name === 'NAMA ASATIDZ');
    html += `
      <div class="col-md-3 col-sm-4 col-6 mb-2">
        <div class="token-wrapper">
          <input type="checkbox" class="btn-check hide-cb-asatidz" id="hidea_${colIdx}" value="${colIdx}" ${isLocked ? 'disabled' : ''}>
          <label class="btn text-truncate" for="hidea_${colIdx}" title="${name}">${name}</label>
        </div>
      </div>`;
  });
  const container = document.getElementById('hideCheckboxesAsatidz');
  if (container) container.innerHTML = html;
}

export function checkAllHideAsatidz(status) {
  $('.hide-cb-asatidz:not(:disabled)').prop('checked', status);
}

export function applyHideColumnsAsatidz() {
  store.hiddenColumnsGlobalAsatidz = [];
  if (!store.dataTableAsatidz) return;
  for (let i = 1; i <= 13; i++) {
    store.dataTableAsatidz.column(i).visible(true, false);
  }
  $('.hide-cb-asatidz:checked').each(function () {
    let colIdx = parseInt($(this).val(), 10);
    store.hiddenColumnsGlobalAsatidz.push(colIdx);
    store.dataTableAsatidz.column(colIdx).visible(false, false);
  });
  store.dataTableAsatidz.columns.adjust().draw(false);
}

export function applyFiltersAsatidz() {
  if (!store.dataTableAsatidz) return;
  store.dataTableAsatidz.columns().search('');
  $('.filter-cb-asatidz:checked').each(function () {
    let colIdx = $(this).val();
    let val = $('#ina_' + colIdx).val();
    store.dataTableAsatidz.column(colIdx).search(val);
  });
  store.dataTableAsatidz.draw();
}

export function resetFiltersAsatidz() {
  $('.filter-cb-asatidz').prop('checked', false);
  $('.filter-input-asatidz').val('').prop('disabled', true);
  if (store.dataTableAsatidz) store.dataTableAsatidz.columns().search('').draw();
}

export function renderDetailAsatidz(a) {
  let ttl = `${a.tempat_lahir || '-'}, ${a.tgl_lahir || ''} ${a.bln_lahir || ''} ${a.thn_lahir || ''}`.trim();
  let alamat = `Dusun ${a.dusun || '-'}, Desa ${a.desa || '-'}, Kec. ${a.kecamatan || '-'}, Kab. ${a.kabupaten || '-'}, Prov. ${a.provinsi || '-'}`;
  let penempatan = `Blok ${a.blok || '-'} - Asrama ${a.asrama || '-'} - Kode ${a.kode || '-'} - Kamar ${a.kamar || '-'}`;
  let kelasDetail = `${a.din_kls_asatidz || ''} ${a.din_bag_asatidz || ''} ${a.tingkat_asatidz || ''}`.trim();

  function buildRow(label, value, extraClass = '') {
    return `<div class="row mb-2">
      <div class="col-sm-3 text-muted small">${label}</div>
      <div class="col-sm-9 text-dark small"><span class="d-none d-sm-inline me-2">:</span> <span class="${extraClass}">${value || '-'}</span></div>
    </div>`;
  }

  let fotoHtml = a.foto_asatidz
    ? `<img src="${a.foto_asatidz}" style="width:90px;height:110px;object-fit:cover;border-radius:12px;cursor:zoom-in;" class="border shadow-sm" title="Klik untuk memperbesar" onclick="window.lihatFotoAsatidz('${a.foto_asatidz}')">`
    : `<div class="d-flex flex-column align-items-center justify-content-center border rounded-3 bg-light text-muted shadow-sm" style="width:90px;height:110px;"><i class="bi bi-person-circle" style="font-size:2.5rem;"></i></div>`;

  let html = `
    <div class="bg-white p-3 rounded border shadow-sm mb-4">
      <h6 class="text-success fw-bold border-bottom pb-2 mb-3"><i class="bi bi-person-badge me-2"></i> Profil Asatidz</h6>
      <div class="row align-items-center">
        <div class="col-sm-3 text-center mb-3 mb-sm-0 d-flex justify-content-center">${fotoHtml}</div>
        <div class="col-sm-9">
          ${buildRow('NIS', a.nis)}
          ${buildRow('NIA', a.nia, 'fw-bold font-monospace')}
          ${buildRow('Nama Lengkap', a.nama_asatidz, 'fw-bold text-success fs-6')}
          ${buildRow('Jah', a.jah_asatidz)}
          ${buildRow('Gender', a.pa_pi === 'PA' ? 'PA (Putra)' : (a.pa_pi === 'PI' ? 'PI (Putri)' : '-'))}
          ${buildRow('Tempat, Tgl Lahir', ttl)}
        </div>
      </div>
    </div>
    <div class="bg-white p-3 rounded border shadow-sm mb-4">
      <h6 class="text-success fw-bold border-bottom pb-2 mb-3">Kelas Madin & Lokasi</h6>
      ${buildRow('Kelas Madin', kelasDetail, 'fw-bold')}
      ${buildRow('Lokasi Diniyyah', a.lokasi_diniyyah)}
      ${buildRow('Lokasi Takror', a.lokasi_takror)}
      ${buildRow('Penempatan Kamar', penempatan)}
      ${buildRow('Alamat Domisili Asal', alamat)}
    </div>
  `;

  let matchTingkat = (a.tingkat_asatidz || '').trim().toUpperCase();
  let matchDinKls = (a.din_kls_asatidz || '').trim().toUpperCase();
  let matchDinBag = (a.din_bag_asatidz || '').trim().toUpperCase();
  let matchPaPi = (a.pa_pi || '').trim().toUpperCase();

  let santriBinaan = (store.globalDataSantri || []).filter(s => {
    return (s[26] || '').trim().toUpperCase() === matchTingkat &&
      (s[24] || '').trim().toUpperCase() === matchDinKls &&
      (s[25] || '').trim().toUpperCase() === matchDinBag &&
      (s[4] || '').trim().toUpperCase() === matchPaPi;
  });

  html += `
    <h6 class="text-success fw-bold mb-3 mt-2"><i class="bi bi-people-fill me-1"></i> Daftar Santri Binaan (${santriBinaan.length} Santri)</h6>
    <div class="table-responsive bg-white rounded border shadow-sm" style="max-height: 320px; overflow-y: auto;">
      <table class="table table-hover table-sm mb-0 align-middle">
        <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
          <tr>
            <th style="width: 40px;" class="text-center">No</th>
            <th style="width: 95px;">Kamar</th>
            <th style="width: 180px;">Nama Santri</th>
            <th>Hafalan &amp; Kategori</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (santriBinaan.length > 0) {
    santriBinaan.forEach((s, idx) => {
      let kode = s[17] || '', kamar = s[18] || '';
      let kamarGabung = (kode && kamar) ? `${kode} - ${kamar}` : (kode || kamar || '-');
      let noIndukSantri = String(s[1] || '').trim();

      let riwayatSantri = (store.globalDataMuhafadzoh || []).filter(m => String(m[1]).trim() === noIndukSantri);
      let badgesHafalan = '';
      if (riwayatSantri.length > 0) {
        badgesHafalan = riwayatSantri.map(m => {
          let namaHafalan = m[17] || '-';
          let katHafalan = (m[18] || 'Wajib').trim();
          let badgeColor = 'bg-primary';
          if (katHafalan === 'Tahfidz') badgeColor = 'bg-info text-dark';
          else if (katHafalan === 'Sunnah') badgeColor = 'bg-warning text-dark';
          else if (katHafalan === 'Kitab') badgeColor = 'bg-secondary';

          return `<span class="badge ${badgeColor} me-1 mb-1 fw-semibold" style="font-size: 11px;">
                    ${namaHafalan} <span class="badge bg-white text-dark ms-1" style="font-size: 9px;">${katHafalan}</span>
                  </span>`;
        }).join('');
      } else {
        badgesHafalan = '<span class="text-muted fst-italic small">Belum ada riwayat setoran</span>';
      }

      html += `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td><span class="badge bg-secondary rounded-pill px-2 py-1">${kamarGabung}</span></td>
          <td class="fw-bold text-dark" style="font-size: 13px;">${s[5] || '-'}</td>
          <td><div class="d-flex flex-wrap align-items-center py-1">${badgesHafalan}</div></td>
        </tr>`;
    });
  } else {
    html += `<tr><td colspan="4" class="text-center text-muted py-4">Tidak ada data santri untuk kelas binaan ini.</td></tr>`;
  }

  html += `</tbody></table></div>`;
  document.getElementById('detailContentAsatidz').innerHTML = html;
}

export function setupDetailModalButtonsAsatidz() {
  const btnEdit = document.getElementById('btnEditDetailAsatidz');
  const btnHapus = document.getElementById('btnHapusDetailAsatidz');
  if (!btnEdit || !btnHapus) return;

  btnEdit.addEventListener('click', function () {
    if (!store.selectedRowDataAsatidz) return;
    store.isEditModeAsatidz = true;
    $('#detailModalAsatidz').modal('hide');
    document.querySelector('#inputModalAsatidz .modal-title').innerHTML = "<i class='bi bi-pencil-square me-2'></i> Edit Data Asatidz";
    document.getElementById('btnSubmitAsatidz').innerText = 'Update Data';

    const a = store.selectedRowDataAsatidz;
    const form = document.getElementById('inputFormAsatidz');
    form.reset();
    document.getElementById('id_asatidz_lama').value = a.id;
    form.nis.value = a.nis || '';

    let matchPrefix = String(a.nia || '').match(/^([A-Za-z])(\d*)$/);
    document.getElementById('nia_prefix').value = matchPrefix ? matchPrefix[1].toUpperCase() : '';
    form.nia.value = a.nia || '';
    form.nama_asatidz.value = a.nama_asatidz || '';
    form.pa_pi.value = a.pa_pi || '';
    form.tempat_lahir.value = a.tempat_lahir || '';
    forceSetSelect(document.getElementById('tgl_lahir_asatidz'), a.tgl_lahir);
    forceSetSelect(document.getElementById('bln_lahir_asatidz'), a.bln_lahir);
    forceSetSelect(document.getElementById('thn_lahir_asatidz'), a.thn_lahir);

    updateJahOptions(a.pa_pi);
    forceSetSelect(document.getElementById('jah_asatidz'), a.jah_asatidz);

    let gender = a.pa_pi;
    if (gender) {
      let tOpts = [...new Set(store.globalDataFormasi.filter(f => f.pa_pi === gender).map(f => f.tingkat))];
      populateSelect('tingkat_asatidz', tOpts);
    }
    forceSetSelect(document.getElementById('tingkat_asatidz'), a.tingkat_asatidz);

    if (a.tingkat_asatidz && gender) {
      let dkOpts = [...new Set(store.globalDataFormasi.filter(f => f.tingkat === a.tingkat_asatidz && f.pa_pi === gender).map(f => f.din_kls))];
      populateSelect('din_kls_asatidz', dkOpts);
    }
    forceSetSelect(document.getElementById('din_kls_asatidz'), a.din_kls_asatidz);

    if (a.tingkat_asatidz && a.din_kls_asatidz && gender) {
      let dbOpts = [...new Set(store.globalDataFormasi.filter(f => f.tingkat === a.tingkat_asatidz && f.pa_pi === gender && f.din_kls === a.din_kls_asatidz).map(f => f.din_bag))];
      populateSelect('din_bag_asatidz', dbOpts);
    }
    forceSetSelect(document.getElementById('din_bag_asatidz'), a.din_bag_asatidz);

    form.lokasi_diniyyah.value = a.lokasi_diniyyah || '';
    form.lokasi_takror.value = a.lokasi_takror || '';

    forceSetSelect(document.getElementById('provinsi_asatidz'), a.provinsi);
    forceSetSelect(document.getElementById('kabupaten_asatidz'), a.kabupaten);
    forceSetSelect(document.getElementById('kecamatan_asatidz'), a.kecamatan);
    forceSetSelect(document.getElementById('desa_asatidz'), a.desa);
    form.dusun.value = a.dusun || '';

    const bVal = a.blok, aVal = a.asrama, kdVal = a.kode, kmVal = a.kamar;
    forceSetSelect(document.getElementById('blok_asatidz'), bVal);
    if (bVal && store.tree1Data[bVal]) populateSelect('asrama_asatidz', Object.keys(store.tree1Data[bVal]));
    forceSetSelect(document.getElementById('asrama_asatidz'), aVal);
    if (bVal && aVal && store.tree1Data[bVal]?.[aVal]) populateSelect('kode_asatidz', Object.keys(store.tree1Data[bVal][aVal]));
    forceSetSelect(document.getElementById('kode_asatidz'), kdVal);
    if (bVal && aVal && kdVal && store.tree1Data[bVal]?.[aVal]?.[kdVal]) populateSelect('kamar_asatidz', Object.keys(store.tree1Data[bVal][aVal][kdVal]));
    forceSetSelect(document.getElementById('kamar_asatidz'), kmVal);

    if (a.foto_asatidz) {
      setPreviewFotoAsatidz(a.foto_asatidz);
    } else {
      hapusFotoAsatidz();
    }

    $('#inputModalAsatidz').modal('show');
    $('#inputModalAsatidz .modal-body').scrollTop(0);
  });

  btnHapus.addEventListener('click', hapusAsatidz);
}

function getNextNiaNumber(prefix) {
  prefix = String(prefix || '').trim().toUpperCase();
  if (!prefix) return '';
  let maxNum = 0;
  store.globalDataAsatidz.forEach(row => {
    let nia = String(row.nia || '').trim().toUpperCase();
    if (nia.length > prefix.length && nia.substring(0, prefix.length) === prefix) {
      let num = parseInt(nia.substring(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return prefix + (maxNum + 1);
}

export function generateNIA() {
  const prefix = document.getElementById('nia_prefix').value;
  const niaInput = document.getElementById('nia_asatidz');
  if (!prefix) {
    niaInput.value = '';
    return;
  }
  niaInput.value = getNextNiaNumber(prefix);
}

export function openAddModalAsatidz() {
  store.isEditModeAsatidz = false;
  store.selectedRowDataAsatidz = null;
  const form = document.getElementById('inputFormAsatidz');
  form.reset();
  document.getElementById('id_asatidz_lama').value = '';
  document.getElementById('nia_prefix').value = '';
  hapusFotoAsatidz();
  resetSelects([
    'din_kls_asatidz', 'din_bag_asatidz', 'tingkat_asatidz',
    'kabupaten_asatidz', 'kecamatan_asatidz', 'desa_asatidz',
    'asrama_asatidz', 'kode_asatidz', 'kamar_asatidz'
  ]);
  document.getElementById('jah_asatidz').innerHTML = '<option value="">Pilih PA/PI Dahulu...</option>';
  document.getElementById('jah_asatidz').disabled = true;
  document.querySelector('#inputModalAsatidz .modal-title').innerHTML = "<i class='bi bi-person-plus-fill me-2'></i> Form Data Asatidz";
  document.getElementById('btnSubmitAsatidz').innerText = 'Simpan Data';
  $('#inputModalAsatidz').modal('show');
}

export async function submitAsatidzData(e) {
  e.preventDefault();
  const btnSubmit = document.getElementById('btnSubmitAsatidz');
  const prevText = btnSubmit.innerText;
  btnSubmit.innerHTML = 'Menyimpan...';
  btnSubmit.disabled = true;

  const form = document.getElementById('inputFormAsatidz');
  const payload = {};
  ASATIDZ_DB_FIELDS.forEach(field => {
    payload[field] = form[field] ? String(form[field].value || '').trim() : '';
  });
  payload.nama_asatidz = payload.nama_asatidz.toUpperCase();

  try {
    if (store.isEditModeAsatidz && store.selectedRowDataAsatidz) {
      const { error } = await supabase
        .from('asatidz')
        .update(payload)
        .eq('id', store.selectedRowDataAsatidz.id);
      if (error) throw error;
      await logActivity('UPDATE ASATIDZ', `Memperbarui data Asatidz: ${payload.nama_asatidz}`);
    } else {
      const { error } = await supabase.from('asatidz').insert([payload]);
      if (error) throw error;
      await logActivity('TAMBAH ASATIDZ', `Menambahkan Asatidz: ${payload.nama_asatidz}`);
    }

    store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    renderTableAsatidz(store.globalDataAsatidz);
    $('#inputModalAsatidz').modal('hide');

    Swal.fire({
      title: store.isEditModeAsatidz ? 'Data Diperbarui!' : 'Data Tersimpan!',
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

export async function hapusAsatidz() {
  if (!store.selectedRowDataAsatidz) return;
  const namaAsatidz = store.selectedRowDataAsatidz.nama_asatidz || '';

  const confirmRes = await Swal.fire({
    title: 'Hapus Data Asatidz?',
    text: `Yakin ingin menghapus Asatidz ${namaAsatidz}?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });
  if (!confirmRes.isConfirmed) return;

  try {
    const { error } = await supabase.from('asatidz').delete().eq('id', store.selectedRowDataAsatidz.id);
    if (error) throw error;
    await logActivity('HAPUS ASATIDZ', `Menghapus Asatidz: ${namaAsatidz}`);
    store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    renderTableAsatidz(store.globalDataAsatidz);
    $('#detailModalAsatidz').modal('hide');
    Swal.fire('Terhapus!', 'Data Asatidz berhasil dihapus.', 'success');
  } catch (err) {
    Swal.fire('Gagal Menghapus', err.message, 'error');
  }
}

export async function hapusTerpilihAsatidz() {
  let selected = [];
  $('.row-check-asatidz:checked').each(function () {
    selected.push($(this).val());
  });
  if (selected.length === 0) {
    return Swal.fire('Perhatian', 'Centang minimal satu data Asatidz!', 'info');
  }

  const confirmRes = await Swal.fire({
    title: `Hapus ${selected.length} Asatidz?`,
    text: 'Data yang dicentang akan dihapus permanen dari database.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Ya, Hapus Terpilih',
    cancelButtonText: 'Batal'
  });
  if (!confirmRes.isConfirmed) return;

  try {
    const { error } = await supabase.from('asatidz').delete().in('id', selected);
    if (error) throw error;
    await logActivity('HAPUS BANYAK ASATIDZ', `Menghapus ${selected.length} data Asatidz terpilih`);
    store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    renderTableAsatidz(store.globalDataAsatidz);
    $('#checkAllAsatidz').prop('checked', false);
    Swal.fire('Berhasil!', `${selected.length} data Asatidz berhasil dihapus.`, 'success');
  } catch (err) {
    Swal.fire('Gagal Menghapus', err.message, 'error');
  }
}
// =========================================================
// FITUR IMPORT MASSAL DATABASE ASATIDZ (EXCEL / CSV)
// =========================================================

/**
 * Membuka Pop-Up Modal Import Massal Database Asatidz (#modalImportExcelAsatidz)
 */
export function bukaModalImportAsatidz() {
  const fileInput = document.getElementById('inputFileExcelAsatidz');
  if (fileInput) fileInput.value = '';

  // Tutup modal Form Data Asatidz terlebih dahulu agar pop-up Import tampil bersih seperti Gambar 2
  $('#inputModalAsatidz').modal('hide');
  setTimeout(() => {
    $('#modalImportExcelAsatidz').modal('show');
  }, 220);
}

/**
 * Mengunduh berkas Template Excel standar untuk Import Massal Database Asatidz
 */
export function unduhTemplateExcelAsatidz() {
  if (typeof XLSX === 'undefined') {
    Swal.fire('Error', 'Pustaka XLSX belum termuat di halaman ini.', 'error');
    return;
  }

  const headers = [
    'NIS',
    'NIA',
    'Nama Lengkap',
    'PA/PI',
    'Tingkat',
    'Din. Kls',
    'Din. Bag',
    'Jah',
    'Lokasi Diniyyah',
    'Lokasi Takror',
    'Tempat Lahir',
    'Tgl Lahir',
    'Bln Lahir',
    'Thn Lahir',
    'Dusun',
    'Desa',
    'Kecamatan',
    'Kabupaten',
    'Provinsi',
    'Blok',
    'Asrama',
    'Kode',
    'Kamar'
  ];

  const contohBaris1 = [
    '201901',
    'A1',
    'UST. AHMAD FAUZI',
    'PA',
    'ULA',
    '1',
    'A',
    'Mustahiq',
    'Gedung Al-Falah R.01',
    'Masjid Lt. 1',
    'BANYUWANGI',
    '12',
    '05',
    '1998',
    'Krajan',
    'Karangdoro',
    'Tegalsari',
    'Banyuwangi',
    'Jawa Timur',
    'Induk',
    'Al-Falah',
    'A',
    '01'
  ];

  const contohBaris2 = [
    '202015',
    'B1',
    'USTZ. SITI AISYAH',
    'PI',
    'WUSTHO',
    '1',
    'A',
    'Mustahiqoh',
    'Gedung Al-Munawwaroh R.02',
    'Aula Putri',
    'JEMBER',
    '24',
    '08',
    '2000',
    'Sumberjati',
    'Kalisat',
    'Kalisat',
    'Jember',
    'Jawa Timur',
    'Putri',
    'Al-Munawwaroh',
    'B',
    '03'
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, contohBaris1, contohBaris2]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 6, 15) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Asatidz');
  XLSX.writeFile(wb, 'Template_Import_Data_Asatidz.xlsx');
}

/**
 * Helper mencocokkan nilai kolom dari objek baris Excel secara fleksibel (Case-Insensitive & Multi-Alias)
 */
function ambilNilaiKolomExcelAsatidz(rowObj, daftarAlias) {
  const keys = Object.keys(rowObj || {});
  for (const alias of daftarAlias) {
    const target = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    const foundKey = keys.find(
      k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === target
    );
    if (foundKey !== undefined && rowObj[foundKey] !== null && rowObj[foundKey] !== undefined) {
      return String(rowObj[foundKey]).trim();
    }
  }
  return '';
}

/**
 * Memproses file Excel (.xlsx / .xls / .csv) dan mengimpor massal ke tabel `asatidz` di Supabase
 */
export async function prosesImportExcelAsatidz() {
  const fileInput = document.getElementById('inputFileExcelAsatidz');
  const file = fileInput?.files?.[0];

  if (!file) {
    Swal.fire({
      icon: 'warning',
      title: 'File Belum Dipilih',
      text: 'Silakan pilih file Excel (.xlsx / .xls / .csv) terlebih dahulu!'
    });
    return;
  }

  const btn = document.getElementById('btnProsesImportAsatidz');
  const oriHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Memproses...';
  }

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!jsonRows || jsonRows.length === 0) {
        throw new Error('File Excel kosong atau format tidak terbaca.');
      }

      const recordsToInsert = [];

      jsonRows.forEach(row => {
        const nama = ambilNilaiKolomExcelAsatidz(row, [
          'nama_asatidz',
          'Nama Lengkap',
          'Nama Lengkap Asatidz',
          'Nama Asatidz',
          'Asatidz',
          'Nama'
        ]).toUpperCase();

        // Lewati baris kosong yang tidak memiliki Nama Asatidz
        if (!nama) return;

        let papi = ambilNilaiKolomExcelAsatidz(row, ['pa_pi', 'PA/PI', 'Gender', 'JK', 'L/P']).toUpperCase();
        if (papi === 'L' || papi === 'PUTRA') papi = 'PA';
        if (papi === 'P' || papi === 'PUTRI') papi = 'PI';

        const blnRaw = ambilNilaiKolomExcelAsatidz(row, ['bln_lahir', 'Bln Lahir', 'Bulan Lahir', 'Bulan']);
        const blnFormatted = blnRaw ? blnRaw.padStart(2, '0') : '';

        recordsToInsert.push({
          nis: ambilNilaiKolomExcelAsatidz(row, ['nis', 'NIS', 'No Induk Santri']),
          nia: ambilNilaiKolomExcelAsatidz(row, ['nia', 'NIA', 'Kode', 'Kode Guru']).toUpperCase(),
          nama_asatidz: nama,
          pa_pi: papi,
          tempat_lahir: ambilNilaiKolomExcelAsatidz(row, ['tempat_lahir', 'Tempat Lahir', 'Tmp Lahir']),
          tgl_lahir: ambilNilaiKolomExcelAsatidz(row, ['tgl_lahir', 'Tgl Lahir', 'Tanggal Lahir', 'Tanggal']),
          bln_lahir: blnFormatted,
          thn_lahir: ambilNilaiKolomExcelAsatidz(row, ['thn_lahir', 'Thn Lahir', 'Tahun Lahir', 'Tahun']),
          dusun: ambilNilaiKolomExcelAsatidz(row, ['dusun', 'Dusun', 'Jalan', 'Alamat']),
          desa: ambilNilaiKolomExcelAsatidz(row, ['desa', 'Desa', 'Kelurahan']),
          kecamatan: ambilNilaiKolomExcelAsatidz(row, ['kecamatan', 'Kecamatan', 'Kec']),
          kabupaten: ambilNilaiKolomExcelAsatidz(row, ['kabupaten', 'Kabupaten', 'Kota', 'Kab']),
          provinsi: ambilNilaiKolomExcelAsatidz(row, ['provinsi', 'Provinsi', 'Prov']),
          blok: ambilNilaiKolomExcelAsatidz(row, ['blok', 'Blok']),
          asrama: ambilNilaiKolomExcelAsatidz(row, ['asrama', 'Asrama']),
          kode: ambilNilaiKolomExcelAsatidz(row, ['kode', 'Kode Kamar', 'Kode Asrama']),
          kamar: ambilNilaiKolomExcelAsatidz(row, ['kamar', 'Kamar', 'No Kamar']),
          tingkat_asatidz: ambilNilaiKolomExcelAsatidz(row, ['tingkat_asatidz', 'Tingkat', 'Jenjang']).toUpperCase(),
          din_kls_asatidz: ambilNilaiKolomExcelAsatidz(row, ['din_kls_asatidz', 'Din. Kls', 'Din Kls', 'Kelas']),
          din_bag_asatidz: ambilNilaiKolomExcelAsatidz(row, ['din_bag_asatidz', 'Din. Bag', 'Din Bag', 'Bagian', 'Bag']).toUpperCase(),
          jah_asatidz: ambilNilaiKolomExcelAsatidz(row, ['jah_asatidz', 'Jah', 'Jabatan']),
          lokasi_diniyyah: ambilNilaiKolomExcelAsatidz(row, ['lokasi_diniyyah', 'Lokasi Diniyyah', 'Ruang Diniyyah']),
          lokasi_takror: ambilNilaiKolomExcelAsatidz(row, ['lokasi_takror', 'Lokasi Takror', 'Ruang Takror']),
          foto_asatidz: ambilNilaiKolomExcelAsatidz(row, ['foto_asatidz', 'Foto', 'URL Foto'])
        });
      });

      if (recordsToInsert.length === 0) {
        throw new Error(
          'Tidak ditemukan baris data valid. Pastikan terdapat kolom "Nama Lengkap" (atau "nama_asatidz").'
        );
      }

      Swal.fire({
        title: 'Mengimpor Data Asatidz...',
        html: `Menyimpan <b>${recordsToInsert.length}</b> data Asatidz ke database...`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      // Batch insert per 100 baris agar stabil untuk ratusan data sekaligus
      const CHUNK_SIZE = 100;
      for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
        const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('asatidz').insert(chunk);
        if (error) throw error;
      }

      await logActivity(
        'IMPORT EXCEL ASATIDZ',
        `Mengimpor massal ${recordsToInsert.length} data Asatidz dari file ${file.name}`
      );

      $('#modalImportExcelAsatidz').modal('hide');
      if (fileInput) fileInput.value = '';

      // Muat ulang data Asatidz & perbarui tabel
      store.globalDataAsatidz = await fetchAllAsatidzFromSupabase();
      populateFilterDatalistsAsatidz();
      if (document.getElementById('tableAsatidzWrapper')?.style.display !== 'none') {
        renderTableAsatidz(store.globalDataAsatidz);
      }

      Swal.fire({
        icon: 'success',
        title: 'Import Berhasil!',
        text: `${recordsToInsert.length} data Asatidz berhasil ditambahkan ke database.`,
        confirmButtonColor: '#0f766e'
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Mengimpor Data',
        text: err.message,
        confirmButtonColor: '#0f766e'
      });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oriHtml;
      }
    }
  };

  reader.readAsArrayBuffer(file);
}
