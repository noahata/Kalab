require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ========== AUTO URL DETECTION (OPTION 2) ==========
// This automatically detects your Render URL without needing PUBLIC_URL in env
const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // Render provides this automatically
const PUBLIC_URL = process.env.PUBLIC_URL || RENDER_URL || `http://localhost:${PORT}`;

console.log("🚀 Server Configuration:");
console.log("📡 PORT:", PORT);
console.log("🌐 Public URL:", PUBLIC_URL);
console.log("🔗 Webhook URL:", PUBLIC_URL + "/verify");
// ====================================================

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

// Add a route to check current URL
app.get("/config", (req, res) => {
  res.json({
    status: "running",
    public_url: PUBLIC_URL,
    webhook_url: PUBLIC_URL + "/verify",
    timestamp: new Date().toISOString()
  });
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
    user.status = "pending"; // pending approval

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
🆔 **User ID:** ${chatId}
⏰ **Time:** ${new Date().toLocaleString()}

Status: ⏳ Pending Approval`,
      { parse_mode: "Markdown", ...messageOptions }
    );

    return bot.sendMessage(
      chatId,
      "✅ Your registration has been submitted for approval. You'll receive a notification once reviewed.",
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
  const adminId = callbackQuery.from.id; // Admin who clicked

  // Extract action and userId from callback_data
  const [action, userId] = data.split("_");

  if (action === "approve" || action === "reject") {
    // Update user status
    if (users[userId]) {
      users[userId].status = action === "approve" ? "approved" : "rejected";
      users[userId].adminActionBy = adminId;
      users[userId].adminActionAt = Date.now();
    }

    // Update the channel message
    const newStatus = action === "approve" ? "✅ APPROVED" : "❌ REJECTED";
    const newText = message.text.replace(/Status:.*/g, `Status: ${newStatus} by [Admin](tg://user?id=${adminId})`);
    
    await bot.editMessageText(newText, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [] } // Remove buttons after action
    });

    // Notify the user
    if (action === "approve") {
      users[userId].approvalTime = Date.now(); // Start payment timer
      
      await bot.sendMessage(
        userId,
        `✅ **Congratulations! Your registration has been APPROVED!**

You now have 24 hours to complete your payment.
- Standard fee: 100 ETB (within 24h)
- Late fee: 150 ETB (after 24h)

Click the button below to proceed with payment.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["Proceed to Payment"]],
            resize_keyboard: true
          }
        }
      );

      // Notify channel admin who approved
      await bot.sendMessage(
        CHANNEL_ID,
        `✅ User [${users[userId].fullName}](tg://user?id=${userId}) has been approved and notified.`,
        { parse_mode: "Markdown" }
      );

    } else {
      await bot.sendMessage(
        userId,
        `❌ **Registration Rejected**

Unfortunately, your registration has been rejected. This could be due to:
- Invalid information provided
- Not meeting our requirements

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

    // Answer callback query
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
    // Check if user is approved
    if (user.status !== "approved") {
      return bot.sendMessage(chatId, "❌ You need to be approved first before making payment.");
    }

    // Calculate payment amount based on time
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
          callback_url: PUBLIC_URL + "/verify",  // Using auto-detected URL
          return_url: PUBLIC_URL                   // Using auto-detected URL
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

      // Notify channel that user initiated payment
      await bot.sendMessage(
        CHANNEL_ID,
        `💰 User [${user.fullName}](tg://user?id=${chatId}) initiated payment of ${amount} ETB`,
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

        // Notify user
        await bot.sendMessage(
          chatId,
          "✅ **Payment Confirmed!**\n\nWelcome aboard! You now have full access to our platform. Use /start to begin.",
          { parse_mode: "Markdown" }
        );

        // Notify channel with user info
        await bot.sendMessage(
          CHANNEL_ID,
          `💎 **New Paid Member!**

👤 **Name:** ${user.fullName}
📧 **Email:** ${user.email}
💰 **Amount:** ${user.paymentAmount} ETB
🆔 **User ID:** ${chatId}
📅 **Date:** ${new Date().toLocaleString()}

Status: ✅ Fully Registered & Paid`,
          { parse_mode: "Markdown" }
        );

        // Update user keyboard
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

// Add simple dashboard for paid users
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