// chatController.js file code 

const chatService = require("../services/chatService");

const isDevelopment = process.env.NODE_ENV === 'development';


// 13-05 Edrees solved
async function createOrGetConversation(req, res) {
  try {
    const currentUid = req.user.uid;
    const { providerUid, serviceId, listingId, serviceTitle, appointmentId } = req.body;

    const finalServiceId = String(serviceId || listingId || "").trim();
    // Syria Arabic launch: appointment system disabled; keep legacy parsing commented.
    // const finalAppointmentId = String(appointmentId || "").trim();

    // INPUT VALIDATION
    if (!providerUid || typeof providerUid !== "string" || providerUid.length > 128) {
      return res.status(400).json({ message: "معرف الخبير غير صالح." });
    }

    if (!finalServiceId || typeof finalServiceId !== "string" || finalServiceId.length > 100) {
      return res.status(400).json({ message: "معرف الخدمة غير صالح." });
    }

    // Syria Arabic launch: appointment system disabled, appointmentId is no longer mandatory.
    // if (
    //   !finalAppointmentId ||
    //   typeof finalAppointmentId !== "string" ||
    //   finalAppointmentId.length > 150
    // ) {
    //   return res.status(400).json({ message: "معلومات الموعد غير صالحة." });
    // }
    // if (finalAppointmentId && finalAppointmentId.length > 150) {
    //   return res.status(400).json({ message: "معلومات الموعد غير صالحة." });
    // }

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "المستخدم غير صالح." });
    }

    const result = await chatService.getOrCreateConversation({
      clientUid: currentUid,
      providerUid,
      serviceId: finalServiceId,
      serviceTitle,
      // appointmentId: finalAppointmentId,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (isDevelopment) console.error("createOrGetConversation error:", error.message);
    return res.status(400).json({
      message:
        error.message || "تعذر بدء المحادثة. يرجى المحاولة لاحقاً.",
    });
  }
}

async function getMyConversations(req, res) {
  try {
    const currentUid = req.user.uid;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "المستخدم غير صالح." });
    }

    const conversations = await chatService.getUserConversations(currentUid);
    return res.status(200).json(conversations);
  } catch (error) {
    if (isDevelopment) console.error("getMyConversations error:", error.message);
    return res.status(500).json({ message: "تعذر تحميل المحادثات. يرجى المحاولة لاحقاً." });
  }
}

async function getMessages(req, res) {
  try {
    const currentUid = req.user.uid;
    const { conversationId } = req.params;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "المستخدم غير صالح." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "معرف المحادثة غير صالح." });
    }

    const messages = await chatService.getConversationMessages({
      conversationId,
      currentUid,
    });

    return res.status(200).json(messages);
  } catch (error) {
    if (isDevelopment) console.error("getMessages error:", error.message);
    const status = error.message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ message: "تعذر تحميل الرسائل. يرجى المحاولة لاحقاً." });
  }
}

async function createMessage(req, res) {
  try {
    const senderUid = req.user.uid;
    const { conversationId } = req.params;
    const { text, replyToMessageId } = req.body;

    if (!senderUid || typeof senderUid !== "string" || senderUid.length > 128) {
      return res.status(401).json({ message: "المستخدم غير صالح." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "معرف المحادثة غير صالح." });
    }

    if (!text || typeof text !== "string" || text.length > 5000) {
      return res.status(400).json({ message: "الرسالة طويلة جداً أو غير صالحة." });
    }

    if (replyToMessageId && (typeof replyToMessageId !== "string" || replyToMessageId.length > 128)) {
      return res.status(400).json({ message: "معرف الرسالة المردود عليها غير صالح." });
    }

    const result = await chatService.sendMessage({
      conversationId,
      senderUid,
      text,
      replyToMessageId,
    });

    return res.status(201).json(result);
  } catch (error) {
    if (isDevelopment) console.error("createMessage error:", error.message);
    const status = error.message === "Forbidden" ? 403 : 400;
    return res.status(status).json({
      message: error?.message || "تعذر إرسال الرسالة. يرجى المحاولة لاحقاً.",
    });
  }
}

async function markAsRead(req, res) {
  try {
    const currentUid = req.user.uid;
    const { conversationId } = req.params;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "المستخدم غير صالح." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "معرف المحادثة غير صالح." });
    }

    const result = await chatService.markConversationAsRead({
      conversationId,
      currentUid,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (isDevelopment) console.error("markAsRead error:", error.message);
    const status = error.message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ message: "تعذر تعليم الرسالة كمقروءة. يرجى المحاولة لاحقاً." });
  }
}

async function deleteMessage(req, res) {
  try {
    const currentUid = req.user.uid;
    const { conversationId, messageId } = req.params;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "المستخدم غير صالح." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "معرف المحادثة غير صالح." });
    }

    if (!messageId || typeof messageId !== "string" || messageId.length > 128) {
      return res.status(400).json({ message: "معرف الرسالة غير صالح." });
    }

    const result = await chatService.deleteMessage({
      conversationId,
      messageId,
      currentUid,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (isDevelopment) console.error("deleteMessage error:", error.message);
    const status = error.message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ message: "تعذر حذف الرسالة. يرجى المحاولة لاحقاً." });
  }
}

async function closeConversation(req, res) {
  try {
    const currentUid = req.user.uid;
    const { conversationId } = req.params;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "المستخدم غير صالح." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "معرف المحادثة غير صالح." });
    }

    const result = await chatService.closeConversation({
      conversationId,
      currentUid,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (isDevelopment) console.error("closeConversation error:", error.message);
    const status = error.message === "Forbidden" ? 403 : 400;
    return res.status(status).json({
      message: error?.message || "تعذر إغلاق المحادثة.",
    });
  }
}

module.exports = {
  createOrGetConversation,
  getMyConversations,
  getMessages,
  createMessage,
  markAsRead,
  deleteMessage,
  closeConversation,
};
