export const listings = [
    {
        id: 1,
        title: 'Kombi Bakımı ve Tamiri',
        category: 'Kombi Klima Bakımı',
        location: 'Kadıköy, İstanbul',
        rating: 4.8,
        reviews: 124,
        price: 350,
        image: 'https://via.placeholder.com/300x200/d6b25e/ffffff?text=Kombi+Bakimi',
        expertName: 'Ahmet Yılmaz',
        expertAvatar: 'AY',
        // Ek detaylar
        experience: 8,
        completedJobs: 248,
        verified: true,
        about: '8 yıllık kombi ve klima servis deneyimim ile evinizin konforu için çalışıyorum. Tüm markalara yetkili servis desteği.',
        phone: '+90 532 123 45 67',
        email: 'ahmet.yilmaz@example.com',
        address: 'Caferağa Mah. Albay Faik Sözdener Cad. No:15, Kadıköy/İstanbul',
        skills: ['Kombi Bakımı', 'Klima Montajı', 'Arıza Tespiti', 'Yedek Parça Değişimi', 'Periyodik Bakım'],
        services: [
            { name: 'Kombi Bakımı', price: 350, unit: 'İşçilik' },
            { name: 'Klima Bakımı', price: 400, unit: 'İşçilik' },
            { name: 'Arıza Tespiti', price: 150, unit: 'Keşif' },
            { name: 'Acil Müdahale', price: 500, unit: 'İşçilik' }
        ],
        reviews_list: [
            {
                id: 1,
                user: 'Mehmet Demir',
                rating: 5,
                date: '2 gün önce',
                comment: 'Çok memnun kaldım, kombim sorunsuz çalışıyor. Teşekkürler Ahmet Usta.',
                avatar: 'M'
            },
            {
                id: 2,
                user: 'Zeynep Kaya',
                rating: 5,
                date: '1 hafta önce',
                comment: 'Zamanında geldi, işini temiz yaptı. Kesinlikle tavsiye ederim.',
                avatar: 'Z'
            }
        ],
        gallery: [
            'https://picsum.photos/id/1010/300/200',
            'https://picsum.photos/id/1043/300/200',
            'https://picsum.photos/id/1050/300/200',
            'https://picsum.photos/id/1060/300/200'
        ],
        certificates: [
            { name: 'Yetkili Servis Belgesi', verified: true },
            { name: 'Mesleki Yeterlilik', verified: true }
        ],
        workingHours: [
            { days: 'Pazartesi - Cuma', hours: '09:00 - 19:00' },
            { days: 'Cumartesi', hours: '10:00 - 16:00' },
            { days: 'Pazar', hours: 'Kapalı', closed: true }
        ],
        mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3011.650493883011!2d29.1243!3d40.9897!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDDCsDU5JzIzLjAiTiAyOcKwMDcnMjcuNSJF!5e0!3m2!1str!2str!4v1630000000000!5m2!1str!2str'
    },
    {
        id: 2,
        title: 'Musluk Tamiri ve Değişimi',
        category: 'Su Tesisatı',
        location: 'Beşiktaş, İstanbul',
        rating: 4.9,
        reviews: 256,
        price: 250,
        image: 'https://via.placeholder.com/300x200/d6b25e/ffffff?text=Musluk+Tamiri',
        expertName: 'Mehmet Demir',
        expertAvatar: 'MD',
        // Ek detaylar
        experience: 12,
        completedJobs: 512,
        verified: true,
        about: '12 yıldır su tesisatı sektöründe hizmet veriyorum. Her türlü musluk, batarya ve tesisat arızasında profesyonel çözümler.',
        phone: '+90 533 234 56 78',
        email: 'mehmet.demir@example.com',
        address: 'Vişnezade Mah. Süleyman Seba Cad. No:25, Beşiktaş/İstanbul',
        skills: ['Musluk Tamiri', 'Batarya Değişimi', 'Su Kaçağı Tespiti', 'Tıkanıklık Açma', 'Tesisat Çekimi'],
        services: [
            { name: 'Musluk Tamiri', price: 250, unit: 'İşçilik' },
            { name: 'Batarya Değişimi', price: 350, unit: 'İşçilik' },
            { name: 'Su Kaçağı Tespiti', price: 400, unit: 'İşçilik' },
            { name: 'Tıkanıklık Açma', price: 300, unit: 'İşçilik' }
        ],
        reviews_list: [
            {
                id: 1,
                user: 'Ali Yıldız',
                rating: 5,
                date: '3 gün önce',
                comment: 'Musluğumuzu çok kısa sürede tamir etti. Fiyat da çok uygundu.',
                avatar: 'A'
            },
            {
                id: 2,
                user: 'Fatma Çelik',
                rating: 4,
                date: '5 gün önce',
                comment: 'İşini bilen bir usta, tavsiye ederim.',
                avatar: 'F'
            }
        ],
        gallery: [
            'https://picsum.photos/id/1011/300/200',
            'https://picsum.photos/id/1044/300/200',
            'https://picsum.photos/id/1051/300/200',
            'https://picsum.photos/id/1061/300/200'
        ],
        certificates: [
            { name: 'Ustalık Belgesi', verified: true },
            { name: 'SGK Kaydı', verified: true }
        ],
        workingHours: [
            { days: 'Pazartesi - Cuma', hours: '08:00 - 20:00' },
            { days: 'Cumartesi', hours: '09:00 - 17:00' },
            { days: 'Pazar', hours: 'Kapalı', closed: true }
        ],
        mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3011.650493883011!2d29.0243!3d41.0897!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDHCsDA1JzIzLjAiTiAyOcKwMDcnMjcuNSJF!5e0!3m2!1str!2str!4v1630000000000!5m2!1str!2str'
    },
    {
        id: 3,
        title: 'Klima Montaj ve Bakım',
        category: 'Kombi Klima Bakımı',
        location: 'Çankaya, Ankara',
        rating: 4.7,
        reviews: 89,
        price: 600,
        image: 'https://via.placeholder.com/300x200/d6b25e/ffffff?text=Klima',
        expertName: 'Ali Kaya',
        expertAvatar: 'AK',
        experience: 6,
        completedJobs: 178,
        verified: true,
        about: 'Klima montajı, bakımı ve arıza tespiti konusunda uzman ekibimle hizmetinizdeyim.',
        phone: '+90 535 345 67 89',
        email: 'ali.kaya@example.com',
        address: 'Kızılay Mah. Atatürk Bulvarı No:123, Çankaya/Ankara',
        skills: ['Klima Montajı', 'Klima Bakımı', 'Gaz Dolumu', 'Arıza Tespiti', 'Temizlik'],
        services: [
            { name: 'Klima Montajı', price: 600, unit: 'İşçilik' },
            { name: 'Klima Bakımı', price: 400, unit: 'İşçilik' },
            { name: 'Gaz Dolumu', price: 500, unit: 'İşçilik' },
            { name: 'Arıza Tespiti', price: 200, unit: 'Keşif' }
        ],
        reviews_list: [
            {
                id: 1,
                user: 'Can Yılmaz',
                rating: 5,
                date: '1 hafta önce',
                comment: 'Klima montajını sorunsuz yaptı, çok memnun kaldım.',
                avatar: 'C'
            }
        ],
        gallery: [
            'https://picsum.photos/id/1012/300/200',
            'https://picsum.photos/id/1045/300/200',
            'https://picsum.photos/id/1052/300/200',
            'https://picsum.photos/id/1062/300/200'
        ],
        certificates: [
            { name: 'Yetkili Servis', verified: true }
        ],
        workingHours: [
            { days: 'Pazartesi - Cuma', hours: '09:00 - 18:00' },
            { days: 'Cumartesi', hours: '10:00 - 15:00' },
            { days: 'Pazar', hours: 'Kapalı', closed: true }
        ],
        mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3011.650493883011!2d32.8543!3d39.9197!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMznCsDU1JzIzLjAiTiAzMsKwNTEnMjcuNSJF!5e0!3m2!1str!2str!4v1630000000000!5m2!1str!2str'
    },
    {
        id: 4,
        title: 'Elektrik Tesisatı Tamiri',
        category: 'Elektrik',
        location: 'Konak, İzmir',
        rating: 4.6,
        reviews: 67,
        price: 400,
        image: 'https://via.placeholder.com/300x200/d6b25e/ffffff?text=Elektrik',
        expertName: 'Ayşe Tekin',
        expertAvatar: 'AT',
        experience: 5,
        completedJobs: 134,
        verified: true,
        about: 'Elektrik tesisatı, arıza tespiti ve tamir işlerinde uzman ekibimle hizmetinizdeyim.',
        phone: '+90 537 456 78 90',
        email: 'ayse.tekin@example.com',
        address: 'Alsancak Mah. Kıbrıs Şehitleri Cad. No:45, Konak/İzmir',
        skills: ['Elektrik Tesisatı', 'Arıza Tespiti', 'Sigorta Değişimi', 'Kablo Çekimi', 'Aydınlatma'],
        services: [
            { name: 'Arıza Tespiti', price: 200, unit: 'Keşif' },
            { name: 'Tesisat Tamiri', price: 400, unit: 'İşçilik' },
            { name: 'Sigorta Değişimi', price: 150, unit: 'İşçilik' },
            { name: 'Kablo Çekimi', price: 350, unit: 'Metre' }
        ],
        reviews_list: [
            {
                id: 1,
                user: 'Burak Öz',
                rating: 5,
                date: '3 gün önce',
                comment: 'Elektrik sorunumuzu hemen çözdü, çok profesyonel.',
                avatar: 'B'
            }
        ],
        gallery: [
            'https://picsum.photos/id/1013/300/200',
            'https://picsum.photos/id/1046/300/200',
            'https://picsum.photos/id/1053/300/200',
            'https://picsum.photos/id/1063/300/200'
        ],
        certificates: [
            { name: 'Elektrikçi Belgesi', verified: true }
        ],
        workingHours: [
            { days: 'Pazartesi - Cuma', hours: '09:00 - 18:00' },
            { days: 'Cumartesi', hours: '09:00 - 14:00' },
            { days: 'Pazar', hours: 'Kapalı', closed: true }
        ],
        mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3011.650493883011!2d27.1423!3d38.4197!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzjCsDI1JzIzLjAiTiAyN8KwMDgnMjcuNSJF!5e0!3m2!1str!2str!4v1630000000000!5m2!1str!2str'
    },
    {
        id: 5,
        title: 'Petek Temizliği',
        category: 'Kombi Klima Bakımı',
        location: 'Nilüfer, Bursa',
        rating: 4.5,
        reviews: 34,
        price: 450,
        image: 'https://via.placeholder.com/300x200/d6b25e/ffffff?text=Petek',
        expertName: 'Can Yalçın',
        expertAvatar: 'CY',
        experience: 4,
        completedJobs: 68,
        verified: true,
        about: 'Petek temizliği, kombi bakımı ve ısınma sistemleri konusunda uzmanım.',
        phone: '+90 539 567 89 01',
        email: 'can.yalcin@example.com',
        address: 'Fethiye Mah. İzmir Yolu Cad. No:78, Nilüfer/Bursa',
        skills: ['Petek Temizliği', 'Kombi Bakımı', 'Tesisat Yıkama', 'Radyatör Montajı'],
        services: [
            { name: 'Petek Temizliği', price: 450, unit: 'İşçilik' },
            { name: 'Kombi Bakımı', price: 350, unit: 'İşçilik' },
            { name: 'Tesisat Yıkama', price: 600, unit: 'İşçilik' }
        ],
        reviews_list: [],
        gallery: [
            'https://picsum.photos/id/1014/300/200',
            'https://picsum.photos/id/1047/300/200',
            'https://picsum.photos/id/1054/300/200',
            'https://picsum.photos/id/1064/300/200'
        ],
        certificates: [],
        workingHours: [
            { days: 'Pazartesi - Cuma', hours: '08:00 - 18:00' },
            { days: 'Cumartesi', hours: '08:00 - 16:00' },
            { days: 'Pazar', hours: 'Kapalı', closed: true }
        ],
        mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3011.650493883011!2d28.9423!3d40.2297!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDDCsDEzJzIzLjAiTiAyOMKwNTYnMjcuNSJF!5e0!3m2!1str!2str!4v1630000000000!5m2!1str!2str'
    },
    {
        id: 6,
        title: 'Banyo Tadilatı',
        category: 'Su Tesisatı',
        location: 'Muratpaşa, Antalya',
        rating: 4.9,
        reviews: 178,
        price: 2500,
        image: 'https://via.placeholder.com/300x200/d6b25e/ffffff?text=Tadilat',
        expertName: 'Zeynep Aksoy',
        expertAvatar: 'ZA',
        experience: 10,
        completedJobs: 356,
        verified: true,
        about: 'Banyo tadilatı, tesisat yenileme ve dekorasyon konularında 10 yıllık deneyim.',
        phone: '+90 541 678 90 12',
        email: 'zeynep.aksoy@example.com',
        address: 'Kışla Mah. Güllük Cad. No:34, Muratpaşa/Antalya',
        skills: ['Banyo Tadilatı', 'Tesisat Yenileme', 'Fayans Döşeme', 'Klozet Montajı', 'Duşakaban'],
        services: [
            { name: 'Banyo Tadilatı', price: 2500, unit: 'İşçilik' },
            { name: 'Tesisat Yenileme', price: 1800, unit: 'İşçilik' },
            { name: 'Fayans Döşeme', price: 800, unit: 'm²' }
        ],
        reviews_list: [
            {
                id: 1,
                user: 'Mustafa Çelik',
                rating: 5,
                date: '1 hafta önce',
                comment: 'Banyomuz baştan aşağı yenilendi, harika iş çıkardı.',
                avatar: 'M'
            }
        ],
        gallery: [
            'https://picsum.photos/id/1015/300/200',
            'https://picsum.photos/id/1048/300/200',
            'https://picsum.photos/id/1055/300/200',
            'https://picsum.photos/id/1065/300/200'
        ],
        certificates: [
            { name: 'Dekorasyon Belgesi', verified: true },
            { name: 'Ustalık Belgesi', verified: true }
        ],
        workingHours: [
            { days: 'Pazartesi - Cuma', hours: '09:00 - 19:00' },
            { days: 'Cumartesi', hours: '10:00 - 17:00' },
            { days: 'Pazar', hours: 'Kapalı', closed: true }
        ],
        mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3011.650493883011!2d30.7043!3d36.8897!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzbCsDUzJzIzLjAiTiAzMMKwNDInMjcuNSJF!5e0!3m2!1str!2str!4v1630000000000!5m2!1str!2str'
    },
    
];