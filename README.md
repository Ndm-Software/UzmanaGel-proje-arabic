# 📌 UzmanaGel Web Projesi – README

Bu dosya:

- 📂 Projedeki tüm önemli klasör ve dosyaların açıklamasını  
- 🔀 Yaptığımız işleri `main` branch’ine güvenli şekilde aktarmamızı sağlayan temel Git komutlarını  

içermektedir.

=====================================================================

# ==============================
# 🚀 PROJE DOSYA YAPISI VE AÇIKLAMALARI
# ==============================

📁 ANA KLASÖRLER

🔹 backend/
Backend tarafı için ayrılmış klasör.
Şu anda aktif olmayabilir. İleride API, Firebase Functions veya başka bir
sunucu tarafı geliştirmesi için kullanılabilir.

🔹 frontend/
Asıl React (Vite) frontend uygulaması burada yer alır.
Projeyi çalıştırırken genellikle bu klasöre girilir.

---------------------------------------------------------------------

📄 TEMEL DOSYALAR

🔹 index.html
Vite’in ana HTML dosyasıdır.
React uygulaması bu dosyaya bağlanır.

🔹 src/main.jsx
React uygulamasının giriş (entry) dosyasıdır.
Genellikle <App /> bileşeni burada render edilir.

🔹 src/App.jsx
Uygulamanın ana bileşenidir.
Genellikle:
- Router yapısı
- Sayfa yönlendirmeleri
- Genel layout
- Global yapılandırmalar
burada bulunur.

🔹 src/index.css
Projenin genel (global) stillerini içerir.

🔹 src/App.css
Şu an boş olabilir ancak ileride uygulama geneli için kullanılabilir.

---------------------------------------------------------------------

2️⃣ SAYFALAR (Pages)

📁 src/pages/

- HomePage.jsx
- LoginPage.jsx
- RegisterPage.jsx

Her sayfanın UI bileşeni burada bulunur.

---------------------------------------------------------------------

3️⃣ ORTAK BİLEŞENLER (Components)

📁 src/components/

🔹 PageTransition.jsx
Sayfa geçiş animasyonları için kullanılır.
(Örneğin: Framer Motion ile animasyon)

---------------------------------------------------------------------

4️⃣ STİL DOSYALARI

📁 src/styles/

- HomePage.css
- LoginPage.css
- RegisterPage.css

Her sayfanın kendine ait CSS dosyası burada bulunur.
Sayfalar arası tasarım birliği buradan kontrol edilir.

---------------------------------------------------------------------

5️⃣ GÖRSELLER

📁 src/assets/pictures/

Örnek dosyalar:
- HomePageLogo.png
- Logo.png
- Turkiye.png
- UK.png

---------------------------------------------------------------------

6️⃣ PAKET VE AYAR DOSYALARI

🔹 eslint.config.js
Kod kalitesi ve yazım kurallarını kontrol eder.

🔹 node_modules/
Bu klasör GitHub’a yüklenmez.
Her geliştirici kendi bilgisayarında şu komut ile oluşturur:

npm install

.gitignore dosyasında yer almalıdır.

=====================================================================

# ==============================
# 🔀 GIT KOMUTLARI VE BRANCH YÖNETİMİ
# ==============================

A) PROJEYİ İLK DEFA KURMA

1- git clone <repo_linki>
2- cd frontend
3- npm install
4- npm run dev

---------------------------------------------------------------------

B) YENİ BRANCH OLUŞTURUP ÇALIŞMALARI PUSH ETME

1- git checkout -b (branch-ismi)
2- git add .
3- git commit -m "İsmin - kısa açıklama"
4- git push -u origin (branch-ismi)

Açıklama:
- -b → Yeni branch oluşturur ve o branch’e geçer.
- -u → Bundan sonra sadece git push yazman yeterli olur.

---------------------------------------------------------------------

C) UZAKTAKİ BRANCH’LERİ LİSTELEME

git branch -r

Sadece GitHub’daki branch’leri gösterir.

---------------------------------------------------------------------

D) MAIN BRANCH’İ GÜNCELLEME

1- git checkout main
2- git pull

Bu komut:
- main branch’ine geçer
- GitHub’daki en güncel origin/main değişikliklerini indirir
- Bilgisayarındaki main ile birleştirir

---------------------------------------------------------------------

E) UZAKTAKİ BRANCH BİLGİLERİNİ GÜNCELLEME

git fetch origin --prune

- GitHub’daki en güncel branch ve commit bilgilerini indirir.
- --prune → GitHub’da silinmiş branch’leri senin bilgisayarından da temizler.

---------------------------------------------------------------------

F) MAIN İLE ÇAKIŞMA KONTROLÜ (MERGE TESTİ)

1- git checkout (senin branch)
2- git fetch origin
3- git merge origin/main

Bu işlem:
- main branch’inin en güncel halini
- Senin branch’inle geçici olarak birleştirir.

Conflict oluşursa dosyalar manuel olarak düzeltilmelidir.

---------------------------------------------------------------------

MERGE SONRASI

1- git add .
2- git commit -m "Main ile merge edildi"
3- git push origin (senin branch)

Daha sonra GitHub üzerinden Pull Request açılır ve
main branch’ine merge edilir.

=====================================================================

ÖNEMLİ NOTLAR

- Direkt main branch üzerinde çalışılmaz.
- Her özellik için ayrı branch açılır.
- Pull Request ile merge yapılır.
- Merge öncesi origin/main ile test edilir.

=====================================================================
# ==============================
# 🔥 FireBase Hesabı: (Veritabanı)
# ==============================
mail : -
şifre : -

=====================================================================

UzmanaGel Team
