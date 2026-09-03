/**
 * Node module loader hook that stubs Vite-only asset imports (audio, images,
 * css) which the game services pull in transitively (e.g. soundService.ts
 * imports mainmenu.mp3). Under plain Node these files are not loadable
 * modules, so short-circuit them to a default export stub.
 */
export async function load(url, context, nextLoad) {
  if (/\.(mp3|wav|ogg|png|jpe?g|gif|svg|webp|css|woff2?)(\?|#|$)/i.test(url)) {
    return {
      format: 'module',
      source: 'export default "stub";',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}