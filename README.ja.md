<div align="center">

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="extension/icons/icon128.png" width="80" alt="GoodConvertPDF"></a>

# GoodConvertPDF Local

**Web ページ、記事、選択したコンテンツを PDF に保存。ブラウザー内で文書の変換や PDF の整理ができます。**

ローカル処理 · アカウント不要 · Chrome / Edge

[English](README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · **日本語** · [简体中文](README.zh-CN.md)

[![ライセンス: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Website-goodconvertpdf.com-4f46e5" alt="公式サイト"></a>

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">公式サイトへ ↗</a> · [使い方](#クイックスタート) · [画面例](#スクリーンショット) · [ライセンス](#ライセンス)

<img src="docs/screenshots/quick-save.png" width="380" alt="Web ページを PDF に保存する拡張機能のポップアップ">

</div>

## 主な機能

- 開いているタブから PDF を作成し、プレビュー後に開くかダウンロードできます。
- ページ全体、本文、または画面上で選択した部分を保存できます。
- 用紙、向き、余白、倍率、背景、読み込み方法を調整し、サイトごとの設定を再利用できます。
- 進行状況を確認し、処理のキャンセルやリソース待機のスキップができます。
- HTML、画像、テキスト、Markdown、データ、会話内容をローカルで変換できます。
- PDF の結合・分割・ページ整理、透かし、ページ番号、表紙、メタデータの追加ができます。
- 最近作成した PDF をローカルで再度開けます。標準の保持期間は 7 日間、上限は 20 件・合計 100 MB です。

## 拡張機能とWeb版の選び方

| 用途 | ローカルコミュニティ拡張機能（このリポジトリ） | Web版 |
| --- | --- | --- |
| 開いているページ・ログイン済みページ | Chrome / Edge で開いているページ、本文、選択範囲を保存。 | ブラウザーのログイン状態が必要なページには拡張機能を使用。 |
| 公開URL | ページを開き、ローカルで書き出し。 | 公開URLを貼り付けてサーバーで変換。一括処理にも対応。 |
| 処理場所 | ブラウザー内で変換。元ページは外部リソースを読み込む場合があります。 | 公開URLはサーバーで処理。ローカルHTML・画像・文書はブラウザー内で処理。 |
| アカウントとクラウド利用枠 | ローカル機能にはアカウント不要。クラウド変換枠も消費しません。 | ローカルツールはアカウント不要。オンライン変換にはアカウントが必要で、プランの利用枠を消費します。 |

<a href="https://goodconvertpdf.com/ja/" target="_blank" rel="noopener noreferrer">Web版を試す ↗</a> · <a href="https://goodconvertpdf.com/ja/pricing.html" target="_blank" rel="noopener noreferrer">プランと現在の制限 ↗</a>

## クイックスタート

**Node.js 22 以降**、Git、デスクトップ版 Chrome または Edge が必要です。

```sh
git clone https://github.com/coosee108/goodconvertpdf-local.git
cd goodconvertpdf-local
npm test
npm run build
```

1. `chrome://extensions` または `edge://extensions` を開きます。
2. **デベロッパーモード**を有効にし、**パッケージ化されていない拡張機能を読み込む**を選びます。
3. 生成された **`build/`** フォルダーを選択します。
4. 通常の Web ページを開き、現在のページを PDF に保存して、プレビュー後にダウンロードします。

現行のビルドではブラウザー用の依存ファイルが同梱されているため、追加の `npm install` は不要です。コードを変更したら再ビルドし、拡張機能を再読み込みしてください。このコミュニティ版は Chrome と Edge 向けです。Firefox のネイティブ印刷版は別の実装です。

## スクリーンショット

画像は拡張機能の実画面です。表示文言はバージョンや言語によって異なります。第三者のページは使用例として掲載しています。

![PDF のプレビューと保存操作](docs/screenshots/pdf-preview.png)

<details><summary>その他の画面：範囲選択、読み込み、文書、PDF ツール、最近の結果</summary>

![コンテンツの選択](docs/screenshots/select-content.png)
![生成の進行状況](docs/screenshots/loading.png)
![ローカル文書の変換](docs/screenshots/documents.png)
![PDF ツール](docs/screenshots/pdf-tools.png)
![最近の PDF](docs/screenshots/recent-pdfs.png)

</details>

## プライバシーと権限

ローカル変換にはアカウントや変換サーバーは必要ありません。ただし、元の Web ページ自体が画像やフォントなどをネットワークから読み込むことがあります。拡張機能はページの読み取り、PDF の生成、結果の保存のために、タブ、スクリプト、ストレージ、ダウンロード、デバッガー、Web サイトへのアクセス権限を使用します。Chrome または Edge にデバッグ中の表示が出る場合があります。

最近の PDF は拡張機能の IndexedDB にローカル保存されます。期限切れや上限超過のデータは確認時に削除され、ブラウザーが閉じている間の正確な削除時刻は保証されません。シークレットモードの結果は永続保存されません。

## よくある質問

**保存できないページがあるのはなぜですか？** ブラウザーの保護されたページや拡張機能のページは変換できません。通常の HTTP(S) ページを開いてください。

**ログイン後のページも保存できますか？** ブラウザーで開いているページを試すことはできます。変換サービスにログイン情報を渡す必要はありませんが、サイト側の制限が結果に影響する場合があります。

**PDF の文字は選択できますか？** Web ページの印刷では通常、文字とリンクが保持されます。一部のローカル HTML や文書の出力は画像化されます。検索可能な文字が必要な場合は印刷機能をお試しください。

**アカウントは必要ですか？** ローカル機能には不要です。オンライン変換やプラン管理は<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">公式サイト ↗</a>で行います。

## 開発と貢献

`extension/` は拡張機能のソース、`locales/` は翻訳、`docs/screenshots/` は画面例です。`build/` は生成物です。`npm test` と `npm run build` を実行し、実際のブラウザーでも PDF の品質を確認してください。詳細は [CONTRIBUTING.md](CONTRIBUTING.md) と [SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

GoodConvertPDF が作成したコードは [MIT ライセンス](LICENSE)で公開しています。第三者の依存ライブラリにはそれぞれのライセンスが適用されます。[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) と `extension/vendor/licenses/` を参照してください。
