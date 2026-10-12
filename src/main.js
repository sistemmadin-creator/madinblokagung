import { createClient } from '@supabase/supabase-js';

// =========================================================
// 1. INISIALISASI CLIENT SUPABASE DARI ENVIRONMENT VARIABLES
// =========================================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// =========================================================
// 2. STATE GLOBAL & KONFIGURASI KOLOM
// =========================================================
let dataTable = null;
const API_WILAYAH = 'https://www.emsifa.com/api-wilayah-indonesia/api';

let tree1Data = {}, tree2Data = {}, tree3Data = {};
let isEditMode = false;
let selectedRowData = []; // Menyimpan 35 elemen baris santri yang sedang dibuka di #detailModal
let globalDataSantri = []; // Menyimpan array 2D [35 kolom] seluruh santri di memori
let hiddenColumnsGlobal = [];

let appSettingsGlobal = {
  tree1: '',
  tree2: '',
  tree3: ''
};

let currentUser = {
  username: 'admin',
  nama: 'Master Administrator',
  role: 'Master Admin'
};

// 16 Kategori Filter Lanjutan sesuai indeks kolom DataTables
const filterCategories = [
  { name: 'PA/PI', col: 5 },
  { name: 'Tempat Lahir', col: 7 },
  { name: 'Dusun', col: 11 },
  { name: 'Desa', col: 12 },
  { name: 'Kecamatan', col: 13 },
  { name: 'Kabupaten', col: 14 },
  { name: 'Provinsi', col: 15 },
  { name: 'Blok', col: 16 },
  { name: 'Asrama', col: 17 },
  { name: 'Kode', col: 18 },
  { name: 'Unit', col: 24 },
  { name: 'Jurusan', col: 23 },
  { name: 'Semester', col: 22 },
  { name: 'Tingkat', col: 27 },
  { name: 'Din.Bag', col: 26 },
  { name: 'ORDA', col: 28 }
];

// Urutan 34 field database tabel `santri` (indeks 1..34 pada array baris)
const SANTRI_DB_FIELDS = [
  'no_induk',     // [1]
  'no_biro',      // [2]
  'nisn',         // [3]
  'pa_pi',        // [4]
  'nama',         // [5]
  'tempat_lahir', // [6]
  'tgl_lahir',    // [7]
  'bln_lahir',    // [8]
  'thn_lahir',    // [9]
  'dusun',        // [10]
  'desa',         // [11]
  'kecamatan',    // [12]
  'kabupaten',    // [13]
  'provinsi',     // [14]
  'blok',         // [15]
  'asrama',       // [16]
  'kode',         // [17]
  'kamar',        // [18]
  'kelas',        // [19]
  'bag',          // [20]
  'semester',     // [21]
  'jurusan',      // [22]
  'unit',         // [23]
  'din_kls',      // [24]
  'din_bag',      // [25]
  'tingkat',      // [26]
  'orda',         // [27]
  'nik',          // [28]
  'no_kk',        // [29]
'nama_ayah',    // [30]
  'nik_ayah',     // [31]
  'nama_ibu',     // [32]
  'nik_ibu',      // [33]
  'telepon',      // [34]
  'foto'          // [35]
];

// Konversi row object dari Supabase menjadi array 36 elemen (indeks 0 kosong, 1..35 data)
function dbRowToArray(obj) {
  return [
    '',
    obj.no_induk || '',
    obj.no_biro || '',
    obj.nisn || '',
    obj.pa_pi || '',
    obj.nama || '',
    obj.tempat_lahir || '',
    obj.tgl_lahir || '',
    obj.bln_lahir || '',
    obj.thn_lahir || '',
    obj.dusun || '',
    obj.desa || '',
    obj.kecamatan || '',
    obj.kabupaten || '',
    obj.provinsi || '',
    obj.blok || '',
    obj.asrama || '',
    obj.kode || '',
    obj.kamar || '',
    obj.kelas || '',
    obj.bag || '',
    obj.semester || '',
    obj.jurusan || '',
    obj.unit || '',
    obj.din_kls || '',
    obj.din_bag || '',
    obj.tingkat || '',
    obj.orda || '',
    obj.nik || '',
    obj.no_kk || '',
    obj.nama_ayah || '',
    obj.nik_ayah || '',
    obj.nama_ibu || '',
    obj.nik_ibu || '',
    obj.telepon || '',
    obj.foto || ''
  ];
}

// =========================================================
// 3. FUNGSI BACKEND SUPABASE (DATA, SETTINGS & AUDIT LOG)
// =========================================================
async function logActivity(aktivitas, detail) {
  if (!supabase) return;
  try {
    await supabase.from('activity_logs').insert([{
      username: currentUser?.username || 'System',
      nama: currentUser?.nama || 'Administrator',
      aktivitas,
      detail: detail || '-'
    }]);
  } catch (err) {
    console.error('Gagal mencatat activity_logs:', err.message);
  }
}

// Mengambil seluruh data santri dari Supabase (mendukung > 1.000 baris dengan paginasi otomatis)
async function fetchAllSantriFromSupabase() {
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

async function fetchSettingsFromSupabase() {
  if (!supabase) return appSettingsGlobal;
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'APP_SETTINGS')
    .maybeSingle();

  if (!error && data && data.value) {
    return {
      tree1: data.value.tree1 || '',
      tree2: data.value.tree2 || '',
      tree3: data.value.tree3 || ''
    };
  }
  return appSettingsGlobal;
}

// =========================================================
// 4. NAVIGASI, SIDEBAR HOVER & LOGOUT
// =========================================================
function toggleSidebar() {
  document.body.classList.toggle('sidebar-collapsed');
  document.getElementById('desktopSidebar').classList.toggle('close');
  setTimeout(() => {
    if (dataTable) dataTable.columns.adjust().draw(false);
  }, 400);
}

function showPage(page) {
  const pageSantri = document.getElementById('page-santri');
  if (pageSantri) pageSantri.style.display = (page === 'santri') ? 'block' : 'none';

  if (window.innerWidth >= 768) {
    document.body.classList.add('sidebar-collapsed');
    document.getElementById('desktopSidebar').classList.add('close');
  }
  if (page === 'santri' && dataTable) {
    dataTable.columns.adjust().draw(false);
  }
}

function actionLogout() {
  Swal.fire({
    title: 'Keluar dari Aplikasi?',
    text: 'Sesi Anda akan diakhiri. Anda harus login kembali untuk masuk.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#0f766e',
    cancelButtonColor: '#ef4444',
    confirmButtonText: '<i class="bi bi-box-arrow-right me-1"></i> Ya, Keluar',
    cancelButtonText: 'Batal',
    background: '#ffffff',
    borderRadius: '16px',
    backdrop: 'rgba(11, 87, 81, 0.4)'
  }).then((result) => {
    if (result.isConfirmed) {
      sessionStorage.removeItem('MUHAFADZOH_USER');
      Swal.fire({
        title: 'Berhasil Keluar!',
        icon: 'success',
        showConfirmButton: false,
        timer: 1000
      }).then(() => {
        window.location.reload();
      });
    }
  });
}

// =========================================================
// 5. INISIALISASI AWAL APLIKASI & BACKGROUND FETCH
// =========================================================
document.addEventListener('DOMContentLoaded', async function () {
  // Efek Hover Auto-Open & Auto-Close Sidebar Desktop
  const sidebarEl = document.getElementById('desktopSidebar');
  if (sidebarEl) {
    sidebarEl.addEventListener('mouseenter', function () {
      document.body.classList.remove('sidebar-collapsed');
      sidebarEl.classList.remove('close');
    });
    sidebarEl.addEventListener('mouseleave', function () {
      document.body.classList.add('sidebar-collapsed');
      sidebarEl.classList.add('close');
    });
  }

  // Render Kategori Filter Lanjutan (16 Kategori)
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
  document.getElementById('filterFormCategories').innerHTML = filterHtml + '</div>';

  // Render Modal Sembunyikan Kolom (34 Kolom, "Nama" dikunci)
  initHideModal();

  // Toggle aktif/nonaktif input filter saat kapsul kategori dicentang
  $(document).on('change', '.filter-cb', function () {
    let inputId = '#in_' + $(this).val();
    $(inputId).prop('disabled', !this.checked);
    if (!this.checked) $(inputId).val('');
  });

  // Inisialisasi Dropdown Tanggal (01-31) & Tahun Lahir (1990 - Sekarang)
  const tglSelect = document.getElementById('tgl_lahir');
  tglSelect.options.add(new Option('Pilih', ''));
  for (let i = 1; i <= 31; i++) {
    let val = i < 10 ? '0' + i : String(i);
    tglSelect.options.add(new Option(val, val));
  }

  const thnSelect = document.getElementById('thn_lahir');
  thnSelect.options.add(new Option('Pilih', ''));
  for (let i = new Date().getFullYear(); i >= 1990; i--) {
    thnSelect.options.add(new Option(i, i));
  }

  // Muat Daftar Provinsi dari REST API Wilayah Emsifa
  fetch(`${API_WILAYAH}/provinces.json`)
    .then(r => r.json())
    .then(provs => {
      let provSelect = document.getElementById('provinsi');
      provSelect.innerHTML = '<option value="">Pilih Provinsi</option>';
      provs.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.name;
        opt.dataset.id = p.id;
        opt.textContent = p.name;
        provSelect.appendChild(opt);
      });
    })
    .catch(err => console.error('Gagal memuat provinsi:', err));

  // Pasang Event Listeners Wilayah & Hierarki
  setupWilayahListeners();
  setupHierarchyListeners();
  setupDetailModalButtons();

  // Muat Konfigurasi Hierarki Dropdown dari Tabel `app_settings`
  try {
    const settings = await fetchSettingsFromSupabase();
    appSettingsGlobal = settings;
    document.getElementById('settingTree1').value = appSettingsGlobal.tree1 || '';
    document.getElementById('settingTree2').value = appSettingsGlobal.tree2 || '';
    document.getElementById('settingTree3').value = appSettingsGlobal.tree3 || '';
    applyTreeData(appSettingsGlobal);
  } catch (err) {
    console.error('Gagal memuat app_settings:', err.message);
  }

  // Background Fetch Data Santri ke memori (`globalDataSantri`) TANPA merender tabel langsung
  try {
    globalDataSantri = await fetchAllSantriFromSupabase();
    populateFilterDatalists();
  } catch (err) {
    console.error('Background fetch santri gagal:', err.message);
  }
});

function populateFilterDatalists() {
  filterCategories.forEach(cat => {
    let uniqueValues = [...new Set(globalDataSantri.map(r => r[cat.col - 1]))]
      .filter(v => v && v.toString().trim() !== '');
    let dataList = document.getElementById('dl_' + cat.col);
    if (dataList) {
      dataList.innerHTML = uniqueValues.sort().map(val => `<option value="${val}">`).join('');
    }
  });
}

// =========================================================
// 6. LAZY LOADING & RENDER TABEL DATATABLES (#dataTable)
// =========================================================
async function actionLoadSantri() {
  const btn = document.getElementById('btnLoadSantri');
  btn.classList.add('btn-loading-state');

  btn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
    <span>Menyiapkan Database Santri...</span>
  `;

  setTimeout(async () => {
    try {
      if (!globalDataSantri || globalDataSantri.length === 0) {
        globalDataSantri = await fetchAllSantriFromSupabase();
      }
      btn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>Memuat ${globalDataSantri.length.toLocaleString('id-ID')} Data Santri...</span>
      `;
      setTimeout(() => {
        renderTable(globalDataSantri);
      }, 80);
    } catch (err) {
      Swal.fire('Gagal Memuat Data', err.message, 'error');
      btn.classList.remove('btn-loading-state');
      btn.innerHTML = '<i class="bi bi-table me-2"></i> Memuat Halaman (Tabel Data)';
    }
  }, 60);
}

function renderTable(data) {
  let btnContainer = document.getElementById('btnLoadSantriContainer');
  let tableWrapper = document.getElementById('tableSantriWrapper');
  if (btnContainer) btnContainer.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  if (dataTable) {
    dataTable.destroy();
    $('#dataTable').empty();
  }

  // Bangun Struktur Header 36 Kolom
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

  globalDataSantri = Array.isArray(data) ? data : JSON.parse(data || '[]');

  const tableDataArray = [];
  for (let r = 0; r < globalDataSantri.length; r++) {
    const row = globalDataSantri[r];
    const genderBadge = row[4] === 'PA'
      ? '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2">PA</span>'
      : (row[4] === 'PI'
        ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2">PI</span>'
        : (row[4] || ''));

    tableDataArray.push([
      `<input type="checkbox" class="row-check form-check-input" value="${row[1]}">`,
      '', // [1] Nomor urut otomatis
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

  dataTable = $('#dataTable').DataTable({
    data: tableDataArray,
    scrollX: true,
    scrollCollapse: true,
    autoWidth: false,
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

  // Penomoran otomatis mengikuti sorting dan pencarian
  dataTable.on('order.dt search.dt', function () {
    let i = 1;
    dataTable.cells(null, 1, { search: 'applied', order: 'applied' }).every(function () {
      this.data(i++);
    });
  }).draw();

  setTimeout(() => {
    if (dataTable) dataTable.columns.adjust().draw(false);
  }, 300);

  applyHideColumns();
  populateFilterDatalists();
}

// =========================================================
// 7. FITUR SEMBUNYIKAN KOLOM & FILTER LANJUTAN
// =========================================================
function initHideModal() {
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
  document.getElementById('hideCheckboxes').innerHTML = html;
}

function checkAllHide(status) {
  $('.hide-cb:not(:disabled)').prop('checked', status);
}

function applyHideColumns() {
  hiddenColumnsGlobal = [];
  if (!dataTable) return;

  for (let i = 2; i <= 35; i++) {
    dataTable.column(i).visible(true, false);
  }

  $('.hide-cb:checked').each(function () {
    let colIdx = parseInt($(this).val(), 10);
    hiddenColumnsGlobal.push(colIdx);
    dataTable.column(colIdx).visible(false, false);
  });

  dataTable.columns.adjust().draw(false);
}

function applyFilters() {
  if (!dataTable) return;
  dataTable.columns().search('');
  $('.filter-cb:checked').each(function () {
    let colIdx = $(this).val();
    let val = $('#in_' + colIdx).val();
    dataTable.column(colIdx).search(val);
  });
  dataTable.draw();
}

function resetFilters() {
  $('.filter-cb').prop('checked', false);$('.filter-input').val('').prop('disabled', true);
  if (dataTable) dataTable.columns().search('').draw();
}

// =========================================================
// 8. KLIK BARIS -> MODAL DETAIL SANTRI (#detailModal)
// =========================================================
$(document).on('change', '#checkAll', function () {
  $('.row-check').prop('checked', this.checked);
});

$(document).off('click', '#dataTable tbody tr').on('click', '#dataTable tbody tr', function (e) {
  if ($(e.target).hasClass('row-check') || $(e.target).is(':checkbox') || $(this).find('.dataTables_empty').length > 0) {
    return;
  }

  let noInduk = $(this).find('.row-check').val();
  if (!noInduk) return;

  let santri = globalDataSantri.find(r => String(r[1]) === String(noInduk));
  if (!santri) return;

  // Simpan baris santri terpilih
  selectedRowData = [...santri];

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
          ${buildDetailRow('Nama Lengkap', santri[5])}${buildDetailRow('Jenis Kelamin', santri[4] === 'PA' ? 'PA (Putra)' : (santri[4] === 'PI' ? 'PI (Putri)' : '-'))}
          ${buildDetailRow('Tempat, Tgl Lahir', ttl)}${buildDetailRow('NIK / No. KK', (santri[28] || '-') + ' / ' + (santri[29] || '-'))}
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

function setupDetailModalButtons() {
  // Tombol Hapus di Modal Detail
  document.getElementById('btnHapusDetail').addEventListener('click', async function () {
    const noInduk = selectedRowData[1];
    const namaSantri = selectedRowData[5] || '';
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

  // Tombol Edit Data di Modal Detail
  document.getElementById('btnEditDetail').addEventListener('click', function () {
    if (!selectedRowData || !selectedRowData[1]) return;
    isEditMode = true;
    $('#detailModal').modal('hide');

    document.querySelector('#inputModal .modal-title').innerHTML = "<i class='bi bi-pencil-square me-2'></i> Edit Data Santri";
    document.getElementById('btnSubmit').innerText = 'Update Data';

    const form = document.getElementById('inputForm');
    form.reset();

    form.no_induk_lama.value = selectedRowData[1] || '';
    form.no_induk.value = selectedRowData[1] || '';
    form.no_biro.value = selectedRowData[2] || '';
    form.nisn.value = selectedRowData[3] || '';
    form.pa_pi.value = selectedRowData[4] || '';
    form.nama.value = selectedRowData[5] || '';
    form.tempat_lahir.value = selectedRowData[6] || '';
    forceSetSelect(form.tgl_lahir, selectedRowData[7]);
    forceSetSelect(form.bln_lahir, selectedRowData[8]);
    forceSetSelect(form.thn_lahir, selectedRowData[9]);

    form.dusun.value = selectedRowData[10] || '';
    forceSetSelect(form.provinsi, selectedRowData[14]);
    forceSetSelect(form.kabupaten, selectedRowData[13]);
    forceSetSelect(form.kecamatan, selectedRowData[12]);
    forceSetSelect(form.desa, selectedRowData[11]);

    // Populate opsi pohon hierarki jika tersedia lalu paksa pilih dengan forceSetSelect
    const bVal = selectedRowData[15], aVal = selectedRowData[16], kdVal = selectedRowData[17], kmVal = selectedRowData[18];
    forceSetSelect(form.blok, bVal);
    if (bVal && tree1Data[bVal]) populateSelect('asrama', Object.keys(tree1Data[bVal]));
    forceSetSelect(form.asrama, aVal);
    if (bVal && aVal && tree1Data[bVal]?.[aVal]) populateSelect('kode', Object.keys(tree1Data[bVal][aVal]));
    forceSetSelect(form.kode, kdVal);
    if (bVal && aVal && kdVal && tree1Data[bVal]?.[aVal]?.[kdVal]) populateSelect('kamar', Object.keys(tree1Data[bVal][aVal][kdVal]));
    forceSetSelect(form.kamar, kmVal);

    const uVal = selectedRowData[23], jVal = selectedRowData[22], sVal = selectedRowData[21], klVal = selectedRowData[19], bgVal = selectedRowData[20];
    forceSetSelect(form.unit, uVal);
    if (uVal && tree2Data[uVal]) populateSelect('jurusan', Object.keys(tree2Data[uVal]));
    forceSetSelect(form.jurusan, jVal);
    if (uVal && jVal && tree2Data[uVal]?.[jVal]) populateSelect('semester', Object.keys(tree2Data[uVal][jVal]));
    forceSetSelect(form.semester, sVal);
    if (uVal && jVal && sVal && tree2Data[uVal]?.[jVal]?.[sVal]) populateSelect('kelas', Object.keys(tree2Data[uVal][jVal][sVal]));
    forceSetSelect(form.kelas, klVal);
    if (uVal && jVal && sVal && klVal && tree2Data[uVal]?.[jVal]?.[sVal]?.[klVal]) populateSelect('bag', Object.keys(tree2Data[uVal][jVal][sVal][klVal]));
    forceSetSelect(form.bag, bgVal);

    const tkVal = selectedRowData[26], dkVal = selectedRowData[24], dbVal = selectedRowData[25];
    forceSetSelect(form.tingkat, tkVal);
    if (tkVal && tree3Data[tkVal]) populateSelect('din_kls', Object.keys(tree3Data[tkVal]));
    forceSetSelect(form.din_kls, dkVal);
    if (tkVal && dkVal && tree3Data[tkVal]?.[dkVal]) populateSelect('din_bag', Object.keys(tree3Data[tkVal][dkVal]));
    forceSetSelect(form.din_bag, dbVal);

    form.orda.value = selectedRowData[27] || '';
    form.nik.value = selectedRowData[28] || '';
    form.no_kk.value = selectedRowData[29] || '';
    form.nama_ayah.value = selectedRowData[30] || '';
    form.nik_ayah.value = selectedRowData[31] || '';
    form.nama_ibu.value = selectedRowData[32] || '';
    form.nik_ibu.value = selectedRowData[33] || '';
    form.telepon.value = selectedRowData[34] || '';

    // Tampilkan foto santri yang tersimpan saat mode Edit
    setPreviewFotoSantri(selectedRowData[35] || '');

    $('#inputModal').modal('show');
  });
}

// =========================================================
// 9. CRUD FORM SANTRI, HAPUS MASSAL & IMPOR EXCEL
// =========================================================
function openAddModal() {
  isEditMode = false;
  document.getElementById('inputForm').reset();
  document.getElementById('no_induk_lama').value = '';
  hapusFotoSantri();
  resetSelects(['kabupaten', 'kecamatan', 'desa', 'asrama', 'kode', 'kamar', 'jurusan', 'semester', 'bag', 'kelas', 'din_bag', 'din_kls']);
  document.querySelector('#inputModal .modal-title').innerHTML = "<i class='bi bi-person-plus-fill me-2'></i> Form Data Santri";
  document.getElementById('btnSubmit').innerText = 'Simpan Data';
  $('#inputModal').modal('show');
}

async function submitData(e) {
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
    if (isEditMode) {
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

    if (!isEditMode) {
      form.reset();
      resetSelects(['kabupaten', 'kecamatan', 'desa', 'asrama', 'kode', 'kamar', 'jurusan', 'semester', 'bag', 'kelas', 'din_bag', 'din_kls']);
    }

    Swal.fire({
      title: isEditMode ? 'Data Diperbarui!' : 'Data Tersimpan!',
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

async function hapusTerpilih() {
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

async function hapusSemuaData() {
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

function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const jsonArray = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

    // Buang baris header pertama
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
      // Deteksi otomatis apakah kolom 0 di Excel adalah kolom "No" (35 kolom) atau langsung "No.Induk" (34 kolom)
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

      // Bulk Upsert per 500 baris agar lancar untuk ribuan data
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

// =========================================================
// 10. CASCADING WILAYAH (EMSIFA) & POHON HIERARKI DROPDOWN
// =========================================================
function forceSetSelect(selectElement, value) {
  if (!selectElement) return;
  if (!value || value === '-') {
    selectElement.value = '';
    return;
  }
  if (!Array.from(selectElement.options).some(opt => opt.value == value)) {
    selectElement.add(new Option(value, value, true, true));
  }
  selectElement.value = value;
  selectElement.disabled = false;
}

function populateSelect(id, optionsArray) {
  let sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">Pilih...</option>';
  if (optionsArray && optionsArray.length > 0) {
    sel.disabled = false;
    optionsArray.forEach(opt => sel.add(new Option(opt, opt)));
  } else {
    sel.disabled = true;
  }
}

function resetSelects(ids) {
  ids.forEach(id => {
    let sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = '<option value="">Pilih...</option>';
      sel.disabled = true;
    }
  });
}

function setupWilayahListeners() {
  document.getElementById('provinsi').addEventListener('change', function () {
    let kabSelect = document.getElementById('kabupaten');
    kabSelect.innerHTML = '<option value="">Memuat...</option>';
    kabSelect.disabled = true;
    resetSelects(['kecamatan', 'desa']);
    let id = this.options[this.selectedIndex]?.dataset?.id;
    if (!id) return;
    fetch(`${API_WILAYAH}/regencies/${id}.json`)
      .then(r => r.json())
      .then(data => {
        kabSelect.innerHTML = '<option value="">Pilih Kabupaten / Kota</option>';
        kabSelect.disabled = false;
        data.forEach(x => {
          let opt = document.createElement('option');
          opt.value = x.name;
          opt.dataset.id = x.id;
          opt.textContent = x.name;
          kabSelect.appendChild(opt);
        });
      });
  });

  document.getElementById('kabupaten').addEventListener('change', function () {
    let kecSelect = document.getElementById('kecamatan');
    resetSelects(['kecamatan', 'desa']);
    kecSelect.innerHTML = '<option value="">Memuat...</option>';
    let id = this.options[this.selectedIndex]?.dataset?.id;
    if (!id) return;
    fetch(`${API_WILAYAH}/districts/${id}.json`)
      .then(r => r.json())
      .then(data => {
        kecSelect.innerHTML = '<option value="">Pilih Kecamatan</option>';
        kecSelect.disabled = false;
        data.forEach(x => {
          let opt = document.createElement('option');
          opt.value = x.name;
          opt.dataset.id = x.id;
          opt.textContent = x.name;
          kecSelect.appendChild(opt);
        });
      });
  });

  document.getElementById('kecamatan').addEventListener('change', function () {
    let desaSelect = document.getElementById('desa');
    resetSelects(['desa']);
    desaSelect.innerHTML = '<option value="">Memuat...</option>';
    let id = this.options[this.selectedIndex]?.dataset?.id;
    if (!id) return;
    fetch(`${API_WILAYAH}/villages/${id}.json`)
      .then(r => r.json())
      .then(data => {
        desaSelect.innerHTML = '<option value="">Pilih Desa / Kelurahan</option>';
        desaSelect.disabled = false;
        data.forEach(x => {
          let opt = document.createElement('option');
          opt.value = x.name;
          opt.dataset.id = x.id;
          opt.textContent = x.name;
          desaSelect.appendChild(opt);
        });
      });
  });
}

function parseHierarchy(text) {
  if (!text) return {};
  let tree = {};
  text.split('\n').forEach(line => {
    let parts = line.split('>').map(s => s.trim()).filter(s => s);
    if (parts.length === 0) return;
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i];
      if (!current[part]) current[part] = {};
      current = current[part];
    }
  });
  return tree;
}

function applyTreeData(settings) {
  tree1Data = parseHierarchy(settings.tree1);
  tree2Data = parseHierarchy(settings.tree2);
  tree3Data = parseHierarchy(settings.tree3);

  populateSelect('blok', Object.keys(tree1Data));
  populateSelect('unit', Object.keys(tree2Data));
  populateSelect('tingkat', Object.keys(tree3Data));
}

function setupHierarchyListeners() {
  // Tree 1: Blok > Asrama > Kode > Kamar
  document.getElementById('blok').addEventListener('change', function () {
    resetSelects(['asrama', 'kode', 'kamar']);
    if (this.value && tree1Data[this.value]) populateSelect('asrama', Object.keys(tree1Data[this.value]));
  });
  document.getElementById('asrama').addEventListener('change', function () {
    let v1 = document.getElementById('blok').value;
    resetSelects(['kode', 'kamar']);
    if (this.value && tree1Data[v1]?.[this.value]) populateSelect('kode', Object.keys(tree1Data[v1][this.value]));
  });
  document.getElementById('kode').addEventListener('change', function () {
    let v1 = document.getElementById('blok').value, v2 = document.getElementById('asrama').value;
    resetSelects(['kamar']);
    if (this.value && tree1Data[v1]?.[v2]?.[this.value]) populateSelect('kamar', Object.keys(tree1Data[v1][v2][this.value]));
  });

  // Tree 2: Unit > Jurusan > Semester > Kelas > Bag
  document.getElementById('unit').addEventListener('change', function () {
    resetSelects(['jurusan', 'semester', 'kelas', 'bag']);
    if (this.value && tree2Data[this.value]) populateSelect('jurusan', Object.keys(tree2Data[this.value]));
  });
  document.getElementById('jurusan').addEventListener('change', function () {
    let v1 = document.getElementById('unit').value;
    resetSelects(['semester', 'kelas', 'bag']);
    if (this.value && tree2Data[v1]?.[this.value]) populateSelect('semester', Object.keys(tree2Data[v1][this.value]));
  });
  document.getElementById('semester').addEventListener('change', function () {
    let v1 = document.getElementById('unit').value, v2 = document.getElementById('jurusan').value;
    resetSelects(['kelas', 'bag']);
    if (this.value && tree2Data[v1]?.[v2]?.[this.value]) populateSelect('kelas', Object.keys(tree2Data[v1][v2][this.value]));
  });
  document.getElementById('kelas').addEventListener('change', function () {
    let v1 = document.getElementById('unit').value, v2 = document.getElementById('jurusan').value, v3 = document.getElementById('semester').value;
    resetSelects(['bag']);
    if (this.value && tree2Data[v1]?.[v2]?.[v3]?.[this.value]) populateSelect('bag', Object.keys(tree2Data[v1][v2][v3][this.value]));
  });

  // Tree 3: Tingkat > Din. Kls > Din. Bag
  document.getElementById('tingkat').addEventListener('change', function () {
    resetSelects(['din_kls', 'din_bag']);
    if (this.value && tree3Data[this.value]) populateSelect('din_kls', Object.keys(tree3Data[this.value]));
  });
  document.getElementById('din_kls').addEventListener('change', function () {
    let v1 = document.getElementById('tingkat').value;
    resetSelects(['din_bag']);
    if (this.value && tree3Data[v1]?.[this.value]) populateSelect('din_bag', Object.keys(tree3Data[v1][this.value]));
  });
}

async function saveSettingsData() {
  const btn = document.getElementById('btnSaveSettings');
  btn.innerHTML = 'Menyimpan...';
  btn.disabled = true;

  appSettingsGlobal.tree1 = document.getElementById('settingTree1').value;
  appSettingsGlobal.tree2 = document.getElementById('settingTree2').value;
  appSettingsGlobal.tree3 = document.getElementById('settingTree3').value;

  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert([{ key: 'APP_SETTINGS', value: appSettingsGlobal }], { onConflict: 'key' });

    if (error) throw error;

    await logActivity('SIMPAN PENGATURAN', 'Memperbarui konfigurasi sistem atau hierarki dropdown');
    applyTreeData(appSettingsGlobal);
    $('#settingsModal').modal('hide');
    Swal.fire('Berhasil!', 'Pengaturan Hierarki Dropdown Berhasil Disimpan!', 'success');
  } catch (err) {
    Swal.fire('Gagal Menyimpan Pengaturan', err.message, 'error');
  } finally {
    btn.innerHTML = 'Simpan Pengaturan';
    btn.disabled = false;
  }
}

// =========================================================
// 11. AUDIT LOG VIEWER (TABEL `activity_logs`)
// =========================================================
async function loadAuditLogs() {
  const tbody = document.getElementById('tbodyAuditLogs');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3"><span class="spinner-border spinner-border-sm me-1"></span> Mengambil riwayat aktivitas dari Supabase...</td></tr>';

  if (!supabase) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-danger">Supabase belum terhubung.</td></tr>';
    return;
  }

  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">Belum ada aktivitas tercatat.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(item => {
      const waktuWIB = item.created_at
        ? new Date(item.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        : '-';
      return `
        <tr>
          <td class="text-nowrap text-secondary">${waktuWIB}</td>
          <td class="fw-bold">${item.username || '-'}</td>
          <td>${item.nama || '-'}</td>
          <td><span class="badge bg-secondary">${item.aktivitas || '-'}</span></td>
          <td><small>${item.detail || '-'}</small></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Gagal memuat log: ${err.message}</td></tr>`;
  }
}

// =========================================================
// 12. MODUL INPUT, KOMPRESI & PREVIEW FOTO SANTRI
// =========================================================
function compressImageFileSantri(file, maxDim = 600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setPreviewFotoSantri(dataUrl) {
  const inputHidden = document.getElementById('foto_santri');
  const previewImg = document.getElementById('preview_foto_santri');
  const placeholder = document.getElementById('placeholder_foto_santri');
  const btnHapus = document.getElementById('btnHapusFotoSantri');
  const statusEl = document.getElementById('statusFotoSantri');

  if (!inputHidden || !previewImg || !placeholder) return;

  if (dataUrl && dataUrl.trim() !== '') {
    inputHidden.value = dataUrl;
    previewImg.src = dataUrl;
    previewImg.style.display = 'block';
    placeholder.style.display = 'none';
    if (btnHapus) btnHapus.classList.remove('d-none');
    if (statusEl) statusEl.innerHTML = '<span class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i> Foto siap disimpan.</span>';
  } else {
    hapusFotoSantri();
  }
}

async function handleFotoSantriSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire('Format Tidak Didukung', 'Pilih file berupa gambar (JPG/PNG/WEBP).', 'warning');
    return;
  }

  const statusEl = document.getElementById('statusFotoSantri');
  if (statusEl) {
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm text-success me-1"></span> Mengompres & menyiapkan foto...';
  }

  try {
    const compressedBase64 = await compressImageFileSantri(file, 600, 0.75);
    setPreviewFotoSantri(compressedBase64);
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.innerHTML = '<span class="text-danger">Gagal memproses foto.</span>';
  }

  event.target.value = '';
}

function hapusFotoSantri() {
  const inputHidden = document.getElementById('foto_santri');
  const previewImg = document.getElementById('preview_foto_santri');
  const placeholder = document.getElementById('placeholder_foto_santri');
  const btnHapus = document.getElementById('btnHapusFotoSantri');
  const statusEl = document.getElementById('statusFotoSantri');

  if (inputHidden) inputHidden.value = '';
  if (previewImg) {
    previewImg.src = '';
    previewImg.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'flex';
  if (btnHapus) btnHapus.classList.add('d-none');
  if (statusEl) statusEl.innerText = 'Belum ada foto dipilih (Otomatis dikompresi agar ringan).';
}

function lihatFotoSantri(url, namaSantri) {
  if (!url) return;
  Swal.fire({
    title: namaSantri || 'Foto Santri',
    imageUrl: url,
    imageAlt: namaSantri || 'Foto Santri',
    showConfirmButton: true,
    confirmButtonText: 'Tutup',
    confirmButtonColor: '#0f766e'
  });
}

// Ekspos fungsi ke global `window` agar dapat dipanggil dari atribut onclick HTML
Object.assign(window, {
  toggleSidebar,
  showPage,
  actionLogout,
  actionLoadSantri,
  openAddModal,
  submitData,
  hapusTerpilih,
  hapusSemuaData,
  handleExcelImport,
  checkAllHide,
  applyHideColumns,
  applyFilters,
  resetFilters,
  saveSettingsData,
  loadAuditLogs,
  handleFotoSantriSelected,
  hapusFotoSantri,
  lihatFotoSantri
});
