const servicesData = [
 {
    id: 1,
    title: "Banyo lavabo tıkanıklığı açma ve sifon tamiri",
    category: "Tesisat",
    icon: "🔧",
    provider: "Mehmet Usta",
    city: "İstanbul / Kadıköy",
    price: "750 TL'den başlayan",
    rating: "4.9",
    jobsDone: 120,
    description:
      "Kadıköy ve çevresinde banyo ve mutfak lavabo tıkanıklığı, sifon arızası ve küçük su kaçaklarında aynı gün hizmet.",
    details: [
      "Profesyonel kamera ile tıkanıklık tespiti",
      "Kimyasal yerine mekanik müdahale önceliği",
      "İş öncesi net fiyat bilgilendirmesi",
    ],
  },

  {
    id: 2,
    title: "2+1 daire komple detaylı temizlik",
    category: "Temizlik",
    icon: "🧹",
    provider: "Elif Temizlik",
    city: "Ankara / Çankaya",
    price: "1.800 TL sabit fiyat",
    rating: "4.8",
    jobsDone: 95,
    description:
      "Boş veya eşyalı 2+1 daireler için detaylı genel temizlik. Çankaya ve yakın ilçelerde hizmet veriyoruz.",
    details: [
      "Mutfak dolap içi-dışı, banyo detaylı temizlik",
      "Tüm zeminlerin makine ve uygun kimyasallarla temizliği",
      "Cam, pervaz ve kapıların silinmesi",
    ],
  },
  {
    id: 3,
    title: "Salon ve yatak odası duvar boyama",
    category: "Boyama & Badana",
    icon: "🎨",
    provider: "Ali Usta Dekorasyon",
    city: "İzmir / Karşıyaka",
    price: "3.500 TL'den başlayan",
    rating: "5.0",
    jobsDone: 60,
    description:
      "İzmir Karşıyaka bölgesinde 1 salon + 1 yatak odası için silinebilir boya ile profesyonel boyama hizmeti.",
    details: [
      "Yüzey hazırlığı, çatlak ve deliklerin onarımı",
      "İki kat silinebilir renk seçenekleri",
      "Mobilyaların örtülmesi ve işlem sonrası kaba temizlik",
    ],
  },
  {
    id: 4,
    title: "Laptop format ve hızlandırma paketi",
    category: "Bilgisayar & Yazılım",
    icon: "💻",
    provider: "TeknoDestek",
    city: "Bursa / Nilüfer",
    price: "900 TL sabit",
    rating: "4.7",
    jobsDone: 80,
    description:
      "Ev ve ofis kullanıcıları için laptop format, virüs temizliği ve performans iyileştirme hizmeti.",
    details: [
      "Lisanslı işletim sistemi kurulumu (müşteriye ait lisans ile)",
      "Sürücü ve temel programların kurulumu",
      "SSD önerisi ve performans raporu",
    ],
  },
  {
    id: 5,
    title: "İstanbul içi şehir içi parça eşya taşıma",
    category: "Nakliyat",
    icon: "🚚",
    provider: "Hızlı Nakliyat",
    city: "İstanbul / Ümraniye",
    price: "1.500 TL'den başlayan",
    rating: "4.6",
    jobsDone: 140,
    description:
      "Buzdolabı, çamaşır makinesi, dolap gibi parça eşyalar için şehir içi nakliyat hizmeti.",
    details: [
      "Eşyalar için streç ve battaniye ile koruma",
      "Asansörlü taşıma opsiyonu",
      "Sigortalı taşıma seçeneği",
    ],
  },
  {
    id: 6,
    title: "Klima bakım ve gaz kontrolü",
    category: "Klima Servisi",
    icon: "❄️",
    provider: "Serkan İklimlendirme",
    city: "Antalya / Konyaaltı",
    price: "600 TL bakım ücreti",
    rating: "4.9",
    jobsDone: 110,
    description:
      "Duvar tipi klimalarınız için genel bakım, iç/dış ünite temizliği ve gaz kontrol hizmeti.",
    details: [
      "İç ünite kimyasal ile detaylı temizleme",
      "Gaz basınç ve kaçak kontrolü",
      "Verimlilik ve enerji tüketim raporu",
    ],
  },
  {
    id: 7,
    title: "Site içi bahçe düzenleme ve çim bakımı",
    category: "Bahçe & Peyzaj",
    icon: "🌿",
    provider: "YeşilAlan Peyzaj",
    city: "Kocaeli / İzmit",
    price: "2.200 TL proje başlangıcı",
    rating: "4.8",
    jobsDone: 45,
    description:
      "Site bahçeleri ve müstakil evler için çim biçme, bitki bakımı ve mevsimsel düzenleme hizmeti.",
    details: ["Profesyonel çim biçme", "Budama ve gübreleme planı", "Sulama kontrolü"],
  },
  {
    id: 8,
    title: "Evde özel matematik dersi (LGS-YKS)",
    category: "Özel Ders",
    icon: "📚",
    provider: "Ayşe Öğretmen",
    city: "İzmir / Bornova",
    price: "350 TL / saat",
    rating: "5.0",
    jobsDone: 70,
    description:
      "Ortaokul ve lise öğrencileri için sınav odaklı, seviyeye uygun matematik özel dersleri.",
    details: ["Seviye tespiti", "Ödevlendirme", "Online/Yüz yüze seçenekleri"],
  },
  {
    id: 9,
    title: "3+1 daire anahtar teslim tadilat keşfi",
    category: "Tadilat & Dekorasyon",
    icon: "🏠",
    provider: "ProTadilat",
    city: "İstanbul / Bakırköy",
    price: "Ücretsiz keşif, teklif sonrası",
    rating: "4.5",
    jobsDone: 35,
    description:
      "Mutfak, banyo, zemin ve boya dahil komple tadilat için yerinde keşif ve detaylı fiyatlandırma.",
    details: ["Yerinde keşif", "Yazılı teklif", "İş programı"],
  },
  {
    id: 10,
    title: "Profesyonel ev fotoğraf çekimi",
    category: "Fotoğraf & Video",
    icon: "📷",
    provider: "LensArt Stüdyo",
    city: "Ankara / Yenimahalle",
    price: "1.200 TL paket",
    rating: "4.9",
    jobsDone: 52,
    description:
      "Emlak ilanları ve Airbnb kiralamaları için iç mekân odaklı profesyonel fotoğraf çekimi.",
    details: ["30 fotoğraf teslim", "Geniş açı + ışık", "3 iş günü teslim"],
  },
  {
    id: 11,
    title: "Kurumsal web sitesi tasarım paketi",
    category: "Web Tasarım",
    icon: "🌐",
    provider: "DijitalAtölye",
    city: "Eskişehir / Tepebaşı",
    price: "8.500 TL'den başlayan",
    rating: "4.7",
    jobsDone: 40,
    description:
      "KOBİ ve serbest meslek sahipleri için mobil uyumlu, yönetim paneli olan kurumsal web sitesi.",
    details: ["Özel tasarım", "SEO", "1 yıl destek"],
  },
  {
    id: 12,
    title: "Evcil hayvan gezdirme ve günlük bakım",
    category: "Evcil Hayvan",
    icon: "🐾",
    provider: "PatiDostu",
    city: "İstanbul / Beşiktaş",
    price: "300 TL / seans",
    rating: "5.0",
    jobsDone: 65,
    description:
      "Yoğun çalışan hayvan sahipleri için köpek gezdirme ve günlük mama/su kontrolü hizmeti.",
    details: ["30-45 dk yürüyüş", "Fotoğraf ile bilgilendirme", "Temel komut opsiyonu"],
  },{
  id: 13,
  title: "Kombi bakım ve petek temizliği",
  category: "Tesisat",
  icon: "🔥",
  provider: "IsıTek Servis",
  city: "Ankara / Keçiören",
  price: "950 TL bakım",
  rating: "4.8",
  jobsDone: 150,
  description:
    "Kombi yıllık bakım, petek temizliği ve arıza kontrol hizmeti.",
  details: [
    "Yanma odası temizliği",
    "Petek içi kimyasal temizleme",
    "Gaz kaçağı kontrolü"
  ],
},

{
  id: 14,
  title: "3+1 ev taşınma paketi",
  category: "Nakliyat",
  icon: "📦",
  provider: "Güven Nakliyat",
  city: "İzmir / Bornova",
  price: "4.500 TL'den başlayan",
  rating: "4.7",
  jobsDone: 98,
  description:
    "3+1 daireler için asansörlü, sigortalı şehir içi taşımacılık hizmeti.",
  details: [
    "Asansörlü taşıma",
    "Mobilya sökme & kurulum",
    "Sigortalı nakliye"
  ],
},

{
  id: 15,
  title: "Profesyonel koltuk yıkama",
  category: "Temizlik",
  icon: "🛋️",
  provider: "TemizEv Hizmetleri",
  city: "Bursa / Osmangazi",
  price: "1.200 TL set fiyat",
  rating: "4.9",
  jobsDone: 210,
  description:
    "Yerinde koltuk, yatak ve sandalye yıkama hizmeti.",
  details: [
    "Antibakteriyel yıkama",
    "Leke çıkarma işlemi",
    "2-4 saat kuruma süresi"
  ],
},

{
  id: 16,
  title: "WordPress web sitesi kurulumu",
  category: "Web Tasarım",
  icon: "🖥️",
  provider: "WebCraft Ajans",
  city: "İstanbul / Şişli",
  price: "6.000 TL paket",
  rating: "4.6",
  jobsDone: 55,
  description:
    "Kurumsal veya blog siteleri için WordPress kurulum ve tasarım hizmeti.",
  details: [
    "Tema kurulumu",
    "SEO ayarları",
    "Mobil uyumlu tasarım"
  ],
},

{
  id: 17,
  title: "Dış cephe mantolama ve boya",
  category: "Tadilat & Dekorasyon",
  icon: "🏗️",
  provider: "YapıMaster",
  city: "Antalya / Muratpaşa",
  price: "Keşif sonrası fiyat",
  rating: "4.5",
  jobsDone: 40,
  description:
    "Bina dış cephe ısı yalıtımı ve boya uygulama hizmeti.",
  details: [
    "Isı yalıtım levha uygulama",
    "Fileli sıva sistemi",
    "Uzun ömürlü dış cephe boyası"
  ],
},

{
  id: 18,
  title: "Düğün ve nişan fotoğraf çekimi",
  category: "Fotoğraf & Video",
  icon: "🎥",
  provider: "DreamShot Studio",
  city: "Konya / Selçuklu",
  price: "7.500 TL paket",
  rating: "5.0",
  jobsDone: 73,
  description:
    "Düğün, nişan ve özel günler için profesyonel fotoğraf ve video çekimi.",
  details: [
    "Full HD video çekim",
    "Drone görüntüleri",
    "Albüm teslimi"
  ],
},
{
  id: 19,
  title: "Klima montaj ve söküm hizmeti",
  category: "Klima Servisi",
  icon: "🧊",
  provider: "SerinTek Klima",
  city: "Adana / Seyhan",
  price: "1.200 TL'den başlayan",
  rating: "4.8",
  jobsDone: 89,
  description:
    "Yeni klima montajı, eski klima söküm ve yer değişimi hizmeti.",
  details: [
    "Bakır boru ve izolasyon işlemi",
    "Vakumlama ve gaz kontrolü",
    "Montaj sonrası test çalıştırma"
  ],
},

{
  id: 20,
  title: "Online İngilizce özel ders",
  category: "Özel Ders",
  icon: "🗣️",
  provider: "Global English Academy",
  city: "Online",
  price: "400 TL / saat",
  rating: "4.9",
  jobsDone: 130,
  description:
    "Çocuklar ve yetişkinler için konuşma odaklı online İngilizce dersleri.",
  details: [
    "Seviye belirleme testi",
    "Konuşma pratiği",
    "Haftalık gelişim raporu"
  ],
},
];

export default servicesData;