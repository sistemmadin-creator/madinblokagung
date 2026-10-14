import { API_WILAYAH } from '../lib/supabase.js';
import { resetSelects } from './dom.js';

// =========================================================
// CASCADING DROPDOWN WILAYAH INDONESIA (API EMSIFA)
// =========================================================
export function loadInitialProvinces() {
  fetch(`${API_WILAYAH}/provinces.json`)
    .then(r => r.json())
    .then(provs => {
      const provSelectSantri = document.getElementById('provinsi');
      if (provSelectSantri) {
        provSelectSantri.innerHTML = '<option value="">Pilih Provinsi</option>';
        provs.forEach(p => {
          let opt = document.createElement('option');
          opt.value = p.name;
          opt.dataset.id = p.id;
          opt.textContent = p.name;
          provSelectSantri.appendChild(opt);
        });
      }

      const provSelectAsatidz = document.getElementById('provinsi_asatidz');
      if (provSelectAsatidz) {
        provSelectAsatidz.innerHTML = '<option value="">Pilih Provinsi</option>';
        provs.forEach(p => {
          let opt = document.createElement('option');
          opt.value = p.name;
          opt.dataset.id = p.id;
          opt.textContent = p.name;
          provSelectAsatidz.appendChild(opt);
        });
      }
    })
    .catch(err => console.error('Gagal memuat provinsi:', err));
}

export function setupWilayahListeners() {
  const provEl = document.getElementById('provinsi');
  if (!provEl) return;

  provEl.addEventListener('change', function () {
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

export function setupWilayahListenersAsatidz() {
  const provEl = document.getElementById('provinsi_asatidz');
  if (!provEl) return;

  provEl.addEventListener('change', function () {
    let kabSelect = document.getElementById('kabupaten_asatidz');
    kabSelect.innerHTML = '<option value="">Memuat...</option>';
    kabSelect.disabled = true;
    resetSelects(['kecamatan_asatidz', 'desa_asatidz']);
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

  document.getElementById('kabupaten_asatidz').addEventListener('change', function () {
    let kecSelect = document.getElementById('kecamatan_asatidz');
    resetSelects(['kecamatan_asatidz', 'desa_asatidz']);
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

  document.getElementById('kecamatan_asatidz').addEventListener('change', function () {
    let desaSelect = document.getElementById('desa_asatidz');
    resetSelects(['desa_asatidz']);
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
