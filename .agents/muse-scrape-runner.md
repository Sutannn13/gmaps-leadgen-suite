# Panduan Eksekusi Agen Muse.ai: Autonomous Scraping, Deep-Verification & Outreach Generator

Dokumen ini adalah instruksi operasional untuk Agen **Muse.ai** (Space / Runner) dalam mengekstrak, memvalidasi kelayakan website secara live, dan menyusun draf penawaran ramah manusia (*humanized*) untuk prospek klien **Tim Developer KodeKiri (`https://kodekiri.tech`)**.

---

## 1. Siklus Kerja Agen (Agent Execution Cycle)

```
[Membaca .agents/muse-scrape-queue.json]
                 ↓
    [1. Discovery: Pencarian Data]
                 ↓
    [2. Deep-Verification Gate: Ping HTTP & Cek Sosmed]
                 ↓
    [3. Filter Geografis: Jabodetabek vs Global English]
                 ↓
    [4. Enrichment: CRO 4-Section & Humanized Copy]
                 ↓
[Kirim balik ke Web Dashboard via Webhook / Simpan ke .agents/muse-scraped-leads.json]
```

---

## 2. Aturan Filter Geografis (Geographic Scope)

1. **Toko Fisik / Layanan Offline (Wajib Tatap Muka / Trust Lokal):**
   - **Kategori:** Bengkel motor/mobil, salon, barbershop, toko bangunan, material, klinik kesehatan, mebel fisik, restoran/kuliner tempat.
   - **Radius:** **Terkunci di JABODETABEK** (DKI Jakarta, Kota/Kabupaten Bogor, Kota Depok, Kota/Kabupaten Tangerang, Tangerang Selatan, Kota/Kabupaten Bekasi).
   - *Abaikan prospek kategori ini jika berada di luar Jabodetabek.*
2. **Jasa Berbasis Pengiriman / Remote B2B / Ekspor:**
   - **Kategori:** Konveksi, sablon kaos/plastisol/DTF, bordir, percetakan, distributor, supplier grosir, agensi digital, pengrajin ekspor.
   - **Radius:** **Nasional & Internasional**.
   - *Aturan Bahasa:*
     - Prospek Indonesia $\rightarrow$ Bahasa Indonesia santai, sopan, dan natural.
     - Prospek Luar Negeri (Nomor telepon non-`+62` atau alamat luar negeri) $\rightarrow$ **Strict English only**.

---

## 3. Tahap Deep-Verification (Pengecekan Website Tersembunyi & Mati)

Setiap kandidat bisnis wajib diverifikasi melalui gerbang berikut:

1. **Pengecekan HTTP Live (Bila ada URL terdaftar):**
   - Lakukan `HEAD` request (atau `GET` bila HEAD ditolak).
   - **HTTP 200–399 (Domain Mandiri Aktif):** Tandai `websiteStatus: "has_website"`. **Otomatis buang dari daftar target** (karena sudah punya web aktif).
   - **HTTP 404, 500, Domain Expired, atau DNS Error:** Tandai `websiteStatus: "website_dead"`. **Jadikan HOT LEAD** (klien pernah menyadari pentingnya web, namun webnya mati).
2. **Pengecekan Media Sosial / Link-in-Bio:**
   - Bila link mengarah ke Instagram, TikTok, Linktree, Shopee, Tokopedia:
   - Tandai `websiteStatus: "social_only"`, simpan URL ke kolom `socialMedia`.
   - Sudut penawaran: Bantu merapikan katalog medsos menjadi web 1 halaman resmi.
3. **Pencarian Sekunder (Jika di Maps kosong):**
   - Jalankan kueri: `"[Nama Toko]" "[Kecamatan/Kota]" (website OR instagram)`.
   - Jika ditemukan Instagram aktif namun tanpa web mandiri $\rightarrow$ tetap valid sebagai prospek `social_only`.
4. **Filter Jaringan / Franchise:**
   - Cek apakah toko merupakan cabang jaringan nasional (Indomaret, Alfamart, J&T, Mixue, KFC, dsb). Jika ya, buang dari target (`isChain: true`).

---

## 4. Standar Penulisan Copywriting Chat 1 (Humanizer)

### Larangan Keras (Anti-AI-Slop):
- ❌ DILARANG memakai em-dash (`—`) atau double-dash (`--`). Gunakan koma, titik, atau kurung biasa.
- ❌ DILARANG menumpuk nama brand, spesialisasi, dan lokasi dalam satu tarikan nafas (terasa seperti template robot).
- ❌ DILARANG menggunakan kata klise AI: *"di era digital ini"*, *"solusi mutakhir"*, *"melejitkan omset"*, *"kami dari agency ternama"*.

### Formula Chat 1 Indonesia (Jabodetabek / Nasional):
```text
Halo kak, salam kenal dari tim developer KodeKiri (kodekiri.tech).

Kebetulan kami lihat review [Nama Toko] di [Kecamatan/Area] bagus dan ramai pelanggannya. Mau tanya kak, saat ini tokonya sudah ada web katalog sendiri atau pemesanan masih murni lewat WA & medsos aja?

Kalau belum ada dan kakak berkenan, tim kami mau buatkan gambaran tampilan web 1 halaman singkat buat katalog tokonya kak, gratis tanpa komitmen apa pun. Kira-kira boleh kami buatkan?
```

### Formula Chat 1 Internasional (English Only):
```text
Hi there, hope you're having a great week!

Reaching out from the KodeKiri developer team (kodekiri.tech). We came across [Brand Name] and really loved your positive reviews and product quality. 

Quick question: do you currently have a dedicated one-page portfolio or catalog website for direct inquiries, or are you primarily handling orders through social media and messaging?

If you'd be open to it, our team would love to build a quick, free preview of a clean one-page web catalog for your brand (zero commitment required). Would it be okay if we put a draft together for you to see?
```

---

## 5. Format Output Terstruktur JSON

Kirimkan payload HTTP `POST` ke endpoint dashboard (`/api/import`) atau simpan ke file `.agents/muse-scraped-leads.json` dengan struktur berikut:

```json
{
  "scrapedAt": "2026-11-09T08:00:00.000Z",
  "targetQuery": "Bengkel Motor Depok",
  "summary": {
    "totalScraped": 12,
    "qualified": 9,
    "filteredChains": 1,
    "filteredHasWebsite": 2
  },
  "leads": [
    {
      "name": "Bengkel Berkah Motor",
      "cleanBrandName": "Berkah Motor",
      "categoryName": "Bengkel Motor",
      "address": "Jl. Raya Sawangan No. 8, Pancoran Mas, Kota Depok",
      "phone": "081288990011",
      "whatsapp": "6281288990011",
      "website": "",
      "websiteStatus": "no_website",
      "isChain": false,
      "socialMedia": "https://instagram.com/berkahmotor_dpk",
      "rating": 4.7,
      "reviewCount": 45,
      "geoScope": "JABODETABEK",
      "language": "id",
      "extractedSpecialty": "Tune up injeksi dan ganti oli cepat",
      "suggestedHook": "Bengkel motor rating 4.7 dengan 45 ulasan di Sawangan",
      "aiResearch": {
        "pipelineStage": "QUEUED",
        "chat1Message": "Halo kak, salam kenal dari tim developer KodeKiri (kodekiri.tech). Kebetulan kami lihat review Berkah Motor di Sawangan bagus dan ramai pelanggannya. Mau tanya kak, saat ini tokonya sudah ada web katalog sendiri atau pemesanan masih murni lewat WA & medsos aja? Kalau belum ada dan kakak berkenan, tim kami mau buatkan gambaran tampilan web 1 halaman singkat buat katalog tokonya kak, gratis tanpa komitmen apa pun. Kira-kira boleh kami buatkan?"
      }
    }
  ]
}
```

