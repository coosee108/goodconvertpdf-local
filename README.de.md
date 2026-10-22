<div align="center">

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="extension/icons/icon128.png" width="80" alt="GoodConvertPDF"></a>

# GoodConvertPDF Local

**Webseiten, Artikel und ausgewählte Inhalte als PDF speichern. Dokumente konvertieren und PDFs direkt im Browser bearbeiten.**

Lokale Verarbeitung · Kein Konto erforderlich · Chrome / Edge

[English](README.md) · **Deutsch** · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)
<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Website-goodconvertpdf.com-4f46e5" alt="Offizielle Website"></a>

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">Offizielle Website ↗</a> · [Schnellstart](#schnellstart) · [Screenshots](#screenshots) · [Lizenz](#lizenz)

<img src="docs/screenshots/quick-save.png" width="380" alt="Popup zum schnellen Speichern einer Webseite als PDF">

</div>

## Funktionen

- Die geöffnete Webseite als PDF erstellen, prüfen und herunterladen.
- Ganze Seite, Hauptartikel oder visuell ausgewählte Inhalte speichern.
- Papierformat, Ausrichtung, Ränder, Skalierung, Hintergrund und Ladeverhalten einstellen; Einstellungen für eine Website wiederverwenden.
- Fortschritt anzeigen, einen Auftrag abbrechen oder das Warten auf Ressourcen überspringen.
- Lokale HTML-Dateien, Bilder, Text, Markdown, Daten und Gesprächsinhalte konvertieren.
- PDFs zusammenführen, teilen, Seiten sortieren sowie Wasserzeichen, Seitenzahlen, Deckblatt und Metadaten hinzufügen.
- Zuletzt erstellte PDFs lokal erneut öffnen. Standardmäßig werden sie bis zu 7 Tage aufbewahrt, höchstens 20 Dateien mit insgesamt 100 MB.

## Erweiterung oder Website wählen

| Anwendungsfall | Lokale Community-Erweiterung (dieses Repository) | Website |
| --- | --- | --- |
| Aktuelle Seite oder angemeldete Sitzung | Geöffnete Seiten, Artikel oder ausgewählte Inhalte in Chrome / Edge speichern. | Für Seiten mit Browser-Anmeldung die Erweiterung verwenden. |
| Öffentliche URL | Seite öffnen und lokal exportieren. | Öffentliche URL zur serverseitigen Konvertierung einfügen; Stapelverarbeitung ist verfügbar. |
| Verarbeitungsort | Lokal im Browser; Quellseiten können weiterhin entfernte Ressourcen laden. | Öffentliche URLs auf dem Server; lokale HTML-Dateien, Bilder und Dokumente im Browser. |
| Konto und Cloud-Kontingent | Lokale Funktionen benötigen kein Konto und kein Cloud-Kontingent. | Lokale Werkzeuge ohne Konto; Online-Konvertierung benötigt ein Konto und nutzt das Kontingent des Tarifs. |

<a href="https://goodconvertpdf.com/de/" target="_blank" rel="noopener noreferrer">Website ausprobieren ↗</a> · <a href="https://goodconvertpdf.com/de/pricing.html" target="_blank" rel="noopener noreferrer">Tarife und aktuelle Limits ↗</a>

## Schnellstart

Erforderlich sind **Node.js 22 oder neuer**, Git und Chrome oder Edge auf dem Desktop.

```sh
git clone https://github.com/coosee108/goodconvertpdf-local.git
cd goodconvertpdf-local
npm test
npm run build
```

1. `chrome://extensions` oder `edge://extensions` öffnen.
2. Den **Entwicklermodus** aktivieren und **Entpackte Erweiterung laden** wählen.
3. Den erzeugten Ordner **`build/`** auswählen.
4. Eine normale Webseite öffnen, die Schaltfläche zum Speichern der aktuellen Seite wählen und das PDF nach der Vorschau herunterladen.

Ein zusätzlicher Schritt mit `npm install` ist beim aktuellen Build nicht nötig. Nach Codeänderungen neu bauen und die Erweiterung im Browser neu laden. Diese Community-Version unterstützt Chrome und Edge; die separate Firefox-Version mit nativem Druck ist nicht enthalten.

## Screenshots

Die Bilder stammen aus der Erweiterung. Beschriftungen können je nach Version und Sprache abweichen. Inhalte fremder Websites dienen nur als Beispiel.

![PDF-Vorschau und Exportaktionen](docs/screenshots/pdf-preview.png)

<details><summary>Weitere Bilder: Auswahl, Laden, Dokumente, PDF-Werkzeuge und Verlauf</summary>

![Inhalte visuell auswählen](docs/screenshots/select-content.png)
![Fortschritt beim Erstellen](docs/screenshots/loading.png)
![Lokale Dokumente konvertieren](docs/screenshots/documents.png)
![PDF-Werkzeuge](docs/screenshots/pdf-tools.png)
![Zuletzt erstellte PDFs](docs/screenshots/recent-pdfs.png)

</details>

## Datenschutz und Berechtigungen

Lokale Konvertierungen benötigen weder ein Konto noch einen Konvertierungsserver. Die Quellseite kann weiterhin eigene Bilder, Schriftarten und andere Ressourcen aus dem Netz laden. Die Erweiterung nutzt unter anderem Berechtigungen für aktive Tabs, Skripte, Speicher, Downloads, Debugging und Webseitenezugriff, um Seiten zu erfassen, PDFs zu erzeugen und Ergebnisse zu speichern. Dabei kann Chrome oder Edge einen Debugging-Hinweis zeigen.

Zuletzt erstellte PDFs liegen in der lokalen IndexedDB der Erweiterung. Abgelaufene oder überzählige Ergebnisse werden bei Prüfungen entfernt; während der Browser geschlossen ist, gibt es keinen genauen Löschzeitpunkt. Im Inkognitomodus werden Ergebnisse nicht dauerhaft gespeichert.

## Häufige Fragen

**Warum lassen sich manche Seiten nicht speichern?** Geschützte Browserseiten und Erweiterungsseiten sind nicht konvertierbar. Öffnen Sie eine normale HTTP(S)-Seite.

**Kann ich angemeldete Seiten speichern?** Eine bereits im Browser geöffnete Seite kann verarbeitet werden, ohne Zugangsdaten an einen Konvertierungsdienst zu übergeben. Eingebettete Inhalte und Einschränkungen der Website können das Ergebnis beeinflussen.

**Ist der Text auswählbar?** Beim Drucken von Webseiten bleiben Text und Links im Allgemeinen erhalten. Einige lokale HTML- oder Dokumentenexporte verwenden Bilddarstellung; für durchsuchbaren Text gegebenenfalls die Druckfunktion verwenden.

**Brauche ich ein Konto?** Für die lokalen Funktionen nicht. Online-Konvertierung und Tarife werden auf der <a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">Website ↗</a> verwaltet.

## Entwicklung und Beiträge

`extension/` enthält den Quellcode, `locales/` die Übersetzungen und `docs/screenshots/` die Produktbilder. `build/` wird erzeugt. `npm test` und `npm run build` prüfen Quellcode und Build; testen Sie die PDF-Qualität zusätzlich in einem echten Browser. Beiträge sind willkommen; siehe [CONTRIBUTING.md](CONTRIBUTING.md) und [SECURITY.md](SECURITY.md).

## Lizenz

Der eigene Quellcode von GoodConvertPDF steht unter der [MIT-Lizenz](LICENSE). Bibliotheken Dritter behalten ihre jeweiligen Lizenzen; siehe [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) und `extension/vendor/licenses/`.
