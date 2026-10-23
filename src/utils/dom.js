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
  if (store.dataTableRiwayatAbsensi && $('#page-absensi').is(':visible') && $('#pills-riwayat').is(':visible')) {
    store.dataTableRiwayatAbsensi.columns.adjust();
  }
  if (store.dataTableRekapAbsensi && $('#page-rekap-absensi').is(':visible')) {
    store.dataTableRekapAbsensi.columns.adjust();
  }
  if (store.dataTableMuhafadzoh && $('#page-setoran').is(':visible')) {
    store.dataTableMuhafadzoh.columns.adjust();
  }
}

export function initLayoutObservers() {
  // A. Auto-adjust saat jendela browser di-resize
  $(window).on('resize', function () {
    selaraskanSemuaTabel();
  });

  // B. Auto-adjust saat tab pill Bootstrap (seperti tab Riwayat & Rekap Data) ditampilkan
  $(document).on('shown.bs.tab', 'button[data-bs-toggle="pill"], a[data-bs-toggle="pill"]', function () {
    setTimeout(function () {
      if (store.dataTableRiwayatAbsensi && $('#pills-riwayat').is(':visible')) {
        store.dataTableRiwayatAbsensi.columns.adjust();
      }
    }, 150);
  });

  // C. Auto-adjust mendeteksi perubahan lebar layar (buka/tutup/hover sidebar)
  if (window.ResizeObserver) {
    const observerKonten = new ResizeObserver(() => {
      selaraskanSemuaTabel();
    });
    const mainEl = document.querySelector('.main-content');
    if (mainEl) observerKonten.observe(mainEl);
  }

  // D. Pastikan penyesuaian sempurna setelah animasi transisi sidebar selesai
  document.addEventListener('transitionend', function (e) {
    if (e.target && (e.target.classList.contains('main-content') || e.target.classList.contains('sidebar-overlay'))) {
      selaraskanSemuaTabel();
    }
  });

  // E. Efek Hover Auto-Open & Auto-Close Sidebar Desktop beserta Animasi Geser Konten
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

export function handleClickMenuJadwal(e) {
  if (e) e.preventDefault();
  // Menuju halaman Jadwal KBM Per Kelas tanpa menutup sidebar & tanpa mengubah status dropdown
  window.showPage('jadwal-kbm', null, true);
}

export function toggleSubmenuJadwal(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const submenu = document.getElementById('submenu-desk-jadwal');
  const arrow = document.getElementById('arrow-submenu-jadwal');
  if (submenu) {
    const isNowOpen = submenu.classList.toggle('open');
    if (arrow) arrow.classList.toggle('rotated', isNowOpen);
  }
  // Pastikan sidebar tetap terbuka saat panah diklik
  document.body.classList.remove('sidebar-collapsed');
  document.getElementById('desktopSidebar')?.classList.remove('close');
}

export function handleClickMenuFan(e) {
  if (e) e.preventDefault();
  // Menuju halaman Daftar Fan Pelajaran tanpa menutup sidebar & tanpa mengubah status dropdown
  window.showPage('fan-pelajaran', null, true);
}

export function toggleSubmenuFan(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const submenu = document.getElementById('submenu-desk-fan');
  const arrow = document.getElementById('arrow-submenu-fan');
  if (submenu) {
    const isNowOpen = submenu.classList.toggle('open');
    if (arrow) arrow.classList.toggle('rotated', isNowOpen);
  }
  // Pastikan sidebar tetap terbuka saat panah diklik
  document.body.classList.remove('sidebar-collapsed');
  document.getElementById('desktopSidebar')?.classList.remove('close');
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
    if (isNowOpen) {
      setTimeout(() => {
        const navContainer = document.querySelector('.sidebar-overlay nav.nav');
        if (navContainer) navContainer.scrollTo({ top: navContainer.scrollHeight, behavior: 'smooth' });
      }, 150);
    }
  }
  // Pastikan sidebar tetap terbuka saat panah diklik
  document.body.classList.remove('sidebar-collapsed');
  document.getElementById('desktopSidebar')?.classList.remove('close');
}

export function showPage(page, onShowFormasi, keepSidebarOpen = false) {
  if (page === 'muhafadzoh') page = 'setoran';
  if (page === 'rekap') page = 'rekap-hafalan';

  const pageSetoran = document.getElementById('page-setoran');
  const pageRekapHafalan = document.getElementById('page-rekap-hafalan');
  const pageSantri = document.getElementById('page-santri');
  const pageFormasi = document.getElementById('page-formasi');
  const pageFormasiGender = document.getElementById('page-formasi-gender');
  const pageAsatidz = document.getElementById('page-asatidz');
  const pageAbsensi = document.getElementById('page-absensi');
  const pageRekapAbsensi = document.getElementById('page-rekap-absensi');
  const pageAbsenCepat = document.getElementById('page-absen-cepat');
  const pageDaftarPendidik = document.getElementById('page-daftar-pendidik');
  const pageFanPelajaran = document.getElementById('page-fan-pelajaran');
  const pagePengajarFan = document.getElementById('page-pengajar-fan');
  const pageJadwalKbm = document.getElementById('page-jadwal-kbm');
  const pageHariKbm = document.getElementById('page-hari-kbm');
  const pagePiagam = document.getElementById('page-piagam');

  if (pageSetoran) pageSetoran.style.display = (page === 'setoran') ? 'block' : 'none';
  if (pageRekapHafalan) pageRekapHafalan.style.display = (page === 'rekap-hafalan') ? 'block' : 'none';
  if (pageSantri) pageSantri.style.display = (page === 'santri') ? 'block' : 'none';
  if (pageFormasi) pageFormasi.style.display = (page === 'formasi') ? 'block' : 'none';
  if (pageFormasiGender) pageFormasiGender.style.display = (page === 'formasi-pa' || page === 'formasi-pi') ? 'block' : 'none';
  if (pageAsatidz) pageAsatidz.style.display = (page === 'asatidz') ? 'block' : 'none';
  if (pageAbsensi) pageAbsensi.style.display = (page === 'absensi') ? 'block' : 'none';
  if (pageRekapAbsensi) pageRekapAbsensi.style.display = (page === 'rekap-absensi') ? 'block' : 'none';
  if (pageAbsenCepat) pageAbsenCepat.style.display = (page === 'absen-cepat') ? 'block' : 'none';
  if (pageDaftarPendidik) pageDaftarPendidik.style.display = (page === 'daftar-pendidik') ? 'block' : 'none';
  if (pageFanPelajaran) pageFanPelajaran.style.display = (page === 'fan-pelajaran') ? 'block' : 'none';
  if (pagePengajarFan) pagePengajarFan.style.display = (page === 'pengajar-fan') ? 'block' : 'none';
  if (pageJadwalKbm) pageJadwalKbm.style.display = (page === 'jadwal-kbm') ? 'block' : 'none';
  if (pageHariKbm) pageHariKbm.style.display = (page === 'hari-kbm') ? 'block' : 'none';
  if (pagePiagam) pagePiagam.style.display = (page === 'piagam') ? 'block' : 'none';

  document.querySelectorAll('.sidebar-overlay .nav-link, .bottom-nav .nav-link').forEach(el => el.classList.remove('active'));

  const submenuFormasi = document.getElementById('submenu-desk-formasi');
  const arrowFormasi = document.getElementById('arrow-submenu-formasi');
  const submenuFan = document.getElementById('submenu-desk-fan');
  const arrowFan = document.getElementById('arrow-submenu-fan');
  const submenuJadwal = document.getElementById('submenu-desk-jadwal');
  const arrowJadwal = document.getElementById('arrow-submenu-jadwal');

  if (page === 'formasi-pa' || page === 'formasi-pi') {
    document.getElementById('nav-desk-formasi')?.classList.add('active');
    document.getElementById(page === 'formasi-pa' ? 'nav-desk-formasi-pa' : 'nav-desk-formasi-pi')?.classList.add('active');
    document.getElementById('nav-mob-formasi')?.classList.add('active');
    if (submenuFormasi) submenuFormasi.classList.add('open');
    if (arrowFormasi) arrowFormasi.classList.add('rotated');
    setTimeout(() => {
      const navContainer = document.querySelector('.sidebar-overlay nav.nav');
      if (navContainer) navContainer.scrollTo({ top: navContainer.scrollHeight, behavior: 'smooth' });
    }, 150);
    const gender = page === 'formasi-pa' ? 'PA' : 'PI';
    if (typeof window.openFormasiGenderView === 'function') {
      window.openFormasiGenderView(gender);
    }
  } else if (page === 'fan-pelajaran' || page === 'pengajar-fan') {
    document.getElementById('nav-desk-fan')?.classList.add('active');
    document.getElementById('nav-desk-' + page)?.classList.add('active');
    document.getElementById('nav-mob-fan')?.classList.add('active');
    if (!keepSidebarOpen) {
      if (submenuFan) submenuFan.classList.add('open');
      if (arrowFan) arrowFan.classList.add('rotated');
    }
    if (page === 'fan-pelajaran' && typeof window.renderFanPelajaran === 'function') {
      window.renderFanPelajaran();
    } else if (page === 'pengajar-fan' && typeof window.renderTabelPengajarFan === 'function') {
      window.renderTabelPengajarFan();
    }
  } else if (page === 'jadwal-kbm' || page === 'hari-kbm') {
    document.getElementById('nav-desk-jadwal')?.classList.add('active');
    document.getElementById('nav-desk-' + page)?.classList.add('active');
    document.getElementById('nav-mob-jadwal')?.classList.add('active');
    if (!keepSidebarOpen) {
      if (submenuJadwal) submenuJadwal.classList.add('open');
      if (arrowJadwal) arrowJadwal.classList.add('rotated');
    }
    if (page === 'jadwal-kbm' && typeof window.renderJadwalKBM === 'function') {
      window.renderJadwalKBM();
    } else if (page === 'hari-kbm' && typeof window.inisialisasiHalamanHariKBM === 'function') {
      window.inisialisasiHalamanHariKBM();
    }
  } else {
    const deskActive = document.getElementById('nav-desk-' + page);
    const mobActive = document.getElementById('nav-mob-' + page);
    if (deskActive) deskActive.classList.add('active');
    if (mobActive) mobActive.classList.add('active');

    if (page === 'setoran') {
      if (typeof window.inisialisasiHalamanSetoran === 'function') {
        window.inisialisasiHalamanSetoran();
      }
    } else if (page === 'rekap-hafalan') {
      if (typeof window.loadRekapData === 'function') {
        window.loadRekapData();
      }
    } else if (page === 'formasi') {
      if (typeof onShowFormasi === 'function') {
        onShowFormasi();
      } else if (typeof window.loadFormasiData === 'function') {
        window.loadFormasiData();
      }
    } else if (page === 'absensi') {
      if (typeof window.inisialisasiHalamanAbsensi === 'function') {
        window.inisialisasiHalamanAbsensi();
      }
    } else if (page === 'rekap-absensi') {
      if (typeof window.inisialisasiHalamanRekapAbsensi === 'function') {
        window.inisialisasiHalamanRekapAbsensi();
      }
    } else if (page === 'absen-cepat') {
      if (typeof window.inisialisasiHalamanAbsenCepat === 'function') {
        window.inisialisasiHalamanAbsenCepat();
      }
    } else if (page === 'daftar-pendidik') {
      if (typeof window.renderTabelDaftarPendidik === 'function') {
        window.renderTabelDaftarPendidik();
      }
    } else if (page === 'piagam') {
      if (typeof window.updateDatalistModalPiagam === 'function') {
        window.updateDatalistModalPiagam();
      }
      if (typeof window.updateZoomPiagam === 'function') {
        window.updateZoomPiagam();
      }
      if (typeof window.renderPiagamCanvas === 'function') {
        window.renderPiagamCanvas();
      }
    }
  }

  // Jangan tutup sidebar jika klik menu induk atau jika keepSidebarOpen bernilai true
  if (window.innerWidth >= 768 && !keepSidebarOpen && page !== 'formasi' && onShowFormasi !== true) {
    document.body.classList.add('sidebar-collapsed');
    document.getElementById('desktopSidebar')?.classList.add('close');
  }

  setTimeout(() => {
    if (page === 'setoran' && store.dataTableMuhafadzoh) {
      store.dataTableMuhafadzoh.columns.adjust().draw(false);
    }
    if (page === 'santri' && store.dataTable) {
      store.dataTable.columns.adjust().draw(false);
    }
    if (page === 'formasi' && store.dtFormasi) {
      store.dtFormasi.columns.adjust().draw(false);
    }
    if (page === 'asatidz' && store.dataTableAsatidz) {
      store.dataTableAsatidz.columns.adjust().draw(false);
    }
    if (page === 'absensi' && store.dataTableRiwayatAbsensi && $('#pills-riwayat').is(':visible')) {
      store.dataTableRiwayatAbsensi.columns.adjust().draw(false);
    }
    if (page === 'rekap-absensi' && store.dataTableRekapAbsensi) {
      store.dataTableRekapAbsensi.columns.adjust().draw(false);
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
