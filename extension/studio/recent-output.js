// Bridges the shared raster-output module to the Recent PDFs page.
// The recent page stores PDF bytes in IndexedDB and drives the rasterizer through blob wrappers.
import {exportPngBlob, printPdfBlob} from './pdf-output.js';
globalThis.GCDPdfOutput = {exportPngBlob, printPdfBlob};
