// chatController.js file code 

const chatService = require("../services/chatService");

const isDevelopment = process.env.NODE_ENV === 'development';


// 13-05 Edrees solved
async function createOrGetConversation(req, res) {
  try {
    const currentUid = req.user.uid;
    const { providerUid, serviceId, listingId, serviceTitle, appointmentId } = req.body;

    const finalServiceId = String(serviceId || listingId || "").trim();
    const finalAppointmentId = String(appointmentId || "").trim();

    // INPUT VALIDATION
    if (!providerUid || typeof providerUid !== "string" || providerUid.length > 128) {
      return res.status(400).json({ message: "Geçersiz providerUid." });
    }

    if (!finalServiceId || typeof finalServiceId !== "string" || finalServiceId.length > 100) {
      return res.status(400).json({ message: "Geçersiz serviceId." });
    }

    // ✅ NEW: appointmentId zorunlu
    if (
      !finalAppointmentId ||
      typeof finalAppointmentId !== "string" ||
      finalAppointmentId.length > 150
    ) {
      return res.status(400).json({ message: "Geçersiz appointmentId." });
    }

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "Geçersiz kullanıcı." });
    }

    const result = await chatService.getOrCreateConversation({
      clientUid: currentUid,
      providerUid,
      serviceId: finalServiceId,
      serviceTitle,
      appointmentId: finalAppointmentId,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (isDevelopment) console.error("createOrGetConversation error:", error.message);
    return res.status(400).json({
      message:
        error.message || "Konuşma başlatılamadı. Lütfen daha sonra tekrar deneyin.",
    });
  }
}

async function getMyConversations(req, res) {
  try {
    const currentUid = req.user.uid;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "Geçersiz kullanıcı." });
    }

    const conversations = await chatService.getUserConversations(currentUid);
    return res.status(200).json(conversations);
  } catch (error) {
    if (isDevelopment) console.error("getMyConversations error:", error.message);
    return res.status(500).json({ message: "Konuşmalar yüklenemedi. Lütfen daha sonra tekrar deneyin." });
  }
}

async function getMessages(req, res) {
  try {
    const currentUid = req.user.uid;
    const { conversationId } = req.params;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "Geçersiz kullanıcı." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "Geçersiz conversationId." });
    }

    const messages = await chatService.getConversationMessages({
      conversationId,
      currentUid,
    });

    return res.status(200).json(messages);
  } catch (error) {
    if (isDevelopment) console.error("getMessages error:", error.message);
    const status = error.message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ message: "Mesajlar yüklenemedi. Lütfen daha sonra tekrar deneyin." });
  }
}

async function createMessage(req, res) {
  try {
    const senderUid = req.user.uid;
    const { conversationId } = req.params;
    const { text, replyToMessageId } = req.body;

    if (!senderUid || typeof senderUid !== "string" || senderUid.length > 128) {
      return res.status(401).json({ message: "Geçersiz kullanıcı." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "Geçersiz conversationId." });
    }

    if (!text || typeof text !== "string" || text.length > 5000) {
      return res.status(400).json({ message: "Mesaj çok uzun veya geçersiz." });
    }

    if (replyToMessageId && (typeof replyToMessageId !== "string" || replyToMessageId.length > 128)) {
      return res.status(400).json({ message: "Geçersiz replyToMessageId." });
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
      message: error?.message || "Mesaj gönderilemedi. Lütfen daha sonra tekrar deneyin.",
    });
  }
}

async function markAsRead(req, res) {
  try {
    const currentUid = req.user.uid;
    const { conversationId } = req.params;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "Geçersiz kullanıcı." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "Geçersiz conversationId." });
    }

    const result = await chatService.markConversationAsRead({
      conversationId,
      currentUid,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (isDevelopment) console.error("markAsRead error:", error.message);
    const status = error.message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ message: "Mesaj okundu işaretlenemedi. Lütfen daha sonra tekrar deneyin." });
  }
}

async function deleteMessage(req, res) {
  try {
    const currentUid = req.user.uid;
    const { conversationId, messageId } = req.params;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "Geçersiz kullanıcı." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "Geçersiz conversationId." });
    }

    if (!messageId || typeof messageId !== "string" || messageId.length > 128) {
      return res.status(400).json({ message: "Geçersiz messageId." });
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
    return res.status(status).json({ message: "Mesaj silinemedi. Lütfen daha sonra tekrar deneyin." });
  }
}

async function closeConversation(req, res) {
  try {
    const currentUid = req.user.uid;
    const { conversationId } = req.params;

    if (!currentUid || typeof currentUid !== "string" || currentUid.length > 128) {
      return res.status(401).json({ message: "Geçersiz kullanıcı." });
    }

    if (!conversationId || typeof conversationId !== "string" || conversationId.length > 128) {
      return res.status(400).json({ message: "Geçersiz conversationId." });
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
      message: error?.message || "Sohbet kapatilamadi.",
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
