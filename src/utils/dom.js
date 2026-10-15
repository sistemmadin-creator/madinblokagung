import { store } from '../state/store.js';

// =========================================================
// HELPER ELEMEN SELECT, NAVIGASI, SIDEBAR & RESIZE TABEL
// =========================================================
export function forceSetSelect(selectElement, value) {
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

export function populateSelect(id, optionsArray) {
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

export function resetSelects(ids) {
  ids.forEach(id => {
    let sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = '<option value="">Pilih...</option>';
      sel.disabled = true;
    }
  });
}

export function selaraskanSemuaTabel() {
  if (store.dataTable && $('#page-santri').is(':visible')) {
    store.dataTable.columns.adjust();
  }
  if (store.dtFormasi && $('#page-formasi').is(':visible')) {
    store.dtFormasi.columns.adjust();
  }
  if (store.dataTableAsatidz && $('#page-asatidz').is(':visible')) {
    store.dataTableAsatidz.columns.adjust();
  }
}

export function initLayoutObservers() {
  // A. Auto-adjust saat jendela browser di-resize
  $(window).on('resize', function () {
    selaraskanSemuaTabel();
  });

  // B. Auto-adjust mendeteksi perubahan lebar layar (buka/tutup/hover sidebar)
  if (window.ResizeObserver) {
    const observerKonten = new ResizeObserver(() => {
      selaraskanSemuaTabel();
    });
    const mainEl = document.querySelector('.main-content');
    if (mainEl) observerKonten.observe(mainEl);
  }

  // C. Pastikan penyesuaian sempurna setelah animasi transisi sidebar selesai
  document.addEventListener('transitionend', function (e) {
    if (e.target && (e.target.classList.contains('main-content') || e.target.classList.contains('sidebar-overlay'))) {
      selaraskanSemuaTabel();
    }
  });

  // D. Efek Hover Auto-Open & Auto-Close Sidebar Desktop beserta Animasi Geser Konten
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
}

export function toggleSidebar() {
  document.body.classList.toggle('sidebar-collapsed');
  document.getElementById('desktopSidebar')?.classList.toggle('close');
}

export function handleClickMenuFormasi(e) {
  if (e) e.preventDefault();
  // Hanya menuju halaman Formasi Kelas tanpa menutup sidebar & tanpa mengubah status dropdown
  window.showPage('formasi', null, true);
}

export function toggleSubmenuFormasi(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const submenu = document.getElementById('submenu-desk-formasi');
  const arrow = document.getElementById('arrow-submenu-formasi');
  if (submenu) {
    const isNowOpen = submenu.classList.toggle('open');
    if (arrow) arrow.classList.toggle('rotated', isNowOpen);
  }
  // Pastikan sidebar tetap terbuka saat panah diklik
  document.body.classList.remove('sidebar-collapsed');
  document.getElementById('desktopSidebar')?.classList.remove('close');
}

export function showPage(page, onShowFormasi, keepSidebarOpen = false) {
  const pageSantri = document.getElementById('page-santri');
  const pageFormasi = document.getElementById('page-formasi');
  const pageFormasiGender = document.getElementById('page-formasi-gender');
  const pageAsatidz = document.getElementById('page-asatidz');

  if (pageSantri) pageSantri.style.display = (page === 'santri') ? 'block' : 'none';
  if (pageFormasi) pageFormasi.style.display = (page === 'formasi') ? 'block' : 'none';
  if (pageFormasiGender) pageFormasiGender.style.display = (page === 'formasi-pa' || page === 'formasi-pi') ? 'block' : 'none';
  if (pageAsatidz) pageAsatidz.style.display = (page === 'asatidz') ? 'block' : 'none';

  document.querySelectorAll('.sidebar-overlay .nav-link, .bottom-nav .nav-link').forEach(el => el.classList.remove('active'));

  const submenu = document.getElementById('submenu-desk-formasi');
  const arrow = document.getElementById('arrow-submenu-formasi');

  if (page === 'formasi-pa' || page === 'formasi-pi') {
    document.getElementById('nav-desk-formasi')?.classList.add('active');
    document.getElementById(page === 'formasi-pa' ? 'nav-desk-formasi-pa' : 'nav-desk-formasi-pi')?.classList.add('active');
    document.getElementById('nav-mob-formasi')?.classList.add('active');
    if (submenu) submenu.classList.add('open');
    if (arrow) arrow.classList.add('rotated');
    const gender = page === 'formasi-pa' ? 'PA' : 'PI';
    if (typeof window.openFormasiGenderView === 'function') {
      window.openFormasiGenderView(gender);
    }
  } else {
    const deskActive = document.getElementById('nav-desk-' + page);
    const mobActive = document.getElementById('nav-mob-' + page);
    if (deskActive) deskActive.classList.add('active');
    if (mobActive) mobActive.classList.add('active');

    if (page === 'formasi') {
      if (typeof onShowFormasi === 'function') {
        onShowFormasi();
      } else if (typeof window.loadFormasiData === 'function') {
        window.loadFormasiData();
      }
    }
  }

  // Jangan tutup sidebar jika klik menu Formasi Kelas atau jika keepSidebarOpen bernilai true
  if (window.innerWidth >= 768 && !keepSidebarOpen && page !== 'formasi' && onShowFormasi !== true) {
    document.body.classList.add('sidebar-collapsed');
    document.getElementById('desktopSidebar')?.classList.add('close');
  }

  setTimeout(() => {
    if (page === 'santri' && store.dataTable) {
      store.dataTable.columns.adjust().draw(false);
    }
    if (page === 'formasi' && store.dtFormasi) {
      store.dtFormasi.columns.adjust().draw(false);
    }
    if (page === 'asatidz' && store.dataTableAsatidz) {
      store.dataTableAsatidz.columns.adjust().draw(false);
    }
  }, 250);
}

export function actionLogout() {
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
