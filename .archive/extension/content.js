// content.js
// GMaps Lead Finder - Accurate Scraper with Stale-Panel Protection & Owned-Website Filtering

if (!window.__GMAPS_LEADGEN_CONTENT_LOADED__) {
  window.__GMAPS_LEADGEN_CONTENT_LOADED__ = true;

  const SCRAPER_VERSION = '2.1';
  let isRunning = false;
  let shouldStop = false;
  let currentCount = 0;
  let currentTarget = 0;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomDelay(min, max) {
    return sleep(min + Math.random() * (max - min));
  }

  function getFeed() {
    return document.querySelector('div[role="feed"]');
  }

  function getResultCards() {
    const feed = getFeed();
    if (!feed) return [];
    const hfpxzc = Array.from(feed.querySelectorAll('a.hfpxzc[href*="/maps/place/"]'));
    return hfpxzc.length > 0 ? hfpxzc : Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));
  }

  async function scrollFeedForMore() {
    const feed = getFeed();
    if (!feed) return;
    feed.scrollTop = feed.scrollHeight;
    await randomDelay(1000, 1600);
  }

  function findByAriaPrefixes(prefixes, root = document) {
    const all = root.querySelectorAll('[aria-label]');
    for (const el of all) {
      const label = el.getAttribute('aria-label') || '';
      for (const p of prefixes) {
        if (label.toLowerCase().startsWith(p.toLowerCase())) {
          return { el, label };
        }
      }
    }
    return null;
  }

  function stripPrefix(label, prefixes) {
    for (const p of prefixes) {
      if (label.toLowerCase().startsWith(p.toLowerCase())) {
        return label.slice(p.length).trim();
      }
    }
    return label.trim();
  }

  function normalizeTitleForCompare(str) {
    return String(str || '')
      .replace(/[·\•]\s*(?:Link yang dikunjungi|Visited link|Ditampilkan|Bersponsor|Sponsored)\b.*/i, '')
      .trim()
      .toLowerCase();
  }

  function getCurrentPanelH1() {
    const h1 = document.querySelector('h1.DUwDvf') || document.querySelector('[role="main"] h1');
    return h1 ? h1.textContent.trim() : '';
  }

  async function waitForDetailPanel(previousTitle = '', expectedName = '', timeoutMs = 5500) {
    const start = Date.now();
    const prevNorm = normalizeTitleForCompare(previousTitle);
    const expectedNorm = normalizeTitleForCompare(expectedName);
    let stableCandidate = '';

    while (Date.now() - start < timeoutMs) {
      const rawH1 = getCurrentPanelH1();
      const currNorm = normalizeTitleForCompare(rawH1);

      if (currNorm.length > 0) {
        // Guard against stale DOM still showing the previous store's title
        const isStaleFromPrevious =
          prevNorm &&
          currNorm === prevNorm &&
          expectedNorm &&
          expectedNorm !== prevNorm;

        if (!isStaleFromPrevious) {
          if (stableCandidate === currNorm) {
            return true;
          }
          stableCandidate = currNorm;
        }
      }
      await sleep(220);
    }
    return Boolean(stableCandidate);
  }

  function isSocialMediaUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('instagram.com') ||
      lower.includes('instagr.am') ||
      lower.includes('ig.me') ||
      lower.includes('facebook.com') ||
      lower.includes('fb.com') ||
      lower.includes('fb.me') ||
      lower.includes('tiktok.com') ||
      lower.includes('twitter.com') ||
      lower.includes('x.com') ||
      lower.includes('youtube.com') ||
      lower.includes('youtu.be') ||
      lower.includes('linktr.ee') ||
      lower.includes('s.id') ||
      lower.includes('bit.ly') ||
      lower.includes('campsite.bio') ||
      lower.includes('beacons.ai') ||
      lower.includes('heylink.me') ||
      lower.includes('bio.link') ||
      lower.includes('taplink.cc') ||
      lower.includes('lynk.id') ||
      lower.includes('msha.ke') ||
      lower.includes('desty.page')
    );
  }

  function isOnlineShopUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('shopee.') ||
      lower.includes('shope.ee') ||
      lower.includes('shp.ee') ||
      lower.includes('tokopedia.') ||
      lower.includes('tkp.me') ||
      lower.includes('lazada.') ||
      lower.includes('lzd.co') ||
      lower.includes('bukalapak.') ||
      lower.includes('bl.id') ||
      lower.includes('blibli.') ||
      lower.includes('blib.li') ||
      lower.includes('grab.com') ||
      lower.includes('gofood.') ||
      lower.includes('shopeefood') ||
      lower.includes('olx.co.id') ||
      lower.includes('carousell.')
    );
  }

  function isFreeBuilderUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('blogspot.') ||
      lower.includes('wordpress.com') ||
      lower.includes('sites.google.com') ||
      lower.includes('business.site') ||
      lower.includes('my.canva.site') ||
      lower.includes('canva.site') ||
      lower.includes('carrd.co') ||
      lower.includes('wixsite.com') ||
      lower.includes('weebly.com') ||
      lower.includes('zyrosite.com') ||
      lower.includes('000webhostapp.com') ||
      lower.includes('github.io') ||
      lower.includes('netlify.app') ||
      lower.includes('vercel.app') ||
      lower.includes('berdu.pw')
    );
  }

  function isThirdPartyAggregatorUrl(rawUrl) {
    if (!rawUrl) return true;
    const lower = rawUrl.toLowerCase().trim();
    const ignored = [
      'google.',
      'gstatic.',
      'wa.me',
      'whatsapp.com',
      'waze.com',
      'traveloka.',
      'tiket.com',
      'agoda.',
      'booking.com',
      'pergikuliner.',
      'zomato.',
      'chope.',
      'halodoc.',
      'alodokter.',
      'tripadvisor.',
      'yelp.',
    ];
    return ignored.some((domain) => lower.includes(domain));
  }

  function isWebsiteCandidate(rawUrl) {
    if (!rawUrl) return false;
    const lower = rawUrl.toLowerCase().trim();
    if (lower.length < 4 || !lower.includes('.')) return false;
    if (isSocialMediaUrl(lower) || isOnlineShopUrl(lower) || isThirdPartyAggregatorUrl(lower)) {
      return false;
    }
    return true;
  }

  function detectClosedStatus(panelRoot) {
    if (!panelRoot) return false;
    const text = panelRoot.textContent || '';
    return /\b(?:Tutup permanen|Permanently closed|Tutup sementara|Temporarily closed)\b/i.test(
      text
    );
  }

  function extractDetailFromPanel(fallbackName, cardHref = '') {
    const feed = getFeed();
    const nameEl = document.querySelector('h1.DUwDvf') || document.querySelector('[role="main"] h1');
    let name = (nameEl && nameEl.textContent.trim()) || fallbackName || '(tanpa nama)';
    name = name.replace(/[·\•]\s*(?:Link yang dikunjungi|Visited link|Ditampilkan)\b.*/i, '').trim();

    // Isolasi container khusus panel tempat (detail panel), JANGAN ambil elemen dari feed pencarian
    const placePanel = nameEl
      ? nameEl.closest('.m6QErb.DxyBCb') || nameEl.closest('.m6QErb') || nameEl.closest('[role="main"]') || document
      : document.querySelector('[role="main"]') || document;

    const isClosed = detectClosedStatus(placePanel);
    if (isClosed && !/tutup permanen|tutup sementara/i.test(name)) {
      name = `${name} (Tutup Permanen)`;
    }

    // Alamat (hanya dari dalam panel toko, mutlak hindari feed)
    let address = '';
    const addrBtn = placePanel.querySelector('[data-item-id="address"]') ||
      Array.from(document.querySelectorAll('[data-item-id="address"]')).find(el => !feed || !feed.contains(el));
    if (addrBtn) {
      const aria = addrBtn.getAttribute('aria-label') || '';
      if (aria) address = stripPrefix(aria, ['Alamat:', 'Address:', 'Salin alamat']);
      if (!address) {
        const inner = addrBtn.querySelector('.Io6YTe, div');
        address = (inner ? inner.textContent : addrBtn.textContent).trim();
      }
    }
    if (!address) {
      const addrMatch = findByAriaPrefixes(['Address:', 'Alamat:'], placePanel);
      if (addrMatch && (!feed || !feed.contains(addrMatch.el))) {
        address = stripPrefix(addrMatch.label, ['Address:', 'Alamat:']);
      }
    }

    // Telepon (hanya dari dalam panel toko, mutlak hindari feed)
    let phone = '';
    const phoneBtn = placePanel.querySelector('[data-item-id^="phone:tel:"]') ||
      Array.from(document.querySelectorAll('[data-item-id^="phone:tel:"]')).find(el => !feed || !feed.contains(el));
    if (phoneBtn) {
      const dataId = phoneBtn.getAttribute('data-item-id') || '';
      phone = dataId.replace('phone:tel:', '').trim();
      if (!phone) {
        const aria = phoneBtn.getAttribute('aria-label') || '';
        phone = stripPrefix(aria, ['Telepon:', 'Phone:', 'Salin nomor telepon']);
      }
    }
    if (!phone) {
      const phoneMatch = findByAriaPrefixes(['Phone:', 'Telepon:'], placePanel);
      if (phoneMatch && (!feed || !feed.contains(phoneMatch.el))) {
        phone = stripPrefix(phoneMatch.label, ['Phone:', 'Telepon:']);
      }
    }
    if (phone) {
      phone = phone.replace(/[^\d+\-() ]/g, '').trim();
    }

    let website = '';
    let socialMedia = '';
    let onlineShop = '';
    let whatsapp = '';

    // 1. Ambil website resmi dari elemen otoritas Maps di DALAM panel toko (bukan dari feed kartu lain)
    const authorityEl = placePanel.querySelector('[data-item-id="authority"]') ||
      Array.from(document.querySelectorAll('[data-item-id="authority"]')).find(el => !feed || !feed.contains(el));
    let rawAuthority = '';
    if (authorityEl) {
      rawAuthority = (authorityEl.getAttribute('href') || authorityEl.textContent || '').trim();
    }
    if (!rawAuthority) {
      const webMatch = findByAriaPrefixes(['Website:', 'Situs Web:'], placePanel);
      if (webMatch && (!feed || !feed.contains(webMatch.el))) {
        rawAuthority = (
          webMatch.el.getAttribute('href') ||
          stripPrefix(webMatch.label, ['Website:', 'Situs Web:'])
        ).trim();
      }
    }

    if (rawAuthority) {
      const lowerAuth = rawAuthority.toLowerCase();
      if (lowerAuth.includes('wa.me') || lowerAuth.includes('whatsapp.com')) {
        const waMatch = rawAuthority.match(/(?:wa\.me\/|phone=)(?:62|0)?(\d+)/);
        if (waMatch) whatsapp = '0' + waMatch[1];
      } else if (isSocialMediaUrl(rawAuthority)) {
        socialMedia = rawAuthority;
      } else if (isOnlineShopUrl(rawAuthority)) {
        onlineShop = rawAuthority;
      } else if (isWebsiteCandidate(rawAuthority)) {
        website = rawAuthority;
      }
    }

    // 2. Scan anchor detail KHUSUS di dalam placePanel (MUTLAK abaikan semua link di dalam feed pencarian!)
    const detailLinks = Array.from(placePanel.querySelectorAll('a[href]')).filter(a => {
      if (feed && feed.contains(a)) return false;
      const href = (a.getAttribute('href') || '').toLowerCase();
      if (href.includes('/contrib/') || href.includes('/reviews') || href.includes('/photos') || href.includes('/maps/place/') || href.includes('/maps/dir/')) {
        return false;
      }
      return true;
    });

    for (const a of detailLinks) {
      const href = (a.getAttribute('href') || '').trim();
      if (!href) continue;

      if (!socialMedia && isSocialMediaUrl(href)) {
        socialMedia = href;
      }
      if (!onlineShop && isOnlineShopUrl(href)) {
        onlineShop = href;
      }
      if (!whatsapp && (href.includes('wa.me') || href.includes('whatsapp.com'))) {
        const waMatch = href.match(/(?:wa\.me\/|phone=)(?:62|0)?(\d+)/);
        if (waMatch) whatsapp = '0' + waMatch[1];
      }
    }

    // 3. Fallback WhatsApp dari nomor HP seluler Indonesia (08... atau 628...)
    if (!whatsapp && phone) {
      const digits = phone.replace(/[^\d]/g, '');
      if (digits.startsWith('08') || digits.startsWith('628') || digits.startsWith('8')) {
        whatsapp = phone;
      }
    }

    // Kategori
    let category = '';
    const catBtn = document.querySelector(
      'button[jsaction="pane.rating.category"], button.DkEaL, button[jsaction*="category"]'
    );
    if (catBtn) category = catBtn.textContent.trim();
    if (!category) {
      const sub = document.querySelector('.DkEaL, .fontBodyMedium button');
      if (sub) category = sub.textContent.trim();
    }

    // Rating & Jumlah Ulasan Asli
    let rating = '';
    let reviewCount = '';
    const f7 = document.querySelector('div.F7nice');
    if (f7) {
      const rMatch = f7.textContent.match(/([1-5][\.,]\d)/);
      if (rMatch) {
        rating = rMatch[1].replace(',', '.');
      }
      const revMatch = f7.textContent.match(/\(([\d\.,]+)\)/);
      if (revMatch) {
        reviewCount = revMatch[1].replace(/[^\d]/g, '');
      }
    }

    const hasOwnedWebsite = Boolean(website && !isFreeBuilderUrl(website));

    return {
      name,
      rating: rating || '',
      reviewCount: reviewCount || '',
      category: category || '',
      address: address || '',
      phone: phone || '',
      whatsapp: whatsapp || '',
      website: website || '',
      socialMedia: socialMedia || '',
      onlineShop: onlineShop || '',
      hasWebsite: hasOwnedWebsite,
      isClosed,
      mapsUrl: cardHref || window.location.href,
      scrapedAt: new Date().toISOString(),
    };
  }

  async function waitForFeedBack(timeoutMs = 7000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (getFeed()) return true;
      await sleep(200);
    }
    return false;
  }

  function findBackButton() {
    return document.querySelector(
      'button[aria-label="Back"], button[aria-label="Kembali"], button[aria-label^="Back to"], button[aria-label^="Kembali ke"]'
    );
  }

  async function goBackToList() {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (getFeed()) return true;
      const backBtn = findBackButton();
      if (backBtn) {
        backBtn.click();
      } else if (attempt === 0) {
        history.back();
      }
      const ok = await waitForFeedBack(2500);
      if (ok) return true;
      await sleep(300);
    }
    return Boolean(getFeed());
  }

  async function saveLead(lead) {
    const { leads = [] } = await chrome.storage.local.get('leads');
    const dupIndex = leads.findIndex(
      (l) =>
        (lead.mapsUrl && l.mapsUrl && l.mapsUrl === lead.mapsUrl) ||
        (l.name === lead.name && l.address === lead.address)
    );
    let isNew = true;
    if (dupIndex >= 0) {
      leads[dupIndex] = { ...leads[dupIndex], ...lead };
      isNew = false;
    } else {
      leads.push(lead);
    }
    await chrome.storage.local.set({
      leads,
      leads_backup: leads,
    });
    return { total: leads.length, isNew };
  }

  function reportProgress(count, target, status, businessName = '') {
    currentCount = count;
    currentTarget = target;
    const progressData = {
      count,
      target,
      status,
      businessName,
      updatedAt: Date.now(),
    };

    chrome.runtime
      .sendMessage({
        type: 'SCRAPE_PROGRESS',
        ...progressData,
      })
      .catch(() => {});

    chrome.storage.local.set({ scrapeProgress: progressData }).catch(() => {});
  }

  async function runScrape(target, skipOwnedWebsite = true) {
    if (isRunning) return;
    isRunning = true;
    shouldStop = false;

    if (!getFeed()) {
      reportProgress(0, target, 'no_feed');
      isRunning = false;
      return;
    }

    const processedHrefs = new Set();
    let sessionCount = 0;
    let skippedCount = 0;
    let finishStatus = null;
    let stagnantScrolls = 0;
    let lastCapturedTitle = getCurrentPanelH1();

    reportProgress(sessionCount, target, 'jalan', 'Memulai...');

    while (isRunning && !shouldStop && sessionCount < target) {
      const cards = getResultCards();
      const unprocessed = cards.filter((c) => !processedHrefs.has(c.href));

      if (unprocessed.length === 0) {
        await scrollFeedForMore();
        stagnantScrolls += 1;
        if (stagnantScrolls > 6) {
          finishStatus = 'habis';
          break;
        }
        continue;
      }
      stagnantScrolls = 0;

      const card = unprocessed[0];
      const cardHref = card.href || '';
      processedHrefs.add(cardHref);

      const fallbackName = card.getAttribute('aria-label') || '';
      reportProgress(sessionCount, target, 'jalan', fallbackName || 'Membuka toko...');

      card.scrollIntoView({ block: 'center' });
      card.click();

      const loaded = await waitForDetailPanel(lastCapturedTitle, fallbackName, 5500);
      await randomDelay(350, 750);

      if (loaded) {
        lastCapturedTitle = getCurrentPanelH1();
        const lead = extractDetailFromPanel(fallbackName, cardHref);

        if (skipOwnedWebsite && (lead.hasWebsite || lead.isClosed)) {
          skippedCount += 1;
          const skipReason = lead.isClosed ? 'tutup' : 'sudah ada web';
          reportProgress(
            sessionCount,
            target,
            'jalan',
            `Dilewati (${skipReason}): ${lead.name}`
          );
        } else {
          const { isNew } = await saveLead(lead);
          if (isNew) sessionCount += 1;
          reportProgress(
            sessionCount,
            target,
            'jalan',
            `${lead.name} (${sessionCount}/${target})`
          );
        }
      }

      const backOk = await goBackToList();
      if (!backOk) {
        finishStatus = 'habis';
        break;
      }

      await randomDelay(550, 1100);
    }

    isRunning = false;
    if (!finishStatus) {
      finishStatus = shouldStop ? 'berhenti' : 'selesai';
    }
    const skipSummary = skippedCount > 0 ? `, ${skippedCount} dilewati` : '';
    reportProgress(
      sessionCount,
      target,
      finishStatus,
      `Selesai (${sessionCount} prospek tersimpan${skipSummary})`
    );
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_SCRAPE') {
      if (!isRunning) {
        const skipOwned =
          typeof msg.skipOwnedWebsite === 'boolean' ? msg.skipOwnedWebsite : true;
        runScrape(msg.target || 20, skipOwned);
      }
      sendResponse({
        ok: true,
        alreadyRunning: isRunning,
        count: currentCount,
        target: currentTarget,
      });
    } else if (msg.type === 'STOP_SCRAPE') {
      shouldStop = true;
      sendResponse({ ok: true });
    } else if (msg.type === 'GET_STATUS') {
      sendResponse({
        isRunning,
        count: currentCount,
        target: currentTarget,
        status: isRunning ? 'jalan' : 'diam',
      });
    } else if (msg.type === 'PING') {
      sendResponse({ ok: true, version: SCRAPER_VERSION });
    }
    return true;
  });
}
