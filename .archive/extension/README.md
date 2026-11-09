# GMaps Lead Finder Extension

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Ekstensi Google Chrome untuk melakukan *scraping* data bisnis (UMKM, Toko, dll) dari Google Maps. 

**Tujuan Utama:** Ekstensi ini dibuat khusus untuk **membantu para programmer / web developer mempermudah pencarian klien**. Ekstensi ini berfokus mencari dan menyaring data toko atau usaha yang **belum memiliki website**, sehingga Anda bisa dengan mudah menghubungi mereka dan menawarkan jasa pembuatan website.

## Fitur Utama

- **Otomatisasi Scraping:** Berjalan otomatis menelusuri hasil pencarian di sidebar Google Maps.
- **Auto-Kategori:** Otomatis mengambil kategori bisnis (misal: *Toko Sepeda*, *Restoran*).
- **Penyimpanan Lokal:** Data tersimpan aman di `chrome.storage.local` tanpa mengirim data ke server pihak ketiga.
- **Tabel Manajemen:** Lihat, filter (hanya yang belum punya website), dan cari data hasil scraping.
- **WhatsApp Direct:** Link otomatis untuk chat langsung ke WhatsApp bisnis.
- **Export Data:** Mendukung export ke `CSV` dan `JSON` (siap diintegrasikan ke Web Dashboard).

## Cara Instalasi (Developer Mode)

1. Clone atau download repository ini.
2. Buka tab baru di Chrome dan masuk ke `chrome://extensions`.
3. Aktifkan toggle **Developer mode** di pojok kanan atas.
4. Klik tombol **Load unpacked**.
5. Pilih folder ekstensi ini (`gmaps-leadgen-extension`).
6. Ekstensi siap digunakan dan icon akan muncul di toolbar Chrome.

## Cara Penggunaan

1. Buka [Google Maps](https://www.google.com/maps).
2. Lakukan pencarian spesifik, misalnya: `Toko Sepeda di Jakarta` atau `Salon Kecantikan Depok`.
3. Setelah hasil muncul di sidebar sebelah kiri, klik icon ekstensi di toolbar.
4. Masukkan **Target Data** (jumlah data yang ingin discrap, misal: 20).
5. Klik **Mulai**. Ekstensi akan otomatis mengklik setiap daftar, mengambil data (Nama, Kategori, Alamat, No. Telp, Website), dan menyimpannya.
6. Progress akan terlihat di popup. Jika sudah selesai, klik **Buka tabel hasil** untuk melihat dan mengelola data.

## Batasan & Catatan Penting

- **Perubahan UI Google Maps:** Script menggunakan heuristik dan `aria-label` untuk membaca data. Jika Google Maps mengubah struktur HTML-nya secara drastis, `content.js` mungkin perlu disesuaikan ulang.
- **Kecepatan Scraping:** Terdapat jeda (delay) acak 1-2 detik pada setiap aksi. Ini disengaja agar aktivitas terlihat natural dan tidak diblokir oleh sistem Google.
- **Penggunaan Etis:** Ekstensi ini bertujuan untuk mempermudah pengumpulan prospek publik. Gunakan secara bijak dan hindari melakukan scraping ribuan data sekaligus dalam waktu singkat.

## Struktur Data Export (JSON)

Jika Anda ingin mengintegrasikan data ini ke Web Dashboard buatan sendiri, berikut adalah skema JSON yang dihasilkan:

```json
[
  {
    "name": "Nama Bisnis",
    "category": "Toko Sepeda",
    "address": "Alamat lengkap...",
    "phone": "0812xxxxxxx",
    "website": "",
    "hasWebsite": false,
    "mapsUrl": "https://www.google.com/maps/place/...",
    "scrapedAt": "2026-09-03T09:22:46.000Z"
  }
]
```

## Struktur Folder
Ekstensi ini menggunakan arsitektur *flat-folder* agar tetap simpel dan ringan untuk dikembangkan:
- `manifest.json`: Konfigurasi dasar ekstensi (Manifest V3).
- `content.js`: Script yang disuntikkan ke halaman Google Maps untuk melakukan tugas scraping.
- `background.js`: Service worker pendukung.
- `popup.html / js / css`: Antarmuka utama saat icon ekstensi diklik.
- `table.html / js / css`: Halaman dashboard internal ekstensi untuk mengelola data.

Kalau mau bikin link WA sendiri di website, rumusnya:
```js
const waNumber = phone.replace(/[^\d]/g, '').replace(/^0/, '62');
const waLink = `https://wa.me/${waNumber}`;
```

## Struktur file

```
manifest.json    - konfigurasi extension (Manifest V3)
content.js       - jalan di halaman Google Maps, otomatisasi klik & scraping
background.js    - service worker, buka tab tabel hasil
popup.html/js/css - UI popup: input target, mulai/stop, progress
table.html/js/css - halaman tabel hasil: filter, search, export CSV, hapus data
```
