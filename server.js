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

/* ================= FIXED CHANNEL REPLY HANDLER ================= */

// Listen for all messages to catch channel replies
bot.on("message", async (msg) => {
  // Check if this is a reply in the channel
  if (msg.chat && msg.chat.id && msg.chat.id.toString() === CHANNEL_ID.toString() && msg.reply_to_message) {
    
    console.log("📨 Channel reply detected:", msg.text);
    
    // Get the original message that was replied to
    const originalMsg = msg.reply_to_message;
    const originalText = originalMsg.text || originalMsg.caption || "";
    
    console.log("Original message text:", originalText);
    
    // Extract user ID from the original message - multiple patterns
    let userIdMatch = null;
    
    // Pattern 1: 🆔 **User ID:** 123456789
    if (originalText.includes("🆔 **User ID:**")) {
      const match = originalText.match(/🆔 \*\*User ID:\*\* (\d+)/);
      if (match) userIdMatch = match;
    }
    
    // Pattern 2: 🆔 User ID: 123456789
    if (!userIdMatch) {
      const match = originalText.match(/🆔.*?(\d+)/);
      if (match) userIdMatch = match;
    }
    
    // Pattern 3: ID: 123456789
    if (!userIdMatch) {
      const match = originalText.match(/ID:?\s*(\d+)/i);
      if (match) userIdMatch = match;
    }
    
    if (userIdMatch) {
      const targetUserId = userIdMatch[1];
      console.log("🎯 Target User ID:", targetUserId);
      
      // Check if user exists in our database
      if (users[targetUserId]) {
        const user = users[targetUserId];
        
        // Forward admin's reply to the user with professional formatting
        const adminName = msg.from.first_name || "Admin";
        const replyText = `✉️ **Message from Administration**\n\n━━━━━━━━━━━━━━━━━━━\n\n${msg.text || msg.caption || ""}\n\n━━━━━━━━━━━━━━━━━━━\n\n_This is an official message from our support team._`;
        
        try {
          await bot.sendMessage(targetUserId, replyText, { parse_mode: "Markdown" });
          
          // Confirm to admin that message was sent
          await bot.sendMessage(
            CHANNEL_ID,
            `✅ **Reply Sent Successfully**\n\n━━━━━━━━━━━━━━━━━━━\n\n👤 **To:** ${user.fullName}\n🆔 **User ID:** \`${targetUserId}\`\n📱 **Username:** ${user.username || 'Not provided'}\n\n━━━━━━━━━━━━━━━━━━━\n\n_Your message has been delivered to the user._`,
            { parse_mode: "Markdown", reply_to_message_id: msg.message_id }
          );
          
          console.log(`✅ Reply forwarded to user ${targetUserId}`);
        } catch (error) {
          console.error("Failed to send reply to user:", error);
          await bot.sendMessage(
            CHANNEL_ID,
            `❌ **Delivery Failed**\n\n━━━━━━━━━━━━━━━━━━━\n\nUnable to send message to user. They may have blocked the bot or stopped the chat.\n\n🆔 **User ID:** \`${targetUserId}\`\n\n━━━━━━━━━━━━━━━━━━━`,
            { parse_mode: "Markdown", reply_to_message_id: msg.message_id }
          );
        }
      } else {
        // User not found in database
        console.log("User not found in database:", targetUserId);
        await bot.sendMessage(
          CHANNEL_ID,
          `❌ **User Not Found**\n\n━━━━━━━━━━━━━━━━━━━\n\nUser ID \`${targetUserId}\` was not found in the registration database.\n\nPossible reasons:\n• User hasn't completed registration\n• User ID is incorrect\n• Database entry was cleared\n\n━━━━━━━━━━━━━━━━━━━`,
          { parse_mode: "Markdown", reply_to_message_id: msg.message_id }
        );
      }
    } else {
      // Couldn't find user ID in the message
      console.log("Could not extract User ID from message");
      await bot.sendMessage(
        CHANNEL_ID,
        `❌ **Cannot Process Reply**\n\n━━━━━━━━━━━━━━━━━━━\n\nUnable to find User ID in the original message.\n\nPlease make sure you're replying to a registration message that contains the user's ID.\n\n━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: "Markdown", reply_to_message_id: msg.message_id }
      );
    }
  }
});

/* ================= PROFESSIONAL WELCOME ================= */

bot.onText(/\/start/, (msg) => {
  const welcomeMessage = `🌟 **Welcome to Enterprise Platform!** 🌟

━━━━━━━━━━━━━━━━━━━

✅ **Secure Registration**
✅ **Fast Approval Process**
✅ **24/7 Support**
✅ **Instant Access**

━━━━━━━━━━━━━━━━━━━

Click the button below to begin your registration and join our growing community of content creators!`;

  bot.sendMessage(
    msg.chat.id,
    welcomeMessage,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [["📝 Start Registration"]],
        resize_keyboard: true
      }
    }
  );
});

/* ================= ENHANCED REGISTRATION FLOW ================= */

bot.on("message", async (msg) => {
  if (msg.chat.type !== "private") return;

  const chatId = msg.chat.id;
  const text = msg.text;

  if (!users[chatId]) users[chatId] = { step: 0 };

  const user = users[chatId];

  // Start Registration
  if (text === "📝 Start Registration") {
    user.step = 1;
    const nameMessage = `📋 **Registration Step 1/6**

━━━━━━━━━━━━━━━━━━━

Please enter your **Full Name** as it appears on your official documents.

Example: *John Smith*

━━━━━━━━━━━━━━━━━━━

_This information is kept confidential and secure._`;

    return bot.sendMessage(chatId, nameMessage, { parse_mode: "Markdown" });
  }

  // Step 1: Full Name
  if (user.step === 1) {
    user.fullName = text;
    user.step = 2;
    
    const emailMessage = `📧 **Registration Step 2/6**

━━━━━━━━━━━━━━━━━━━

Please enter your **Business Email Address**

Example: *contact@yourbusiness.com*

━━━━━━━━━━━━━━━━━━━

🔒 We'll never share your email with third parties.`;

    return bot.sendMessage(chatId, emailMessage, { parse_mode: "Markdown" });
  }

  // Step 2: Email
  if (user.step === 2) {
    // Simple email validation
    if (!text.includes('@') || !text.includes('.')) {
      return bot.sendMessage(chatId, "❌ Please enter a valid email address (e.g., name@domain.com)");
    }
    
    user.email = text;
    user.step = 3;
    
    const phoneMessage = `📱 **Registration Step 3/6**

━━━━━━━━━━━━━━━━━━━

Please enter your **Phone Number** with country code

Example: *+251912345678*

━━━━━━━━━━━━━━━━━━━

📞 For account verification and important updates.`;

    return bot.sendMessage(chatId, phoneMessage, { parse_mode: "Markdown" });
  }

  // Step 3: Phone Number
  if (user.step === 3) {
    user.phone = text;
    user.step = 4;
    
    const usernameMessage = `🐦 **Registration Step 4/6**

━━━━━━━━━━━━━━━━━━━

Please enter your **Telegram Username** (without @)

Example: *john_doe*

━━━━━━━━━━━━━━━━━━━

💬 So our team can easily identify and contact you.`;

    return bot.sendMessage(chatId, usernameMessage, { parse_mode: "Markdown" });
  }

  // Step 4: Telegram Username
  if (user.step === 4) {
    // Remove @ if they included it
    user.username = text.replace('@', '');
    user.step = 5;
    
    const subscribersMessage = `👥 **Registration Step 5/6**

━━━━━━━━━━━━━━━━━━━

How many **subscribers/followers** do you currently have?

Example: *15000*

━━━━━━━━━━━━━━━━━━━

📊 This helps us understand your audience size.`;

    return bot.sendMessage(chatId, subscribersMessage, { parse_mode: "Markdown" });
  }

  // Step 5: Subscribers Count
  if (user.step === 5) {
    user.subscribers = text;
    user.step = 6;
    
    const channelMessage = `🔗 **Registration Step 6/6**

━━━━━━━━━━━━━━━━━━━

Please enter your **Channel/Page Link**

Example: *https://t.me/yourchannel*

━━━━━━━━━━━━━━━━━━━

🌐 So we can review your content and verify your presence.`;

    return bot.sendMessage(chatId, channelMessage, { parse_mode: "Markdown" });
  }

  // Step 6: Channel Link
  if (user.step === 6) {
    user.channelLink = text;
    user.step = 7;
    user.status = "pending";
    user.registrationDate = new Date().toISOString();
    
    // Store Telegram info automatically
    user.telegramId = chatId;
    user.telegramFirstName = msg.from.first_name || "";
    user.telegramLastName = msg.from.last_name || "";

    // Send confirmation to user
    const confirmationMessage = `✅ **Registration Submitted Successfully!**

━━━━━━━━━━━━━━━━━━━

📋 **Your Information:**
👤 Name: ${user.fullName}
📧 Email: ${user.email}
📱 Phone: ${user.phone}
🐦 Username: @${user.username}
👥 Subscribers: ${user.subscribers}
🔗 Channel: ${user.channelLink}

━━━━━━━━━━━━━━━━━━━

⏳ Your application is now pending review by our admin team.

📌 **What happens next:**
1. Admin will review your application (usually within 24h)
2. You'll receive an approval notification
3. Complete your payment to activate access
4. Start using all platform features!

━━━━━━━━━━━━━━━━━━━

_Thank you for choosing our platform!_ 🌟`;

    await bot.sendMessage(chatId, confirmationMessage, { parse_mode: "Markdown" });

    // Professional registration notification to channel
    const channelMessage = `📥 **NEW REGISTRATION REQUEST** 📥

━━━━━━━━━━━━━━━━━━━

👤 **Personal Information:**
├ Name: ${user.fullName}
├ Email: ${user.email}
├ Phone: ${user.phone}
└ Username: @${user.username}

📊 **Channel Details:**
├ Subscribers: ${user.subscribers}
└ Link: ${user.channelLink}

🆔 **System Info:**
├ User ID: \`${chatId}\`
├ Telegram: ${user.telegramFirstName} ${user.telegramLastName}
└ Registered: ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━
⏳ Status: PENDING APPROVAL
━━━━━━━━━━━━━━━━━━━

💡 *Reply to this message to contact the user directly*`,
      { parse_mode: "Markdown" };

    // Send to channel with approve/reject buttons
    const messageOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ APPROVE", callback_data: `approve_${chatId}` },
            { text: "❌ REJECT", callback_data: `reject_${chatId}` }
          ]
        ]
      }
    };

    // Store the message ID for future reference
    const sentMessage = await bot.sendMessage(CHANNEL_ID, channelMessage, { 
      parse_mode: "Markdown", 
      ...messageOptions 
    });
    
    user.channelMessageId = sentMessage.message_id;

    return bot.sendMessage(
      chatId,
      "📊 Use the button below to check your application status:",
      {
        reply_markup: {
          keyboard: [["📊 Check Status"]],
          resize_keyboard: true
        }
      }
    );
  }

  // Check Status
  if (text === "📊 Check Status") {
    const status = user.status || "pending";
    let statusEmoji = "⏳";
    let statusText = "Pending Review";
    
    if (status === "approved") {
      statusEmoji = "✅";
      statusText = "APPROVED";
    } else if (status === "rejected") {
      statusEmoji = "❌";
      statusText = "REJECTED";
    }
    
    let statusMsg = `📊 **Application Status** 📊

━━━━━━━━━━━━━━━━━━━

${statusEmoji} **Status:** ${statusText}

👤 **Name:** ${user.fullName}
📧 **Email:** ${user.email}
📱 **Phone:** ${user.phone}
🐦 **Username:** @${user.username}
👥 **Subscribers:** ${user.subscribers}
🔗 **Channel:** ${user.channelLink}

━━━━━━━━━━━━━━━━━━━`;

    if (status === "pending") {
      statusMsg += `\n\n⏳ Your application is in queue for review.\nWe'll notify you once admin makes a decision.`;
    } else if (status === "approved") {
      statusMsg += `\n\n✅ **Congratulations!** Your application is approved.\nClick the button below to proceed with payment.`;
    } else if (status === "rejected") {
      statusMsg += `\n\n❌ Unfortunately, your application was not approved at this time.\nPlease contact support for more information.`;
    }

    const keyboard = status === "approved" 
      ? { keyboard: [["💰 Proceed to Payment"], ["📊 Check Status"]], resize_keyboard: true }
      : { keyboard: [["📝 Start Registration"], ["📊 Check Status"]], resize_keyboard: true };

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
  const adminName = callbackQuery.from.first_name || "Admin";

  const [action, userId] = data.split("_");

  if (action === "approve" || action === "reject") {
    if (users[userId]) {
      users[userId].status = action === "approve" ? "approved" : "rejected";
      users[userId].adminActionBy = adminId;
      users[userId].adminActionAt = Date.now();
      users[userId].adminName = adminName;
    }

    const newStatus = action === "approve" ? "✅ APPROVED" : "❌ REJECTED";
    const currentText = message.text;
    
    // Update the channel message with new status
    const updatedText = currentText.replace(/Status:.*$/m, `Status: ${newStatus} by ${adminName}`);
    
    await bot.editMessageText(updatedText, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [] } // Remove buttons
    });

    // Notify user
    if (action === "approve") {
      users[userId].approvalTime = Date.now();
      
      const approvalMessage = `✅ **APPLICATION APPROVED!** ✅

━━━━━━━━━━━━━━━━━━━

Dear ${users[userId].fullName},

We're pleased to inform you that your registration has been **APPROVED**!

📋 **Your Information:**
👤 Name: ${users[userId].fullName}
📧 Email: ${users[userId].email}
🔗 Channel: ${users[userId].channelLink}

━━━━━━━━━━━━━━━━━━━

💰 **Payment Instructions:**
• Standard fee: **100 ETB** (within 24 hours)
• Late fee: **150 ETB** (after 24 hours)

Click the button below to complete your payment and activate your account.

━━━━━━━━━━━━━━━━━━━
_We're excited to have you onboard!_ 🌟`;

      await bot.sendMessage(
        userId,
        approvalMessage,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["💰 Proceed to Payment"], ["📊 Check Status"]],
            resize_keyboard: true
          }
        }
      );

      // Admin notification in channel
      await bot.sendMessage(
        CHANNEL_ID,
        `✅ **User Approved** ✅

━━━━━━━━━━━━━━━━━━━

👤 **User:** ${users[userId].fullName}
🆔 **ID:** \`${userId}\`
📧 **Email:** ${users[userId].email}
📱 **Phone:** ${users[userId].phone}
🐦 **Username:** @${users[userId].username}
🔗 **Channel:** ${users[userId].channelLink}

✅ **Approved by:** ${adminName}
⏰ **Time:** ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: "Markdown" }
      );

    } else {
      // Rejection message
      const rejectionMessage = `❌ **APPLICATION STATUS UPDATE** ❌

━━━━━━━━━━━━━━━━━━━

Dear ${users[userId].fullName},

We regret to inform you that your registration application has been **REJECTED**.

━━━━━━━━━━━━━━━━━━━

**Possible reasons:**
• Information provided could not be verified
• Channel/content doesn't meet our guidelines
• Duplicate application detected

━━━━━━━━━━━━━━━━━━━

If you believe this is a mistake or would like more information, please contact our support team.

You may reapply after 30 days with updated information.`;

      await bot.sendMessage(
        userId,
        rejectionMessage,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["📝 Start Registration"]],
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

  if (text === "💰 Proceed to Payment") {
    if (user.status !== "approved") {
      return bot.sendMessage(chatId, "❌ You need to be approved first before making payment.");
    }

    const now = Date.now();
    const approvalTime = user.approvalTime || now;
    const diffHours = (now - approvalTime) / (1000 * 60 * 60);
    
    let amount = 100;
    let feeType = "Standard (within 24h)";
    if (diffHours > 24) {
      amount = 150;
      feeType = "Late (after 24h)";
    }

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

      const paymentMessage = `💰 **Payment Required** 💰

━━━━━━━━━━━━━━━━━━━

**Amount:** ${amount} ETB (${feeType})
**Fee Type:** ${feeType}

Click the secure link below to complete your payment:

[🔐 CLICK HERE TO PAY SECURELY](${response.data.data.checkout_url})

━━━━━━━━━━━━━━━━━━━

✅ After payment, you'll be automatically verified and get instant access.

_All payments are processed securely through Chapa._`;

      bot.sendMessage(
        chatId,
        paymentMessage,
        { parse_mode: "Markdown" }
      );

      // Notify channel
      await bot.sendMessage(
        CHANNEL_ID,
        `💰 **Payment Initiated** 💰

━━━━━━━━━━━━━━━━━━━

👤 **User:** ${user.fullName}
🆔 **ID:** \`${chatId}\`
💰 **Amount:** ${amount} ETB (${feeType})
🔗 **Channel:** ${user.channelLink}

━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: "Markdown" }
      );

    } catch (err) {
      console.log(err.response?.data || err.message);
      bot.sendMessage(chatId, "❌ Payment initialization failed. Please try again later or contact support.");
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

        // Welcome message to user
        const welc
