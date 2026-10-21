<div align="center">

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="extension/icons/icon128.png" width="80" alt="GoodConvertPDF"></a>

# GoodConvertPDF Local

**Save webpages, articles, and selected content as PDFs. Convert documents and organize PDFs in your browser.**

Local processing · No account required · Chrome / Edge

**English** · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Source checks](https://github.com/coosee108/goodconvertpdf-local/actions/workflows/ci.yml/badge.svg)](https://github.com/coosee108/goodconvertpdf-local/actions/workflows/ci.yml)
<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Website-goodconvertpdf.com-4f46e5" alt="Official website"></a>

**<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">Visit the website ↗</a> · [Quick start](#quick-start) · [Screenshots](#screenshots) · [FAQ](#faq) · [Contribute](CONTRIBUTING.md)**

<img src="docs/screenshots/quick-save.png" width="380" alt="Extension popup with full-page, article-only, and selected-content PDF actions">

</div>

## What you can do

- **Save the page you are viewing.** Generate a PDF from an open browser tab, preview it, then open or download it.
- **Choose what to keep.** Capture the full page, extract the main article, or select content visually. Open the workspace for more control.
- **Tune the layout.** Adjust paper, orientation, margins, scale, backgrounds, and loading options. Reuse settings for a website.
- **Follow the process.** See loading and generation stages, cancel a task, or skip waiting. Review resource warnings alongside the result.
- **Convert local content.** Work with HTML, images, text, Markdown, data, and conversation content before exporting.
- **Finish your PDFs.** Merge, split, organize pages, and add text watermarks, page numbers, a cover, and metadata.
- **Reopen recent PDFs.** Default local retention is 7 days, up to 20 PDFs and 100 MB total, with retention and deletion controls.
- **Use your language.** English, Simplified Chinese, German, Spanish, French, Japanese, and Brazilian Portuguese interfaces.

Need hosted conversion of a public URL, or account and plan management? Visit **<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">GoodConvertPDF.com ↗</a>**. This repository provides the buildable local community edition; website services have their own processing behavior and terms.

## Quick start

You need **Node.js 22 or newer**, Git, and desktop Chrome or Edge.

```sh
git clone https://github.com/coosee108/goodconvertpdf-local.git
cd goodconvertpdf-local
npm test
npm run build
```

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode** and choose **Load unpacked**.
3. Select the generated **`build/`** folder and pin the extension.
4. Open a regular webpage, choose **Save current webpage**, then preview and download your PDF.

No additional `npm install` step is needed for the current build: browser dependencies are bundled in the source. After updating the code, rebuild and reload the extension from the browser's extensions page.

This build targets **Chrome and Edge**. The separate Firefox native-print implementation is not included in this community build.

## Screenshots

These screenshots were supplied by the maintainer from the extension. Labels may vary by version or language. Third-party webpages shown in the examples illustrate export behavior and do not imply an affiliation or endorsement.

### Preview and save

Open PDF, Download PDF, Download PNG, Print, and further PDF tools are available from the result area. Review the content and loading warnings: successful generation does not guarantee every lazy-loaded resource was captured.

![Generated PDF with preview and export actions](docs/screenshots/pdf-preview.png)

<details>
<summary><strong>More screenshots: selection, loading, documents, PDF tools, and recent results</strong></summary>

#### Select content on the page
![Visual content selection](docs/screenshots/select-content.png)

#### Control loading and waiting
![Generation progress with cancel and skip-waiting actions](docs/screenshots/loading.png)

#### Convert local documents
![Document editing and preview](docs/screenshots/documents.png)

#### Organize and finish PDFs
![PDF merge, split, organize, and watermark tools](docs/screenshots/pdf-tools.png)

#### Reopen recent PDFs
![Recent PDFs and local storage controls](docs/screenshots/recent-pdfs.png)

</details>

## Privacy and permissions

Local conversion does not require an account or a conversion server. Source webpages can still request their own remote images, fonts, and other resources. Official website links open a separate website.

The extension requests active-tab access, scripting, tabs, storage, downloads, and debugger permissions, along with webpage host access. These support page reading and selection, printing, settings, and result storage. Chrome / Edge webpage PDF generation uses the debugger interface, so the browser may display a debugging banner.

Recent PDFs are stored in the extension's local IndexedDB. Expired results and results over the count or size limits are removed during cleanup checks, not on a guaranteed schedule while the browser is closed. Incognito results are not persisted. Turning off automatic retention affects future results; existing results can be deleted separately.

## FAQ

**Why can some pages not be saved?** Browser settings, extension pages, and other protected pages cannot be converted. Open a regular HTTP(S) page. Existing PDFs can be processed with the PDF tools.

**Can I save a page behind a login?** You can attempt to save a page already open in your browser without giving a conversion service your login credentials. Embedded or protected content and site restrictions may still affect the result.

**Why is the debugger busy?** Close DevTools on the source tab and finish any conflicting debugging task, then retry.

**Will text be selectable?** Webpage printing generally preserves text and links; images do not automatically become text. Some local HTML / document downloads use image rendering. Follow the interface's Print option when searchable text is needed.

**What if the preview is blank?** Choose Open PDF to view the same generated file. If content is missing, review loading warnings, allow images to load, and adjust the settings before retrying.

**Do I need an account or a paid plan?** Local features do not require sign-in or website conversion credits. Hosted conversion and account plans are managed on the <a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">official website ↗</a>.

## Development and contributing

`extension/` contains the extension source, `locales/` the editable translation catalogs, and `docs/screenshots/` the product screenshots. `build/` is generated. Run `npm test` for source-boundary and asset checks, then `npm run build` to build the extension. These checks do not replace PDF quality testing in a real browser.

Contributions to conversion compatibility, accessibility, translations, and documentation are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change and [SECURITY.md](SECURITY.md) for vulnerability reporting. If the project helps you, consider starring the repository or sharing the <a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">official website ↗</a>.

## License

GoodConvertPDF-authored source is available under the **[MIT License](LICENSE)**. Bundled third-party dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `extension/vendor/licenses/`. Third-party content and marks visible in screenshots belong to their respective owners. Project names and logos must not be used to imply an unauthorized official endorsement.
