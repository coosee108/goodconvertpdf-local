// The extension never invokes cloud jobs. Public URLs are handled by the official website.
export function headers() { return {}; }
export async function run() { throw new Error('Open the webpage in a browser tab to convert it locally.'); }
export function download(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
