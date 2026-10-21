<div align="center">

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="extension/icons/icon128.png" width="80" alt="GoodConvertPDF"></a>

# GoodConvertPDF Local

**Guarda páginas web, artículos y contenido seleccionado como PDF. Convierte documentos y organiza tus PDF en el navegador.**

Procesamiento local · No requiere cuenta · Chrome / Edge

[English](README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · **Español** · [Português (Brasil)](README.pt-BR.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Sitio-goodconvertpdf.com-4f46e5" alt="Sitio oficial"></a>

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">Visitar el sitio oficial ↗</a> · [Instalación](#inicio-rápido) · [Capturas](#capturas-de-pantalla) · [Licencia](#licencia)

<img src="docs/screenshots/quick-save.png" width="380" alt="Ventana de la extensión para guardar una página como PDF">

</div>

## Funciones

- Crea un PDF de la pestaña abierta, revisa la vista previa y abre o descarga el archivo.
- Guarda la página completa, el artículo principal o una selección visual.
- Ajusta papel, orientación, márgenes, escala, fondos y carga; reutiliza los ajustes de cada sitio.
- Consulta las etapas de generación, cancela una tarea u omite la espera de recursos.
- Convierte localmente HTML, imágenes, texto, Markdown, datos y contenido de conversaciones.
- Combina y divide archivos PDF, organiza páginas y añade marcas de agua, números de página, portada y metadatos.
- Vuelve a abrir PDF recientes guardados localmente. Por defecto se conservan 7 días, hasta 20 archivos y 100 MB en total.

Para convertir URL públicas en línea o gestionar cuentas y planes, visita el <a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">sitio oficial ↗</a>.

## Inicio rápido

Necesitas **Node.js 22 o posterior**, Git y Chrome o Edge para escritorio.

```sh
git clone https://github.com/coosee108/goodconvertpdf-local.git
cd goodconvertpdf-local
npm test
npm run build
```

1. Abre `chrome://extensions` o `edge://extensions`.
2. Activa el **modo de desarrollador** y elige **Cargar descomprimida**.
3. Selecciona la carpeta generada **`build/`**.
4. Abre una página web normal, guárdala como PDF, revisa la vista previa y descárgala.

Esta compilación no necesita un paso adicional de `npm install`: incluye las dependencias del navegador. Después de modificar el código, vuelve a compilar y recarga la extensión. La edición comunitaria es para Chrome y Edge; la implementación independiente de Firefox usa impresión nativa.

## Capturas de pantalla

Las capturas proceden de la extensión. Los textos pueden variar según la versión o el idioma. Las páginas de terceros solo ilustran el funcionamiento.

![Vista previa del PDF y acciones de exportación](docs/screenshots/pdf-preview.png)

<details><summary>Más capturas: selección, carga, documentos, herramientas PDF y resultados recientes</summary>

![Selección visual de contenido](docs/screenshots/select-content.png)
![Progreso de generación](docs/screenshots/loading.png)
![Conversión de documentos](docs/screenshots/documents.png)
![Herramientas PDF](docs/screenshots/pdf-tools.png)
![PDF recientes](docs/screenshots/recent-pdfs.png)

</details>

## Privacidad y permisos

La conversión local no necesita cuenta ni servidor de conversión. La página de origen puede seguir cargando imágenes, fuentes y otros recursos externos. La extensión solicita acceso a pestañas, scripts, almacenamiento, descargas, depuración y sitios web para leer la página, generar el PDF y guardar los resultados. Chrome o Edge puede mostrar un aviso de depuración.

Los PDF recientes se guardan en IndexedDB de la extensión. La limpieza se realiza durante las comprobaciones; no hay una hora de eliminación garantizada mientras el navegador está cerrado. Los resultados de incógnito no se conservan.

## Preguntas frecuentes

**¿Por qué algunas páginas no se pueden guardar?** Las páginas protegidas del navegador y las de extensiones no se pueden convertir. Abre una página HTTP(S) normal.

**¿Puedo guardar una página con sesión iniciada?** Puedes intentar guardar una página ya abierta sin entregar tus credenciales a un servicio de conversión. Las restricciones del sitio pueden afectar el resultado.

**¿Se puede seleccionar el texto?** La impresión de páginas web suele conservar texto y enlaces. Algunas descargas de HTML o documentos locales usan imágenes; utiliza Imprimir si necesitas texto buscable.

**¿Necesito una cuenta?** No para las funciones locales. La conversión en línea y los planes se gestionan en el <a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">sitio oficial ↗</a>.

## Desarrollo y contribuciones

`extension/` contiene el código, `locales/` las traducciones y `docs/screenshots/` las capturas. `build/` se genera automáticamente. Ejecuta `npm test` y `npm run build`, y comprueba la calidad del PDF en un navegador real. Lee [CONTRIBUTING.md](CONTRIBUTING.md) y [SECURITY.md](SECURITY.md).

## Licencia

El código propio de GoodConvertPDF se distribuye bajo la [licencia MIT](LICENSE). Las dependencias de terceros mantienen sus licencias; consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) y `extension/vendor/licenses/`.
