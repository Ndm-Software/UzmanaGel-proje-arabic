import { Link } from "react-router-dom";
import PageTransition from "../components/PageTransition";
import Navbar from "../components/Navbar"; // Navbar bileşenini import et
import "../styles/HomePage.css";
import "../styles/KvkkPage.css";
import brandImage from "../assets/pictures/Logo.png";

export default function KvkkPage() {
  return (
    <PageTransition>
      <div className="landing-page">
        <Navbar />
        {/* KVKK CONTENT */}
        <section className="section-band section-band--plain">
          <main className="legal-page">
            <div className="legal-container">
              <header className="legal-header">
                <h1>UzmanaGel Kişisel Verilerin Korunması ve Gizlilik Politikası</h1>
                <p>
                  Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;)
                  kapsamında, UzmanaGel platformunda işlenen kişisel verilerin hangi
                  amaçlarla, hangi hukuki sebeplere dayanarak ve nasıl korunduğunu
                  ayrıntılı şekilde açıklamaktadır.
                </p>
              </header>

              <section className="legal-section">
                <h2>1. Veri Sorumlusu</h2>
                <p>
                  UzmanaGel internet sitesi ve mobil uygulamasında işlenen kişisel
                  verilerden, KVKK kapsamında veri sorumlusu olarak
                  &quot;UzmanaGel&quot; sorumludur. Bu metinde geçen
                  &quot;UzmanaGel&quot; ifadesi, platformu işleten tüzel kişiyi ifade
                  eder.
                </p>
              </section>

              <section className="legal-section">
                <h2>2. İşlediğimiz Kişisel Veri Kategorileri</h2>
                <p>
                  Platformu kullanma şeklinize göre aşağıdaki kişisel veri
                  kategorilerini işleyebiliriz:
                </p>
                <ul>
                  <li>
                    <strong>Kimlik Bilgileri:</strong> İsim, soyisim, profil adı,
                    uzman profili bilgileri.
                  </li>
                  <li>
                    <strong>İletişim Bilgileri:</strong> E-posta adresi, telefon
                    numarası, şehir ve ilçe bilgisi.
                  </li>
                  <li>
                    <strong>Hesap Bilgileri:</strong> Giriş bilgileri, şifre (kriptolu
                    biçimde saklanır), hesap oluşturma ve güncelleme tarihleri.
                  </li>
                  <li>
                    <strong>İşlem ve Talep Bilgileri:</strong> Oluşturduğunuz iş
                    talepleri, talep açıklamaları, seçtiğiniz uzmanlar, randevu
                    detayları, puanlama ve yorumlarınız.
                  </li>
                  <li>
                    <strong>Görsel ve Ses Kayıtları:</strong> Arıza fotoğrafları,
                    uzman profiline yüklediğiniz görseller, iletişim kapsamında
                    paylaştığınız dosyalar.
                  </li>
                  <li>
                    <strong>Teknik Kullanım Verileri:</strong> IP adresi, cihaz türü,
                    işletim sistemi ve tarayıcı bilgileri, oturum süresi, sayfa
                    görüntüleme kayıtları, çerezler ve benzeri teknolojilerle elde
                    edilen kullanım verileri.
                  </li>
                  <li>
                    <strong>Ödeme ve Faturalama Bilgileri:</strong> Ödeme tarihi,
                    tutar, kullanılan ödeme aracı türü, fatura bilgileri (ödeme
                    sağlayıcılar üzerinden, KVKK ve ilgili mevzuata uygun şekilde).
                  </li>
                </ul>
              </section>

              <section className="legal-section">
                <h2>3. Kişisel Verileri İşleme Amaçlarımız</h2>
                <p>Kişisel verilerinizi aşağıdaki amaçlarla işleriz:</p>
                <ul>
                  <li>
                    UzmanaGel platformunun çalışması, üyelik ve giriş işlemlerinin
                    yönetilmesi,
                  </li>
                  <li>
                    Uzman ve hizmet arayan kullanıcıların eşleştirilmesi, ilan,
                    teklif, randevu ve hizmet süreçlerinin yürütülmesi,
                  </li>
                  <li>
                    Arıza fotoğrafı yükleme, uzman seçimi, konum bazlı hizmet
                    sunulması gibi temel fonksiyonların sağlanması,
                  </li>
                  <li>
                    Ödeme süreçlerinin yürütülmesi, muhasebe ve faturalama
                    işlemlerinin yapılması,
                  </li>
                  <li>
                    Kullanıcı hesap güvenliğinin sağlanması, şüpheli işlem
                    incelemeleri ve dolandırıcılığın önlenmesi,
                  </li>
                  <li>
                    Destek taleplerinizin yanıtlanması, şikâyet ve geri bildirim
                    süreçlerinin yönetilmesi,
                  </li>
                  <li>
                    Platformun performansının iyileştirilmesi, hataların tespiti ve
                    giderilmesi, yeni özelliklerin geliştirilmesi,
                  </li>
                  <li>
                    Hukuki yükümlülüklerin yerine getirilmesi, resmi mercilerden
                    gelen taleplere yanıt verilmesi,
                  </li>
                  <li>
                    Açık rızanız olması hâlinde; kampanya, duyuru ve pazarlama
                    iletişimlerinin yapılması.
                  </li>
                </ul>
              </section>

              <section className="legal-section">
                <h2>4. KVKK Kapsamında Hukuki Sebepler</h2>
                <p>
                  Kişisel verilerinizi KVKK&apos;nın 5. ve 6. maddelerinde yer alan
                  aşağıdaki hukuki sebeplere dayanarak işleriz:
                </p>
                <ul>
                  <li>
                    <strong>Açık rızanızın bulunması,</strong>
                  </li>
                  <li>
                    <strong>Kanunlarda açıkça öngörülmesi,</strong>
                  </li>
                  <li>
                    <strong>
                      Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili
                      olması (üyelik, hizmet ilişkisinin kurulması vb.),
                    </strong>
                  </li>
                  <li>
                    <strong>
                      Hukuki yükümlülüklerimizi yerine getirebilmemiz için zorunlu
                      olması,
                    </strong>
                  </li>
                  <li>
                    <strong>
                      Bir hakkın tesisi, kullanılması veya korunması için veri
                      işlemenin zorunlu olması,
                    </strong>
                  </li>
                  <li>
                    <strong>
                      Temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru
                      menfaatlerimiz için zorunlu olması.
                    </strong>
                  </li>
                </ul>
              </section>

              <section className="legal-section">
                <h2>5. Verilerin Aktarıldığı Taraflar</h2>
                <p>
                  Kişisel verilerinizi, KVKK&apos;ya uygun şekilde ve veri
                  minimizasyonu ilkesi çerçevesinde aşağıdaki alıcı gruplarıyla
                  paylaşabiliriz:
                </p>
                <ul>
                  <li>
                    <strong>Uzmanlar ve hizmet sağlayıcılar:</strong> Sadece iş
                    talebinizin karşılanması için gerekli olduğu ölçüde (örneğin
                    adınız, il/ilçe, talep detayları).
                  </li>
                  <li>
                    <strong>Ödeme kuruluşları ve bankalar:</strong> Ödeme işlemlerinin
                    yürütülmesi için zorunlu bilgiler.
                  </li>
                  <li>
                    <strong>İş ortaklarımız ve teknik hizmet sağlayıcılarımız:</strong>{" "}
                    barındırma (hosting), e-posta/SMS gönderimi, loglama, güvenlik ve
                    performans izleme hizmetleri.
                  </li>
                  <li>
                    <strong>Yetkili kamu kurum ve kuruluşları:</strong> Yasal
                    yükümlülüklerimizin gerektirdiği hallerde ve ilgili mevzuat
                    çerçevesinde.
                  </li>
                </ul>
                <p>
                  Yurt dışına veri aktarımı söz konusu olduğunda, KVKK&apos;da
                  öngörülen açık rıza ve/veya Kurul tarafından belirlenen yeterli
                  koruma tedbirleri dikkate alınır.
                </p>
              </section>

              <section className="legal-section">
                <h2>6. Kişisel Verilerin Saklanma Süresi</h2>
                <p>
                  Kişisel verileriniz, ilgili mevzuatta öngörülen zamanaşımı ve saklama
                  süreleri ile meşru menfaatlerimiz göz önünde bulundurularak;
                  hizmetin sunulması için gerekli süre boyunca ve sonrasında yasal
                  yükümlülüklerimizi yerine getirebilmemiz için zorunlu olduğu
                  ölçüde saklanır.
                </p>
                <p>
                  Saklama süresi sona eren kişisel veriler; şirketimiz tarafından
                  silinir, yok edilir veya anonim hale getirilir.
                </p>
              </section>

              <section className="legal-section">
                <h2>7. Kişisel Verilerin Korunması İçin Aldığımız Tedbirler</h2>
                <p>
                  UzmanaGel olarak, kişisel verilerinizin güvenliğini sağlamak için
                  teknik ve idari tedbirler alırız. Bunlar arasında özellikle
                  aşağıdakiler yer alır:
                </p>
                <ul>
                  <li>
                    Güçlü şifreleme algoritmaları kullanarak şifrelerin kriptolu
                    biçimde saklanması,
                  </li>
                  <li>
                    Sunucu ve veri tabanlarında erişim yetkilerinin rol ve görev
                    tanımlarına göre sınırlandırılması,
                  </li>
                  <li>
                    Güvenlik duvarı, saldırı tespit/önleme sistemleri ve benzeri
                    ağ güvenliği önlemleri,
                  </li>
                  <li>
                    Log kayıtlarının tutulması ve şüpheli işlemlerin incelemesi,
                  </li>
                  <li>
                    Gerekli olduğu ölçüde yedekleme ve felaket kurtarma
                    mekanizmalarının oluşturulması,
                  </li>
                  <li>
                    Çalışanlarımız ve iş ortaklarımız için KVKK ve bilgi güvenliği
                    konularında farkındalık çalışmaları yapılması,
                  </li>
                  <li>
                    Veri işleme faaliyetlerinin periyodik olarak gözden geçirilmesi ve
                    güncellenmesi.
                  </li>
                </ul>
              </section>

              <section className="legal-section">
                <h2>8. İlgili Kişi Olarak Haklarınız</h2>
                <p>
                  KVKK&apos;nın 11. maddesi uyarınca, UzmanaGel&apos;e başvurarak
                  aşağıdaki haklara sahipsiniz:
                </p>
                <ul>
                  <li>Kişisel verinizin işlenip işlenmediğini öğrenme,</li>
                  <li>
                    İşlenmişse buna ilişkin bilgi talep etme ve işleme amaçlarını
                    öğrenme,
                  </li>
                  <li>
                    Yurt içinde veya yurt dışında kişisel verilerin aktarıldığı üçüncü
                    kişileri bilme,
                  </li>
                  <li>
                    Eksik veya yanlış işlenmiş olması hâlinde bunların düzeltilmesini
                    isteme,
                  </li>
                  <li>
                    KVKK ve ilgili diğer kanun hükümlerine uygun olarak işlenmiş
                    olmasına rağmen, işlenmesini gerektiren sebeplerin ortadan
                    kalkması hâlinde kişisel verilerin silinmesini veya yok
                    edilmesini isteme,
                  </li>
                  <li>
                    Düzeltme, silme veya yok etme işlemlerinin kişisel verilerin
                    aktarıldığı üçüncü kişilere bildirilmesini talep etme,
                  </li>
                  <li>
                    İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla
                    analiz edilmesi suretiyle kişinin kendisi aleyhine bir sonucun
                    ortaya çıkmasına itiraz etme,
                  </li>
                  <li>
                    Kişisel verilerin kanuna aykırı olarak işlenmesi sebebiyle
                    zarara uğramanız hâlinde zararın giderilmesini talep etme.
                  </li>
                </ul>
              </section>

              <section className="legal-section">
                <h2>9. Başvuru Yöntemi</h2>
                <p>
                  KVKK kapsamındaki haklarınıza ilişkin taleplerinizi, kimliğinizi
                  tespit etmeye yarayan belgelerle birlikte, yazılı olarak veya kayıtlı
                  elektronik posta (KEP) adresi, güvenli elektronik imza ya da tarafınızca
                  bildirilen ve sistemimizde kayıtlı bulunan e-posta adresinizi
                  kullanmak suretiyle UzmanaGel&apos;e iletebilirsiniz.
                </p>
                <p>
                  Başvurularınız, KVKK&apos;da öngörülen süreler içerisinde
                  değerlendirilecek ve tarafınıza dönüş sağlanacaktır.
                </p>
              </section>

              <section className="legal-section">
                <h2>10. Politika Güncellemeleri</h2>
                <p>
                  Bu KVKK ve Gizlilik Politikası, platformun ve ilgili mevzuatın
                  gelişimine paralel olarak güncellenebilir. Güncellenmiş metin
                  UzmanaGel internet sitesi ve/veya mobil uygulaması üzerinden
                  yayımlandığı tarihten itibaren geçerli olur.
                </p>
              </section>
            </div>
          </main>
        </section>
      </div>
    </PageTransition>
  );
}