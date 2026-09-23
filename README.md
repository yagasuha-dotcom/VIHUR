# CLINT TRADE

**TRADE. ANALYZE. SURVIVE.** Simulator dunia keuangan yang hidup. Bukan sekadar chart dengan harga acak: pasar punya memori, regime, berita yang bereaksi berantai, ekonomi makro, perusahaan fiktif yang bisa untung, rugi, IPO, atau bangkrut, dan kariermu sebagai trader ikut terbentuk oleh keputusanmu.

> **Semua uang, aset, perusahaan, dan pasar di dalam game ini VIRTUAL.** Tidak ada uang asli, tidak ada broker, tidak ada koneksi ke pasar sungguhan.

## Menjalankan

Butuh Node.js 18+ (diuji di Node 22).

```bash
npm install
npm run dev          # buka http://localhost:5173
```

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm run build` | typecheck + build produksi ke `dist/` |
| `npm run preview` | jalankan hasil build |
| `npm run typecheck` | hanya typecheck |
| `npm test` | soak test dunia 30 hari + playtest gameplay headless |
| `npm run simtest -- <seed> <hari>` | simulasi dunia tanpa UI, cetak berita/earnings/crash |
| `npm run year` | 4 seed x 1 tahun game: hitung crash, bubble, warning bangkrut |
| `npm run balance` | ukur drift harga 45 hari di 7 seed |
| `npm run calibrate` | regenerasi `src/engine/calibration.ts` (volatilitas per aset) |

## Cara bermain (30 detik)

1. Klik **START CAREER** (atau **LEARN TRADING** untuk tutorial). Modal awal **$10,000**.
2. Tekan **▶** atau **Spasi**. 1x berarti 1 detik nyata = 1 menit game. Kecepatan 1x sampai 50x.
3. Pilih aset di watchlist, atur ukuran, leverage, **Stop Loss** dan **Take Profit**, lalu konfirmasi.
4. Pantau berita, kalender ekonomi (countdown di header), dan panel **CLINT AI** (deskriptif, tidak pernah menyuruh beli).
5. Bertahan. Kalau modal habis: kerja sampingan, daily reward, pinjaman darurat, restrukturisasi utang, atau bangkrut lalu mulai lagi.

Pintasan: `Spasi` play/pause · `Ctrl+Shift+D` panel developer.

## Yang ada di dalam

**Pasar:** 7 forex, 12 crypto (6 nyata + 6 fiktif: CLNT, NOVA, VOLT, AURA, NEON, FLUX), 18 saham fiktif di 9 sektor + 4 IPO yang muncul selama game (AURORA AI IPO $25 di hari 10), emas/perak/minyak/gas alam, 2 obligasi, 4 indeks (CLINT 100, TECH 50, GLOBAL 500, CRYPTO INDEX).

**Sistem trading:** market/limit/stop order, SL/TP, leverage 1-50x, margin, margin call, likuidasi, spread dinamis, slippage dari order book sintetis, swap/financing, dividen, sesi ASIA/EUROPE/US, jam buka bursa, perilaku akhir pekan.

**Karier:** XP dan level, rank (NOVICE → MARKET VETERAN), reputasi 0-100 yang membuka tool/limit pinjaman/leverage 50x/challenge, credit score 300-850 yang menentukan bunga, misi, achievement, jurnal trading otomatis, statistik (win rate, profit factor, drawdown, Sharpe-like), psikologi (discipline, patience, risk control) dengan peringatan overtrading/revenge trade.

## Cara kerja dunia (arsitektur)

```
src/
  engine/        simulasi murni (tanpa React), deterministik dari seed
    rng.ts             RNG seeded (mulberry32), state bisa disimpan
    marketEngine.ts    harga per tick: faktor makro + momentum + memori volatilitas + sentimen + supply/demand + dampak berita + regime
    regimes.ts         state machine 10 regime (BULL, BEAR, PANIC, EUPHORIA, ...)
    candles.ts         tick -> OHLC 8 timeframe (1m..1W), gap saat bursa buka
    newsEngine.ts      berita: reliability, priced-in, reversal, expected vs actual impact
    eventEngine.ts     event dunia, crash, bubble, pola pemulihan
    economyEngine.ts   suku bunga/inflasi/GDP per mata uang + kalender + surprise
    companyEngine.ts   earnings, valuasi, kesehatan, kebangkrutan, IPO
    world.ts           orkestrator (warm-up 90 hari, rescale, kalender, laporan harian)
  features/      trading, banking, missions, journal, analytics (AI analyst), life events
  store/         controller (game loop), Zustand, IndexedDB
  components/ pages/ hooks/ utils/ types/
```

**Rantai sebab-akibat** (semua fitur saling terhubung): berita/rilis data → faktor ekonomi (USD, RISK, RATES, INFL, OIL, GROWTH, GEO, CRYPTO, 9 sektor) → jaringan hubungan antar faktor (probabilistik, bertunda, tidak selalu konsisten) → sentimen dan regime → harga tiap aset → candle → posisi pemain → P/L → equity → margin → limit pinjaman → credit score → karier.

**Memori pasar:** tiap aset menyimpan momentum, varians realisasi (mirip GARCH), sentimen, memori berita, trend OU, supply/demand, dan EMA lambat untuk deteksi overextension. Hari ini dipengaruhi kemarin.

**Earnings ≠ selalu naik.** Reaksi = surprise EPS + guidance − penalti valuasi/sentimen (*priced in*) + noise. Saham mahal dengan hasil bagus tetap bisa turun.

**Performa:** simulasi berjalan sampai ratusan tick/detik pada 50x, sedangkan React hanya menerima snapshot ~4 kali per detik. Chart di-update langsung lewat subscription cepat (~10 Hz) tanpa melewati React.

## Determinisme dan seed

`WORLD SEED: CLINT-739241` menentukan kondisi awal, event acak, dan kecenderungan pasar. Seed yang sama menghasilkan dunia yang sama (dua dunia yang dipulihkan dari save yang sama berevolusi identik, diuji di `scripts/playtest.ts`). Seed bisa diisi manual di layar awal.

## Save

Otomatis ke IndexedDB tiap 30 detik, saat pause, saat tab disembunyikan, dan saat tutup. Refresh tidak menghapus progres. Candle dipadatkan lalu di-gzip (~7.6 MB mentah → jauh lebih kecil). Settings → **Export/Import** untuk cadangan JSON.

## Balance dan desain

Angka-angka ini diukur, bukan ditebak (lihat `scripts/`): volatilitas realisasi per aset dikalibrasi ke target harian (`calibration.ts`), drift indeks ≈ +10–30% per tahun game, crash ≈ 0.5–1 per tahun (langka), bubble tidak selalu berakhir crash, perusahaan yang rapuh (mis. IRONWHEEL AUTO) sesekali kena *bankruptcy warning*.

Tingkat kesulitan (EASY/NORMAL/HARD/CHAOS) mengubah volatilitas, frekuensi event, peluang crash, batas margin call/stop-out, spread, slippage, dan bunga pinjaman.

## Panel developer (`Ctrl+Shift+D`)

Regime, volatilitas, seed, state RNG, event aktif, variabel mesin harga per aset, level faktor. Aksi: paksa berita, paksa event, paksa crash, paksa bull/bear/regime apa pun, majukan waktu, tambah uang. Hanya untuk pengembangan.

## Stack

React 18, TypeScript (strict), Tailwind CSS 3, Zustand, IndexedDB (idb-keyval), Lightweight Charts 4, Vite.

## Catatan

- Game menganggap "hari" = 24 jam waktu pasar; hari 1 adalah Senin. Saham buka 09:30-16:00 hari kerja, forex Senin-Jumat 17:00, kripto 24/7.
- AI pada panel **CLINT AI** hanya mendeskripsikan kondisi. Ia tidak memberi sinyal beli/jual dan tidak menjanjikan hasil.
