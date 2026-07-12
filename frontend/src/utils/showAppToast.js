import "../styles/AppToast.css";

const TOAST_VISIBLE_MS = 5000;
const TOAST_FADE_MS = 450;

let activeToast = null;
let hideTimer = null;
let removeTimer = null;
let lastToastKey = '';
let lastToastAt = 0;

function translateToastMessage(message) {
  const text = String(message || "").trim();
  if (!text) return "";

  const lower = text.toLowerCase();

  const containsTranslations = [
    ["bildirim göndermek için giriş yapmalısınız", "يجب تسجيل الدخول لإرسال البلاغ."],
    ["bildiriminiz alındı", "تم استلام بلاغك. شكراً لمساعدتك."],
    ["gönderilemedi", "تعذر الإرسال. يرجى التحقق من الاتصال والمحاولة مرة أخرى."],
    ["adres başarıyla silindi", "تم حذف العنوان بنجاح."],
    ["adres silinirken", "حدث خطأ أثناء حذف العنوان."],
    ["adres başarıyla güncellendi", "تم تحديث العنوان بنجاح."],
    ["adres başarıyla eklendi", "تمت إضافة العنوان بنجاح."],
    ["adres kaydedilirken", "حدث خطأ أثناء حفظ العنوان."],
    ["adresiniz başarıyla güncellendi", "تم تحديث عنوانك بنجاح."],
    ["adresiniz başarıyla kaydedildi", "تم حفظ عنوانك بنجاح."],
    ["dosya boyutu", "يجب أن يكون حجم الملف أقل من 2MB."],
    ["eksik veya hatalı alan", "يرجى تعبئة معلومات العنوان المطلوبة بشكل صحيح."],
    ["cadde/sokak adı geçersiz", "اسم الشارع يحتوي على أحرف غير صالحة."],
    ["konum bilgisi eksik", "معلومات الموقع ناقصة."],
    ["hatalı kod", "الرمز غير صحيح. يرجى التحقق والمحاولة مرة أخرى."],
    ["müşteriye çıkış kodu gönderildi", "تم إرسال رمز الخروج إلى العميل. اطلب الرمز لإغلاق العملية."],
    ["operasyon başarıyla tamamlandı", "تم إكمال العملية بنجاح."],
    ["mesaj silinirken hata oluştu", "حدث خطأ أثناء حذف الرسالة. يرجى المحاولة لاحقاً."],
    ["romantik ifadeler kullanılamaz", "لا يمكن استخدام عبارات رومانسية في المحادثة."],
    ["randevu talebiniz başarıyla geri çekildi", "تم سحب طلب الموعد بنجاح."],
    ["talep geri çekilirken", "حدث خطأ أثناء سحب الطلب."],
    ["kayıt başarıyla silindi", "تم حذف السجل بنجاح."],
    ["silme işlemi başarısız", "فشلت عملية الحذف."],
    ["uzmanla sohbet açılamadı", "تعذر فتح المحادثة مع الخبير."],
    ["sohbet id alınamadı", "تعذر الحصول على معرف المحادثة."],
    ["lütfen önce giriş", "يرجى تسجيل الدخول أولاً."],
    ["lütfen 1-5 arası bir puan seçin", "يرجى اختيار تقييم بين 1 و 5."],
    ["sadece onaylanmış", "يمكن تقييم المواعيد الموافق عليها أو المكتملة فقط."],
    ["değerlendirmeniz alındı", "تم استلام تقييمك. شكراً لك."],
    ["randevunuz başarıyla iptal edildi", "تم إلغاء موعدك بنجاح."],
    ["işlem başarısız", "فشلت العملية."],
    ["talebi reddettiniz", "تم رفض الطلب."],
    ["bildirim gönderilirken", "حدث خطأ أثناء إرسال الإشعار."],
    ["ilan silindi", "تم حذف الإعلان."],
    ["ilan silinemedi", "تعذر حذف الإعلان. يرجى المحاولة لاحقاً."],
    ["ilan durumu güncellenemedi", "تعذر تحديث حالة الإعلان. يرجى المحاولة لاحقاً."],
    ["yayındaki ilan limitine ulaştınız", "تم الوصول إلى حد الإعلانات المنشورة."],
    ["günlük silme limitine ulaştınız", "تم الوصول إلى حد الحذف اليومي."],
    ["lütfen bir kapak fotoğrafı seçin", "يرجى اختيار صورة غلاف."],
    ["kapak fotoğrafı", "حدث خطأ في صورة الغلاف. يرجى اختيار صورة صالحة."],
    ["sadece jpeg", "يمكنك رفع الصور بصيغ JPEG أو PNG أو WEBP فقط."],
    ["uzmanlık seçmelisiniz", "يرجى اختيار التخصص."],
    ["geçerli bir ücret", "يرجى إدخال سعر صالح."],
    ["değişiklikler kaydedildi", "تم حفظ التغييرات."],
    ["ilan güncellenemedi", "تعذر تحديث الإعلان. يرجى المحاولة لاحقاً."],
    ["toplam ilan limitine ulaşıldı", "تم الوصول إلى الحد الإجمالي للإعلانات."],
    ["bu uzmanlık için limit dolu", "تم الوصول إلى الحد المسموح لهذا التخصص."],
    ["lütfen şehir ve ilçe", "يرجى اختيار المدينة والمنطقة."],
    ["bu randevunun onay süresi dolmuştur", "انتهت مدة الموافقة على هذا الموعد."],
    ["lütfen geçerli bir mazeret", "يرجى إدخال سبب صالح لا يقل عن 5 أحرف."],
    ["lütfen müşterinize sunmak için en az bir gün seçiniz", "يرجى اختيار يوم واحد على الأقل لعرضه على العميل."],
    ["lütfen bir başlangıç saati giriniz", "يرجى إدخال وقت بداية."],
    ["seçtiğiniz gün uzman mesai dışındadır", "اليوم الذي اخترته خارج ساعات عمل الخبير."],
    ["seçtiğiniz saat aralığı", "الفترة الزمنية التي اخترتها خارج ساعات عمل الخبير."],
    ["uzmanın başka bir randevusu ile çakışıyor", "الوقت الذي اخترته يتعارض مع موعد آخر للخبير أو قريب جداً منه."],
    ["işlem başarılı", "تمت العملية بنجاح."],
    ["randevular başarıyla kaydedildi", "تم حفظ المواعيد بنجاح."],
    ["çakışan randevular", "تم رفض المواعيد المتعارضة وإضافة الموعد الجديد بنجاح."],
    ["randevu başarıyla silindi", "تم حذف الموعد بنجاح."],
    ["randevu silinirken", "حدث خطأ أثناء حذف الموعد."],
    ["randevu süresi en az 5 dakika", "يجب ألا تقل مدة الموعد عن 5 دقائق."],
    ["randevu güncellendi", "تم تحديث الموعد."],
    ["vakit değişikliği talebiniz", "تم إرسال طلب تغيير الوقت بنجاح."],
    ["takvim verileri şu anda yüklenemedi", "تعذر تحميل بيانات التقويم حالياً."],
    ["hesabınızdaki kısıtlama", "لا يمكنك إنشاء موعد جديد حالياً بسبب القيود على حسابك."],
    ["ilan bilgileri yükleniyor", "يتم تحميل معلومات الإعلان، يرجى الانتظار قليلاً."],
    ["işlem süresi en az 5 dakika", "يجب ألا تقل مدة العملية عن 5 دقائق."],
    ["hata oluştu", "حدث خطأ."],
    ["lütfen geçerli bir süre girin", "يرجى إدخال مدة صالحة."],
    ["belirlediğiniz süre", "المدة المحددة تتعارض مع موعد آخر في التقويم."],
    ["bu işlem mesai saatinizi", "هذه العملية تتجاوز ساعات العمل. يرجى تقصير المدة."],
    ["işlem tamamlanamadı", "تعذر إكمال العملية. يرجى المحاولة مرة أخرى."],
    ["işlem sırasında bir hata oluştu", "حدث خطأ أثناء العملية."],
    ["lütfen daha sonra tekrar deneyin", "يرجى المحاولة مرة أخرى لاحقاً."]
  ];

  const matchedTranslation = containsTranslations.find(([needle]) =>
    lower.includes(needle)
  );
  if (matchedTranslation) return matchedTranslation[1];

  if (
    lower.includes("bu, şu anda geçerli olan bir durumdur") ||
    lower.includes("bu, su anda gecerli olan bir durumdur") ||
    lower.includes("şu anda geçerli") ||
    lower.includes("su anda gecerli")
  ) {
    return "تم تقييم هذه الخدمة بالفعل.";
  }

  if (
    lower.includes("bu, bir sorundur") ||
    lower.includes("sorundur") ||
    lower.includes("uygun randevu")
  ) {
    return "لم يتم العثور على موعد مناسب.";
  }

  const isAppointmentError =
    lower.includes("appointmentid") ||
    lower.includes("randevu") ||
    lower.includes("geçersiz") ||
    lower.includes("gecersiz") ||
    lower.includes("geã§ersiz");

  if (!isAppointmentError) return text;

  if (
    lower.includes("geçersiz") ||
    lower.includes("gecersiz") ||
    lower.includes("geã§ersiz") ||
    lower.includes("invalid")
  ) {
    return "معلومات الموعد غير صالحة.";
  }

  if (
    lower.includes("gereklidir") ||
    lower.includes("eksik") ||
    lower.includes("missing") ||
    lower.includes("required")
  ) {
    return "معلومات الموعد مطلوبة.";
  }

  if (lower.includes("bulunamad")) {
    return "لم يتم العثور على موعد مناسب.";
  }

  return text;
}

function clearToastTimers() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (removeTimer) {
    clearTimeout(removeTimer);
    removeTimer = null;
  }
}

function dismissToast(el) {
  if (!el?.isConnected) return;
  el.classList.add("app-toast--leaving");
  removeTimer = setTimeout(() => {
    el.remove();
    if (activeToast === el) activeToast = null;
    removeTimer = null;
  }, TOAST_FADE_MS);
}

/**
 * Sağ üstte otomatik kaybolan bildirim (varsayılan 5 sn).
 * @param {string} message
 * @param {'success' | 'error' | 'info'} type
 */
export function showAppToast(message, type = "success") {
  const text = translateToastMessage(message);
  if (!text) return;

  const toastKey = `${type}:${text}`;
  const now = Date.now();
  if (toastKey === lastToastKey && now - lastToastAt < 600) return;
  lastToastKey = toastKey;
  lastToastAt = now;

  let variant, icon, title;
  
  if (type === "error") {
    variant = "error";
    icon = "fa-exclamation-circle";
    title = "خطأ";
  } else if (type === "info") {
    variant = "info";
    icon = "fa-info-circle";
    title = "معلومة";
  } else {
    variant = "success";
    icon = "fa-check-circle";
    title = "تم بنجاح";
  }

  clearToastTimers();
  if (activeToast?.isConnected) {
    activeToast.remove();
    activeToast = null;
  }

  const toast = document.createElement("div");
  toast.className = `app-toast app-toast--${variant}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.setAttribute("dir", "rtl");
  toast.setAttribute("lang", "ar");
  toast.setAttribute("translate", "no");

  const header = document.createElement("div");
  header.className = "app-toast__header";
  const iconEl = document.createElement("i");
  iconEl.className = `fas ${icon}`;
  iconEl.setAttribute("aria-hidden", "true");
  const titleEl = document.createElement("span");
  titleEl.textContent = title;
  header.appendChild(iconEl);
  header.appendChild(titleEl);

  const messageEl = document.createElement("p");
  messageEl.className = "app-toast__message";
  messageEl.textContent = text;

  toast.appendChild(header);
  toast.appendChild(messageEl);
  document.body.appendChild(toast);
  activeToast = toast;

  hideTimer = setTimeout(() => dismissToast(toast), TOAST_VISIBLE_MS);
}
