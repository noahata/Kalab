require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ========== AUTO URL DETECTION ==========
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const PUBLIC_URL = process.env.PUBLIC_URL || RENDER_URL || `http://localhost:${PORT}`;

console.log("🚀 Server Configuration:");
console.log("📡 PORT:", PORT);
console.log("🌐 Public URL:", PUBLIC_URL);
console.log("🔗 Webhook URL:", PUBLIC_URL + "/verify");
// ========================================

app.listen(PORT, () => console.log("✅ Server running on port " + PORT));

/* ================= TELEGRAM BOT ================= */

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const CHANNEL_ID = process.env.CHANNEL_ID;
const CHAPA_SECRET = process.env.CHAPA_SECRET_KEY;

let users = {};

/* ================= HEALTH CHECK ================= */

app.get("/", (req, res) => {
  res.send("✅ Bot is running 🚀");
});

app.get("/config", (req, res) => {
  res.json({
    status: "running",
    public_url: PUBLIC_URL,
    webhook_url: PUBLIC_URL + "/verify",
    timestamp: new Date().toISOString()
  });
});

/* ================= CHANNEL REPLY HANDLER ================= 
   When admin replies to a message in channel, it forwards to user's DM
*/

bot.on("message", async (msg) => {
  // Check if this is a reply in the channel
  if (msg.chat.id.toString() === CHANNEL_ID.toString() && msg.reply_to_message) {
    
    // Get the original message that was replied to
    const originalMsg = msg.reply_to_message;
    const originalText = originalMsg.text || originalMsg.caption || "";
    
    // Extract user ID from the original message
    // Format: "🆔 User ID: 123456789" or similar
    const userIdMatch = originalText.match(/🆔.*?(\d+)/) || originalText.match(/ID:?\s*(\d+)/i);
    
    if (userIdMatch) {
      const targetUserId = userIdMatch[1];
      
      // Check if user exists in our database
      if (users[targetUserId]) {
        const user = users[targetUserId];
        
        // Forward admin's reply to the user
        const replyText = `📨 **Message from Admin:**\n\n${msg.text || msg.caption || ""}`;
        
        try {
          await bot.sendMessage(targetUserId, replyText, { parse_mode: "Markdown" });
          
          // Confirm to admin that message was sent
          await bot.sendMessage(
            CHANNEL_ID,
            `✅ Reply sent to [${user.fullName}](tg://user?id=${targetUserId})`,
            { parse_mode: "Markdown", reply_to_message_id: msg.message_id }
          );
          
          console.log(`✅ Reply forwarded to user ${targetUserId}`);
        } catch (error) {
          console.error("Failed to send reply to user:", error);
          await bot.sendMessage(
            CHANNEL_ID,
            `❌ Failed to send reply. User may have blocked the bot.`,
            { reply_to_message_id: msg.message_id }
          );
        }
      } else {
        // User not found in database
        await bot.sendMessage(
          CHANNEL_ID,
          `❌ User ID ${targetUserId} not found in registration database.`,
          { reply_to_message_id: msg.message_id }
        );
      }
    } else {
      // Couldn't find user ID in the message
      await bot.sendMessage(
        CHANNEL_ID,
        `❌ Could not find User ID in the original message. Make sure the message contains the user ID.`,
        { reply_to_message_id: msg.message_id }
      );
    }
  }
});

/* ================= START ================= */

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Welcome 🚀 Click Register to join our platform",
    {
      reply_markup: {
        keyboard: [["Register"]],
        resize_keyboard: true
      }
    }
  );
});

/* ================= USER REGISTRATION FLOW ================= */

bot.on("message", async (msg) => {
  if (msg.chat.type !== "private") return;

  const chatId = msg.chat.id;
  const text = msg.text;

  if (!users[chatId]) users[chatId] = { step: 0 };

  const user = users[chatId];

  if (text === "Register") {
    user.step = 1;
    return bot.sendMessage(chatId, "📝 Please enter your Full Name:");
  }

  if (user.step === 1) {
    user.fullName = text;
    user.step = 2;
    return bot.sendMessage(chatId, "📧 Please enter your Business Email:");
  }

  if (user.step === 2) {
    user.email = text;
    user.step = 3;
    return bot.sendMessage(chatId, "👥 How many subscribers do you have?");
  }

  if (user.step === 3) {
    user.subscribers = text;
    user.step = 4;
    return bot.sendMessage(chatId, "🔗 Please enter your Channel Link (e.g., https://t.me/yourchannel):");
  }

  if (user.step === 4) {
    user.channelLink = text;
    user.step = 5;
    user.status = "pending";

    // Send registration to channel with inline buttons
    const messageOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve_${chatId}` },
            { text: "❌ Reject", callback_data: `reject_${chatId}` }
          ]
        ]
      }
    };

    await bot.sendMessage(
      CHANNEL_ID,
      `📥 **New Registration Request**

👤 **Name:** ${user.fullName}
📧 **Email:** ${user.email}
👥 **Subscribers:** ${user.subscribers}
🔗 **Channel:** ${user.channelLink}
🆔 **User ID:** ${chatId}
⏰ **Time:** ${new Date().toLocaleString()}

Status: ⏳ Pending Approval

---
💡 *Reply to this message to contact the user directly*`,
      { parse_mode: "Markdown", ...messageOptions }
    );

    return bot.sendMessage(
      chatId,
      "✅ Your registration has been submitted for approval. You'll receive a notification once reviewed.\n\n📝 **Note:** Admins may contact you via DM by replying to your registration message in the channel.",
      {
        reply_markup: {
          keyboard: [["Check Status"]],
          resize_keyboard: true
        }
      }
    );
  }

  if (text === "Check Status") {
    const status = user.status || "pending";
    let statusMsg = "📊 **Your Registration Status**\n\n";
    
    if (status === "pending") {
      statusMsg += "⏳ Your application is pending admin approval.";
    } else if (status === "approved") {
      statusMsg += "✅ Your application has been approved! Click 'Proceed to Payment' to continue.";
    } else if (status === "rejected") {
      statusMsg += "❌ Your application has been rejected. Please contact support for more information.";
    }

    // Add channel link if available
    if (user.channelLink) {
      statusMsg += `\n\n🔗 Your Channel: ${user.channelLink}`;
    }

    const keyboard = status === "approved" 
      ? { keyboard: [["Proceed to Payment"]], resize_keyboard: true }
      : { keyboard: [["Register"]], resize_keyboard: true };

    return bot.sendMessage(chatId, statusMsg, { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    });
  }
});

/* ================= CHANNEL ADMIN ACTIONS ================= */

// Handle callback queries from inline buttons
bot.on("callback_query", async (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;
  const adminId = callbackQuery.from.id;

  const [action, userId] = data.split("_");

  if (action === "approve" || action === "reject") {
    if (users[userId]) {
      users[userId].status = action === "approve" ? "approved" : "rejected";
      users[userId].adminActionBy = adminId;
      users[userId].adminActionAt = Date.now();
    }

    const newStatus = action === "approve" ? "✅ APPROVED" : "❌ REJECTED";
    const newText = message.text.replace(/Status:.*/g, `Status: ${newStatus} by [Admin](tg://user?id=${adminId})`);
    
    await bot.editMessageText(newText, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [] }
    });

    if (action === "approve") {
      users[userId].approvalTime = Date.now();
      
      await bot.sendMessage(
        userId,
        `✅ **Congratulations! Your registration has been APPROVED!**

You now have 24 hours to complete your payment.
- Standard fee: 100 ETB (within 24h)
- Late fee: 150 ETB (after 24h)

🔗 Your Channel: ${users[userId].channelLink}

Click the button below to proceed with payment.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["Proceed to Payment"]],
            resize_keyboard: true
          }
        }
      );

      await bot.sendMessage(
        CHANNEL_ID,
        `✅ User [${users[userId].fullName}](tg://user?id=${userId}) has been approved and notified.\n🔗 Channel: ${users[userId].channelLink}`,
        { parse_mode: "Markdown" }
      );

    } else {
      await bot.sendMessage(
        userId,
        `❌ **Registration Rejected**

Unfortunately, your registration has been rejected. This could be due to:
- Invalid information provided
- Not meeting our requirements
- Channel not eligible

Please contact support if you believe this is a mistake.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["Register"]],
            resize_keyboard: true
          }
        }
      );
    }

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: `User ${action === "approve" ? "approved" : "rejected"} successfully!`,
      show_alert: false
    });
  }
});

/* ================= PAYMENT FLOW ================= */

bot.on("message", async (msg) => {
  if (msg.chat.type !== "private") return;

  const chatId = msg.chat.id;
  const text = msg.text;

  if (!users[chatId]) return;

  const user = users[chatId];

  if (text === "Proceed to Payment") {
    if (user.status !== "approved") {
      return bot.sendMessage(chatId, "❌ You need to be approved first before making payment.");
    }

    const now = Date.now();
    const approvalTime = user.approvalTime || now;
    const diffHours = (now - approvalTime) / (1000 * 60 * 60);
    
    let amount = 100;
    if (diffHours > 24) amount = 150;

    const tx_ref = "tx-" + chatId + "-" + Date.now();

    try {
      const response = await axios.post(
        "https://api.chapa.co/v1/transaction/initialize",
        {
          amount: amount,
          currency: "ETB",
          email: user.email,
          first_name: user.fullName,
          tx_ref: tx_ref,
          callback_url: PUBLIC_URL + "/verify",
          return_url: PUBLIC_URL
        },
        {
          headers: {
            Authorization: `Bearer ${CHAPA_SECRET}`
          }
        }
      );

      user.tx_ref = tx_ref;
      user.paymentAmount = amount;
      user.paymentInitTime = now;

      bot.sendMessage(
        chatId,
        `💰 **Payment Required: ${amount} ETB**

Click the link below to complete your payment:
[🔗 Pay Now](${response.data.data.checkout_url})

After payment, you'll be automatically verified.`,
        { parse_mode: "Markdown" }
      );

      await bot.sendMessage(
        CHANNEL_ID,
        `💰 User [${user.fullName}](tg://user?id=${chatId}) initiated payment of ${amount} ETB\n🔗 Channel: ${user.channelLink}`,
        { parse_mode: "Markdown" }
      );

    } catch (err) {
      console.log(err.response?.data || err.message);
      bot.sendMessage(chatId, "❌ Payment initialization failed. Please try again later.");
    }
  }
});

/* ================= CHAPA WEBHOOK ================= */

app.post("/verify", async (req, res) => {
  const tx_ref = req.body.tx_ref;

  if (!tx_ref) return res.sendStatus(400);

  try {
    const verify = await axios.get(
      `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
      {
        headers: { Authorization: `Bearer ${CHAPA_SECRET}` }
      }
    );

    if (verify.data.status === "success") {
      const chatId = Object.keys(users).find(
        id => users[id].tx_ref === tx_ref
      );

      if (chatId) {
        const user = users[chatId];
        user.paymentStatus = "completed";
        user.paymentVerifiedAt = Date.now();

        await bot.sendMessage(
          chatId,
          "✅ **Payment Confirmed!**\n\nWelcome aboard! You now have full access to our platform.\n🔗 Your Channel: " + user.channelLink,
          { parse_mode: "Markdown" }
        );

        await bot.sendMessage(
          CHANNEL_ID,
          `💎 **New Paid Member!**

👤 **Name:** ${user.fullName}
📧 **Email:** ${user.email}
🔗 **Channel:** ${user.channelLink}
💰 **Amount:** ${user.paymentAmount} ETB
🆔 **User ID:** ${chatId}
📅 **Date:** ${new Date().toLocaleString()}

Status: ✅ Fully Registered & Paid`,
          { parse_mode: "Markdown" }
        );

        await bot.sendMessage(chatId, "What would you like to do next?", {
          reply_markup: {
            keyboard: [["Dashboard", "Support"]],
            resize_keyboard: true
          }
        });
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.log("Verification error:", error.message);
    res.sendStatus(500);
  }
});

// Dashboard for paid users
bot.on("message", async (msg) => {
  if (msg.chat.type !== "private") return;
  
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!users[chatId]) return;
  
  const user = users[chatId];
  
  if (text === "Dashboard" && user.paymentStatus === "completed") {
    bot.sendMessage(
      chatId,
      `📊 **Your Dashboard**

👤 Name: ${user.fullName}
📧 Email: ${user.email}
👥 Subscribers: ${user.subscribers}
🔗 Channel: ${user.channelLink}
💰 Paid: ${user.paymentAmount} ETB
📅 Member since: ${new Date(user.paymentVerifiedAt).toLocaleDateString()}

Access your features below:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [["Features", "Support"]],
          resize_keyboard: true
        }
      }
    );
  } else if (text === "Support") {
    bot.sendMessage(
      chatId,
      "📞 **Support Center**\n\nContact us at: support@example.com\nOr wait for admin assistance.",
      { parse_mode: "Markdown" }
    );
  } else if (text === "Features") {
    bot.sendMessage(
      chatId,
      "✨ **Available Features**\n\n• Analytics Dashboard\n• Campaign Manager\n• Audience Insights\n• Export Reports\n\nMore features coming soon!",
      { parse_mode: "Markdown" }
    );
  }
});
