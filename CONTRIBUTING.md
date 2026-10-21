# Contributing to GoodConvertPDF Local

Thanks for helping improve local webpage conversion and PDF tools.

## Report a problem

Open a [GitHub issue](https://github.com/coosee108/goodconvertpdf-local/issues) with your browser and version, extension version, steps to reproduce, expected behavior, and actual behavior. Include a public example URL or a sanitized sample when possible. Remove private content from screenshots and documents. Report vulnerabilities through [SECURITY.md](SECURITY.md).

Website account, subscription, and hosted-conversion questions belong to the support options on [goodconvertpdf.com](https://goodconvertpdf.com/).

## Submit a change

1. Fork the repository and create a focused branch.
2. Edit `extension/` for extension changes or `locales/` for translated interface text. Do not edit generated files under `build/`.
3. Run `npm test` and `npm run build` with Node.js 22 or newer.
4. Load `build/` in Chrome or Edge. For conversion changes, inspect the actual PDF for missing content, selectable text, working links, and page breaks. Check cancellation and restoration of the source page when relevant.
5. Submit a pull request describing the problem, the change, and what you verified. Include before/after screenshots for UI changes.

Keep changes focused on local conversion, document tools, accessibility, browser compatibility, translations, or documentation. Preserve third-party notices when changing bundled dependencies. New contributions to project-owned code are made under the repository's [MIT License](LICENSE).

## Documentation

Keep [README.md](README.md) and [README.zh-CN.md](README.zh-CN.md) consistent when changing installation steps or capabilities. Use real product screenshots and clearly distinguish local features from hosted website services.
