(() => {
  const $ = (id) => document.getElementById(id);
  const input = $('pdfInput');
  const dropArea = $('dropArea');
  const createBtn = $('createBtn');
  const status = $('status');
  const uploadPanel = $('uploadPanel');
  const readerSection = $('readerSection');
  const bookElement = $('book');
  let selectedFile = null;
  let pageFlip = null;
  let pdfBytes = null;
  let pageCount = 0;
  let pdfDocument = null;
  let pageAspectRatio = 1.414;
  let resizeTimer = null;

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function selectFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      selectedFile = null;
      createBtn.disabled = true;
      $('fileName').textContent = 'Please select a PDF file.';
      setStatus('That file does not appear to be a PDF.', true);
      return;
    }
    selectedFile = file;
    $('fileName').textContent = file.name;
    createBtn.disabled = false;
    setStatus('PDF selected. Click “Create flipbook” to begin.');
  }

  input.addEventListener('change', () => selectFile(input.files && input.files[0]));
  dropArea.addEventListener('dragover', (event) => { event.preventDefault(); dropArea.classList.add('dragging'); });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragging'));
  dropArea.addEventListener('drop', (event) => {
    event.preventDefault(); dropArea.classList.remove('dragging');
    selectFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  createBtn.addEventListener('click', createFlipbook);

  async function createFlipbook() {
    if (!selectedFile) return;
    if (!window.pdfjsLib || !window.St || !window.St.PageFlip) {
      setStatus('Could not load the viewer libraries. Check your internet connection and refresh.', true);
      return;
    }
    createBtn.disabled = true;
    setStatus('Reading PDF…');
    try {
      pdfBytes = await selectedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) }).promise;
      pdfDocument = pdf;
      pageCount = pdf.numPages;
      bookElement.innerHTML = '';
      if (pageFlip) { try { pageFlip.destroy(); } catch (_) {} pageFlip = null; }
      const pages = [];
      const first = await pdf.getPage(1);
      const firstViewport = first.getViewport({ scale: 1 });
      pageAspectRatio = firstViewport.height / firstViewport.width;
      const dimensions = calculatePageDimensions();
      const pageWidth = dimensions.width;
      const pageHeight = dimensions.height;
      for (let number = 1; number <= pageCount; number++) {
        setStatus(`Rendering page ${number} of ${pageCount}…`);
        const page = await pdf.getPage(number);
        const original = page.getViewport({ scale: 1 });
        const scale = pageWidth / original.width;
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(3, Math.max(1.5, window.devicePixelRatio || 1));
        const renderViewport = page.getViewport({ scale: scale * pixelRatio });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false });
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: renderViewport }).promise;
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.appendChild(canvas);
        pages.push(pageDiv);
      }
      bookElement.style.width = `${pageWidth}px`;
      bookElement.style.height = `${pageHeight}px`;
      pages.forEach(page => bookElement.appendChild(page));
      pageFlip = makePageFlip(pageWidth, pageHeight);
      pageFlip.loadFromHTML(bookElement.querySelectorAll('.page'));
      pageFlip.on('flip', (event) => updatePage(event.data));
      $('documentTitle').textContent = selectedFile.name;
      uploadPanel.hidden = true;
      readerSection.hidden = false;
      updatePage(0);
      setStatus('Flipbook ready. Enjoy reading!');
      readerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error(error);
      setStatus('Unable to open this PDF. It may be damaged, password-protected, or too large for this device.', true);
    } finally {
      createBtn.disabled = !selectedFile;
    }
  }

  function calculatePageDimensions() {
    const stage = $('bookStage');
    const availableWidth = Math.max(260, stage.clientWidth - 28);
    const isFullscreen = Boolean(document.fullscreenElement);
    const availableHeight = Math.max(300, window.innerHeight - (isFullscreen ? 190 : 250));
    // PageFlip's width/height are per page. Keep the PDF's true aspect ratio
    // and size the page to fit both the stage width and the visible height.
    const maxPageWidth = availableWidth > 700 ? Math.min(540, availableWidth / 2) : availableWidth;
    const width = Math.max(180, Math.floor(Math.min(maxPageWidth, availableHeight / pageAspectRatio)));
    return { width, height: Math.max(1, Math.floor(width * pageAspectRatio)) };
  }

  function makePageFlip(width, height) {
    return new St.PageFlip(bookElement, {
      width, height,
      size: 'fixed',
      minWidth: 180,
      maxWidth: 900,
      minHeight: 250,
      maxHeight: 1600,
      showCover: pageCount > 1,
      drawShadow: true,
      flippingTime: 700,
      usePortrait: true,
      startPage: 0,
      autoSize: false,
      maxShadowOpacity: 0.35,
      mobileScrollSupport: true
    });
  }

  function resizeFlipbook() {
    if (!pageFlip || !pdfDocument) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const current = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
      const dimensions = calculatePageDimensions();
      try { pageFlip.destroy(); } catch (_) {}
      bookElement.style.width = `${dimensions.width}px`;
      bookElement.style.height = `${dimensions.height}px`;
      pageFlip = makePageFlip(dimensions.width, dimensions.height);
      pageFlip.loadFromHTML(bookElement.querySelectorAll('.page'));
      pageFlip.on('flip', (event) => updatePage(event.data));
      if (current > 0) pageFlip.turnToPage(Math.min(current, pageCount - 1));
      updatePage(current);
    }, 120);
  }

  window.addEventListener('resize', resizeFlipbook);
  document.addEventListener('fullscreenchange', resizeFlipbook);

  function updatePage(index) {
    if (!pageFlip) return;
    const current = Math.min(pageCount, index + 1);
    $('pageCounter').textContent = pageCount ? `Page ${current} / ${pageCount}` : '';
    $('pageStatus').textContent = `${pageCount} page${pageCount === 1 ? '' : 's'}`;
    $('prevBtn').disabled = index <= 0;
    $('nextBtn').disabled = index >= pageCount - 1;
  }

  $('prevBtn').addEventListener('click', () => pageFlip && pageFlip.flipPrev());
  $('nextBtn').addEventListener('click', () => pageFlip && pageFlip.flipNext());
  $('newPdfBtn').addEventListener('click', () => {
    readerSection.hidden = true;
    uploadPanel.hidden = false;
    setStatus('Choose another PDF when you are ready.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('fullscreenBtn').addEventListener('click', async () => {
    const stage = $('readerSection');
    try {
      if (!document.fullscreenElement) await stage.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) { setStatus('Fullscreen is not supported by this browser.', true); }
  });
  $('downloadBtn').addEventListener('click', () => {
    if (!pdfBytes || !selectedFile) return;
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = selectedFile.name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
