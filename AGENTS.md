# AGENTS.md — GMaps LeadGen Suite & Bridge Muse.ai (`Tim Developer KodeKiri`)

Repositori ini adalah monorepo **GMaps LeadGen Suite** milik **Tim Developer KodeKiri (`https://kodekiri.tech`)** yang terdiri dari:
1. `web-dashboard/` — Dashboard Next.js 16 + Neon PostgreSQL + Multi-Provider AI (DeepSeek & OpenRouter Free) + Bridge Mockup & Scraping Otonom `muse.ai`.
2. `.agents/` — Konteks Produk Marketing (`.agents/product-marketing.md`), runner scraping otonom (`.agents/muse-scrape-runner.md`), dan 16 paket Agent Skills di `.agents/skills/`.
3. `.archive/extension/` — Arsip Chrome Extension historis (sekarang digantikan penuh oleh pipeline otonom Muse.ai).

---

## Daftar Agent Skills yang Terpasang di `.agents/skills/`

1. **Scraping & Ekstraksi Web:**
   - `scrapling-skill` (`D4Vinci/Scrapling`): Adaptive web scraping, ekstraksi struktur DOM website referensi, dan bypass anti-bot.
2. **Reverse Engineering & Standar Desain Premium (Anti-AI-Slop):**
   - `reverse-engineer-anything`: Membedah arsitektur komponen & sistem layout dari website referensi premium.
   - `deanchor`: Mengambil prinsip dan kualitas struktur dari referensi tanpa menjiplak isi konten/identitas sumber.
   - `frontend-design`: Panduan pembuatan UI landing page berkarakter kuat, mobile-first, dan lolos standar WCAG AA.
   - `ai-slop`: Rubrik audit untuk mencegah desain AI generik dan memastikan nol klaim/harga palsu.
3. **Marketing, Outreach, & Humanizer (`coreyhaines31/marketingskills` + `humanizer`):**
   - `product-marketing`: Membaca konteks utama di `.agents/product-marketing.md`.
   - `prospecting`: Kualifikasi dan riset prospek UMKM lokal.
   - `cold-email`: Strategi pesan pembuka B2B (Chat 1) & tindak lanjut tanpa paksaan.
   - `cro`: Optimasi konversi halaman landing page pratinjau (fokus layar HP & klik tombol WA).
   - `copywriting` & `copy-editing`: Penyusunan headline dan penawaran yang spesifik sesuai kategori usaha.
   - `humanizer`: Menghapus gaya bahasa robotik AI, em-dash (`—`), double-dash (`--`), dan kalimat klise terjemahan.
   - `competitor-profiling`, `reverse-engineer-marketing`, `sales-enablement`, `emails`.

---

## Kontrak Logika Outreach & Bridge `muse.ai`

1. **Pembersihan Nama Toko (`extractBusinessIdentity` di `web-dashboard/src/lib/openrouter.js`):**
   - Jangan pernah menempelkan judul SEO Google Maps mentah (yang mengandung `|` atau kata kunci panjang) langsung ke sapaan WhatsApp.
   - Gunakan `cleanBrandName` untuk sapaan dan masukkan `extractedSpecialty` ke dalam isi kalimat pengamatan.
2. **Alur 3 Tahap WhatsApp & Mockup (`AiLeadModal.js`):**
   - **Tab 1 (`Chat Pembuka`):** Perkenalkan diri dari **Tim Developer KodeKiri**, sebutkan keunggulan review/layanan spesifik toko, dan tawarkan izin *membuatkan gambaran tampilan web singkat* (tanpa URL hidup di Chat 1).
   - **Tab 2 (`Kualifikasi - Boleh`):** Saat klien membalas *"Boleh"*, kirimkan link portofolio **`https://kodekiri.tech`** dan tanyakan layanan yang paling sering dipesan serta apakah ada logo/foto sebelum membuat mockup.
   - **Tab 3 (`Bridge Muse.ai`):** Gunakan generator prompt terstruktur (`buildMuseMockupBridgePrompt`) yang menerapkan *Reverse-Engineer Desain Premium*, *5-Point Cross-Check Anti-Dummy Gate* (0% bocoran nama/alamat/harga dari web referensi), dan *Batasan 4 Section Pratinjau KodeKiri*.
   - **Tab 4 (`Follow-up H+3`):** Sapaan tindak lanjut singkat dan sopan.
