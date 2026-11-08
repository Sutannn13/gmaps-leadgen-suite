# Product Marketing Context — Tim Developer KodeKiri (`kodekiri.tech`)

Dokumen ini menjadi sumber kebenaran utama (*single source of truth*) yang dibaca oleh seluruh skill di `.agents/skills/` (`product-marketing`, `prospecting`, `cold-email`, `copywriting`, `cro`, `humanizer`, `reverse-engineer-anything`, `ai-slop`, `frontend-design`, dan `scrapling-skill`) serta sistem **Bridge Muse.ai**.

---

## 1. Identitas Agency & Penawaran Utama

- **Nama Brand / Pengirim Resmi:** `Tim Developer KodeKiri`
- **Website Portofolio Resmi:** `https://kodekiri.tech`
- **Layanan Utama:** Pembuatan Website Katalog Produk, Landing Page Konversi WhatsApp, Website Info Layanan & Booking Jadwal, serta Company Profile SEO Lokal untuk UMKM dan bisnis menengah di Indonesia (fokus area Depok, Kabupaten Bogor, Jabodetabek, dan sekitarnya).
- **Aturan Identitas Pengirim:**
  - Gunakan identitas bersama **`Tim Developer KodeKiri`** pada seluruh pesan WhatsApp agar setiap anggota tim dapat melanjutkan *follow-up* secara konsisten.
  - Jangan gunakan nama generik anonim seperti *"Tim Web Developer"*.

---

## 2. Target Prospek (Ideal Customer Profile / ICP)

- **Kriteria Utama (HOT LEAD):**
  - Usaha lokal aktif di Google Maps yang **belum memiliki website berdomain resmi sendiri** (`.com`, `.id`, `.co.id`) — termasuk yang baru memakai Linktree, Blogspot, Canva Site, Instagram, atau Shopee.
  - Memiliki reputasi ulasan positif di Google Maps dan nomor WhatsApp aktif (`08...` / `628...`).
- **Segmen Kategori & Nilai Jual Spesifik (`valuePropLabel`):**
  1. **Sablon, Konveksi, Apparel, & Percetakan:** Website katalog produk, info jenis bahan/sablon, dan tombol order langsung ke WhatsApp.
  2. **Kuliner, Kafe, Resto, Bakery, & Katering:** Website daftar menu, info paket pesanan, dan tombol pesan langsung ke WhatsApp tanpa potongan komisi aplikasi.
  3. **Jasa Servis, Bengkel, Laundry, & Konstruksi:** Website info layanan, estimasi biaya, dan tombol booking jadwal ke WhatsApp.
  4. **Klinik, Salon, Barbershop, & Kecantikan:** Website daftar treatment, pricelist layanan, dan tombol reservasi ke WhatsApp.
  5. **Toko Ritel & Bisnis Lokal Umum:** Website katalog produk resmi dan info pemesanan yang terhubung ke WhatsApp.

---

## 3. SOP Funnel Outreach WhatsApp 3-Tahap (Anti-Blunder)

### Tahap 1 — Chat 1 (Pembuka & Pembersihan Nama SEO)
- **Bersihkan Nama Toko (`cleanBrandName`):** Jika nama di Google Maps penuh kata kunci SEO atau tanda `|` (misal: `Ofcourse.apparel | Jasa Sablon DTF dan Plastisol Terdekat Di Depok | Sablon Kaos Satuan`), sapa dengan nama pendek yang wajar (**"Ofcourse Apparel"**), lalu gunakan informasi layanan di judul (*"sablon DTF, plastisol, dan kaos satuan"*) di dalam isi kalimat pengamatan.
- **Tanpa Link URL Hidup di Chat 1:** Di WhatsApp, URL pada pesan pertama dari nomor yang belum disimpan tidak bisa diklik dan berisiko terkena filter spam. Cukup sebutkan nama **Tim Developer KodeKiri**.
- **Hindari Jebakan "Katalog Sudah Jadi":** Jangan menulis *"Boleh kami kirimkan contoh katalognya?"* (karena membuat klien mengira katalog produk toko mereka sudah ada). Gunakan kalimat: **"Boleh kami coba buatkan gambaran tampilan web singkat khusus untuk [Nama Usaha] Kak?"**

### Tahap 2 — Chat 2 (Kualifikasi Saat Klien Membalas *"Boleh"*)
- Begitu klien membalas 1 kali (misal *"Boleh"*), fitur klik link di WhatsApp mereka otomatis terbuka.
- Kirimkan balasan kualifikasi yang mencantumkan **`https://kodekiri.tech`** dan menanyakan **2 hal singkat** sebelum membuat mockup di `muse.ai`:
  1. Layanan atau produk apa yang paling sering dipesan pelanggan?
  2. Apakah ada logo atau foto hasil kerja/produk yang ingin sekalian ditampilkan?

### Tahap 3 — Bridge Mockup `muse.ai` (Setelah Klien Menjawab Kualifikasi)
Saat men-generate halaman pratinjau di `muse.ai` (`https://muse.ai/s/mockup-...`), wajib mematuhi **4 Pengaman Utama**:
1. **Reverse-Engineer Desain Premium (`reverse-engineer-anything` + `deanchor` + `frontend-design` + `ai-slop`):**
   - Ambil hanya arsitektur visual, sistem grid, tipografi karakter kuat, dan ritme *whitespace* dari website referensi premium. Dilarang menghasilkan tampilan *AI Slop* generik.
2. **Audit Cross-Check Anti-Dummy 5 Poin:**
   - **Zero Reference Brand Leak:** 0% nama brand, logo, atau copyright dari website referensi yang tertinggal.
   - **Zero Dummy Address/Contact:** Wajib memakai alamat asli Depok/Bogor dan nomor WA asli dari data Google Maps toko target.
   - **Zero Fabricated Pricing:** Dilarang mengarang angka harga Rupiah (`Rp ...`) kecuali disebutkan oleh klien di Chat 2; gunakan tombol *"Cek Estimasi Harga Sesuai Pesanan via WhatsApp"*.
   - **Zero Fake Testimonials:** Gunakan angka rating & jumlah ulasan asli dari Google Maps toko tersebut.
   - **Mobile-First & Kontras (`superior-accessibility`):** Rasio kontras minimal 4.5:1 dan tata letak rapi di layar HP.
3. **Batasan Scope Pratinjau (Maksimal 4 Section — Jangan Buat Full Website):**
   - Section 1: Sticky Top Banner `"Mode Pratinjau Desain oleh Tim Developer KodeKiri (kodekiri.tech) - Domain resmi & katalog penuh diaktifkan setelah rilis"`.
   - Section 2: Hero Section spesifik usaha + CTA simulasi order WhatsApp.
   - Section 3: 3 Kartu Layanan Utama (sesuai jawaban klien) + 1 Kartu Terkunci (`"Slot Katalog Produk Penuh & Kalkulator Order Aktif di Versi Resmi"`).
   - Section 4: Bukti Rating Google Maps & Lokasi + Simulasi Format Order WhatsApp.
