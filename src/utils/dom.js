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
