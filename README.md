# PDF Flipbook

A free, static PDF-to-flipbook website. It runs in the browser and does not upload your PDF to a server.

## Run locally

1. Download or clone this folder.
2. Open `index.html` in a modern browser.
3. Select a PDF and click **Create flipbook**.

The page uses PDF.js and StPageFlip from public CDNs, so an internet connection is needed to load those libraries. The PDF itself is processed locally in your browser.

## Publish with GitHub Pages

1. Create a new repository on GitHub.
2. Upload `index.html`, `style.css`, `app.js`, and this `README.md` to the repository's root.
3. Open the repository **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.
6. Wait for GitHub Pages to publish. Your website will be available at the URL shown in the Pages section (usually `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`).

## Notes

- PDF files are not saved on the website or sent to a server.
- The flipbook is generated in the current browser session. Refreshing the page clears it.
- Very large PDFs may use substantial memory, especially on mobile devices.
- This project uses external CDN libraries. For fully offline use, download the PDF.js and StPageFlip distribution files and update the script/worker paths in `index.html` and `app.js`.
