import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "../components/PageTransition";
import Navbar from "../components/Navbar";
import "../styles/FAQPage.css";

const faqList = [
  {
    q: "هل يمكنني تعديل موعد الحجز بعد تأكيده؟",
    a: "نعم، يمكنك طلب تعديل الموعد بالتواصل مع الخبير مباشرة عبر نظام المحادثة في التطبيق والاتفاق على موعد جديد يناسب الطرفين.",
  },
  {
    q: "هل الخبراء المسجلون في التطبيق موثوقون وتم التحقق منهم؟",
    a: "نعم، نقوم بمراجعة وتوثيق هويات جميع الخبراء ومزودي الخدمات، ونتحقق من أوراقهم الرسمية وتراخيصهم قبل السماح لهم بتقديم عروض أسعار على طلباتك.",
  },
  {
    q: "هل الدفع يكون نقداً أم عبر التطبيق؟",
    a: " يُتاح لك خيار الدفع نقداً للخبير بعد الانتهاء من العمل.",
  },
  {
    q: "هل يوجد ضمان على الخدمات المقدمة؟",
    a: "العديد من الخبراء يقدمون ضماناً على أعمالهم (مثل خدمات الصيانة والتركيب). ننصحك دائماً بمناقشة تفاصيل الضمان مع الخبير قبل الموافقة على عرض السعر.",
  },
  {
    q: "هل يمكنني طلب خدمة لشخص آخر أو لعنوان مختلف عن موقعي؟",
    a: "بالتأكيد، يمكنك إدخال أي عنوان تريده عند تقديم الطلب (مثل منزل والديك أو مكتبك)، وإضافة تفاصيل الاتصال بالشخص المتواجد هناك في صندوق الملاحظات.",
  },
  {
    q: "كيف يمكنني حذف حسابي من التطبيق؟",
    a: "يمكنك حذف حسابك في أي وقت بالذهاب إلى 'إعدادات الحساب' ثم اختيار 'حذف الحساب'. يرجى ملاحظة أن هذا الإجراء سيؤدي إلى مسح جميع بياناتك وحجوزاتك السابقة.",
  },
  {
    q: "كيف يمكنني - كخبير - زيادة فرص حصولي على طلبات؟",
    a: "احرص على إكمال ملفك الشخصي بنسبة 100%، تقديم عروض أسعار تنافسية، وكتابة رسائل مخصصة للعملاء تشرح فيها لماذا أنت الخيار الأفضل.",
  },
  {
    q: "هل يمكنني استخدام التطبيق كعميل وكخبير في نفس الوقت؟",
    a: "نعم، ولكن ستحتاج عادةً إلى إنشاء حساب خبير منفصل لضمان فصل طلباتك الشخصية عن أعمالك.",
  }
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqList;
    return faqList.filter((item) => {
      return (
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
      );
    });
  }, [query]);

  function toggle(i) {
    setOpenIndex((prev) => (prev === i ? null : i));
  }

  return (
    <PageTransition>
      <div className="faq-page">
        <Navbar />

        <main className="faq-main">
          <section className="faq-hero">
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36 }}
            >
              الأسئلة الشائعة
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, delay: 0.06 }}
            >
              جمعنا الإجابات على الأسئلة المتكررة لمساعدتك بسرعة.
            </motion.p>

            <div className="faq-search">
              <label className="visually-hidden">بحث في الأسئلة</label>
              <input
                type="search"
                placeholder="ابحث عن سؤال أو كلمة..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="ابحث في الأسئلة"
              />
            </div>
          </section>

          <section className="faq-list">
            {filtered.length === 0 ? (
              <div className="faq-empty">لا توجد نتائج مطابقة.</div>
            ) : (
              filtered.map((item, idx) => {
                const isOpen = openIndex === idx;
                return (
                  <article
                    key={idx}
                    className={`faq-item ${isOpen ? "open" : ""}`}
                  >
                    <button
                      className="faq-q"
                      aria-expanded={isOpen}
                      onClick={() => toggle(idx)}
                    >
                      <span>{item.q}</span>
                      <motion.span
                        className="chev"
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 24 }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </motion.span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          className="faq-a"
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28 }}
                        >
                          <div className="faq-a-inner">
                            <p>{item.a}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </article>
                );
              })
            )}
          </section>
        </main>
      </div>
    </PageTransition>
  );
}
