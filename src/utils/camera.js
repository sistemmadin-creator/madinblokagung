// =========================================================
// MODUL INPUT, KOMPRESI & PREVIEW FOTO (SANTRI & ASATIDZ)
// =========================================================
export function compressImageFileSantri(file, maxDim = 600, quality = 0.75) {
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

async function getCameraStreamSafe() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
  } catch (e) {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

function restoreBootstrapModalScroll() {
  setTimeout(() => {
    const modalSantri = document.getElementById('inputModal');
    const modalAsatidz = document.getElementById('inputModalAsatidz');
    if (modalSantri && modalSantri.classList.contains('show')) {
      document.body.classList.add('modal-open');
    }
    if (modalAsatidz && modalAsatidz.classList.contains('show')) {
      document.body.classList.add('modal-open');
    }
  }, 100);
}

// --- A. FOTO SANTRI ---
export function setPreviewFotoSantri(dataUrl) {
  const inputHidden = document.getElementById('foto_santri');
  const previewImg = document.getElementById('preview_foto_santri');
  const placeholder = document.getElementById('placeholder_foto_santri');
  const btnHapus = document.getElementById('btnHapusFotoSantri');
  const statusEl = document.getElementById('statusFotoSantri');

  if (!inputHidden || !previewImg || !placeholder) return;

  if (dataUrl && String(dataUrl).trim() !== '') {
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

export async function handleFotoSantriSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire('Format Tidak Didukung', 'Pilih file berupa gambar (JPG/PNG/WEBP).', 'warning');
    event.target.value = '';
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

export function hapusFotoSantri() {
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

export async function bukaKameraSantri() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('inputCameraFotoSantri').click();
    return;
  }

  let stream = null;
  try {
    stream = await getCameraStreamSafe();
  } catch (err) {
    document.getElementById('inputCameraFotoSantri').click();
    return;
  }

  try {
    const result = await Swal.fire({
      title: 'Ambil Foto Santri',
      html: `
        <div class="d-flex flex-column align-items-center">
          <video id="webcamVideoSantri" autoplay playsinline muted style="width: 100%; max-width: 360px; border-radius: 12px; background: #000;"></video>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '<i class="bi bi-camera-fill me-1"></i> Ambil Foto',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#0f766e',
      didOpen: () => {
        const videoEl = document.getElementById('webcamVideoSantri');
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch(() => {});
        }
      },
      preConfirm: () => {
        const videoEl = document.getElementById('webcamVideoSantri');
        if (!videoEl) return null;
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let w = videoEl.videoWidth || 640;
        let h = videoEl.videoHeight || 480;
        if (w > h && w > maxDim) {
          h = Math.round(h * (maxDim / w));
          w = maxDim;
        } else if (h >= w && h > maxDim) {
          w = Math.round(w * (maxDim / h));
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.75);
      },
      willClose: () => {
        if (stream) stream.getTracks().forEach(track => track.stop());
        restoreBootstrapModalScroll();
      }
    });

    if (result.isConfirmed && result.value) {
      setPreviewFotoSantri(result.value);
    }
  } catch (err) {
    if (stream) stream.getTracks().forEach(track => track.stop());
    restoreBootstrapModalScroll();
  }
}

export function lihatFotoSantri(url, namaSantri) {
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

// --- B. FOTO ASATIDZ ---
export function setPreviewFotoAsatidz(dataUrl) {
  const hidden = document.getElementById('foto_asatidz');
  const preview = document.getElementById('preview_foto_asatidz');
  const placeholder = document.getElementById('placeholder_foto_asatidz');
  const btnHapus = document.getElementById('btnHapusFotoAsatidz');
  const statusEl = document.getElementById('statusFotoAsatidz');

  if (!hidden || !preview || !placeholder) return;

  if (dataUrl && String(dataUrl).trim() !== '') {
    hidden.value = dataUrl;
    preview.src = dataUrl;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    if (btnHapus) btnHapus.classList.remove('d-none');
    if (statusEl) statusEl.innerHTML = '<span class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i> Foto siap disimpan.</span>';
  } else {
    hapusFotoAsatidz();
  }
}

export async function handleFotoAsatidzSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire('Format Tidak Didukung', 'Pilih file berupa gambar (JPG/PNG/WEBP).', 'warning');
    event.target.value = '';
    return;
  }

  const statusEl = document.getElementById('statusFotoAsatidz');
  if (statusEl) {
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm text-success me-1"></span> Mengompres & menyiapkan foto...';
  }

  try {
    const compressedBase64 = await compressImageFileSantri(file, 600, 0.75);
    setPreviewFotoAsatidz(compressedBase64);
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.innerHTML = '<span class="text-danger">Gagal memproses foto.</span>';
  }

  event.target.value = '';
}

export function hapusFotoAsatidz() {
  const hidden = document.getElementById('foto_asatidz');
  const preview = document.getElementById('preview_foto_asatidz');
  const placeholder = document.getElementById('placeholder_foto_asatidz');
  const btnHapus = document.getElementById('btnHapusFotoAsatidz');
  const statusEl = document.getElementById('statusFotoAsatidz');

  if (hidden) hidden.value = '';
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'flex';
  if (btnHapus) btnHapus.classList.add('d-none');
  if (statusEl) statusEl.innerText = 'Belum ada foto dipilih (Otomatis dikompresi agar ringan).';
}

export async function bukaKameraAsatidz() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('inputCameraFotoAsatidz').click();
    return;
  }

  let stream = null;
  try {
    stream = await getCameraStreamSafe();
  } catch (err) {
    document.getElementById('inputCameraFotoAsatidz').click();
    return;
  }

  try {
    const result = await Swal.fire({
      title: 'Ambil Foto Asatidz',
      html: `
        <div class="d-flex flex-column align-items-center">
          <video id="webcamVideoAsatidz" autoplay playsinline muted style="width:100%;max-width:360px;border-radius:12px;background:#000;"></video>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '<i class="bi bi-camera-fill me-1"></i> Ambil Foto',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#0f766e',
      didOpen: () => {
        const videoEl = document.getElementById('webcamVideoAsatidz');
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch(() => {});
        }
      },
      preConfirm: () => {
        const videoEl = document.getElementById('webcamVideoAsatidz');
        if (!videoEl) return null;
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let w = videoEl.videoWidth || 640;
        let h = videoEl.videoHeight || 480;
        if (w > h && w > maxDim) {
          h = Math.round(h * (maxDim / w));
          w = maxDim;
        } else if (h >= w && h > maxDim) {
          w = Math.round(w * (maxDim / h));
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.75);
      },
      willClose: () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        restoreBootstrapModalScroll();
      }
    });

    if (result.isConfirmed && result.value) {
      setPreviewFotoAsatidz(result.value);
    }
  } catch (err) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    restoreBootstrapModalScroll();
  }
}

export function lihatFotoAsatidz(url) {
  if (!url) return;
  Swal.fire({
    imageUrl: url,
    imageAlt: 'Foto Asatidz',
    showConfirmButton: true,
    confirmButtonText: 'Tutup',
    confirmButtonColor: '#0f766e'
  });
}
