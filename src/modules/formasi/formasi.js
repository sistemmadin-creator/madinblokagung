import { supabase } from '../../lib/supabase.js';
import { store } from '../../state/store.js';
import { logActivity } from '../audit/audit.js';
import { compressImageFileSantri } from '../../utils/camera.js';

// =========================================================
// HELPER SINKRONISASI ASATIDZ (WALI KELAS) & SANTRI KELAS
// =========================================================
const VALID_JAH_WALIKELAS = ['MUSTAHIQ', 'MS & KOOR', 'MUSTAHIQOH'];

function norm(val) {
  return String(val || '').trim().toUpperCase();
}

/**
 * Mencari Asatidz yang bertugas sebagai Wali Kelas (Mustahiq, MS & Koor, Mustahiqoh)
 * sesuai Tingkat, Kelas, Bagian, dan Gender pada Formasi Kelas
 */
export function findWaliKelasAsatidz(f) {
  const listAsatidz = store.globalDataAsatidz || [];
  if (!f || listAsatidz.length === 0) return [];

  const fTingkat = norm(f.tingkat);
  const fKls = norm(f.din_kls);
  const fBag = norm(f.din_bag);
  const fGender = norm(f.pa_pi);

  return listAsatidz.filter(a => {
    const jah = norm(a.jah_asatidz);
    if (!VALID_JAH_WALIKELAS.includes(jah)) return false;

    const matchTingkat = norm(a.tingkat_asatidz) === fTingkat;
    const matchKls = norm(a.din_kls_asatidz) === fKls;
    const matchBag = norm(a.din_bag_asatidz) === fBag;
    const matchGender = !fGender || !a.pa_pi || norm(a.pa_pi) === fGender;

    return matchTingkat && matchKls && matchBag && matchGender;
  });
}

/**
 * Mengambil informasi gabungan Formasi & Asatidz Wali Kelas (termasuk fallback lokasi/domisili)
 */
function getWaliKelasSyncInfo(f) {
  const matchedAsatidz = findWaliKelasAsatidz(f);

  // Nama Wali Kelas: Prioritaskan sinkronisasi dari Asatidz (Mustahiq / MS & Koor / Mustahiqoh), fallback ke f.id_mustahiq
  let waliKelasText = f.id_mustahiq || '-';
  let waliKelasHtml = f.id_mustahiq ? `<span class="fw-bold">${f.id_mustahiq}</span>` : '-';

if (matchedAsatidz.length > 0) {
    waliKelasText = matchedAsatidz.map(a => a.nama_asatidz).join(', ');
    waliKelasHtml = matchedAsatidz.map(a => {
      const niaBadge = a.nia ? `<span class="badge bg-secondary text-white ms-1">${a.nia}</span>` : '';
      const jahBadge = a.jah_asatidz ? `<span class="badge bg-success text-white ms-1">${a.jah_asatidz}</span>` : '';
      return `<div class="fw-bold text-teal">${a.nama_asatidz} ${niaBadge} ${jahBadge}</div>`;
    }).join('');
  }

const primaryAsatidz = matchedAsatidz[0] || null;

  const domisili = f.domisili || (primaryAsatidz?.blok ? `Blok ${primaryAsatidz.blok}${primaryAsatidz.asrama ? ' - ' + primaryAsatidz.asrama : ''}` : '-');
  const lokasiTakror = f.lokasi_takror || primaryAsatidz?.lokasi_takror || '-';
  const lokasiDiniyyah = f.lokasi_diniyyah || primaryAsatidz?.lokasi_diniyyah || '-';
  const fotoTakror = f.foto_takror || '';
  const fotoDiniyyah = f.foto_diniyyah || '';

  return {
    matchedAsatidz,
    waliKelasText,
    waliKelasHtml,
    domisili,
    lokasiTakror,
    lokasiDiniyyah,
    fotoTakror,
    fotoDiniyyah
  };
}

/**
 * Merender tampilan gabungan Teks Nama Lokasi + Thumbnail Foto dalam 1 kolom
 */
function buildLokasiWithFotoHtml(namaLokasi, fotoUrl, labelPopup) {
  const safeText = namaLokasi || '-';
  if (!fotoUrl) return `<span>${safeText}</span>`;

  const safeLabel = String(labelPopup || 'Foto Lokasi').replace(/'/g, "\\'");
  const safeUrl = String(fotoUrl).replace(/'/g, "\\'");
  return `
    <div class="d-inline-flex align-items-center gap-2">
      <img src="${safeUrl}" alt="${safeLabel}"
           style="width: 32px; height: 32px; object-fit: cover; border-radius: 6px; cursor: zoom-in; flex-shrink: 0;"
           class="border shadow-sm"
           title="Klik untuk memperbesar ${safeLabel}"
           onclick="event.stopPropagation(); window.lihatFotoLokasiFormasi('${safeUrl}', '${safeLabel}')">
      <span>${safeText}</span>
    </div>
  `;
}

export function setPreviewFotoFormasi(jenis, dataUrl) {
  const isTakror = jenis === 'takror';
  const inputHidden = document.getElementById(isTakror ? 'f_foto_takror' : 'f_foto_diniyyah');
  const previewImg = document.getElementById(isTakror ? 'preview_f_foto_takror' : 'preview_f_foto_diniyyah');
  const placeholder = document.getElementById(isTakror ? 'placeholder_f_foto_takror' : 'placeholder_f_foto_diniyyah');
  const btnHapus = document.getElementById(isTakror ? 'btnHapusFotoTakror' : 'btnHapusFotoDiniyyah');
  const statusEl = document.getElementById(isTakror ? 'statusFotoTakror' : 'statusFotoDiniyyah');

  if (!inputHidden || !previewImg || !placeholder) return;

  if (dataUrl && String(dataUrl).trim() !== '') {
    inputHidden.value = dataUrl;
    previewImg.src = dataUrl;
    previewImg.style.display = 'block';
    placeholder.style.display = 'none';
    if (btnHapus) btnHapus.classList.remove('d-none');
    if (statusEl) statusEl.innerHTML = '<span class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i> Foto siap disimpan.</span>';
  } else {
    hapusFotoFormasi(jenis);
  }
}

export async function handleFotoFormasiSelected(event, jenis) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire('Format Tidak Didukung', 'Pilih file berupa gambar (JPG/PNG/WEBP).', 'warning');
    event.target.value = '';
    return;
  }

  const isTakror = jenis === 'takror';
  const statusEl = document.getElementById(isTakror ? 'statusFotoTakror' : 'statusFotoDiniyyah');
  if (statusEl) {
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm text-success me-1"></span> Mengompres foto...';
  }

  try {
    const compressedBase64 = await compressImageFileSantri(file, 700, 0.75);
    setPreviewFotoFormasi(jenis, compressedBase64);
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.innerHTML = '<span class="text-danger">Gagal memproses foto.</span>';
  }

  event.target.value = '';
}

export function hapusFotoFormasi(jenis) {
  const isTakror = jenis === 'takror';
  const inputHidden = document.getElementById(isTakror ? 'f_foto_takror' : 'f_foto_diniyyah');
  const previewImg = document.getElementById(isTakror ? 'preview_f_foto_takror' : 'preview_f_foto_diniyyah');
  const placeholder = document.getElementById(isTakror ? 'placeholder_f_foto_takror' : 'placeholder_f_foto_diniyyah');
  const btnHapus = document.getElementById(isTakror ? 'btnHapusFotoTakror' : 'btnHapusFotoDiniyyah');
  const statusEl = document.getElementById(isTakror ? 'statusFotoTakror' : 'statusFotoDiniyyah');

  if (inputHidden) inputHidden.value = '';
  if (previewImg) {
    previewImg.src = '';
    previewImg.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'block';
  if (btnHapus) btnHapus.classList.add('d-none');
  if (statusEl) statusEl.innerText = 'Otomatis dikompresi agar ringan.';
}

export function lihatFotoLokasiFormasi(url, judul) {
  if (!url) return;
  Swal.fire({
    title: judul || 'Foto Lokasi',
    imageUrl: url,
    imageAlt: judul || 'Foto Lokasi',
    showConfirmButton: true,
    confirmButtonText: 'Tutup',
    confirmButtonColor: '#0f766e'
  });
}

/**
 * Mengambil daftar santri dari store.globalDataSantri yang masuk ke dalam Formasi Kelas ini
 */
export function getSantriInFormasi(f) {
  const listSantri = store.globalDataSantri || [];
  if (!f || listSantri.length === 0) return [];

  const fTingkat = norm(f.tingkat);
  const fKls = norm(f.din_kls);
  const fBag = norm(f.din_bag);
  const fGender = norm(f.pa_pi);

  const hasil = [];

  listSantri.forEach(s => {
    // Mendukung format Array (dbRowToArray) maupun Object
    const isArr = Array.isArray(s);
    const no_induk = isArr ? s[1] : s.no_induk;
    const pa_pi = isArr ? s[4] : s.pa_pi;
    const nama = isArr ? s[5] : s.nama;
    const kabupaten = isArr ? s[13] : s.kabupaten;
    const blok = isArr ? s[15] : s.blok;
    const asrama = isArr ? s[16] : s.asrama;
    const kode = isArr ? s[17] : s.kode;
    const kamar = isArr ? s[18] : s.kamar;
    const kelasFormal = isArr ? s[19] : s.kelas;
    const unitFormal = isArr ? s[23] : s.unit;
    const din_kls = isArr ? s[24] : s.din_kls;
    const din_bag = isArr ? s[25] : s.din_bag;
    const tingkat = isArr ? s[26] : s.tingkat;

    const matchTingkat = norm(tingkat) === fTingkat;
    const matchKls = norm(din_kls) === fKls;
    const matchBag = norm(din_bag) === fBag;
    const matchGender = !fGender || !pa_pi || norm(pa_pi) === fGender;

    if (matchTingkat && matchKls && matchBag && matchGender) {
      hasil.push({
        no_induk: no_induk || '-',
        nama: nama || '-',
        pa_pi: pa_pi || '-',
        kabupaten: kabupaten || '-',
        domisiliKamar: [blok, asrama, kode, kamar].filter(Boolean).join(' - ') || '-',
        formal: [unitFormal, kelasFormal].filter(Boolean).join(' - ') || '-'
      });
    }
  });

  // Urutkan berdasarkan nama santri A-Z
  hasil.sort((a, b) => a.nama.localeCompare(b.nama));
  return hasil;
}

/**
 * Mengisi datalist pilihan Mustahiq pada modal Tambah/Edit Formasi
 */
function populateMustahiqDatalist() {
  const dl = document.getElementById('datalistMustahiqFormasi');
  if (!dl) return;

  const listAsatidz = store.globalDataAsatidz || [];
  const waliList = listAsatidz.filter(a => VALID_JAH_WALIKELAS.includes(norm(a.jah_asatidz)));

  let optionsHtml = '';
  waliList.forEach(a => {
    const infoKelas = [a.din_kls_asatidz, a.din_bag_asatidz, a.tingkat_asatidz].filter(Boolean).join(' ');
    const label = `${a.jah_asatidz || ''} ${infoKelas ? '(' + infoKelas + ')' : ''}`.trim();
    optionsHtml += `<option value="${a.nama_asatidz}" label="${label}"></option>`;
  });
  dl.innerHTML = optionsHtml;
}

// =========================================================
// MODUL FORMASI KELAS MADIN (TABEL, FILTER, HIDE & CRUD)
// =========================================================
export function initHideFilterFormasi() {
  const formasiColNames = [
    { name: 'Tingkat', col: 1 }, { name: 'Kelas', col: 2 }, { name: 'Bagian', col: 3 },
    { name: 'Gender', col: 4 }, { name: 'Kapasitas', col: 5 }, { name: 'Wali Kelas', col: 6 },
    { name: 'Domisili', col: 7 }, { name: 'Lokal Takror', col: 8 }, { name: 'Lokasi Diniyyah', col: 9 },
    { name: 'Blok', col: 10 }
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
    { name: 'Wali Kelas', col: 6 }, { name: 'Domisili', col: 7 },
    { name: 'Blok', col: 10 }
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

  $(document).on('change', '.filter-cb-formasi', function () {
    $('#in_f_' + $(this).val()).prop('disabled', !this.checked).val('');
  });
}

export function checkAllHideFormasi(status) {
  $('.hide-cb-formasi').prop('checked', status);
}

export function applyHideColumnsFormasi() {
  if (!store.dtFormasi) return;
  for (let i = 1; i <= 10; i++) store.dtFormasi.column(i).visible(true, false);
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
        <th>Blok</th>
        <th class="text-center">Aksi</th>
      </tr>
    </thead>
    <tbody id="tableBodyFormasi"></tbody>
  `);

  let html = '';
  data.forEach(f => {
    let badgeUg = f.is_unggulan ? '<span class="badge bg-warning text-dark border ms-2 shadow-sm"><i class="bi bi-star-fill"></i> Unggulan</span>' : '';
    let genderB = f.pa_pi === 'PA' ? '<span class="text-primary fw-bold">PA</span>' : '<span class="text-danger fw-bold">PI</span>';

    // Sinkronisasi Wali Kelas & Jumlah Santri
    const syncInfo = getWaliKelasSyncInfo(f);
    const jmlSantri = getSantriInFormasi(f).length;
    const kapasitasMaks = f.kapasitas_maksimal || 80;
    const kapasitasBadge = `<span class="badge ${jmlSantri >= kapasitasMaks ? 'bg-danger text-white' : 'bg-success text-white'}">${jmlSantri} / ${kapasitasMaks} Santri</span>`;
// Kolom Blok mandiri (tidak sinkron dengan Asatidz / Santri)
    const blokMandiri = f.blok || '-';

    // Gabungkan thumbnail foto + nama lokasi dalam satu kolom
    const takrorCellHtml = buildLokasiWithFotoHtml(
      syncInfo.lokasiTakror,
      syncInfo.fotoTakror,
      `Lokal Takror (${f.din_kls} ${f.din_bag} ${f.tingkat}): ${syncInfo.lokasiTakror}`
    );
    const diniyyahCellHtml = buildLokasiWithFotoHtml(
      syncInfo.lokasiDiniyyah,
      syncInfo.fotoDiniyyah,
      `Lokasi Diniyyah (${f.din_kls} ${f.din_bag} ${f.tingkat}): ${syncInfo.lokasiDiniyyah}`
    );

    html += `
    <tr style="cursor: pointer;">
      <td class="text-center" onclick="event.stopPropagation();"><input type="checkbox" class="row-check-formasi form-check-input" value="${f.id}"></td>
      <td class="fw-bold row-klik-formasi" data-id="${f.id}">${f.tingkat}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${f.din_kls}</td>
      <td class="fw-bold row-klik-formasi" data-id="${f.id}">${f.din_bag} ${badgeUg}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${genderB}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${kapasitasBadge}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${syncInfo.waliKelasHtml}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${syncInfo.domisili}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${takrorCellHtml}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${diniyyahCellHtml}</td>
      <td class="row-klik-formasi" data-id="${f.id}">${blokMandiri}</td>
      <td class="text-center" onclick="event.stopPropagation();">
        <button class="btn btn-sm btn-outline-warning border-0" onclick="window.editFormasi('${f.id}')" title="Edit"><i class="bi bi-pencil-square"></i></button>
        <button class="btn btn-sm btn-outline-danger border-0" onclick="window.hapusFormasi('${f.id}')" title="Hapus"><i class="bi bi-trash"></i></button>
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
      { searchable: false, orderable: false, targets: [0, 11] }
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

  $('#dataTableFormasi tbody').off('click', '.row-klik-formasi').on('click', '.row-klik-formasi', function () {
    showDetailFormasi($(this).data('id'));
  });

  $('#checkAllFormasi').on('change', function () {
    $('.row-check-formasi').prop('checked', this.checked);
  });
}

export function openAddFormasiModal() {
  populateMustahiqDatalist();
  document.getElementById('formasiForm').reset();
  document.getElementById('f_id').value = '';
  document.getElementById('f_kapasitas_maksimal').value = 80;
  hapusFotoFormasi('takror');
  hapusFotoFormasi('diniyyah');
  document.querySelector('#formasiModal .modal-title').innerHTML = '<i class="bi bi-building-add me-2"></i> Formasi Kelas Baru';
  $('#formasiModal').modal('show');
}

export async function submitFormasiData(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitFormasi');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';

  const form = e.target;
  const inputKapasitas = parseInt(form.f_kapasitas_maksimal.value, 10) || 80;
  const payload = {
    tingkat: form.f_tingkat.value,
    din_kls: form.f_din_kls.value,
    din_bag: form.f_din_bag.value,
    pa_pi: form.f_pa_pi.value,
    is_unggulan: form.f_is_unggulan.checked,
    kapasitas_maksimal: Math.min(Math.max(inputKapasitas, 1), 80),
    id_mustahiq: form.f_id_mustahiq.value,
    domisili: form.f_domisili.value,
    lokasi_takror: form.f_lokasi_takror.value,
    lokasi_diniyyah: form.f_lokasi_diniyyah.value,
    blok: form.f_blok ? form.f_blok.value : '',
    foto_takror: form.f_foto_takror ? form.f_foto_takror.value : '',
    foto_diniyyah: form.f_foto_diniyyah ? form.f_foto_diniyyah.value : ''
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

  const syncInfo = getWaliKelasSyncInfo(f);
  const daftarSantri = getSantriInFormasi(f);

  // Render baris tabel daftar santri
  let rowsSantriHtml = '';
  if (daftarSantri.length === 0) {
    rowsSantriHtml = `
      <tr>
        <td colspan="5" class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-3 d-block mb-1"></i>
          Belum ada santri yang terdaftar di kelas <strong>${f.din_kls} ${f.din_bag} ${f.tingkat} (${f.pa_pi})</strong>.
        </td>
      </tr>`;
  } else {
    daftarSantri.forEach((s, idx) => {
      rowsSantriHtml += `
        <tr class="santri-formasi-row">
          <td class="text-center">${idx + 1}</td>
          <td class="fw-bold text-secondary">${s.no_induk}</td>
          <td class="fw-bold text-dark">${s.nama}</td>
          <td>${s.domisiliKamar}</td>
          <td>${s.formal}</td>
        </tr>`;
    });
  }

  let html = `
<!-- Kartu Informasi Formasi & Wali Kelas -->
  <div class="bg-white p-3 rounded shadow-sm border mb-3">
    <h6 class="text-success fw-bold border-bottom pb-2 mb-3">
      <i class="bi bi-info-circle-fill me-1"></i> Informasi Kelas & Wali Kelas
    </h6>
    <div class="row g-2">
      <div class="col-md-6">
        <div class="row mb-2"><div class="col-5 text-muted">Tingkat</div><div class="col-7 fw-bold">: ${f.tingkat}</div></div>
        <div class="row mb-2"><div class="col-5 text-muted">Kelas / Bagian</div><div class="col-7 fw-bold">: ${f.din_kls} - ${f.din_bag} ${f.is_unggulan ? '<span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i> Unggulan</span>' : ''}</div></div>
        <div class="row mb-2"><div class="col-5 text-muted">Gender</div><div class="col-7 fw-bold">: ${f.pa_pi === 'PA' ? 'PA (Putra)' : 'PI (Putri)'}</div></div>
        <div class="row mb-2"><div class="col-5 text-muted">Kapasitas</div><div class="col-7 fw-bold">: <span class="badge bg-success">${daftarSantri.length} / ${f.kapasitas_maksimal || 80} Santri</span></div></div>
      </div>
      <div class="col-md-6">
        <div class="row mb-2"><div class="col-5 text-muted">Wali Kelas</div><div class="col-7 d-flex align-items-start gap-1">: <div>${syncInfo.waliKelasHtml}</div></div></div>
        <div class="row mb-2"><div class="col-5 text-muted">Domisili</div><div class="col-7 fw-bold">: ${syncInfo.domisili}</div></div>
        <div class="row mb-2 align-items-center"><div class="col-5 text-muted">Lokal Takror</div><div class="col-7 fw-bold d-flex align-items-center gap-1">: ${buildLokasiWithFotoHtml(syncInfo.lokasiTakror, syncInfo.fotoTakror, 'Foto Lokal Takror: ' + syncInfo.lokasiTakror)}</div></div>
        <div class="row mb-2 align-items-center"><div class="col-5 text-muted">Lokasi Diniyyah</div><div class="col-7 fw-bold d-flex align-items-center gap-1">: ${buildLokasiWithFotoHtml(syncInfo.lokasiDiniyyah, syncInfo.fotoDiniyyah, 'Foto Lokasi Diniyyah: ' + syncInfo.lokasiDiniyyah)}</div></div>
        <div class="row mb-2"><div class="col-5 text-muted">Blok</div><div class="col-7 fw-bold">: ${f.blok || '-'}</div></div>
      </div>
    </div>
  </div>

  <!-- Kartu Daftar Santri di Kelas Ini -->
  <div class="bg-white p-3 rounded shadow-sm border">
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 border-bottom pb-2 mb-3">
      <h6 class="text-success fw-bold m-0">
        <i class="bi bi-people-fill me-1"></i> Daftar Santri Kelas ${f.din_kls} ${f.din_bag} ${f.tingkat}
        <span class="badge bg-success ms-1">${daftarSantri.length} Santri</span>
      </h6>
      <input type="text" id="searchSantriFormasiInput" class="form-control form-control-sm" style="max-width: 240px;" placeholder="Cari nama / NIS / kamar..." oninput="window.filterSantriDiModalFormasi(this.value)">
    </div>

    <div class="table-responsive" style="max-height: 340px; overflow-y: auto;">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead class="table-light sticky-top">
          <tr>
            <th class="text-center" style="width: 45px;">No</th>
            <th style="width: 110px;">No. Induk</th>
            <th>Nama Lengkap Santri</th>
            <th>Domisili Kamar</th>
            <th>Sekolah Formal</th>
          </tr>
        </thead>
        <tbody id="tbodySantriFormasiDetail">
          ${rowsSantriHtml}
        </tbody>
      </table>
    </div>
  </div>`;

  document.getElementById('detailFormasiContent').innerHTML = html;

  document.getElementById('btnHapusDetailFormasi').onclick = function () {
    $('#detailFormasiModal').modal('hide');
    hapusFormasi(f.id);
  };
  document.getElementById('btnEditDetailFormasi').onclick = function () {
    $('#detailFormasiModal').modal('hide');
    editFormasi(f.id);
  };

  $('#detailFormasiModal').modal('show');
}

export function filterSantriDiModalFormasi(keyword) {
  const q = String(keyword || '').toLowerCase();
  const rows = document.querySelectorAll('#tbodySantriFormasiDetail .santri-formasi-row');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

export function editFormasi(id) {
  let f = store.globalDataFormasi.find(x => String(x.id) === String(id));
  if (!f) return;

  populateMustahiqDatalist();
  const syncInfo = getWaliKelasSyncInfo(f);

  const form = document.getElementById('formasiForm');
  form.f_id.value = f.id;
  form.f_tingkat.value = f.tingkat;
  form.f_din_kls.value = f.din_kls;
  form.f_din_bag.value = f.din_bag;
  form.f_pa_pi.value = f.pa_pi;
  form.f_is_unggulan.checked = f.is_unggulan;
  form.f_kapasitas_maksimal.value = f.kapasitas_maksimal || 80;
  form.f_id_mustahiq.value = f.id_mustahiq || (syncInfo.matchedAsatidz[0]?.nama_asatidz || '');
  form.f_domisili.value = f.domisili || '';
  form.f_lokasi_takror.value = f.lokasi_takror || '';
  form.f_lokasi_diniyyah.value = f.lokasi_diniyyah || '';
  if (form.f_blok) form.f_blok.value = f.blok || '';

  setPreviewFotoFormasi('takror', f.foto_takror || '');
  setPreviewFotoFormasi('diniyyah', f.foto_diniyyah || '');

  document.querySelector('#formasiModal .modal-title').innerHTML = '<i class="bi bi-pencil-square me-2"></i> Edit Formasi Kelas';
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
