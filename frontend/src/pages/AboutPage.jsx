import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import Navbar from "../components/Navbar";
import PageTransition from "../components/PageTransition";
import { db } from "../firebase/firebaseClient";
import "../styles/AboutPage.css";
import logo from "../assets/pictures/logo.png";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

const stats = [
  { value: "81", label: "Şehirde aktif hizmet" },
  { valueKey: "providerCount", label: "Doğrulanmış uzman" },
  { valueKey: "completedAppointmentsCount", label: "Tamamlanan iş" },
  { value: 5, label: "5 yıldızlık hizmet", type: "stars" },
];

const journey = [
  {
    title: "İlk ürün versiyonu",
    text: "Yaptığımız piyasa araştırmaları sonucunda böyle bir uygulamaya ihtiyaç olduğuna karar verdik ve ilk ürün versiyonunu geliştirdik.",
  },
  {
    title: "Büyüme dönemi",
    text: "Farklı kategorilerde yayına çıkıp uzman doğrulama ve yorum sistemini derinleştirdik.",
  },
  {
    title: "Akıllı eşleşme",
    text: "Hizmet talebini doğru uzmana daha hızlı yönlendiren veri odaklı eşleşme modelini devreye aldık.",
  },
  {
    title: "Deneyim 2.0",
    text: "Mobil odaklı yeni arayüz, daha hızlı akışlar ve güven odaklı ürün geliştirmeleriyle ilerliyoruz.",
  },
];

const values = [
  {
    title: "Güven",
    text: "Profil doğrulama, yorumlar ve açık iletişim ile hem kullanıcı hem uzman tarafında güven inşa ediyoruz.",
  },
  {
    title: "Hız",
    text: "Dakikalar içinde teklif al, en uygun uzmanı seç ve süreci tek yerden yönet.",
  },
  {
    title: "Kalite",
    text: "Veri destekli eşleşme ve geri bildirim mekanizmamızla sürekli daha iyi sonuçlar üretiyoruz.",
  },
];

const team = [
  {
    name: "Ali",
    role: "Ürün Lideri",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80",
  },
  {
    name: "Ayşe",
    role: "Teknoloji Lideri",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80",
  },
  {
    name: "Ahmet",
    role: "Topluluk ve Güven",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=300&q=80",
  },
];

export default function AboutPage() {
  const [counts, setCounts] = useState({
    providerCount: 0,
    completedAppointmentsCount: 0,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadCounts() {
      try {
        const [providerCountSnap, completedAppointmentsCountSnap] = await Promise.all([
          getCountFromServer(query(collection(db, "users"), where("userType", "==", "PROVIDER"))),
          getCountFromServer(
            query(collection(db, "appointments"), where("status", "==", "completed"))
          ),
        ]);

        if (!isMounted) return;

        setCounts({
          providerCount: Number(providerCountSnap.data().count || 0),
          completedAppointmentsCount: Number(completedAppointmentsCountSnap.data().count || 0),
        });
      } catch (error) {
        console.error("About page stats could not be loaded:", error);
      }
    }

    loadCounts();

    return () => {
      isMounted = false;
    };
  }, []);

  const formattedStats = stats.map((item) => {
    if (!item.valueKey) return item;

    return {
      ...item,
      value: counts[item.valueKey].toLocaleString("tr-TR"),
    };
  });

  return (
    <PageTransition>
      <div className="about-page">
        <Navbar />

        <main className="about-main">
          <section className="about-hero-shell">
            <motion.div
              className="about-hero"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="about-hero-copy">
                <p className="about-eyebrow">HAKKIMIZDA</p>
                <h1>
                  Hizmet bulmayı
                  <span> güvenilir, hızlı ve sade </span>
                  hale getiriyoruz.
                </h1>
                <p>
                  UzmanaGel, ihtiyaç sahibi kullanıcılarla uzmanları tek bir güvenli platformda
                  birleştirir. Amacımız; zaman kaybını azaltmak, kaliteyi yükseltmek ve sürecin
                  her adımında şeffaflık sağlamaktır.
                </p>
                <div className="about-hero-badges">
                  <span>Doğrulanmış Profiller</span>
                  <span>Hızlı Teklif Akışı</span>
                  <span>Şeffaf Değerlendirme</span>
                </div>
              </div>

              <motion.div
                className="about-hero-panel"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.55, delay: 0.1 }}
              >
                <img className="about-hero-logo" src={logo} alt="UzmanaGel logosu" />
              </motion.div>
            </motion.div>
          </section>

          <motion.section
            className="about-stats"
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
          >
            {formattedStats.map((item) => (
              <motion.article key={item.label} className="about-stat-card" variants={fadeUp}>
                {item.type === "stars" ? (
                  <strong className="about-stars" aria-label="5 yildiz">
                    {Array.from({ length: item.value }).map((_, index) => (
                      <i key={index} className="fa-solid fa-star" aria-hidden="true" />
                    ))}
                  </strong>
                ) : (
                  <strong>{item.value}</strong>
                )}
                <span>{item.label}</span>
              </motion.article>
            ))}
          </motion.section>

          <section className="about-grid">
            <motion.article
              className="about-block about-block-mission"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.55 }}
            >
              <h2>Misyonumuz</h2>
              <p>
                Hizmet almayı da hizmet vermeyi de kolaylaştıran bir ekosistem kuruyoruz.
                Kullanıcı doğru uzmana hızlı ulaşır; uzman ise işini güvenle büyütür.
              </p>
            </motion.article>

            <motion.article
              className="about-block about-block-vision"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.55, delay: 0.1 }}
            >
              <h2>Vizyonumuz</h2>
              <p>
                Türkiye&apos;nin en güvenilir hizmet platformu olmak ve her şehirde aynı kalite
                standardını koruyarak kalıcı değer üretmek.
              </p>
            </motion.article>
          </section>

          <section className="about-values">
            <motion.h2
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.6 }}
            >
              Bizi Farklı Kılan
            </motion.h2>
            <motion.div
              className="about-values-grid"
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
            >
              {values.map((item) => (
                <motion.article key={item.title} className="value-card" variants={fadeUp}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </motion.article>
              ))}
            </motion.div>
          </section>

          <section className="about-timeline-wrap">
            <motion.h2
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.6 }}
            >
              Gelişim Yolculuğumuz
            </motion.h2>
            <motion.div
              className="about-timeline"
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
            >
              {journey.map((item) => (
                <motion.article key={item.title} className="timeline-item" variants={fadeUp}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </motion.article>
              ))}
            </motion.div>
          </section>

          <section className="about-team">
            <motion.h2
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.5 }}
            >
              Ekibimiz
            </motion.h2>
            <motion.div
              className="about-team-grid"
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
            >
              {team.map((member) => (
                <motion.article key={member.name} className="team-card" variants={fadeUp}>
                  <div className="team-avatar" aria-hidden="true">
                    <img src={member.image} alt={member.name} loading="lazy" />
                  </div>
                  <h3>{member.name}</h3>
                  <p>{member.role}</p>
                </motion.article>
              ))}
            </motion.div>
          </section>

          <motion.section
            className="about-cta"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.6 }}
          >
            <h2>Hizmet sürecini daha iyi bir standarda taşıyoruz.</h2>
            <p>
              Her geçen gün daha güvenli, daha hızlı ve daha verimli bir deneyim için ürünümüzü
              geliştirmeye devam ediyoruz.
            </p>
          </motion.section>
        </main>
      </div>
    </PageTransition>
  );
}
