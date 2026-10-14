import { supabase } from '../../lib/supabase.js';
import { store } from '../../state/store.js';
import { logActivity } from '../audit/audit.js';

// =========================================================
// MODUL FORMASI KELAS MADIN (TABEL, FILTER, HIDE & CRUD)
// =========================================================
export function initHideFilterFormasi() {
  const formasiColNames = [
    { name: 'Tingkat', col: 1 }, { name: 'Kelas', col: 2 }, { name: 'Bagian', col: 3 },
    { name: 'Gender', col: 4 }, { name: 'Kapasitas', col: 5 }, { name: 'Wali Kelas', col: 6 },
    { name: 'Domisili', col: 7 }, { name: 'Lokal Takror', col: 8 }, { name: 'Lokasi Diniyyah', col: 9 }
  ];
  let hideHtml = '';
  formasiColNames.forEach(c => {
    hideHtml += `
      <div class="col-md-4 col-sm-6 col-6 mb-2">
        <div class="token-wrapper">
          <input type="checkbox" class="btn-check hide-cb-formasi" id="hide_f_${c.col}" value="${c.col}">
          <label class="btn text-truncate w-100" for="hide_f_${c.col}" title="${c.name}">${c.name}</label>
        </div>
      </div>`;
  });
  const hideContainer = document.getElementById('hideCheckboxesFormasi');
  if (hideContainer) hideContainer.innerHTML = hideHtml;

  let filterHtml = '';
  const filterCats = [
    { name: 'Tingkat', col: 1 }, { name: 'Gender', col: 4 },
    { name: 'Wali Kelas', col: 6 }, { name: 'Domisili', col: 7 }
  ];
  filterCats.forEach(cat => {
    filterHtml += `
      <div class="col-md-6">
        <div class="token-wrapper">
          <input class="btn-check filter-cb-formasi" type="checkbox" id="cb_f_${cat.col}" value="${cat.col}">
          <label class="btn text-truncate w-100" for="cb_f_${cat.col}">${cat.name}</label>
        </div>
        <input type="text" class="form-control form-control-sm mt-2 filter-input-formasi" id="in_f_${cat.col}" disabled placeholder="Ketik pencarian...">
      </div>`;
  });
  const filterContainer = document.getElementById('filterFormCategoriesFormasi');
  if (filterContainer) filterContainer.innerHTML = filterHtml;

  $(document).off('change', '.filter-cb-formasi').on('change', '.filter-cb-formasi', function () {
    $('#in_f_' + $(this).val()).prop('disabled', !this.checked).val('');
  });
}

export function checkAllHideFormasi(status) {
  $('.hide-cb-formasi').prop('checked', status);
}

export function applyHideColumnsFormasi() {
  if (!store.dtFormasi) return;
  for (let i = 1; i <= 9; i++) store.dtFormasi.column(i).visible(true, false);
  $('.hide-cb-formasi:checked').each(function () {
    store.dtFormasi.column(parseInt($(this).val(), 10)).visible(false, false);
  });
  store.dtFormasi.columns.adjust().draw(false);
}

export function applyFiltersFormasi() {
  if (!store.dtFormasi) return;
  store.dtFormasi.columns().search('');
  $('.filter-cb-formasi:checked').each(function () {
    let colIdx = $(this).val();
    let val = $('#in_f_' + colIdx).val();
    store.dtFormasi.column(colIdx).search(val);
  });
  store.dtFormasi.draw();
}

export function resetFiltersFormasi() {
  $('.filter-cb-formasi').prop('checked', false);$('.filter-input-formasi').val('').prop('disabled', true);
  if (store.dtFormasi) store.dtFormasi.columns().search('').draw();
}

export async function loadFormasiData() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('formasi_kelas')
      .select('*')
      .order('tingkat')
      .order('din_kls')
      .order('din_bag');
    if (error) throw error;
    store.globalDataFormasi = data || [];

    if (document.getElementById('tableBodyFormasi')) {
      renderTableFormasi(store.globalDataFormasi);
    }
  } catch (err) {
    console.error('Gagal memuat Formasi Kelas:', err.message);
  }
}

export function renderTableFormasi(data) {
  if (store.dtFormasi) {
    store.dtFormasi.destroy();
    $('#dataTableFormasi').empty();
  }

  $('#dataTableFormasi').html(`
    <thead class="table-light">
      <tr>
        <th class="text-center" style="width: 40px;"><input type="checkbox" id="checkAllFormasi" class="form-check-input"></th>
        <th>Tingkat</th>
        <th>Kelas</th>
        <th>Bagian</th>
        <th>Gender</th>
        <th>Kapasitas</th>
        <th>Wali Kelas</th>
        <th>Domisili</th>
        <th>Lokal Takror</th>
        <th>Lokasi Diniyyah</th>
        <th class="text-center">Aksi</th>
      </tr>
    </thead>
    <tbody id="tableBodyFormasi"></tbody>
  `);

  let html = '';
  data.forEach(f => {
    let badgeUg = f.is_unggulan ? '<span class="badge bg-warning text-dark border ms-2 shadow-sm"><i class="bi bi-star-fill"></i> Unggulan</span>' : '';
    let genderB = f.pa_pi === 'PA' ? '<span class="text-primary fw-bold">PA</span>' : '<span class="text-danger fw-bold">PI</span>';

    html += `
    <tr style="cursor: pointer;">
      <td class="text-center" onclick="event.stopPropagation();"><input type="checkbox" class="row-check-formasi form-check-input" value="${f.id}"></td>
      <td class="fw-bold row-klik-formasi" data-id="${f.id}">${f.tingkat}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${f.din_kls}</td>
      <td class="fw-bold row-klik-formasi" data-id="${f.id}">${f.din_bag} ${badgeUg}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${genderB}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${f.kapasitas_maksimal}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${f.id_mustahiq || '-'}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${f.domisili || '-'}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${f.lokasi_takror || '-'}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${f.lokasi_diniyyah || '-'}</td>
      <td class="text-center" onclick="event.stopPropagation();">
        <button type="button" class="btn btn-sm btn-outline-warning border-0" onclick="window.editFormasi('${f.id}')" title="Edit"><i class="bi bi-pencil-square"></i></button>
        <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="window.hapusFormasi('${f.id}')" title="Hapus"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  });

  $('#tableBodyFormasi').html(html);

  store.dtFormasi = $('#dataTableFormasi').DataTable({
    scrollX: true,
    pageLength: 25,
    autoWidth: true,
    language: { search: 'Cari Kelas:' },
    columnDefs: [
      { searchable: false, orderable: false, targets: [0, 10] }
    ],
    initComplete: function () {
      if ($('#actionGroupFormasi').length === 0) {
        $('#dataTableFormasi_filter').addClass('d-flex justify-content-end align-items-center gap-2 flex-wrap');
        $('#dataTableFormasi_filter label').addClass('mb-0 d-flex align-items-center gap-2');

        let actionBtns = $(`
        <div class="d-flex gap-2 flex-nowrap" id="actionGroupFormasi">
          <div class="dropdown">
            <button class="btn btn-outline-danger btn-sm dropdown-toggle text-nowrap border-0" type="button" data-bs-toggle="dropdown">
              <i class="bi bi-trash"></i> Hapus
            </button>
            <ul class="dropdown-menu shadow-sm border-0">
              <li><a class="dropdown-item" href="#" onclick="window.hapusFormasiTerpilih(); return false;"><i class="bi bi-check2-square text-danger me-2"></i> Hapus Terpilih</a></li>
            </ul>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#hideFormasiModal"><i class="bi bi-eye-slash"></i> Sembunyikan</button>
          <button type="button" class="btn btn-outline-primary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#filterFormasiModal"><i class="bi bi-funnel"></i> Filter</button>
        </div>
        `);
        $('#dataTableFormasi_filter').prepend(actionBtns);
      }
    }
  });

  setTimeout(() => {
    if (store.dtFormasi) store.dtFormasi.columns.adjust().draw(false);
  }, 300);

  // Gunakan event delegation agar klik baris & checkAll tetap berfungsi di halaman paginasi berikutnya
  $('#dataTableFormasi tbody').off('click', '.row-klik-formasi').on('click', '.row-klik-formasi', function () {
    showDetailFormasi($(this).attr('data-id'));
  });

  $(document).off('change', '#checkAllFormasi').on('change', '#checkAllFormasi', function () {
    $('.row-check-formasi').prop('checked', this.checked);
  });
}

export function openAddFormasiModal() {
  const form = document.getElementById('formasiForm');
  if (form) form.reset();
  const idInput = document.getElementById('f_id');
  if (idInput) idInput.value = '';
  const titleEl = document.querySelector('#formasiModal .modal-title');
  if (titleEl) titleEl.innerHTML = '<i class="bi bi-building-add me-2"></i> Formasi Kelas Baru';
  $('#formasiModal').modal('show');
}

export async function submitFormasiData(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitFormasi');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';

  const form = e.target;
  const payload = {
    tingkat: form.f_tingkat.value,
    din_kls: form.f_din_kls.value,
    din_bag: form.f_din_bag.value,
    pa_pi: form.f_pa_pi.value,
    is_unggulan: form.f_is_unggulan.checked,
    kapasitas_maksimal: parseInt(form.f_kapasitas_maksimal.value, 10) || 40,
    id_mustahiq: form.f_id_mustahiq.value,
    domisili: form.f_domisili.value,
    lokasi_takror: form.f_lokasi_takror.value,
    lokasi_diniyyah: form.f_lokasi_diniyyah.value
  };

  try {
    const f_id = form.f_id.value;
    if (f_id) {
      const { error } = await supabase.from('formasi_kelas').update(payload).eq('id', f_id);
      if (error) {
        if (error.code === '23505') throw new Error('Kombinasi Tingkat, Kelas, Bagian, dan Gender duplikat!');
        throw error;
      }
      await logActivity('UPDATE FORMASI', `Memperbarui formasi kelas: ${payload.tingkat} ${payload.din_kls} - ${payload.din_bag}`);
      Swal.fire('Diperbarui!', 'Formasi Kelas Berhasil Diperbarui', 'success');
    } else {
      const { error } = await supabase.from('formasi_kelas').insert([payload]);
      if (error) {
        if (error.code === '23505') throw new Error('Kombinasi Tingkat, Kelas, Bagian, dan Gender duplikat!');
        throw error;
      }
      await logActivity('TAMBAH FORMASI', `Membuat kelas baru: ${payload.tingkat} ${payload.din_kls} - ${payload.din_bag}`);
      Swal.fire('Berhasil!', 'Formasi Blueprint Kelas Berhasil Dibuat', 'success');
    }
    $('#formasiModal').modal('hide');
    await loadFormasiData();
  } catch (err) {
    Swal.fire('Gagal Menyimpan', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Simpan Formasi';
  }
}

export function showDetailFormasi(id) {
  let f = store.globalDataFormasi.find(x => String(x.id) === String(id));
  if (!f) return;

  let html = `
  <div class="row mb-2"><div class="col-sm-4 text-muted">Tingkat</div><div class="col-sm-8 fw-bold">: ${f.tingkat}</div></div>
  <div class="row mb-2"><div class="col-sm-4 text-muted">Kelas / Bagian</div><div class="col-sm-8 fw-bold">: ${f.din_kls} - ${f.din_bag} ${f.is_unggulan ? '<span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i> Unggulan</span>' : ''}</div></div>
  <div class="row mb-2"><div class="col-sm-4 text-muted">Gender</div><div class="col-sm-8 fw-bold">: ${f.pa_pi}</div></div>
  <div class="row mb-2"><div class="col-sm-4 text-muted">Kapasitas Maksimal</div><div class="col-sm-8 fw-bold">: ${f.kapasitas_maksimal} Santri</div></div>
  <div class="row mb-2 mt-3"><div class="col-sm-4 text-muted">Wali Kelas</div><div class="col-sm-8 fw-bold">: ${f.id_mustahiq || '-'}</div></div>
  <div class="row mb-2"><div class="col-sm-4 text-muted">Domisili</div><div class="col-sm-8 fw-bold">: ${f.domisili || '-'}</div></div>
  <div class="row mb-2"><div class="col-sm-4 text-muted">Lokal Takror</div><div class="col-sm-8 fw-bold">: ${f.lokasi_takror || '-'}</div></div>
  <div class="row mb-2"><div class="col-sm-4 text-muted">Lokasi Diniyyah</div><div class="col-sm-8 fw-bold">: ${f.lokasi_diniyyah || '-'}</div></div>
  `;

  const detailContainer = document.getElementById('detailFormasiContent');
  if (detailContainer) detailContainer.innerHTML = html;

  const btnHapus = document.getElementById('btnHapusDetailFormasi');
  if (btnHapus) {
    btnHapus.onclick = function () {
      $('#detailFormasiModal').modal('hide');
      hapusFormasi(f.id);
    };
  }

  const btnEdit = document.getElementById('btnEditDetailFormasi');
  if (btnEdit) {
    btnEdit.onclick = function () {
      $('#detailFormasiModal').modal('hide');
      editFormasi(f.id);
    };
  }

  $('#detailFormasiModal').modal('show');
}

export function editFormasi(id) {
  let f = store.globalDataFormasi.find(x => String(x.id) === String(id));
  if (!f) return;

  const form = document.getElementById('formasiForm');
  if (!form) return;

  form.f_id.value = f.id;
  form.f_tingkat.value = f.tingkat || '';
  form.f_din_kls.value = f.din_kls || '';
  form.f_din_bag.value = f.din_bag || '';
  form.f_pa_pi.value = f.pa_pi || '';
  form.f_is_unggulan.checked = Boolean(f.is_unggulan);
  form.f_kapasitas_maksimal.value = f.kapasitas_maksimal || 40;
  form.f_id_mustahiq.value = f.id_mustahiq || '';
  form.f_domisili.value = f.domisili || '';
  form.f_lokasi_takror.value = f.lokasi_takror || '';
  form.f_lokasi_diniyyah.value = f.lokasi_diniyyah || '';

  const titleEl = document.querySelector('#formasiModal .modal-title');
  if (titleEl) titleEl.innerHTML = '<i class="bi bi-pencil-square me-2"></i> Edit Formasi Kelas';
  $('#formasiModal').modal('show');
}

export async function hapusFormasi(id) {
  const res = await Swal.fire({
    title: 'Hapus Blueprint Kelas?',
    text: 'Menghapus formasi tidak akan menghapus data santri di dalamnya.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Ya, Hapus Kelas!'
  });
  if (!res.isConfirmed) return;

  try {
    const { error } = await supabase.from('formasi_kelas').delete().eq('id', id);
    if (error) throw error;
    await logActivity('HAPUS FORMASI', `Menghapus blueprint kelas (ID: ${id})`);
    Swal.fire('Terhapus', 'Formasi kelas telah dihapus.', 'success');
    await loadFormasiData();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

export async function hapusFormasiTerpilih() {
  let selected = [];
  $('.row-check-formasi:checked').each(function () {
    selected.push($(this).val());
  });
  if (selected.length === 0) {
    return Swal.fire('Perhatian', 'Centang minimal satu data formasi!', 'info');
  }

  const res = await Swal.fire({
    title: `Hapus ${selected.length} Formasi?`,
    text: 'Data yang dicentang akan dihapus permanen.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Ya, Hapus Terpilih'
  });
  if (!res.isConfirmed) return;

  try {
    const { error } = await supabase.from('formasi_kelas').delete().in('id', selected);
    if (error) throw error;
    await logActivity('HAPUS BANYAK FORMASI', `Menghapus ${selected.length} formasi kelas`);
    Swal.fire('Berhasil!', `${selected.length} formasi berhasil dihapus.`, 'success');
    await loadFormasiData();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}
