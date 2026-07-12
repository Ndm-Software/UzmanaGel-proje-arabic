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
  { value: "81", label: "خدمة نشطة في المدينة" },
  { valueKey: "providerCount", label: "خبير موثق" },
  { valueKey: "completedAppointmentsCount", label: "عمل مكتمل" },
  { value: 5, label: "خدمة 5 نجوم", type: "stars" },
];

const journey = [
  {
    title: "نسخة المنتج الأولى",
    text: "بناءً على أبحاث السوق التي أجريناها، قررنا أن هناك حاجة لمثل هذا التطبيق وقمنا بتطوير نسخة المنتج الأولى.",
  },
  {
    title: "فترة النمو",
    text: "انطلقنا في فئات مختلفة وقمنا بتعميق نظام توثيق الخبراء والتعليقات.",
  },
  {
    title: "المطابقة الذكية",
    text: "قمنا بتفعيل نموذج المطابقة المعتمد على البيانات لتوجيه طلب الخدمة إلى الخبير المناسب بشكل أسرع.",
  },
  {
    title: "تجربة 2.0",
    text: "نتقدم بواجهة جديدة تركز على الهاتف المحمول، وتدفقات أسرع، وتطويرات للمنتج تركز على الثقة.",
  },
];

const values = [
  {
    title: "الثقة",
    text: "نبني الثقة لدى كل من العميل والخبير من خلال توثيق الملفات الشخصية والتعليقات والتواصل المفتوح.",
  },
  {
    title: "السرعة",
    text: "احصل على عروض أسعار خلال دقائق، واختر الخبير الأنسب، ودر العملية من مكان واحد.",
  },
  {
    title: "الجودة",
    text: "ننتج نتائج أفضل باستمرار من خلال آلية المطابقة والتعليقات المدعومة بالبيانات.",
  },
];

const team = [
  {
    name: "Ali",
    role: "قائد المنتج",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80",
  },
  {
    name: "Ayşe",
    role: "القائد التقني",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80",
  },
  {
    name: "Ahmet",
    role: "المجتمع والأمان",
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
                <p className="about-eyebrow">من نحن</p>
                <h1>
                  نجعل العثور على الخدمات
                  <span> موثوقاً وسريعاً وبسيطاً </span>
                  .
                </h1>
                <p>
                  منصة خبير تجمع بين العملاء الباحثين عن خدمات والخبراء في منصة آمنة واحدة. هدفنا تقليل هدر الوقت، ورفع الجودة، وضمان الشفافية في كل خطوة.
                </p>
                <div className="about-hero-badges">
                  <span>ملفات شخصية موثقة</span>
                  <span>عروض أسعار سريعة</span>
                  <span>تقييم شفاف</span>
                </div>
              </div>

              <motion.div
                className="about-hero-panel"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.55, delay: 0.1 }}
              >
                <img className="about-hero-logo" src={logo} alt="شعار خبير" />
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
              <h2>مهمتنا</h2>
              <p>
                نبني نظاماً يسهل تلقي وتقديم الخدمات على حد سواء. نساعد العملاء في الوصول إلى الخبراء بسرعة، ونمكن الخبراء من تنمية أعمالهم بأمان.
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
              <h2>رؤيتنا</h2>
              <p>
                نسعى لنكون المنصة الأكثر موثوقية لتقديم الخدمات مع الحفاظ على نفس معايير الجودة العالية في كل مدينة لخلق قيمة مستدامة.
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
              ما يميزنا
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
              مسيرة تطورنا
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
              فريقنا
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
            <h2>نرتقي بعملية تقديم الخدمات إلى معيار أفضل.</h2>
            <p>
              نواصل تطوير منتجنا يومياً لنقدم تجربة أكثر أماناً وسرعة وكفاءة.
            </p>
          </motion.section>
        </main>
      </div>
    </PageTransition>
  );
}
