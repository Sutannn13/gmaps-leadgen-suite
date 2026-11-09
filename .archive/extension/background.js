// background.js
// Service worker minimal: cuma buat buka tab tabel hasil dari popup,
// dan meneruskan progress dari content script ke popup kalau popup lagi kebuka.

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_TABLE') {
    chrome.tabs.create({ url: chrome.runtime.getURL('table.html') });
  }
  // SCRAPE_PROGRESS cukup didengarkan langsung oleh popup.js selagi popup terbuka;
  // tidak perlu diteruskan lagi di sini.
});
