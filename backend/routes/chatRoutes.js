// chatRoutes.js file code 

const express = require("express");
const router = express.Router();

const isDevelopment = process.env.NODE_ENV === 'development';

if (isDevelopment) console.log("chatRoutes.js LOADED");

const authMiddleware = require("../middleware/authMiddleware");
const chatController = require("../controllers/chatController");

router.get("/test", (_req, res) => {
  if (isDevelopment) console.log("GET /api/chat/test reached");
  res.json({ ok: true, route: "chatRoutes works" });
});

router.post(
  "/conversations/get-or-create",
  authMiddleware,
  chatController.createOrGetConversation
);

router.get("/conversations", authMiddleware, chatController.getMyConversations);

router.get(
  "/conversations/:conversationId/messages",
  authMiddleware,
  chatController.getMessages
);

router.post(
  "/conversations/:conversationId/messages",
  authMiddleware,
  chatController.createMessage
);

router.delete(
  "/conversations/:conversationId/messages/:messageId",
  authMiddleware,
  chatController.deleteMessage
);

router.post(
  "/conversations/:conversationId/read",
  authMiddleware,
  chatController.markAsRead
);

router.post(
  "/conversations/:conversationId/close",
  authMiddleware,
  chatController.closeConversation
);

module.exports = router;