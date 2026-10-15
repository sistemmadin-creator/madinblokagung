import { store } from '../state/store.js';

// =========================================================
// UTILITAS DOM, SELECT DROPDOWN, TABEL & NAVIGASI HALAMAN
// =========================================================

export function forceSetSelect(selectElement, value) {
  if (!selectElement) return;
  if (!value) {
    selectElement.value = '';
    return;
  }
  let exists = Array.from(selectElement.options).some(opt => opt.value === String(value));
  if (!exists) {
    selectElement.add(new Option(value, value));
  }
  selectElement.value = value;
}

export function populateSelect(id, optionsArray) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = '<option value="">Pilih</option>';
  if (!optionsArray || optionsArray.length === 0) {
    select.disabled = true;
    return;
  }
  select.disabled = false;
  optionsArray.forEach(opt => {
    select.add(new Option(opt, opt));
  });
}

export function resetSelects(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = '<option value="">Pilih</option>';
      el.disabled = true;
    }
  });
}

export function selaraskanSemuaTabel() {
  setTimeout(() => {
    if (store.dataTable) store.dataTable.columns.adjust();
    if (store.dtFormasi) store.dtFormasi.columns.adjust();
    if (store.dataTableAsatidz) store.dataTableAsatidz.columns.adjust();
  }, 260);
}

export function toggleSidebar() {
  const sidebar = document.getElementById('desktopSidebar');
  if (sidebar) sidebar.classList.toggle('close');
  selaraskanSemuaTabel();
}

export function handleClickMenuFormasi(e) {
  if (e) e.preventDefault();
  const submenu = document.getElementById('submenu-desk-formasi');
  const arrow = document.getElementById('arrow-submenu-formasi');
  if (submenu) {
    submenu.classList.toggle('open');
    if (arrow) arrow.classList.toggle('rotated', submenu.classList.contains('open'));
  }
  window.showPage('formasi');
}

export function showPage(page, loadFormasiCallback) {
  const pageSantri = document.getElementById('page-santri');
  const pageFormasi = document.getElementById('page-formasi');
  const pageFormasiGender = document.getElementById('page-formasi-gender');
  const pageAsatidz = document.getElementById('page-asatidz');

  if (pageSantri) pageSantri.style.display = 'none';
  if (pageFormasi) pageFormasi.style.display = 'none';
  if (pageFormasiGender) pageFormasiGender.style.display = 'none';
  if (pageAsatidz) pageAsatidz.style.display = 'none';

  document.querySelectorAll('#desktopSidebar .nav-link, .bottom-nav .nav-link').forEach(el => {
    el.classList.remove('active');
  });

  const submenu = document.getElementById('submenu-desk-formasi');
  const arrow = document.getElementById('arrow-submenu-formasi');

  if (page === 'santri') {
    if (pageSantri) pageSantri.style.display = 'block';
    document.getElementById('nav-desk-santri')?.classList.add('active');
    document.getElementById('nav-mob-santri')?.classList.add('active');
  } else if (page === 'formasi') {
    if (pageFormasi) pageFormasi.style.display = 'block';
    document.getElementById('nav-desk-formasi')?.classList.add('active');
    document.getElementById('nav-mob-formasi')?.classList.add('active');
    if (submenu) submenu.classList.add('open');
    if (arrow) arrow.classList.add('rotated');
    if (typeof loadFormasiCallback === 'function') loadFormasiCallback();
  } else if (page === 'formasi-pa' || page === 'formasi-pi') {
    if (pageFormasiGender) pageFormasiGender.style.display = 'block';
    document.getElementById('nav-desk-formasi')?.classList.add('active');
    document.getElementById(page === 'formasi-pa' ? 'nav-desk-formasi-pa' : 'nav-desk-formasi-pi')?.classList.add('active');
    document.getElementById('nav-mob-formasi')?.classList.add('active');
    if (submenu) submenu.classList.add('open');
    if (arrow) arrow.classList.add('rotated');
    const gender = page === 'formasi-pa' ? 'PA' : 'PI';
    if (typeof window.openFormasiGenderView === 'function') {
      window.openFormasiGenderView(gender);
    }
  } else if (page === 'asatidz') {
    if (pageAsatidz) pageAsatidz.style.display = 'block';
    document.getElementById('nav-desk-asatidz')?.classList.add('active');
    document.getElementById('nav-mob-asatidz')?.classList.add('active');
  }

  selaraskanSemuaTabel();
}

export function actionLogout() {
  Swal.fire({
    title: 'Keluar Aplikasi?',
    text: 'Sesi Anda akan diakhiri.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Ya, Keluar',
    cancelButtonText: 'Batal'
  }).then((res) => {
    if (res.isConfirmed) {
      localStorage.removeItem('madin_user');
      window.location.reload();
    }
  });
}

export function initLayoutObservers() {
  window.addEventListener('resize', () => {
    selaraskanSemuaTabel();
  });

  const mainContent = document.querySelector('.main-content');
  if (mainContent && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      selaraskanSemuaTabel();
    });
    ro.observe(mainContent);
  }

  const sidebar = document.getElementById('desktopSidebar');
  if (sidebar) {
    sidebar.addEventListener('mouseenter', () => {
      sidebar.classList.remove('close');
      selaraskanSemuaTabel();
    });
    sidebar.addEventListener('mouseleave', () => {
      sidebar.classList.add('close');
      selaraskanSemuaTabel();
    });
  }
}
