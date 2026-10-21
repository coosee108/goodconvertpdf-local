<div align="center">

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="extension/icons/icon128.png" width="80" alt="GoodConvertPDF"></a>

# GoodConvertPDF Local

**把网页、正文和选定内容保存为 PDF，在浏览器中完成文档转换与 PDF 整理。**

本地处理 · 无需登录 · Chrome / Edge

[English](README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [日本語](README.ja.md) · **简体中文**

[![MIT 许可证](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![源码检查](https://github.com/coosee108/goodconvertpdf-local/actions/workflows/ci.yml/badge.svg)](https://github.com/coosee108/goodconvertpdf-local/actions/workflows/ci.yml)
<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/官网-goodconvertpdf.com-4f46e5" alt="访问官网"></a>

**<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">访问官网 ↗</a> · [快速安装](#快速安装) · [功能截图](#功能截图) · [常见问题](#常见问题) · [参与贡献](CONTRIBUTING.md)**

<img src="docs/screenshots/quick-save.png" width="380" alt="插件弹窗：保存当前网页、只保存正文、选择内容保存">

</div>

## 为什么使用 GoodConvertPDF Local

- **保存当前网页**：直接处理已经打开的页面，生成后预览，再打开或下载 PDF。
- **保存需要的内容**：选择整页、正文识别或可视化选区；需要时进入工作台调整排版。
- **控制导出效果**：调整纸张、方向、边距、缩放、背景和加载选项，复用本站设置。
- **看得见的处理过程**：显示加载与生成阶段，可以取消或跳过等待；结果区域显示缺失资源等提示。
- **本地文档工具**：处理 HTML、图片、文本、Markdown、数据及会话内容，预览后导出。
- **整理 PDF**：合并、拆分、整理页面，并添加文字水印、页码、封面和元数据。
- **重新打开最近 PDF**：本机默认保留 7 天，最多 20 份、总计 100 MB；支持关闭自动保留与清理。
- **七种界面语言**：英语、简体中文、德语、西班牙语、法语、日语和巴西葡萄牙语。

需要在线转换公开网址，或管理账户与套餐？请访问 **<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">GoodConvertPDF 官网 ↗</a>**。本仓库提供可自行构建的本地社区版；官网服务有各自的处理方式和使用条件。

## 快速安装

需要 **Node.js 22 或更高版本**、Git，以及桌面版 Chrome 或 Edge。

```sh
git clone https://github.com/coosee108/goodconvertpdf-local.git
cd goodconvertpdf-local
npm test
npm run build
```

1. 打开 `chrome://extensions` 或 `edge://extensions`。
2. 开启「开发者模式」，点击「加载已解压的扩展程序」。
3. 选择刚生成的 **`build/`** 文件夹，将插件固定到工具栏。
4. 打开普通网页，点击插件的「保存当前网页」，完成后预览并下载。

当前构建不需要额外的 `npm install`；浏览器依赖已随源码提供。更新代码后重新运行构建，并在扩展管理页点击重新加载。

本仓库当前构建面向 **Chrome / Edge**。Firefox 原生打印方案不包含在本次社区版构建中。

## 功能截图

以下为维护者提供的插件实拍截图；不同版本和语言的文案可能略有差异。截图中的第三方网页仅用于展示导出效果，不代表合作或背书。

### 预览并保存

打开 PDF、下载 PDF、下载 PNG、打印和继续整理集中在结果区域。请同时检查页面内容与加载提示，生成成功不代表所有懒加载资源都已完整加载。

![PDF 生成结果与预览](docs/screenshots/pdf-preview.png)

<details>
<summary><strong>查看更多：选区、加载进度、文档工具、PDF 整理和最近结果</strong></summary>

#### 在网页上选择内容
![可视化选区](docs/screenshots/select-content.png)

#### 加载与等待控制
![生成进度、取消和跳过等待](docs/screenshots/loading.png)

#### 本地文档转换
![文档编辑和预览](docs/screenshots/documents.png)

#### PDF 整理
![合并、拆分、整理与水印](docs/screenshots/pdf-tools.png)

#### 最近 PDF
![最近 PDF 与本地保留控制](docs/screenshots/recent-pdfs.png)

</details>

## 隐私与权限

本地转换无需账户或转换服务器。网页本身仍可能请求其图片、字体等远程资源；点击官网入口会打开独立网站。

插件申请当前标签页、脚本注入、标签页访问、存储、下载及调试器权限，并声明网页访问范围，用于读取页面、选择内容、打印、保存设置和结果。Chrome / Edge 的网页 PDF 生成使用调试器接口，浏览器可能显示调试提示条。

最近结果保存于插件的本地 IndexedDB。过期或超过数量、容量限制的记录在执行清理检查时淘汰；浏览器关闭期间不保证准时删除。无痕结果不持久保存。关闭自动保留只影响后续结果，已有记录可手动删除。

## 常见问题

**为什么某些页面不能保存？** 浏览器内部页、扩展页等受保护页面不可转换。请打开普通 HTTP(S) 网页；已有 PDF 可通过 PDF 工具处理。

**能保存登录后的网页吗？** 可以尝试保存当前浏览器中已打开的页面，无需将登录凭据交给转换服务。嵌入内容、受保护内容或网站自身限制仍可能影响结果。

**为什么提示调试器被占用？** 关闭来源页的开发者工具，结束冲突的调试任务，然后重试。

**PDF 文字能选择吗？** 网页打印通常保留文字和链接；图片本身不会自动变成文字。部分本地 HTML / 文档下载采用图像渲染，可按界面提示使用「打印」保留可搜索文字。

**结果预览空白怎么办？** 先点击「打开 PDF」查看同一份文件。如果内容缺失，检查加载提示、等待图片加载完成，再调整设置重试。

**社区版需要付费或登录吗？** 本地功能无需登录，也不依赖官网转换额度。在线转换与账户套餐请前往<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">官网 ↗</a>。

## 开发与贡献

`extension/` 是插件源码，`locales/` 是可编辑语言文案，`docs/screenshots/` 是展示截图，`build/` 是生成产物。执行 `npm test` 检查源码边界与资源引用，执行 `npm run build` 构建插件；这两项检查不能代替真实浏览器的 PDF 质量验收。

欢迎改进转换兼容性、可访问性、翻译和文档。提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；安全问题请参阅 [SECURITY.md](SECURITY.md)。如果项目对你有帮助，欢迎 Star 或分享<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">官网 ↗</a>。

## 许可证

GoodConvertPDF 自有源码采用 **[MIT 许可证](LICENSE)**。第三方依赖仍遵循各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 `extension/vendor/licenses/`。截图中的第三方内容及标识归其各自权利人所有；项目名称与标识不可用于暗示未经授权的官方背书。
