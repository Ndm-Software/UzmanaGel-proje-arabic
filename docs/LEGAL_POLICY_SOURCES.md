# Khabiir Hukuki Metin Kaynakları

Son inceleme tarihi: 16 Temmuz 2026

Bu belge, kayıt ekranında gösterilen Arapça Kullanım Şartları ve Gizlilik Politikası taslağının kaynaklarını ve proje özellikleriyle eşleştirmesini açıklar. Metin tek bir internet sitesinden kopyalanmamış; projenin gerçek veri akışları, hizmet sağlayıcı belgeleri ve hukuki referanslar birlikte değerlendirilerek yazılmıştır.

## Proje içi teknik kaynaklar

- `frontend/src/firebase/authService.js`: Hesap oluşturma, e-posta/telefon, kullanıcı türü, uzman profili, adresler ve dosya yüklemeleri.
- `frontend/src/services/chatApi.js` ve `backend/services/chatService.js`: Konuşmalar, mesajlar, okundu durumu ve sohbet kapatma işlemleri.
- `frontend/src/services/reviewsApi.js`: Değerlendirme ve yorum verileri.
- `frontend/src/services/listingReportsApi.js`: İlan şikâyetleri.
- `backend/routes/accountRoutes.js`: Hesap silme talebi, 60 günlük geri yükleme süresi ve kalıcı silme planı.
- `backend/services/iyzicoService.js`: Etkinleştirilmesi hâlinde ödeme işlem kimliği, durum ve tutar kayıtları.
- `frontend/src/firebase/firebaseClient.js`: Firebase Authentication, Firestore ve Storage kullanımı.

## Hizmet sağlayıcı kaynakları

1. Firebase Privacy and Security
   https://firebase.google.com/support/privacy

   Kullanılan bölümler: Firebase Authentication tarafından işlenen hesap ve teknik veriler, veri güvenliği, şifreleme ve veri işleme konumları.

2. Firebase Data Processing and Security Terms
   https://firebase.google.com/terms/data-processing-terms/

   Kullanılan bölümler: Google ile platform arasındaki veri sorumluluğu, veri işleyen rolü, alt işleyenler ve güvenlik tedbirleri.

3. Firebase Clear and Export End-User Data
   https://firebase.google.com/support/privacy/clear-export-data

   Kullanılan bölümler: Kullanıcı verisinin silinmesi ve dışa aktarılması için teknik seçenekler. Projede bulunmayan otomatik dışa aktarma özelliği kullanıcı metninde vaat edilmemiştir.

4. Firebase Terms of Service
   https://firebase.google.com/terms/

   Kullanılan bölümler: Firebase hizmetlerinin genel koşulları ve olası uluslararası veri işleme konumları.

## Hukuki referanslar

1. Suriye, 2022 tarihli 20 sayılı Bilişim Suçları Kanunu
   https://menarights.org/sites/default/files/2022-04/CyberCrimeLaw_SYR_2022_AR.pdf

   Eşleşen konular: Yetkisiz erişim, çevrim içi dolandırıcılık, hukuka aykırı içerik ve ağ hizmetlerinin kötüye kullanılması.

2. Suriye, 2009 tarihli 4 sayılı Elektronik İmza ve Ağ Hizmetleri Kanunu
   https://www.syrian-lawyer.club/قانون-التوقيع-الإلكتروني-وخدمات-الشب/

   Eşleşen konular: Elektronik belgeler, elektronik hizmetler ve ağ üzerinden kurulan işlemler.

3. Suriye, 2021 tarihli 8 sayılı Tüketicinin Korunması Kanunu
   https://www.syrian-lawyer.club/نص-قانون-حماية-المستهلك-الجديد-رقم-8-لعا/

   Eşleşen konular: Yanıltıcı bilgi, fiyatların açıklığı, hizmet sunanların sorumlulukları ve tüketici hakları.

4. Avrupa Komisyonu - Kişisel veri toplanırken verilmesi gereken bilgiler
   https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/principles-gdpr/what-information-must-be-given-individuals-whose-data-collected_en

   Bu kaynak Suriye'de doğrudan uygulanabilir hukuk olarak değil; açık bir gizlilik bildiriminde bulunması gereken başlıkları kontrol etmek için uluslararası yazım standardı olarak kullanılmıştır.

## Hukukçu kontrolünde kesinleştirilecek alanlar

- Platformu işleten tüzel kişinin tam unvanı ve tebligat adresi.
- Uyuşmazlıklarda yetkili mahkeme ve uygulanacak hukuk ifadesinin nihai biçimi.
- İletişim e-postası ve varsa yerel veri sorumlusu bilgisi.
- Iyzico veya başka bir ödeme sağlayıcısının Suriye sürümünde gerçekten etkin olup olmayacağı.
- Mevzuatın Temmuz 2026 itibarıyla yürürlük ve değişiklik durumu.
- Saklama sürelerinin muhasebe, tüketici ve adli yükümlülüklerle uyumu.

Bu metin yayın öncesinde hedef ülkedeki yetkili bir hukukçu tarafından incelenmelidir.
