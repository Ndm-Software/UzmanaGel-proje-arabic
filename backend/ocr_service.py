import asyncio
import hashlib
import io
import logging
import os
import re
import shutil
import sys
import time
from functools import lru_cache
from pathlib import Path

import cv2
import fitz
import numpy as np
import pytesseract
import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from sentence_transformers import SentenceTransformer
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from transformers import pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)
log = logging.getLogger(__name__)

def find_tesseract():
    """Tesseract'ı sistemde ara - platform bağımsız"""
    tess_path = os.getenv("TESSERACT_CMD")
    if tess_path and os.path.exists(tess_path):
        return tess_path

    if sys.platform == "win32":
        for path in [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]:
            if os.path.exists(path):
                return path

    tess_path = shutil.which("tesseract")
    if tess_path:
        return tess_path

    raise RuntimeError(
        "Tesseract bulunamadı! Lütfen kurun:\n"
        "Windows: https://github.com/UB-Mannheim/tesseract/wiki\n"
        "macOS: brew install tesseract\n"
        "Linux: sudo apt install tesseract-ocr"
    )

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

os.environ["TRANSFORMERS_CACHE"] = str(MODELS_DIR / "transformers")
os.environ["HF_HOME"] = str(MODELS_DIR / "huggingface")
os.environ["SENTENCE_TRANSFORMERS_HOME"] = str(MODELS_DIR / "sentence_transformers")

_tess = find_tesseract()
pytesseract.pytesseract.tesseract_cmd = _tess
log.info(f"Tesseract: {_tess}")

CFG = {
    "clip_fake_min":    0.55,
    "clip_doc_min":     0.35,
    "combined_min":     0.20,
    "embed_min":        0.10,
    "struct_strong":    0.55,
    "blur_min":         85,
    "brightness_min":   38,
    "brightness_max":   232,
    "tilt_max_deg":     9.0,
    "stamp_red_ratio":  0.022,
    "stamp_min_area":   4500,
    "white_ratio_max":  0.80,
    "min_ocr_chars":    12,
    "max_file_bytes":   10 * 1024 * 1024,
    "embed_model":      "paraphrase-multilingual-MiniLM-L12-v2",
    "embed_cache_size": 256,

    "cert_keyword_skip_embed_threshold": 3,
    "ocr_alnum_cert_hint": 20,
}

ALLOWED_MIME  = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
VALID_TYPES   = {"id_card", "certificate", "tax_plate"}
FAKE_TYPES    = {"digital_mockup", "screenshot"}
INVALID_TYPES = {"unrelated"}

CLIP_LABELS = {
    "id_card":        "a real physical Turkish national identity card or driver's license",
    "certificate":    "a certificate, diploma, or course completion document with an official seal",
    "tax_plate":      "an official Turkish government tax registration plate or tax document",
    "digital_mockup": "a digital template, computer-generated document design, or mockup",
    "screenshot":     "a screenshot of a screen showing a document",
    "unrelated":      "a photo of a person, object, landscape, or anything unrelated to documents",
}

_CLIP_LABEL_LIST = list(CLIP_LABELS.values())
_CLIP_LABEL_MAP  = {v: k for k, v in CLIP_LABELS.items()}

_REF_TEXTS = {
    "id_card": [
        "Türkiye Cumhuriyeti nüfus cüzdanı veya kimlik belgesi.",
        "Identity card with name, surname, date of birth, ID number, nationality.",
        "TC kimlik no, seri numarası, geçerlilik tarihi, fotoğraflı kimlik.",
        "Kimlik numarası, doğum tarihi, anne adı, baba adı içeren resmi belge.",
        "T.C. kimlik kartı üzerinde soyadı, adı, doğum yeri ve tarihi yer alır.",
    ],
    "certificate": [
        "Sertifika, diploma, katılım belgesi, başarı belgesi.",
        "Certificate of completion, training certificate, course diploma with official seal.",
        "Bu sertifika adı geçen kişinin ilgili eğitimi tamamladığını onaylar.",
        "Eğitim programını başarıyla tamamladığına dair verilmiş resmi belge.",
        "Üniversite, akademi veya kurs merkezi tarafından düzenlenen eğitim belgesi.",
        "Bu belge verilen tarih itibarıyla geçerli olup imza ve mühür içermektedir.",
    ],
    "tax_plate": [
        "Vergi levhası, vergi dairesi tarafından düzenlenen resmi vergi belgesi.",
        "Mükellef bilgileri, vergi kimlik numarası, matrah, vergi tutarı.",
        "Türkiye Cumhuriyeti Gelir İdaresi Başkanlığı tarafından düzenlenen vergi levhası.",
        "Tax registration document issued by Turkish tax authority with taxpayer information.",
        "Vergi numarası, mükellef adı, adres, faaliyet kodu içeren resmi belge.",
    ],
}

_TYPE_KEYWORDS = {
    "id_card": [
        "nüfus cüzdanı", "kimlik kartı", "tc kimlik", "t.c. kimlik",
        "türkiye cumhuriyeti kimlik", "national id", "identity card",
        "nüfus", "cüzdan", "kimlik no", "tc no", "seri no",
        "anne adı", "baba adı", "doğum yeri", "cinsiyet", "ehliyet",
    ],
    "certificate": [
        "sertifika", "certificate", "diploma", "katılım belgesi",
        "başarı belgesi", "tamamladı", "tamamlamıştır", "certifies",
        "eğitim belgesi", "kurs belgesi", "başarıyla tamamladı",
        "katılım sertifikası", "akademi", "python", "programlama",
        "kursu başarıyla", "eğitim programı", "onaylar",
    ],
    "tax_plate": [
        "vergi levhası", "vergi kimlik", "gelir idaresi", "gib",
        "mükellef", "vergi dairesi", "tax plate", "tax id",
        "vergi kimlik numarası", "matrah", "vergi tutarı", "beyanname",
    ],
}

_CERT_STRONG_KEYWORDS = frozenset([
    "sertifika", "certificate", "tamamladı", "tamamlamıştır",
    "certifies", "diploma", "katılım belgesi", "başarı belgesi",
    "başarıyla tamamladı", "katılım sertifikası", "eğitim belgesi",
    "kurs belgesi", "kursu başarıyla", "eğitim programı",
])

_CERT_DEFINITIVE_PATTERNS = [
    re.compile(r'\b(SERTİFİKA|SERTIFIKA|CERTIFICATE)\b', re.I),
    re.compile(r'\b(TAMAMLADI|TAMAMLAMIŞTIR|COMPLETED|CERTIFIES|AWARDED)\b', re.I),
    re.compile(r'\b(KATILIM|BAŞARI|DIPLOMA)\b', re.I),
    re.compile(r'\b(AKADEMİ|AKADEMI|ACADEMY|ÜNİVERSİTE)\b', re.I),
]


def _compile(patterns: list) -> list:
    out = []
    for p in patterns:
        pat, w = p[0], p[1]
        flags = p[2] if len(p) > 2 else 0
        out.append((re.compile(pat, flags), w))
    return out

_STRUCT: dict[str, list] = {
    "id_card": _compile([
        (r'\b[1-9]\d{10}\b',                                              3.0),
        (r'\b(T\.?C\.?|TÜRKİYE|TURKIYE|TURKEY|REPUBLIC)\b',             2.0, re.I),
        (r'\bTC\s*/\s*TUR\b',                                             2.5, re.I),
        (r'\b(NÜFUS|NUFUS|KİMLİK|KIMLIK|IDENTITY|CARD)\b',              1.5, re.I),
        (r'\b\d{2}[./]\d{2}[./]\d{4}\b',                                 0.8),
        (r'\b[A-Z]\d{2}[A-Z]\d{5,6}\b',                                  1.0),
        (r'\b(CİNSİYET|CINSIYET|SEX|GENDER)\b',                          1.0, re.I),
        (r'\b(ANNE|BABA|MOTHER|FATHER)\b',                               1.0, re.I),
    ]),
    "certificate": _compile([
        (r'\b(SERTİFİKA|SERTIFIKA|CERTIFICATE|CERT\.?)\b',               3.0, re.I),
        (r'\b(TAMAMLADI|TAMAMLAMIŞTIR|COMPLETED|CERTIFIES|AWARDED|VERİLMİŞTİR)\b', 2.5, re.I),
        (r'\b(KATILIM|BAŞARI|BASARI|DIPLOMA|DİPLOMA)\b',                 2.0, re.I),
        (r'\b\d{2}[./]\d{2}[./]\d{4}\b',                                 1.0),
        (r'\b(AKADEMİ|AKADEMI|ACADEMY|ÜNİVERSİTE|UNIVERSITE|SCHOOL|ENSTİTÜ)\b', 1.5, re.I),
        (r'\b(ONAYLAR|CONFIRMS|AWARDED|PRESENTED)\b',                    1.0, re.I),
    ]),
    "tax_plate": _compile([
        (r'\b\d{10}\b',                                                   3.0),
        (r'\b(VERGİ|VERGI|TAX|GELİR\s*İDARESİ|GELIR\s*IDARESI|GİB)\b', 3.0, re.I),
        (r'\b(MÜKELLEF|MUKELLEF|TAXPAYER|BEYANNAME)\b',                  2.0, re.I),
        (r'\b(MATRAH|TUTAR|AMOUNT|TL|TRY|₺)\b',                         1.0, re.I),
        (r'\b(20\d{2}|19\d{2})\b',                                       0.5),
        (r'\b(FAALİYET|FAALIYET|ACTIVITY|NALİYE|VERGI\s*DAİRESİ)\b',    1.5, re.I),
    ]),
}

_STRUCT_TOTALS: dict[str, float] = {
    dtype: sum(w for _, w in patterns)
    for dtype, patterns in _STRUCT.items()
}

log.info("CLIP yükleniyor…")
_clip = pipeline(
    "zero-shot-image-classification",
    model="openai/clip-vit-base-patch32",
    device=-1,
)

log.info("Sentence-transformer yükleniyor…")
_model_cache_path = MODELS_DIR / CFG["embed_model"]
if _model_cache_path.exists():
    log.info(f"Önbellekten yükleniyor: {_model_cache_path}")
    _embedder = SentenceTransformer(str(_model_cache_path))
else:
    log.info(f"İndiriliyor: {CFG['embed_model']}")
    _embedder = SentenceTransformer(CFG["embed_model"])
    _embedder.save(str(_model_cache_path))
    log.info(f"Kaydedildi: {_model_cache_path}")

log.info("Referans embedding'leri hesaplanıyor…")
_ref_vecs: dict[str, np.ndarray] = {
    dtype: _embedder.encode(texts, convert_to_numpy=True, batch_size=8).mean(axis=0)
    for dtype, texts in _REF_TEXTS.items()
}

_ref_vecs_norm: dict[str, np.ndarray] = {
    k: v / (np.linalg.norm(v) + 1e-9) for k, v in _ref_vecs.items()
}
log.info("Modeller hazır.")

_STAMP_KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))

_INVALID_STAMP_WORDS = frozenset([
    "örnek", "ornektir", "örnektir", "sample", "specimen",
    "void", "cancelled", "invalid", "geçersiz", "gecersiz",
    "iptal", "taslak", "draft", "deneme",
])

@lru_cache(maxsize=CFG["embed_cache_size"])
def _cached_encode(text_hash: str, text: str) -> tuple:
    vec = _embedder.encode(text, convert_to_numpy=True)
    norm = float(np.linalg.norm(vec))
    return tuple(vec / (norm + 1e-9))

def _ocr_hash(text: str) -> str:
    return hashlib.md5(text[:800].encode()).hexdigest()


app = FastAPI(title="Belge Doğrulama v2")
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def warm_up():
    log.info("Model warm-up başlıyor…")
    dummy = Image.new("RGB", (224, 224), color=(128, 128, 128))
    await asyncio.to_thread(lambda: _clip(dummy, candidate_labels=_CLIP_LABEL_LIST[:2]))
    await asyncio.to_thread(lambda: _embedder.encode("test", convert_to_numpy=True))
    log.info("Warm-up tamamlandı.")


def to_image(data: bytes, mime: str) -> tuple[Image.Image, bool]:
    if mime == "application/pdf":
        try:
            doc = fitz.open(stream=data, filetype="pdf")
            if not doc.page_count:
                raise ValueError("Boş PDF")
            pix = doc.load_page(0).get_pixmap(matrix=fitz.Matrix(1.8, 1.8))
            return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"), True
        except Exception as e:
            raise HTTPException(422, f"PDF işlenemedi: {e}")
    try:
        return Image.open(io.BytesIO(data)).convert("RGB"), False
    except Exception as e:
        raise HTTPException(422, f"Görüntü açılamadı: {e}")


def quick_quality(image: Image.Image) -> dict:
    arr = np.array(image)
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(np.mean(gray))
    white = float(np.mean(gray > 200))
    return {"blur": blur, "brightness": brightness, "white": white, "gray": gray}


def detect_tilt(gray: np.ndarray) -> float:
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blur, 40, 130)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 40, minLineLength=35, maxLineGap=25)
    if lines is None or len(lines) < 4:
        return 0.0
    angles = []
    for x1, y1, x2, y2 in lines[:, 0]:
        if x2 == x1:
            continue
        a = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(a) < 40:
            angles.append(a)
    if len(angles) < 4:
        return 0.0
    return float(np.median(angles))


_KEEP = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

def run_ocr(image: Image.Image, is_pdf: bool = False) -> str:
    if is_pdf:
        gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
    else:
        w, h = image.size
        img = image.resize((w * 2, h * 2), Image.Resampling.LANCZOS)
        gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
        gray = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)

    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    cfg = "--psm 3 --oem 3"
    lang = "tur+eng"

    _, bw1 = cv2.threshold(cv2.GaussianBlur(gray, (3, 3), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    t1 = pytesseract.image_to_string(bw1, lang=lang, config=cfg)

    alnum1 = sum(1 for c in t1 if c in _KEEP)
    # OPT-4: Eşik 30 → 20
    if alnum1 >= 20:
        log.info(f"OCR (1 geçiş, pdf={is_pdf}): {len(t1)} kar | alnum={alnum1}")
        return t1.strip()

    bw2 = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10)
    t2 = pytesseract.image_to_string(bw2, lang=lang, config=cfg)

    lines1 = set(t1.splitlines())
    extra = [ln for ln in t2.splitlines() if ln.strip() and ln not in lines1]
    combined = t1 + "\n" + "\n".join(extra)

    log.info(f"OCR (2 geçiş, pdf={is_pdf}): {len(combined)} kar")
    return combined.strip()


def structural_score(ocr: str, doc_type: str) -> float:
    patterns = _STRUCT.get(doc_type, [])
    if not patterns or not ocr:
        return 0.0
    total = _STRUCT_TOTALS[doc_type]
    earned = sum(w for pat, w in patterns if pat.search(ocr))
    score = min(earned / (total * 0.40), 1.0)
    log.info(f"Yapısal [{doc_type}]: {score:.3f} ({earned:.1f}/{total:.1f})")
    return score


def embed_score(ocr: str, doc_type: str) -> float:
    if not ocr or len(ocr.strip()) < 10:
        return 0.0
    text = ocr[:800]
    h = _ocr_hash(text)
    vec_tuple = _cached_encode(h, text)
    vec = np.array(vec_tuple)
    rv = _ref_vecs_norm.get(doc_type, _ref_vecs_norm["id_card"])
    sim = float(np.dot(vec, rv))
    sim = max(sim, 0.0)
    log.info(f"Embedding [{doc_type}]: {sim:.4f}")
    return sim


def _cert_can_skip_embed(ocr: str, struct: float) -> bool:
    if struct < CFG["struct_strong"]:
        return False
    match_count = sum(1 for p in _CERT_DEFINITIVE_PATTERNS if p.search(ocr))
    return match_count >= 2


def combined_score(emb: float, struct: float) -> float:
    if struct >= CFG["struct_strong"]:
        return struct
    if emb <= CFG["embed_min"]:
        return struct * 0.70
    w_s, w_e = 0.60, 0.40
    if emb < 1e-6 or struct < 1e-6:
        return emb * w_e + struct * w_s
    harmonic = (w_s + w_e) / (w_s / struct + w_e / emb)
    return min(harmonic, 1.0)


def detect_doc_type_from_ocr(ocr: str) -> tuple[str, float, dict]:
    if not ocr or len(ocr.strip()) < 20:
        return "unknown", 0.0, {}

    ocr_lower = ocr.lower()
    scores = {}

    for doc_type, keywords in _TYPE_KEYWORDS.items():
        hit_count = 0
        for kw in keywords:
            if kw in ocr_lower:
                if doc_type == "certificate" and kw in _CERT_STRONG_KEYWORDS:
                    hit_count += 2
                else:
                    hit_count += 1
        raw_score = min(hit_count / 8.0, 1.0)
        struct = structural_score(ocr, doc_type)
        combined = raw_score * 0.40 + struct * 0.60
        scores[doc_type] = combined

    if not scores:
        return "unknown", 0.0, {}

    best_type = max(scores, key=scores.get)
    best_score = scores[best_type]

    log.info(f"OCR tip tespiti: {best_type} ({best_score:.3f}) | detay: {scores}")
    return best_type, best_score, scores


def resolve_document_type(clip_type: str, clip_score: float, ocr_type: str, ocr_score: float) -> tuple[str, float, str]:
    if clip_type in VALID_TYPES and ocr_type in VALID_TYPES:
        if clip_type == ocr_type:
            return clip_type, max(clip_score, ocr_score), "hybrid_agreed"

        if ocr_type == "certificate" and ocr_score >= 0.25:
            log.info(f"Certificate OCR güvencesi devreye girdi: ocr_score={ocr_score:.3f}")
            return ocr_type, ocr_score, "certificate_ocr_priority"

        adjusted_clip = clip_score * 0.85
        if ocr_score > adjusted_clip:
            return ocr_type, ocr_score, "ocr_override"
        else:
            return clip_type, clip_score, "clip_override"

    if clip_type in VALID_TYPES:
        return clip_type, clip_score, "clip_only"
    if ocr_type in VALID_TYPES:
        return ocr_type, ocr_score, "ocr_only"

    return "unknown", max(clip_score, ocr_score), "none"


def detect_stamp(image: Image.Image, ocr: str) -> tuple[bool, str]:
    ocr_hit = any(w in ocr.lower() for w in _INVALID_STAMP_WORDS)

    hsv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2HSV)
    mask = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([0, 80, 70]),   np.array([10, 255, 255])),
        cv2.inRange(hsv, np.array([165, 80, 70]), np.array([180, 255, 255])),
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _STAMP_KERNEL)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  _STAMP_KERNEL)

    red_ratio = mask.sum() / (255.0 * mask.size)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    stamp_cnts = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < CFG["stamp_min_area"]:
            continue
        x, y, bw, bh = cv2.boundingRect(c)
        aspect = max(bw, bh) / (min(bw, bh) + 1e-5)
        if aspect < 6.0:
            stamp_cnts.append(c)

    visual_hit = red_ratio > CFG["stamp_red_ratio"] and len(stamp_cnts) > 0
    detected = ocr_hit or visual_hit
    source = "+".join(filter(None, ["ocr" if ocr_hit else "", "visual" if visual_hit else ""]))
    log.info(f"Damga: {detected}, kaynak={source}, red={red_ratio:.4f}")
    return detected, source


def detect_empty(ocr: str, white: float) -> bool:
    alnum = len(re.sub(r"[^a-zA-Z0-9]", "", ocr))
    result = alnum < CFG["min_ocr_chars"] and white > CFG["white_ratio_max"]
    log.info(f"Boş şablon: alnum={alnum}, white={white:.3f}, result={result}")
    return result


def _out(verdict: str, doc_type: str, clip_score: float, comb: float, reason: str,
         flags: list, ocr: str, details: dict) -> dict:
    final_score = comb if comb > 0 else clip_score
    return {
        "verdict": verdict,
        "doc_type": doc_type,
        "score": round(final_score, 3),
        "clip_score": round(clip_score, 3),
        "reason": reason,
        "flags": flags,
        "ocr_preview": ocr[:120] + ("…" if len(ocr) > 120 else ""),
        "details": details,
    }


def _build_details(scores_map, emb, struct, comb, blur, brightness,
                    tilt_val, stamp_src, is_empty, ocr, t0, ocr_type_info=None):
    details = {
        "clip": {k: round(v, 3) for k, v in scores_map.items()},
        "embed_sim": round(emb, 4),
        "struct_sim": round(struct, 4),
        "combined_sim": round(comb, 4),
        "blur": round(blur, 1),
        "brightness": round(brightness, 1),
        "tilt_deg": round(tilt_val, 2),
        "stamp": stamp_src,
        "is_empty": is_empty,
        "ocr_chars": len(re.sub(r"[^a-zA-Z0-9]", "", ocr)),
        "elapsed": round(time.monotonic() - t0, 2),
        "embed_cache": _cached_encode.cache_info()._asdict(),
    }
    if ocr_type_info:
        details["ocr_type_detection"] = ocr_type_info
    return details


@app.post("/analyze")
@limiter.limit("30/minute")
async def analyze(request: Request, file: UploadFile = File(...)):
    t0 = time.monotonic()

    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(415, "Desteklenmeyen dosya türü.")
    data = await file.read()
    if len(data) > CFG["max_file_bytes"]:
        raise HTTPException(413, "Dosya 10 MB sınırını aşıyor.")

    image, is_pdf = to_image(data, file.content_type)

    # ── Aşama 1: Kalite kontrolü ──────────────────────────────────────────────
    quality = await asyncio.to_thread(quick_quality, image)
    gray    = quality["gray"]

    blur       = quality["blur"]
    brightness = quality["brightness"]
    white      = quality["white"]

    is_blurry  = blur < CFG["blur_min"]
    is_dark    = brightness < CFG["brightness_min"]
    is_overlit = brightness > CFG["brightness_max"]

    if is_blurry or is_dark or is_overlit:
        tilt_val = 0.0
        reason   = ("Görüntü çok bulanık..." if is_blurry
                    else "Görüntü çok karanlık..." if is_dark
                    else "Görüntü aşırı parlak...")
        flag     = (["blurry"] if is_blurry
                    else ["too_dark"] if is_dark
                    else ["overexposed"])
        details  = {"blur": round(blur, 1), "brightness": round(brightness, 1),
                    "tilt_deg": 0.0, "elapsed": round(time.monotonic() - t0, 2)}
        return _out("rejected", "unknown", 0.0, 0.0, reason, flag, "", details)

    tilt_val = await asyncio.to_thread(detect_tilt, gray)
    is_tilted = abs(tilt_val) > CFG["tilt_max_deg"]

    clip_res, ocr = await asyncio.gather(
        asyncio.to_thread(lambda: _clip(image, candidate_labels=_CLIP_LABEL_LIST)),
        asyncio.to_thread(run_ocr, image, is_pdf),
    )

    scores_map = {_CLIP_LABEL_MAP[r["label"]]: r["score"] for r in clip_res}
    clip_top   = max(scores_map, key=scores_map.get)
    clip_score = scores_map[clip_top]

    ocr_type, ocr_confidence, ocr_scores = detect_doc_type_from_ocr(ocr)

    final_type, type_confidence, type_source = resolve_document_type(
        clip_top, clip_score, ocr_type, ocr_confidence
    )

    log.info(f"Tip kararı: CLIP={clip_top}({clip_score:.3f}) OCR={ocr_type}({ocr_confidence:.3f}) → {final_type} ({type_source})")

    if clip_top in FAKE_TYPES and ocr_type in VALID_TYPES and ocr_confidence >= 0.35:
        log.warning(f"OVERRIDE: CLIP {clip_top} → OCR {ocr_type}")
        final_type      = ocr_type
        type_confidence = ocr_confidence
        type_source     = "ocr_override_fake"
        clip_top        = ocr_type
        clip_score      = ocr_confidence

    if clip_top in FAKE_TYPES and clip_score >= CFG["clip_fake_min"]:
        details = _build_details(scores_map, 0.0, 0.0, 0.0, blur, brightness, tilt_val, "", False, ocr, t0)
        return _out("rejected", clip_top, clip_score, 0.0, "Dijital ortamda üretilmiş veya ekran görüntüsü...", ["digital_artifact"], "", details)

    if clip_top in INVALID_TYPES:
        details = _build_details(scores_map, 0.0, 0.0, 0.0, blur, brightness, tilt_val, "", False, ocr, t0)
        return _out("rejected", "none", clip_score, 0.0, "Yüklenen görsel geçerli bir belge olarak tanımlanamadı.", ["not_a_document"], "", details)

    emb, struct = 0.0, 0.0
    embed_skipped = False

    if final_type in VALID_TYPES:
        struct = await asyncio.to_thread(structural_score, ocr, final_type)

        if final_type == "certificate" and _cert_can_skip_embed(ocr, struct):
            emb = struct
            embed_skipped = True
            log.info(f"Sertifika embed ATLANDI: struct={struct:.3f}")
        else:
            emb = await asyncio.to_thread(embed_score, ocr, final_type)

    comb = combined_score(emb, struct)

    stamp_hit, stamp_src = await asyncio.to_thread(detect_stamp, image, ocr)

    is_empty = detect_empty(ocr, white)

    ocr_type_info = {
        "detected_type": ocr_type,
        "confidence": round(ocr_confidence, 4),
        "scores": {k: round(v, 4) for k, v in ocr_scores.items()},
        "resolution": type_source,
        "final_type": final_type,
        "embed_skipped": embed_skipped,
    }

    details = _build_details(scores_map, emb, struct, comb, blur, brightness, tilt_val, stamp_src, is_empty, ocr, t0, ocr_type_info)

    log.info(f"FINAL: type={final_type} clip={clip_score:.3f} emb={emb:.3f} struct={struct:.3f} comb={comb:.3f} embed_skipped={embed_skipped}")

    if stamp_hit:
        return _out("rejected", final_type, clip_score, comb, "Belgede geçersizlik damgası tespit edildi...", ["invalid_stamp", f"via:{stamp_src}"], ocr, details)

    if is_empty:
        return _out("rejected", final_type, clip_score, comb, "Belgede yeterli metin bulunamadı...", ["empty_template"], ocr, details)

    if final_type not in VALID_TYPES or type_confidence < CFG["clip_doc_min"]:
        return _out("rejected", final_type, clip_score, comb, "Belge türü güvenilir biçimde tanımlanamadı...", ["low_confidence"], ocr, details)

    if comb < CFG["combined_min"]:
        return _out("manual_review", final_type, clip_score, comb, "Görsel belgeye uyuyor ancak metin içeriği doğrulanamadı...", ["text_mismatch"], ocr, details)

    if is_tilted:
        return _out("manual_review", final_type, clip_score, comb, "Belge içeriği doğrulandı ancak görüntü eğik...", ["tilted"], ocr, details)

    return _out("approved", final_type, clip_score, comb, "Belge başarıyla doğrulandı.", [], ocr, details)


@app.post("/debug/scores")
async def debug_scores(file: UploadFile = File(...)):
    data = await file.read()
    image, is_pdf = to_image(data, file.content_type)
    ocr = await asyncio.to_thread(run_ocr, image, is_pdf)
    result = {}
    for dtype in VALID_TYPES:
        e = embed_score(ocr, dtype)
        s = structural_score(ocr, dtype)
        result[dtype] = {"embed": round(e, 4), "struct": round(s, 4), "combined": round(combined_score(e, s), 4)}
    return {"ocr_preview": ocr[:300], "ocr_chars": len(re.sub(r"[^a-zA-Z0-9]", "", ocr)), "scores": result}


@app.post("/debug/structural")
async def debug_structural(file: UploadFile = File(...)):
    data = await file.read()
    image, is_pdf = to_image(data, file.content_type)
    ocr = await asyncio.to_thread(run_ocr, image, is_pdf)
    hits = {
        dtype: [{"pattern": pat.pattern[:50], "weight": w, "hit": bool(pat.search(ocr)), "match": (m := pat.search(ocr)) and m.group(0)} for pat, w in patterns]
        for dtype, patterns in _STRUCT.items()
    }
    return {"ocr_preview": ocr[:300], "hits": hits}


@app.post("/debug/clip")
async def debug_clip(file: UploadFile = File(...)):
    data = await file.read()
    image, _ = to_image(data, file.content_type)
    clip_res = await asyncio.to_thread(lambda: _clip(image, candidate_labels=_CLIP_LABEL_LIST))
    return {"scores": {_CLIP_LABEL_MAP[r["label"]]: round(r["score"], 4) for r in clip_res}, "top": _CLIP_LABEL_MAP[clip_res[0]["label"]], "top_score": round(clip_res[0]["score"], 4)}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "embed_model": CFG["embed_model"],
        "tesseract": _tess,
        "embed_cache": _cached_encode.cache_info()._asdict(),
        "models_dir": str(MODELS_DIR),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
