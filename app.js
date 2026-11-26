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
  let pdfDocument = null;
  let pageCount = 0;
  let pageAspectRatio = 1.414;
  let pageWidth = 0;
  let pageHeight = 0;
  let pageNodes = [];
  let renderJobs = new Map();
  let renderToken = 0;
  const MAX_CANVASES = 4;

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

  function calculatePageDimensions() {
    const stage = $('bookStage');
    const availableWidth = Math.max(260, stage.clientWidth - 24);
    const availableHeight = Math.max(320, window.innerHeight - 300);
    const maxWidth = availableWidth > 700 ? Math.min(520, availableWidth / 2) : availableWidth;
    pageWidth = Math.floor(Math.min(maxWidth, availableHeight / pageAspectRatio));
    pageWidth = Math.max(180, pageWidth);
    pageHeight = Math.floor(pageWidth * pageAspectRatio);
  }

  async function createFlipbook() {
    if (!selectedFile) return;
    if (!window.pdfjsLib || !window.St || !window.St.PageFlip) {
      setStatus('Could not load the viewer libraries. Check your internet connection and refresh.', true);
      return;
    }
    createBtn.disabled = true;
    setStatus('Opening PDF…');
    try {
      destroyViewer();
      pdfBytes = await selectedFile.arrayBuffer();
      pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) }).promise;
      pageCount = pdfDocument.numPages;
      const firstPage = await pdfDocument.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1 });
      pageAspectRatio = firstViewport.height / firstViewport.width;
      calculatePageDimensions();

      bookElement.innerHTML = '';
      pageNodes = [];
      renderJobs.clear();
      for (let i = 0; i < pageCount; i++) {
        const node = document.createElement('div');
        node.className = 'page';
        node.style.width = `${pageWidth}px`;
        node.style.height = `${pageHeight}px`;
        node.dataset.pageIndex = String(i);
        pageNodes.push(node);
        bookElement.appendChild(node);
      }
      bookElement.style.width = `${pageWidth}px`;
      bookElement.style.height = `${pageHeight}px`;

      // Render only the opening spread. Remaining pages are rendered on demand.
      await renderWindow(0, true);
      pageFlip = new St.PageFlip(bookElement, {
        width: pageWidth,
        height: pageHeight,
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
        mobileScrollSupport: true,
        useMouseEvents: true
      });
      pageFlip.loadFromHTML(bookElement.querySelectorAll('.page'));
      pageFlip.on('flip', (event) => {
        const index = Number(event.data) || 0;
        updatePage(index);
        renderWindow(index).catch(console.error);
      });

      $('documentTitle').textContent = selectedFile.name;
      uploadPanel.hidden = true;
      readerSection.hidden = false;
      updatePage(0);
      setStatus('Flipbook ready. Pages load as you read to keep your phone responsive.');
      readerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error(error);
      setStatus('Unable to open this PDF. It may be damaged, password-protected, or too large for this device.', true);
    } finally {
      createBtn.disabled = !selectedFile;
    }
  }

  async function renderPage(index, token) {
    if (index < 0 || index >= pageCount || token !== renderToken) return;
    const node = pageNodes[index];
    if (node.querySelector('canvas')) return;
    if (renderJobs.has(index)) return renderJobs.get(index);

    const job = (async () => {
      const page = await pdfDocument.getPage(index + 1);
      if (token !== renderToken) return;
      const base = page.getViewport({ scale: 1 });
      const cssScale = pageWidth / base.width;
      const cssViewport = page.getViewport({ scale: cssScale });
      // Use a moderate device pixel ratio: crisp text without allocating hundreds of large canvases.
      const pixelRatio = Math.min(2.25, Math.max(1.5, window.devicePixelRatio || 1));
      const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport: renderViewport }).promise;
      if (token !== renderToken) {
        canvas.width = 0; canvas.height = 0;
        return;
      }
      node.appendChild(canvas);
      page.cleanup();
    })().finally(() => renderJobs.delete(index));
    renderJobs.set(index, job);
    return job;
  }

  async function renderWindow(index, initial = false) {
    const token = renderToken;
    // Render current and nearby pages; do not rasterize the whole PDF into RAM.
    const wanted = [index - 1, index, index + 1, index + 2]
      .filter((n) => n >= 0 && n < pageCount);
    for (const n of wanted) {
      if (token !== renderToken) return;
      await renderPage(n, token);
    }
    const keep = new Set(wanted);
    // Release backing pixel memory from pages outside the small reading window.
    pageNodes.forEach((node, n) => {
      if (keep.has(n)) return;
      const canvas = node.querySelector('canvas');
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
        canvas.remove();
      }
    });
    if (initial) setStatus(`Prepared first pages of ${pageCount}-page PDF…`);
  }

  function destroyViewer() {
    renderToken++;
    renderJobs.clear();
    if (pageFlip) { try { pageFlip.destroy(); } catch (_) {} pageFlip = null; }
    bookElement.innerHTML = '';
    pageNodes = [];
    pdfDocument = null;
    pageCount = 0;
  }

  function updatePage(index) {
    if (!pageFlip) return;
    const current = Math.min(pageCount, index + 1);
    $('pageCounter').textContent = pageCount ? `Page ${current} / ${pageCount}` : '';
    $('pageStatus').textContent = `${pageCount} page${pageCount === 1 ? '' : 's'}`;
    $('prevBtn').disabled = index <= 0;
    $('nextBtn').disabled = index >= pageCount - 1;
  }

  $('prevBtn').addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
  });
  $('nextBtn').addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
  });
  $('newPdfBtn').addEventListener('click', () => {
    destroyViewer();
    readerSection.hidden = true;
    uploadPanel.hidden = false;
    setStatus('Choose another PDF when you are ready.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('fullscreenBtn').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await readerSection.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      setStatus('Fullscreen is not supported by this browser. Try rotating your phone or zooming the browser.', true);
    }
  });
  $('downloadBtn').addEventListener('click', () => {
    if (!pdfBytes || !selectedFile) return;
    const url = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = selectedFile.name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
