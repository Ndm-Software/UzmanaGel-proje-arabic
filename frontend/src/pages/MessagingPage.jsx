// MessagingPage.jsx file code

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

import Navbar from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";
import { auth, db } from "../firebase/firebaseClient";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  fetchMyConversations,
  fetchConversationMessages,
  sendConversationMessage,
  markConversationAsRead,
  deleteConversationMessage,
  // Syria Arabic launch: close conversation operation is disabled in the UI.
  // closeConversation,
} from "../services/chatApi";
import { getProfilePhoto } from "../services/updateService";
import DOMPurify from "dompurify";
import { showAppToast } from "../utils/showAppToast";
import { ARABIC_LATIN_LOCALE } from "../utils/localeFormat";
import ConfirmModal from "../components/ConfirmModal";
import { toArabicServiceLabel } from "../utils/arabicLabels";
import "../styles/MessagingPage.css";

const isDevelopment = process.env.NODE_ENV === "development";

const sanitizeText = (text) => {
  if (!text) return "";
  return DOMPurify.sanitize(String(text));
};

const QUICK_MESSAGES_CUSTOMER = [
  {
    id: 1,
    text: "مرحباً، شكراً لك على تأكيد الموعد. هل يمكننا تحديد وقت الخدمة؟",
    type: "saat",
  },
  {
    id: 2,
    text: "هل عنوان الخدمة ومعلومات الوصول صحيحة، هل يمكننا التحقق معاً؟",
    type: "adres",
  },
  {
    id: 3,
    text: "هل هناك أي شيء يجب علي تحضيره قبل الخدمة؟",
    type: "hazirlik",
  },
];

const QUICK_MESSAGES_EXPERT = [
  {
    id: 1,
    text: "مرحباً، تم تأكيد موعدك. سأكون هناك في الوقت المحدد للخدمة.",
    type: "onay",
  },
  {
    id: 2,
    text: "هل يمكنك مشاركة التفاصيل الأخيرة لتأكيد عنوان الخدمة؟",
    type: "adres",
  },
  {
    id: 3,
    text: "إذا كان لديك أي سؤال قبل الموعد، يمكنك كتابته هنا.",
    type: "soru",
  },
];

function getQuickMessageOptions(isCustomer) {
  return isCustomer ? QUICK_MESSAGES_CUSTOMER : QUICK_MESSAGES_EXPERT;
}

const COMPLETED_APPOINTMENT_STATUS = "completed";

const LOVE_WORDS = [
  "aşk",
  "ask",
  "aşkım",
  "askim",
  "seviyorum",
  "seni seviyorum",
  "canım",
  "canim",
  "bebeğim",
  "bebegim",
  "hayatım",
  "hayatim",
  "tatlım",
  "tatlim",
  "özledim",
  "ozledim",
  "bitanem",
  "bir tanem",
];

const EMOJI_REGEX =
  /[\p{Extended_Pictographic}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}]/gu;

function removeEmojis(value = "") {
  return String(value || "").replace(EMOJI_REGEX, "");
}

function normalizeModerationText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchedLoveWords(text = "") {
  const normalized = normalizeModerationText(text);
  if (!normalized) return [];

  return LOVE_WORDS.filter((word) =>
    normalized.includes(normalizeModerationText(word))
  );
}

function buildMessagesSignature(list) {
  return (list || [])
    .map((msg) => {
      const createdAt =
        msg?.createdAt?._seconds ||
        msg?.createdAt?.seconds ||
        msg?.createdAt ||
        "";
      return [
        msg?.messageId || "",
        msg?.type || "",
        msg?.isDeleted ? "1" : "0",
        msg?.deletedAt?._seconds || msg?.deletedAt?.seconds || "",
        createdAt,
        msg?.text || "",
        msg?.replyTo?.messageId || "",
      ].join(":");
    })
    .join("|");
}

const MessageComposer = memo(function MessageComposer({
  conversationId,
  storageKey,
  onSend,
  onFocusChange,
  messageOptions,
}) {
  const [draft, setDraft] = useState("");
  const [isTextareaScrollable, setIsTextareaScrollable] = useState(false);
  const [composerWarning, setComposerWarning] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!storageKey) {
      setDraft("");
      setIsTextareaScrollable(false);
      setComposerWarning("");
      onFocusChange(false);
      return;
    }

    try {
      const savedDraft = sessionStorage.getItem(storageKey) || "";
      const cleanedDraft = removeEmojis(savedDraft);
      setDraft(cleanedDraft);
    } catch {
      setDraft("");
    }

    setComposerWarning("");
    onFocusChange(false);
  }, [conversationId, storageKey, onFocusChange]);

  useEffect(() => {
    if (!storageKey) return;

    try {
      if (draft.trim()) {
        sessionStorage.setItem(storageKey, draft);
      } else {
        sessionStorage.removeItem(storageKey);
      }
    } catch {}
  }, [draft, storageKey]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const MAX_HEIGHT = 120;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;

    const shouldScroll = textarea.scrollHeight > MAX_HEIGHT;
    setIsTextareaScrollable(shouldScroll);
    textarea.style.overflowY = shouldScroll ? "auto" : "hidden";
  }, [draft]);

  const handleDraftChange = useCallback((e) => {
    const rawValue = e.target.value || "";
    const noEmojiValue = removeEmojis(rawValue);
    const removedEmoji = rawValue !== noEmojiValue;
    const matchedLoveWords = findMatchedLoveWords(noEmojiValue);

    if (removedEmoji) {
      setComposerWarning("تم إيقاف استخدام الرموز التعبيرية. تم مسح الرموز التعبيرية.");
    } else if (matchedLoveWords.length > 0) {
      setComposerWarning("لا يمكن استخدام عبارات الحب أو الرومانسية.");
    } else {
      setComposerWarning("");
    }

    setDraft(noEmojiValue);
  }, []);

  const handleSubmit = useCallback(async () => {
    const noEmojiText = removeEmojis(String(draft || ""));
    const finalText = noEmojiText.trim();

    if (!finalText) {
      setComposerWarning("لا يمكنك إرسال رسالة فارغة.");
      return;
    }

    const matchedLoveWords = findMatchedLoveWords(finalText);
    if (matchedLoveWords.length > 0) {
      setComposerWarning("لا يمكن استخدام عبارات الحب أو الرومانسية.");
      return;
    }

    const success = await onSend(finalText);
    if (success) {
      setDraft("");
      setIsTextareaScrollable(false);
      setComposerWarning("");
      try {
        if (storageKey) {
          sessionStorage.removeItem(storageKey);
        }
      } catch {}
    }
  }, [draft, onSend, storageKey]);

  const handleQuickSend = useCallback(
    async (text) => {
      const noEmojiText = removeEmojis(String(text || ""));
      const finalText = noEmojiText.trim();

      if (!finalText) {
        setComposerWarning("لا يمكنك إرسال رسالة فارغة.");
        return;
      }

      const matchedLoveWords = findMatchedLoveWords(finalText);
      if (matchedLoveWords.length > 0) {
        setComposerWarning("لا يمكن استخدام عبارات الحب أو الرومانسية.");
        return;
      }

      const success = await onSend(finalText);
      if (success) {
        setDraft("");
        setIsTextareaScrollable(false);
        setComposerWarning("");
        try {
          if (storageKey) {
            sessionStorage.removeItem(storageKey);
          }
        } catch {}
      }
    },
    [onSend, storageKey]
  );

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    setComposerWarning("تم إيقاف اللصق. لا يمكن استخدام اختصار اللصق.");
  }, []);

  const handleCopy = useCallback((e) => {
    e.preventDefault();
    setComposerWarning("تم إيقاف النسخ. لا يمكن استخدام اختصار النسخ.");
  }, []);

  const handleCut = useCallback((e) => {
    e.preventDefault();
    setComposerWarning("تم إيقاف القص. لا يمكن استخدام اختصار القص.");
  }, []);

  const handleKeyDown = useCallback(
    async (e) => {
      const key = String(e.key || "").toLowerCase();

      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x"].includes(key)) {
        e.preventDefault();

        if (key === "v") {
          setComposerWarning("تم إيقاف اللصق. لا يمكن استخدام اختصار اللصق.");
        } else if (key === "c") {
          setComposerWarning("تم إيقاف النسخ. لا يمكن استخدام اختصار النسخ.");
        } else if (key === "x") {
          setComposerWarning("تم إيقاف القص. لا يمكن استخدام اختصار القص.");
        }
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        await handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <>
      <div className="message-composer-wrapper">
        <div className={`message-composer ${composerWarning ? "has-warning" : ""}`}>
          <textarea
            ref={textareaRef}
            className={`message-input ${
              isTextareaScrollable ? "message-input-scrollable" : ""
            }`}
            placeholder="اكتب رسالة..."
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCopy={handleCopy}
            onCut={handleCut}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            rows={1}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />

          <button
            type="button"
            className="send-message-btn"
            onClick={handleSubmit}
            disabled={!draft.trim()}
            title="إرسال الرسالة"
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>

        {composerWarning ? (
          <div className="composer-warning">
            <i className="fas fa-exclamation-triangle"></i>
            <span>{sanitizeText(composerWarning)}</span>
          </div>
        ) : (
          <div className="composer-helper-text">
            <i className="fas fa-info-circle"></i>
            <span>
              تم حظر الرموز التعبيرية، كلمات الحب، واختصارات النسخ/اللصق.
            </span>
          </div>
        )}
      </div>

      <div className="options-header">
        <i className="fas fa-bolt"></i>
        <span>رسائل سريعة</span>
      </div>

      <div className="options-grid">
        {messageOptions.map((option) => (
          <button
            key={option.id}
            className="option-btn"
            onClick={() => handleQuickSend(option.text)}
          >
            {sanitizeText(option.text)}
          </button>
        ))}
      </div>
    </>
  );
});

const MessagingPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);

  const [conversations, setConversations] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [messages, setMessages] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [sendError, setSendError] = useState("");
  const [chatDeadline, setChatDeadline] = useState(null);

  const [avatars, setAvatars] = useState({});
  const fetchedUidsRef = useRef(new Set());

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    message: null,
  });

  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  // Syria Arabic launch: close conversation confirmation is disabled.
  // const [showCloseConversationConfirm, setShowCloseConversationConfirm] = useState(false);

  const messagesBodyRef = useRef(null);
  const messagesEndRef = useRef(null);
  const contextMenuRef = useRef(null);
  const headerMenuRef = useRef(null);

  const previousMessagesLengthRef = useRef(0);
  const pendingOpenScrollRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const shouldAutoScrollRef = useRef(false);
  const messagesSignatureRef = useRef("");
  const conversationsSignatureRef = useRef("");

  const currentUid = firebaseUser?.uid || null;
  const conversationCount = conversations.length;

  const scrollToBottom = useCallback((behavior = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
      return;
    }

    if (messagesBodyRef.current) {
      messagesBodyRef.current.scrollTo({
        top: messagesBodyRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  const isUserNearBottom = useCallback(() => {
    const container = messagesBodyRef.current;
    if (!container) return true;

    const threshold = 120;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    return distanceFromBottom <= threshold;
  }, []);

  const parseAnyDate = useCallback((value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === "function") return value.toDate();
    if (
      typeof value === "object" &&
      value !== null &&
      typeof value._seconds === "number"
    ) {
      return new Date(value._seconds * 1000);
    }
    if (
      typeof value === "object" &&
      value !== null &&
      typeof value.seconds === "number"
    ) {
      return new Date(value.seconds * 1000);
    }
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) ? parsed : null;
  }, []);

  const formatMessageTime = useCallback(
    (value) => {
      const date = parseAnyDate(value);
      if (!date) return "";
      return date.toLocaleTimeString(ARABIC_LATIN_LOCALE, {
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [parseAnyDate]
  );

  const formatChatListTime = useCallback(
    (value) => {
      const date = parseAnyDate(value);
      if (!date) return "";
      const now = new Date();
      const sameDay =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      if (sameDay) {
        return date.toLocaleTimeString(ARABIC_LATIN_LOCALE, {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return date.toLocaleDateString(ARABIC_LATIN_LOCALE, {
        day: "2-digit",
        month: "2-digit",
      });
    },
    [parseAnyDate]
  );

  const formatDateDivider = useCallback(
    (value) => {
      const date = parseAnyDate(value);
      if (!date) return "";
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      const isSameDate = (a, b) =>
        a.getDate() === b.getDate() &&
        a.getMonth() === b.getMonth() &&
        a.getFullYear() === b.getFullYear();

      if (isSameDate(date, today)) return "اليوم";
      if (isSameDate(date, yesterday)) return "أمس";

      return date.toLocaleDateString(ARABIC_LATIN_LOCALE, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    },
    [parseAnyDate]
  );

  const isDifferentDay = useCallback(
    (currentMessage, previousMessage) => {
      const currentDate = parseAnyDate(currentMessage?.createdAt);
      const previousDate = parseAnyDate(previousMessage?.createdAt);
      if (!currentDate) return false;
      if (!previousDate) return true;

      return (
        currentDate.getDate() !== previousDate.getDate() ||
        currentDate.getMonth() !== previousDate.getMonth() ||
        currentDate.getFullYear() !== previousDate.getFullYear()
      );
    },
    [parseAnyDate]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, message: null });
  }, []);

  const getConversationOtherName = useCallback(
    (conversation) => {
      if (!conversation) return "خبير";
      if (conversation.otherUserName) return conversation.otherUserName;
      return conversation.clientUid === currentUid
        ? conversation.providerName || "خبير"
        : conversation.clientName || "عميل";
    },
    [currentUid]
  );

  const getConversationServiceTitle = useCallback((conversation) => {
    if (!conversation) return "";
    const specialty = conversation.serviceSubcategory || conversation.serviceCategory || conversation.serviceTitle || "";
    return toArabicServiceLabel(specialty);
  }, []);

  const getConversationUnreadCount = useCallback(
    (conversation) => {
      if (!conversation) return 0;
      if (typeof conversation.unreadCount === "number") return conversation.unreadCount;
      if (!currentUid) return 0;
      return conversation.clientUid === currentUid
        ? conversation.unreadCountClient || 0
        : conversation.providerUid === currentUid
        ? conversation.unreadCountProvider || 0
        : 0;
    },
    [currentUid]
  );

  const selectedConversation = useMemo(() => {
    return (
      conversations.find((c) => c.conversationId === selectedConversationId) || null
    );
  }, [conversations, selectedConversationId]);

  const selectedChatName = useMemo(() => {
    return getConversationOtherName(selectedConversation);
  }, [getConversationOtherName, selectedConversation]);

  const selectedServiceTitle = useMemo(() => {
    return getConversationServiceTitle(selectedConversation);
  }, [getConversationServiceTitle, selectedConversation]);

  const isCurrentUserCustomer = useMemo(() => {
    if (!selectedConversation || !currentUid) return true;
    return selectedConversation.clientUid === currentUid;
  }, [selectedConversation, currentUid]);

  const quickMessageOptions = useMemo(
    () => getQuickMessageOptions(isCurrentUserCustomer),
    [isCurrentUserCustomer]
  );

  const selectedOtherUid = selectedConversation
    ? selectedConversation.clientUid === currentUid
      ? selectedConversation.providerUid
      : selectedConversation.clientUid
    : null;

  const defaultChatAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    selectedChatName
  )}&background=d6b25e&color=0b1020&bold=true`;

  const selectedChatAvatar =
    selectedOtherUid && avatars[selectedOtherUid]
      ? avatars[selectedOtherUid]
      : defaultChatAvatar;

  const getMessageDisplayText = useCallback(
    (message) => {
      if (!message) return "";
      if (message.isDeleted || message.type === "deleted") {
        return message.senderUid === currentUid
          ? "لقد حذفت هذه الرسالة"
          : "تم حذف هذه الرسالة";
      }
      return message.text || "";
    },
    [currentUid]
  );

  const getReplySenderLabel = useCallback(
    (replyMessage) => {
      if (!replyMessage) return "";
      return replyMessage.senderUid === currentUid
        ? "أنت"
        : selectedChatName || "مستخدم";
    },
    [currentUid, selectedChatName]
  );

  const getReplyPreviewText = useCallback((replyMessage) => {
    if (!replyMessage) return "";
    return replyMessage.isDeleted || replyMessage.type === "deleted"
      ? "تم حذف هذه الرسالة"
      : replyMessage.text || "";
  }, []);

  const canDeleteMessage = useCallback(
    (message) => {
      if (!message || message.isDeleted || message.type === "deleted") return false;
      return message.senderUid === currentUid;
    },
    [currentUid]
  );

  const canReplyToMessage = useCallback((message) => {
    if (!message || message.isDeleted || message.type === "deleted") return false;
    return true;
  }, []);

  const clampContextMenuPosition = useCallback((x, y) => {
    const menuWidth = 190,
      menuHeight = 130,
      padding = 12;
    const nextX = Math.min(x, window.innerWidth - menuWidth - padding);
    const nextY = Math.min(y, window.innerHeight - menuHeight - padding);
    return { x: Math.max(padding, nextX), y: Math.max(padding, nextY) };
  }, []);

  const buildConversationsSignature = useCallback((list) => {
    return (list || [])
      .map((conversation) => {
        return [
          conversation?.conversationId || "",
          conversation?.serviceId || "",
          conversation?.serviceTitle || "",
          conversation?.lastMessage || "",
          conversation?.lastMessageAt?._seconds ||
            conversation?.lastMessageAt?.seconds ||
            conversation?.lastMessageAt ||
            "",
          conversation?.updatedAt?._seconds ||
            conversation?.updatedAt?.seconds ||
            conversation?.updatedAt ||
            "",
          conversation?.unreadCount ?? "",
          conversation?.unreadCountClient ?? "",
          conversation?.unreadCountProvider ?? "",
        ].join(":");
      })
      .join("|");
  }, []);

  const buildAppointmentConversationKey = useCallback(
  (clientUid, providerUid, serviceId, appointmentId) =>
    [
      String(clientUid || "").trim(),
      String(providerUid || "").trim(),
      String(serviceId || "").trim(),
      String(appointmentId || "").trim(),
    ].join("::"),
    []
  );

  const filterConversationsByAppointments = useCallback(
    async (conversationList) => {
      if (!currentUid || !Array.isArray(conversationList) || conversationList.length === 0) {
        return conversationList || [];
      }

      // Syria Arabic launch: appointment-based conversation filtering disabled.
      return conversationList;

      /* Syria Arabic launch: old appointment-based filtering disabled.
      const [clientAppointmentsSnap, providerAppointmentsSnap] = await Promise.all([
        getDocs(query(collection(db, "appointments"), where("clientId", "==", currentUid))),
        getDocs(query(collection(db, "appointments"), where("expertId", "==", currentUid))),
      ]);

      const appointmentStateByConversationKey = new Map();

      [...clientAppointmentsSnap.docs, ...providerAppointmentsSnap.docs].forEach((docSnap) => {
        const data = docSnap.data() || {};
        const key = buildAppointmentConversationKey(
          data.clientId,
          data.expertId,
          data.listingId || data.serviceId,
          data.appointmentId || docSnap.id
        );

        if (!key || key === "::") return;

        const currentState =
          appointmentStateByConversationKey.get(key) || {
            hasCompleted: false,
            hasNonCompleted: false,
          };

        if (data.status === COMPLETED_APPOINTMENT_STATUS) {
          currentState.hasCompleted = true;
        } else {
          currentState.hasNonCompleted = true;
        }

        appointmentStateByConversationKey.set(key, currentState);
      });

      return conversationList.filter((conversation) => {
        const key = buildAppointmentConversationKey(
          conversation.clientUid,
          conversation.providerUid,
          conversation.serviceId,
          conversation.appointmentId
        );

        const appointmentState = appointmentStateByConversationKey.get(key);
        if (!appointmentState) return true;
        if (appointmentState.hasNonCompleted) return true;
        return !appointmentState.hasCompleted;
      });
      */
    },
    [buildAppointmentConversationKey, currentUid]
  );

  const refreshConversationData = useCallback(async () => {
    if (!selectedConversationId || !currentUid) return;

    const [updatedMessages, updatedConversations] = await Promise.all([
      fetchConversationMessages(selectedConversationId),
      fetchMyConversations(),
    ]);

    const nextMessages = updatedMessages || [];
    const nextConversations = await filterConversationsByAppointments(
      updatedConversations || []
    );
    messagesSignatureRef.current = buildMessagesSignature(nextMessages);
    conversationsSignatureRef.current =
      buildConversationsSignature(nextConversations);

    setMessages(nextMessages);
    setConversations(nextConversations);
    previousMessagesLengthRef.current = nextMessages.length;
  }, [
    selectedConversationId,
    currentUid,
    buildConversationsSignature,
    filterConversationsByAppointments,
  ]);

  const handleMessageContextMenu = useCallback(
    (event, message) => {
      event.preventDefault();
      event.stopPropagation();

      const canReply = canReplyToMessage(message);
      const canDelete = canDeleteMessage(message);
      if (!canReply && !canDelete) {
        closeContextMenu();
        return;
      }

      const position = clampContextMenuPosition(event.clientX, event.clientY);
      setContextMenu({ visible: true, x: position.x, y: position.y, message });
    },
    [canDeleteMessage, canReplyToMessage, clampContextMenuPosition, closeContextMenu]
  );

  const handleReplyMessage = useCallback(
    (message) => {
      if (!canReplyToMessage(message)) return;
      setReplyingTo(message);
      closeContextMenu();
    },
    [canReplyToMessage, closeContextMenu]
  );

  const confirmDeleteMessage = async () => {
    if (!selectedConversationId || !messageToDelete?.messageId) return;

    try {
      await deleteConversationMessage(selectedConversationId, messageToDelete.messageId);
      if (replyingTo?.messageId === messageToDelete.messageId) setReplyingTo(null);
      closeContextMenu();
      await refreshConversationData();
    } catch (error) {
      if (isDevelopment) console.error("Failed to delete message:", error.message);
      showAppToast("حدث خطأ أثناء حذف الرسالة. يرجى المحاولة لاحقاً.", "error");
    } finally {
      setShowDeleteConfirm(false);
      setMessageToDelete(null);
    }
  };

  const handleDeleteMessage = useCallback(
    (message) => {
      if (!selectedConversationId || !message?.messageId || !canDeleteMessage(message)) return;
      setMessageToDelete(message);
      setShowDeleteConfirm(true);
      closeContextMenu();
    },
    [selectedConversationId, canDeleteMessage, closeContextMenu]
  );

  const handleSendMessage = useCallback(
    async (customText = "") => {
      if (!selectedConversationId) return false;
      const finalText = removeEmojis(String(customText || "")).trim();

      if (!finalText) return false;
      if (findMatchedLoveWords(finalText).length > 0) {
        showAppToast("لا يمكن استخدام عبارات رومانسية في المحادثة.", "error");
        return false;
      }

      try {
        await sendConversationMessage(
          selectedConversationId,
          finalText,
          replyingTo?.messageId || null
        );
        setSendError("");
        setReplyingTo(null);
        shouldAutoScrollRef.current = true;
        await refreshConversationData();
        return true;
      } catch (error) {
        if (isDevelopment) console.error("Failed to send message:", error.message);
        setSendError(
          error?.message ||
            "حدث خطأ أثناء إرسال الرسالة. يرجى المحاولة لاحقاً."
        );

        try {
          await refreshConversationData();
        } catch {}
        return false;
      }
    },
    [selectedConversationId, replyingTo, refreshConversationData]
  );

  const handleComposerFocusChange = useCallback((isFocused) => {
    setIsComposerFocused(isFocused);
  }, []);

  const handleSelectConversation = useCallback(
    async (conversationId) => {
      setIsMessagesLoading(true);
      setMessages([]);
      setReplyingTo(null);
      setSendError("");
      setHeaderMenuOpen(false);

      pendingOpenScrollRef.current = true;
      initialScrollDoneRef.current = false;
      shouldAutoScrollRef.current = false;
      previousMessagesLengthRef.current = 0;
      messagesSignatureRef.current = "";

      setSelectedConversationId(conversationId);
      navigate(`/الرسائل?conversation=${conversationId}&open=true`, {
        replace: true,
      });
    },
    [navigate]
  );

  /* Syria Arabic launch: close conversation operation is disabled.
  const confirmCloseConversation = async () => {
    if (!selectedConversationId) return;

    try {
      await closeConversation(selectedConversationId);
      await refreshConversationData();
    } catch (e) {
      showAppToast(
        e?.message || "تعذر إغلاق المحادثة. يرجى المحاولة لاحقاً.",
        "error"
      );
    } finally {
      setShowCloseConversationConfirm(false);
    }
  };
  */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user || null);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleEvents = (event) => {
      if (
        event.type === "click" &&
        contextMenuRef.current?.contains(event.target)
      )
        return;
      if (event.type === "keydown" && event.key !== "Escape") return;
      closeContextMenu();
    };
    window.addEventListener("click", handleEvents);
    window.addEventListener("keydown", handleEvents);
    window.addEventListener("scroll", handleEvents, true);
    return () => {
      window.removeEventListener("click", handleEvents);
      window.removeEventListener("keydown", handleEvents);
      window.removeEventListener("scroll", handleEvents, true);
    };
  }, [closeContextMenu]);

  useEffect(() => {
    const handleClickOutsideHeaderMenu = (event) => {
      if (!event.target.closest(".chat-header-menu")) {
        setHeaderMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutsideHeaderMenu);
    return () => {
      document.removeEventListener("mousedown", handleClickOutsideHeaderMenu);
    };
  }, []);

  useEffect(() => {
    if (!selectedConversation || !currentUid) {
      setChatDeadline(null);
      return;
    }

    // Syria Arabic launch: appointment deadline tracking disabled for direct chat.
    setChatDeadline(null);
    return;

    /* Syria Arabic launch: old appointment deadline tracking disabled.
    const { clientUid, providerUid } = selectedConversation;
    if (!clientUid || !providerUid) return;

    getDocs(
      query(
        collection(db, "appointments"),
        where("clientId", "==", clientUid),
        where("expertId", "==", providerUid),
        where("status", "==", "approved")
      )
    )
      .then((snap) => {
        if (snap.empty) {
          setChatDeadline(null);
          return;
        }
        const now = new Date();
        let latest = null;
        snap.docs.forEach((d) => {
          const data = d.data();
          const end = new Date(`${data.date}T${data.end || "23:59"}`);
          if (end >= now && (!latest || end > latest)) latest = end;
        });
        setChatDeadline(latest);
      })
      .catch(() => setChatDeadline(null));
    */
  }, [selectedConversation, currentUid]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const conversationId = params.get("conversation");
    const shouldOpen = params.get("open");

    if (conversationId && shouldOpen === "true") {
      setSelectedConversationId(conversationId);
      pendingOpenScrollRef.current = true;
      initialScrollDoneRef.current = false;
    } else {
      setSelectedConversationId(null);
      setMessages([]);
      setReplyingTo(null);
      closeContextMenu();
      setHeaderMenuOpen(false);
      pendingOpenScrollRef.current = false;
      initialScrollDoneRef.current = false;
      shouldAutoScrollRef.current = false;
      previousMessagesLengthRef.current = 0;
      messagesSignatureRef.current = "";
    }
  }, [location.search, closeContextMenu]);

  useEffect(() => {
    if (!conversations || conversations.length === 0 || !currentUid) return;

    const fetchAvatars = async () => {
      const missingUids = [];
      const newAvatars = {};
      let stateNeedsUpdate = false;

      conversations.forEach((conv) => {
        const otherUid =
          conv.clientUid === currentUid ? conv.providerUid : conv.clientUid;

        if (otherUid) {
          const cachedAvatar = sessionStorage.getItem(`avatar_${otherUid}`);

          if (cachedAvatar && cachedAvatar !== "null") {
            newAvatars[otherUid] = cachedAvatar;
            stateNeedsUpdate = true;
          } else if (!fetchedUidsRef.current.has(otherUid)) {
            missingUids.push(otherUid);
            fetchedUidsRef.current.add(otherUid);
          }
        }
      });

      if (missingUids.length > 0) {
        const promises = missingUids.map(async (uid) => {
          try {
            const photoUrl = await getProfilePhoto(uid);
            if (photoUrl) {
              newAvatars[uid] = photoUrl;
              sessionStorage.setItem(`avatar_${uid}`, photoUrl);
              stateNeedsUpdate = true;
            }
          } catch {}
        });

        await Promise.all(promises);
      }

      if (stateNeedsUpdate) {
        setAvatars((prev) => {
          const merged = { ...prev };
          let changed = false;

          Object.entries(newAvatars).forEach(([uid, url]) => {
            if (url && merged[uid] !== url) {
              merged[uid] = url;
              changed = true;
            }
          });

          return changed ? merged : prev;
        });
      }
    };

    fetchAvatars();
  }, [conversations, currentUid]);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function loadConversations() {
      if (!currentUid) {
        if (!cancelled) {
          setConversations([]);
          setLoading(false);
        }
        return;
      }

      try {
        const data = await fetchMyConversations();
        if (cancelled) return;
        const filteredData = await filterConversationsByAppointments(data || []);
        if (cancelled) return;
        const nextSignature = buildConversationsSignature(filteredData);
        if (nextSignature !== conversationsSignatureRef.current) {
          conversationsSignatureRef.current = nextSignature;
          setConversations(filteredData);
        }
        setLoading(false);
      } catch (error) {
        if (isDevelopment) {
          console.error("Failed to load conversations:", error.message);
        }
        if (!cancelled) setLoading(false);
      }
    }

    if (!authLoading && currentUid) {
      loadConversations();
      intervalId = setInterval(loadConversations, 3000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    currentUid,
    authLoading,
    buildConversationsSignature,
    filterConversationsByAppointments,
  ]);

  useEffect(() => {
    if (!selectedConversationId) return;
    if (loading || authLoading) return;
    if (!Array.isArray(conversations)) return;

    const selectedStillVisible = conversations.some(
      (conversation) => conversation.conversationId === selectedConversationId
    );

    if (selectedStillVisible) return;

    setSelectedConversationId(null);
    setMessages([]);
    setReplyingTo(null);
    setSendError("");
    setHeaderMenuOpen(false);
    closeContextMenu();
    pendingOpenScrollRef.current = false;
    initialScrollDoneRef.current = false;
    shouldAutoScrollRef.current = false;
    previousMessagesLengthRef.current = 0;
    messagesSignatureRef.current = "";
    navigate("/mesajlar", { replace: true });
  }, [
    selectedConversationId,
    conversations,
    loading,
    authLoading,
    closeContextMenu,
    navigate,
  ]);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function loadMessages() {
      if (authLoading || !currentUid || !selectedConversationId) return;

      try {
        const wasNearBottom = isUserNearBottom();
        const previousLength = previousMessagesLengthRef.current;
        const data = await fetchConversationMessages(selectedConversationId);

        if (cancelled) return;

        const nextMessages = data || [];
        const currentLength = nextMessages.length;
        const hasNewMessage = currentLength > previousLength;
        const lastMessage = nextMessages[currentLength - 1];
        const isMyMessage = lastMessage?.senderUid === currentUid;
        const nextSignature = buildMessagesSignature(nextMessages);

        shouldAutoScrollRef.current =
          hasNewMessage && (wasNearBottom || isMyMessage);
        previousMessagesLengthRef.current = currentLength;

        if (nextSignature !== messagesSignatureRef.current) {
          messagesSignatureRef.current = nextSignature;
          setMessages(nextMessages);
        }

        setIsMessagesLoading(false);
        await markConversationAsRead(selectedConversationId);
      } catch (error) {
        if (isDevelopment) {
          console.error("Failed to load messages:", error.message);
        }
        if (!cancelled) {
          setIsMessagesLoading(false);
        }
      }
    }

    if (!authLoading && currentUid && selectedConversationId && !isComposerFocused) {
      loadMessages();
      intervalId = setInterval(loadMessages, 2000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    selectedConversationId,
    currentUid,
    authLoading,
    isComposerFocused,
    isUserNearBottom,
  ]);

  useLayoutEffect(() => {
    if (
      !selectedConversationId ||
      !messages.length ||
      !pendingOpenScrollRef.current ||
      initialScrollDoneRef.current
    )
      return;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        scrollToBottom("auto");
        initialScrollDoneRef.current = true;
        pendingOpenScrollRef.current = false;
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [messages, selectedConversationId, scrollToBottom]);

  useLayoutEffect(() => {
    if (!selectedConversationId || !messages.length || !shouldAutoScrollRef.current)
      return;
    const raf = requestAnimationFrame(() => {
      scrollToBottom("smooth");
      shouldAutoScrollRef.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, selectedConversationId, scrollToBottom]);

  const filteredChats = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase().trim();
    return conversations.filter((c) => {
      if (!normalizedSearch) return true;
      return (
        getConversationOtherName(c).toLowerCase().includes(normalizedSearch) ||
        getConversationServiceTitle(c).toLowerCase().includes(normalizedSearch)
      );
    });
  }, [
    conversations,
    getConversationOtherName,
    getConversationServiceTitle,
    searchTerm,
  ]);

  const contextMenuMessage = contextMenu.message;
  const contextMenuCanReply = canReplyToMessage(contextMenuMessage);
  const contextMenuCanDelete = canDeleteMessage(contextMenuMessage);
  const composerStorageKey =
    currentUid && selectedConversationId
      ? `chat-draft:${currentUid}:${selectedConversationId}`
      : "";

  if (authLoading || loading) {
    return (
      <div className="messaging-page">
        <Navbar />
        <div className="loading-container">
          <LoadingSpinner text="جاري تحميل الرسائل..." />
        </div>
      </div>
    );
  }

  return (
    <div className="messaging-page" onClick={closeContextMenu}>
      <Navbar />
      <div className="messaging-container">
        <div className={`messaging-wrapper ${selectedConversationId ? "conversation-active" : ""}`}>
          <div className="chats-panel">
            <div className="chats-header">
              <div className="chats-title-wrap">
                <h2>الرسائل</h2>
                <span className="chats-subtitle">
                  {conversationCount > 0
                    ? `${conversationCount} محادثة نشطة`
                    : "لا توجد محادثات نشطة بعد"}
                </span>
              </div>
              <span className="chats-counter">{conversationCount}</span>
            </div>

            <div className="chats-search">
              <div className="msg-search-field">
                <i className="fas fa-search msg-search-icon" aria-hidden="true"></i>
                <input
                  type="text"
                  placeholder="ابحث عن اسم أو خدمة..."
                  className="msg-search-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button type="button" className="msg-search-clear" onClick={() => setSearchTerm("")}>
                    <i className="fas fa-times" aria-hidden="true"></i>
                  </button>
                )}
              </div>
            </div>

            <div className="chats-list">
              {filteredChats.length > 0 ? (
                filteredChats.map((conversation) => {
                  const otherName = getConversationOtherName(conversation);
                  const serviceTitle = getConversationServiceTitle(conversation);
                  const unreadCount = getConversationUnreadCount(conversation);

                  const listOtherUid =
                    conversation.clientUid === currentUid
                      ? conversation.providerUid
                      : conversation.clientUid;

                  const defaultListAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    otherName
                  )}&background=d6b25e&color=0b1020&bold=true`;

                  const listAvatar =
                    listOtherUid && avatars[listOtherUid]
                      ? avatars[listOtherUid]
                      : defaultListAvatar;

                  return (
                    <div
                      key={conversation.conversationId}
                      className={`chat-item ${
                        selectedConversationId === conversation.conversationId
                          ? "active"
                          : ""
                      }`}
                      onClick={() =>
                        handleSelectConversation(conversation.conversationId)
                      }
                    >
                      <div className="chat-avatar">
                        <img src={listAvatar} alt={sanitizeText(otherName)} />
                      </div>

                      <div className="chat-info">
                        <div className="chat-header">
                          <h3 title={sanitizeText(otherName)}>
                            {sanitizeText(otherName)}
                          </h3>
                          <span className="chat-time">
                            {formatChatListTime(
                              conversation.lastMessageAt || conversation.updatedAt
                            )}
                          </span>
                        </div>

                        {serviceTitle && (
                          <div className="chat-service-row">
                            <span
                              className="chat-service-badge"
                              title={sanitizeText(serviceTitle)}
                            >
                              <i className="fas fa-briefcase"></i>{" "}
                              {sanitizeText(serviceTitle)}
                            </span>
                          </div>
                        )}

                        <div className="chat-preview">
                          <p className="last-message">
                            {sanitizeText(
                              conversation.lastMessage || "ابدأ المحادثة"
                            )}
                          </p>

                          {unreadCount > 0 && (
                            <span className="unread-badge">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="no-search-results">
                  <i className="fas fa-search"></i>
                  <p>
                    {searchTerm
                      ? `لم يتم العثور على محادثة تطابق "${sanitizeText(searchTerm)}".`
                      : "لم يتم العثور على محادثات بعد."}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="messages-panel">
            {selectedConversationId ? (
              <>
                <div className="messages-header">
                  <div className="chat-header-bar">
                    <div className="chat-header-left">
                      <button
                        type="button"
                        className="chat-back-btn"
                        onClick={() => navigate("/mesajlar")}
                      >
                        <i className="fas fa-arrow-right"></i>
                      </button>
                      <div className="msg-header-avatar">
                        <img src={selectedChatAvatar} alt="avatar" />
                      </div>

                      <div className="chat-header-meta">
                        <div className="chat-header-top">
                          <h3
                            className="chat-user-name"
                            title={sanitizeText(selectedChatName)}
                          >
                            {sanitizeText(selectedChatName)}
                          </h3>
                        </div>

                        <div className="chat-header-chips">
                          {selectedServiceTitle && (
                            <span
                              className="header-chip header-chip-service"
                              title={sanitizeText(selectedServiceTitle)}
                            >
                              <i className="fas fa-briefcase"></i>
                              <span>{sanitizeText(selectedServiceTitle)}</span>
                            </span>
                          )}

                          <span className="header-chip header-chip-active">
                            <i className="fas fa-comments"></i>
                            <span>محادثة نشطة</span>
                          </span>

                          {chatDeadline && (
                            <span className="header-chip header-chip-deadline">
                              <i className="fas fa-clock"></i>
                              <span>
                                آخر رسالة:{" "}
                                {chatDeadline.toLocaleDateString(ARABIC_LATIN_LOCALE, {
                                  day: "numeric",
                                  month: "long",
                                })}{" "}
                                {chatDeadline.toLocaleTimeString(ARABIC_LATIN_LOCALE, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="header-actions">
                      <div className="chat-header-menu" ref={headerMenuRef}>
                        <button
                          type="button"
                          className="action-btn"
                          title="قائمة المحادثة"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHeaderMenuOpen((prev) => !prev);
                          }}
                        >
                          <i className="fas fa-ellipsis-v"></i>
                        </button>

                        {headerMenuOpen && (
                          <div className="chat-header-dropdown">
                            <button
                              type="button"
                              className="chat-header-dropdown-item"
                              onClick={() => {
                                setHeaderMenuOpen(false);
                                showAppToast("سيتم تفعيل قسم التفاصيل لاحقاً.", "info");
                              }}
                            >
                              <i className="fas fa-circle-info"></i>
                              <span>التفاصيل</span>
                            </button>

                            {selectedServiceTitle && (
                              <button
                                type="button"
                                className="chat-header-dropdown-item"
                                onClick={() => {
                                  setHeaderMenuOpen(false);
                                  showAppToast(
                                    `الخدمة: ${sanitizeText(selectedServiceTitle)}`,
                                    "info"
                                  );
                                }}
                              >
                                <i className="fas fa-briefcase"></i>
                                <span>عرض الخدمة</span>
                              </button>
                            )}

                            {/* Syria Arabic launch: close conversation button disabled with its operations.
                            <button
                              type="button"
                              className="chat-header-dropdown-item danger"
                              onClick={() => {
                                setHeaderMenuOpen(false);
                                setShowCloseConversationConfirm(true);
                              }}
                            >
                              <i className="fas fa-ban"></i>
                              <span>إغلاق المحادثة</span>
                            </button>
                            */}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="messages-body"
                  ref={messagesBodyRef}
                  onClick={closeContextMenu}
                >
                  {isMessagesLoading ? (
                    <div className="no-chat-selected">
                      <LoadingSpinner text="جاري تحميل المحادثة..." />
                    </div>
                  ) : messages.length > 0 ? (
                    messages.map((msg, index) => {
                      const showDateDivider =
                        index === 0 || isDifferentDay(msg, messages[index - 1]);
                      const displayText = getMessageDisplayText(msg);
                      const isDeleted =
                        msg.isDeleted === true || msg.type === "deleted";

                      return (
                        <div key={msg.messageId || index}>
                          {showDateDivider && (
                            <div className="date-divider">
                              <span>{formatDateDivider(msg.createdAt)}</span>
                            </div>
                          )}

                          <div
                            className={`message-wrapper ${
                              msg.senderUid === currentUid
                                ? "own-message"
                                : "other-message"
                            }`}
                          >
                            {msg.senderUid !== currentUid && (
                              <img
                                src={selectedChatAvatar}
                                alt="avatar"
                                className="message-avatar"
                              />
                            )}

                            <div className="message-content">
                              <div
                                className={`message-bubble ${
                                  isDeleted ? "deleted-message-bubble" : ""
                                }`}
                                onContextMenu={(e) =>
                                  handleMessageContextMenu(e, msg)
                                }
                              >
                                {msg.replyTo && (
                                  <div className="reply-snippet">
                                    <span className="reply-snippet-name">
                                      {sanitizeText(
                                        getReplySenderLabel(msg.replyTo)
                                      )}
                                    </span>
                                    <p className="reply-snippet-text">
                                      {sanitizeText(
                                        getReplyPreviewText(msg.replyTo)
                                      )}
                                    </p>
                                  </div>
                                )}

                                <p
                                  className={
                                    isDeleted ? "deleted-message-text" : ""
                                  }
                                >
                                  {sanitizeText(displayText)}
                                </p>

                                <span className="message-time">
                                  {formatMessageTime(msg.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="no-chat-selected">
                      <div className="no-chat-content">
                        <i className="fas fa-comments"></i>
                        <h3>لا توجد رسائل بعد</h3>
                        <p>
                          يمكنك بدء المحادثة باستخدام أحد الرسائل السريعة أدناه.
                        </p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="message-options">
                  {sendError && (
                    <div
                      style={{
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid #ef4444",
                        borderRadius: "10px",
                        padding: "10px 14px",
                        margin: "8px 0",
                        color: "#ef4444",
                        fontSize: "13px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <i className="fas fa-lock"></i>
                      {sanitizeText(sendError)}
                    </div>
                  )}

                  {replyingTo && (
                    <div className="reply-preview">
                      <div className="reply-preview-left">
                        <span className="reply-preview-title">
                          <i className="fas fa-reply"></i> جاري الرد
                        </span>
                        <strong className="reply-preview-name">
                          {sanitizeText(getReplySenderLabel(replyingTo))}
                        </strong>
                        <p className="reply-preview-text">
                          {sanitizeText(getReplyPreviewText(replyingTo))}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="reply-preview-close"
                        onClick={() => setReplyingTo(null)}
                        title="إلغاء"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  )}

                  <MessageComposer
                    conversationId={selectedConversationId}
                    storageKey={composerStorageKey}
                    onSend={handleSendMessage}
                    onFocusChange={handleComposerFocusChange}
                    messageOptions={quickMessageOptions}
                  />
                </div>
              </>
            ) : (
              <div className="no-chat-selected">
                <div className="no-chat-content">
                  <i className="fas fa-comments"></i>
                  <h3>مرحباً بك في المحادثات</h3>
                  <p>
                    يمكنك بدء المحادثة باختيار محادثة من القائمة على اليسار.
                  </p>
                  <small>
                    ستظهر رسائلك الجديدة ومحادثاتك النشطة هنا.
                  </small>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {contextMenu.visible && contextMenu.message && (
        <div
          ref={contextMenuRef}
          className="message-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenuCanReply && (
            <button
              type="button"
              className="message-context-menu-btn"
              onClick={() => handleReplyMessage(contextMenu.message)}
            >
              <i className="fas fa-reply"></i> <span>Reply</span>
            </button>
          )}
          {contextMenuCanDelete && (
            <button
              type="button"
              className="message-context-menu-btn delete"
              onClick={() => handleDeleteMessage(contextMenu.message)}
            >
              <i className="fas fa-trash-alt"></i> <span>Delete</span>
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setMessageToDelete(null);
        }}
        onConfirm={confirmDeleteMessage}
        title="حذف الرسالة"
        message="هل أنت متأكد من رغبتك في حذف هذه الرسالة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="نعم، حذف"
        cancelText="إلغاء"
        type="danger"
      />

      {/* Syria Arabic launch: close conversation modal disabled with its operations.
      <ConfirmModal
        isOpen={showCloseConversationConfirm}
        onClose={() => setShowCloseConversationConfirm(false)}
        onConfirm={confirmCloseConversation}
        title="إإغلاق المحادثة"
        message="هل أنت متأكد من رغبتك في إغلاق هذه المحادثة؟ ستصبح غير نشطة وتختفي من القائمة."
        confirmText="نعم، إغلاق"
        cancelText="إلغاء"
        type="warning"
      />
      */}
    </div>
  );
};

export default MessagingPage;
