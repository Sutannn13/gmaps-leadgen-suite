// popup.js
const targetInput = document.getElementById('target');
const skipOwnedWebCheckbox = document.getElementById('skipOwnedWeb');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const openTableBtn = document.getElementById('openTableBtn');

async function getActiveMapsTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes('google.com/maps')) return tab;
  return null;
}

async function ensureContentScript(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (res && res.version) {
      return true;
    }
  } catch {
    // Content script not loaded yet
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await new Promise((r) => setTimeout(r, 250));
    return true;
  } catch {
    return false;
  }
}

function setRunningUI(running) {
  startBtn.disabled = running;
  stopBtn.disabled = !running;
  targetInput.disabled = running;
  if (skipOwnedWebCheckbox) skipOwnedWebCheckbox.disabled = running;
}

function updateProgress(count, target, status, businessName = '', newCount = 0) {
  progressWrap.hidden = false;
  const pct = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
  progressFill.style.width = pct + '%';
  progressLabel.textContent = `${count} / ${target}`;

  let statusText = '';
  if (status === 'jalan') {
    statusText = businessName ? `Proses: ${businessName}` : 'Sedang mengambil data...';
  } else if (status === 'selesai') {
    statusText = businessName || `Selesai. ${newCount || count} prospek baru tersimpan.`;
  } else if (status === 'berhenti') {
    statusText = `Dihentikan manual pada ${count} data.`;
  } else if (status === 'habis') {
    statusText = businessName || `Semua hasil pencarian Maps sudah diperiksa (${count} data).`;
  } else if (status === 'no_feed') {
    statusText =
      'Belum ada daftar pencarian. Ketik pencarian di Google Maps (misal "toko sepatu depok"), tekan Enter, lalu klik Mulai.';
  }

  if (statusText) statusEl.textContent = statusText;

  if (status === 'selesai' || status === 'berhenti' || status === 'habis' || status === 'no_feed') {
    setRunningUI(false);
  } else if (status === 'jalan') {
    setRunningUI(true);
  }
}

if (skipOwnedWebCheckbox) {
  skipOwnedWebCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({
      scrapePrefs: { skipOwnedWebsite: skipOwnedWebCheckbox.checked },
    });
  });
}

startBtn.addEventListener('click', async () => {
  const tab = await getActiveMapsTab();
  if (!tab) {
    statusEl.textContent = 'Buka tab Google Maps (google.com/maps), cari bisnis, lalu tekan Mulai.';
    return;
  }

  statusEl.textContent = 'Menghubungkan ke Google Maps...';
  const ready = await ensureContentScript(tab.id);
  if (!ready) {
    statusEl.textContent = 'Gagal memuat scraper. Refresh tab Maps (F5), lalu tekan Mulai.';
    return;
  }

  const target = parseInt(targetInput.value, 10) || 20;
  const skipOwnedWebsite = skipOwnedWebCheckbox ? skipOwnedWebCheckbox.checked : true;

  await chrome.storage.local.set({ scrapePrefs: { skipOwnedWebsite } });

  chrome.tabs.sendMessage(
    tab.id,
    { type: 'START_SCRAPE', target, skipOwnedWebsite },
    (res) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent =
          'Error: ' + chrome.runtime.lastError.message + '. Silakan refresh tab Maps (F5).';
        setRunningUI(false);
        return;
      }
      setRunningUI(true);
      updateProgress(0, target, 'jalan', 'Memulai...');
    }
  );
});

stopBtn.addEventListener('click', async () => {
  const tab = await getActiveMapsTab();
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'STOP_SCRAPE' });
  statusEl.textContent = 'Menghentikan proses...';
});

openTableBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_TABLE' });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCRAPE_PROGRESS') {
    updateProgress(msg.count, msg.target, msg.status, msg.businessName, msg.newCount);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.scrapeProgress) {
    const p = changes.scrapeProgress.newValue;
    if (p) updateProgress(p.count, p.target, p.status, p.businessName, p.newCount);
  }
});

(async () => {
  const { leads = [], scrapeProgress, scrapePrefs } = await chrome.storage.local.get([
    'leads',
    'scrapeProgress',
    'scrapePrefs',
  ]);

  if (skipOwnedWebCheckbox && scrapePrefs && typeof scrapePrefs.skipOwnedWebsite === 'boolean') {
    skipOwnedWebCheckbox.checked = scrapePrefs.skipOwnedWebsite;
  }

  const tab = await getActiveMapsTab();
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, (res) => {
      if (!chrome.runtime.lastError && res && res.isRunning) {
        setRunningUI(true);
        updateProgress(res.count || 0, res.target || 20, 'jalan');
        return;
      }

      if (scrapeProgress && scrapeProgress.status === 'jalan') {
        setRunningUI(true);
        updateProgress(
          scrapeProgress.count,
          scrapeProgress.target,
          scrapeProgress.status,
          scrapeProgress.businessName,
          scrapeProgress.newCount
        );
      } else if (leads.length > 0) {
        statusEl.textContent = `Tersimpan ${leads.length} data bisnis. Tekan Mulai untuk menambah data baru.`;
      }
    });
  } else if (leads.length > 0) {
    statusEl.textContent = `Tersimpan ${leads.length} data bisnis. Buka Google Maps untuk mulai scraping.`;
  }
})();
