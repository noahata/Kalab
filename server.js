require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHAPA_SECRET = process.env.CHAPA_SECRET_KEY;

// Initialize bot with error handling
const bot = new TelegramBot(BOT_TOKEN, { 
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 30
    }
  }
});

// Handle polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

// Store users
const users = {};

// Store channel message IDs to user IDs
const channelMessageMap = {};

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

// ==================== WELCOME MESSAGE ====================

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  const welcomeMessage = 
`🌟 *WELCOME TO OUR PLATFORM* 🌟

━━━━━━━━━━━━━━━━━━━

✅ Secure Registration
✅ Fast Approval
✅ 24/7 Support

━━━━━━━━━━━━━━━━━━━

Click the button below to begin your registration!`;

  bot.sendMessage(
    chatId,
    welcomeMessage,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [['📝 START REGISTRATION']],
        resize_keyboard: true
      }
    }
  );
});

// ==================== REGISTRATION FLOW ====================

bot.on('message', async (msg) => {
  if (msg.chat.type !== 'private') return;
  
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!users[chatId]) users[chatId] = { step: 0 };
  const user = users[chatId];

  // ========== STEP 1: START REGISTRATION ==========
  if (text === '📝 START REGISTRATION') {
    user.step = 1;
    
    const message = 
`📋 *REGISTRATION STEP 1/6*

━━━━━━━━━━━━━━━━━━━

👤 Please enter your *Full Name*

📝 *Example:* John Smith

━━━━━━━━━━━━━━━━━━━
🔒 Your information is encrypted and secure`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 2: FULL NAME ==========
  if (user.step === 1) {
    user.fullName = text;
    user.step = 2;
    
    const message = 
`📋 *REGISTRATION STEP 2/6*

━━━━━━━━━━━━━━━━━━━

📧 Please enter your *Email Address*

📝 *Example:* name@company.com

━━━━━━━━━━━━━━━━━━━
🔒 We'll never share your email`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 3: EMAIL ==========
  if (user.step === 2) {
    if (!text.includes('@') || !text.includes('.')) {
      return bot.sendMessage(chatId, '❌ Please enter a valid email address');
    }
    
    user.email = text;
    user.step = 3;
    
    const message = 
`📋 *REGISTRATION STEP 3/6*

━━━━━━━━━━━━━━━━━━━

📱 Please enter your *Phone Number*

📝 *Example:* +251912345678

━━━━━━━━━━━━━━━━━━━
📞 For account verification`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 4: PHONE NUMBER ==========
  if (user.step === 3) {
    user.phone = text;
    user.step = 4;
    
    const message = 
`📋 *REGISTRATION STEP 4/6*

━━━━━━━━━━━━━━━━━━━

🐦 Please enter your *Telegram Username*

📝 *Example:* @john_doe

━━━━━━━━━━━━━━━━━━━
💬 So we can contact you easily`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 5: USERNAME ==========
  if (user.step === 4) {
    user.username = text.replace('@', '');
    user.step = 5;
    
    const message = 
`📋 *REGISTRATION STEP 5/6*

━━━━━━━━━━━━━━━━━━━

👥 How many *subscribers* do you have?

📝 *Example:* 15000

━━━━━━━━━━━━━━━━━━━
📊 This helps us understand your audience`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 6: SUBSCRIBERS ==========
  if (user.step === 5) {
    user.subscribers = text;
    user.step = 6;
    
    const message = 
`📋 *REGISTRATION STEP 6/6*

━━━━━━━━━━━━━━━━━━━

🔗 Please enter your *Channel Link*

📝 *Example:* https://t.me/yourchannel

━━━━━━━━━━━━━━━━━━━
🌐 For content verification`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 7: CHANNEL LINK (COMPLETE) ==========
  if (user.step === 6) {
    user.channelLink = text;
    user.step = 0;
    user.status = 'pending';
    user.registeredAt = new Date().toISOString();
    
    // Confirmation to user
    const confirmationMessage = 
`✅ *REGISTRATION COMPLETE!*

━━━━━━━━━━━━━━━━━━━

📋 *Your Information:*
👤 Name: ${user.fullName}
📧 Email: ${user.email}
📱 Phone: ${user.phone}
🐦 Username: @${user.username}
👥 Subscribers: ${user.subscribers}
🔗 Channel: ${user.channelLink}

━━━━━━━━━━━━━━━━━━━

⏳ Your application is now pending admin approval.
You'll be notified once reviewed.`;

    await bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' });
    
    // Send to channel for approval
    const channelMessage = 
`📥 *NEW REGISTRATION REQUEST*

━━━━━━━━━━━━━━━━━━━

👤 *Name:* ${user.fullName}
📧 *Email:* ${user.email}
📱 *Phone:* ${user.phone}
🐦 *Username:* @${user.username}
👥 *Subscribers:* ${user.subscribers}
🔗 *Channel:* ${user.channelLink}
🆔 *User ID:* \`${chatId}\`

━━━━━━━━━━━━━━━━━━━
⏳ *Status: PENDING APPROVAL*
━━━━━━━━━━━━━━━━━━━

💡 *Reply to this message to contact the user*`;

    // Send to channel with buttons and store message ID
    const sentMessage = await bot.sendMessage(CHANNEL_ID, channelMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ APPROVE', callback_data: `approve_${chatId}` },
            { text: '❌ REJECT', callback_data: `reject_${chatId}` }
          ]
        ]
      }
    });
    
    // Store mapping for reply system
    channelMessageMap[sentMessage.message_id] = chatId;
    
    return bot.sendMessage(
      chatId,
      '📊 Use the button below to check your status:',
      {
        reply_markup: {
          keyboard: [['📊 CHECK STATUS']],
          resize_keyboard: true
        }
      }
    );
  }
  
  // ========== CHECK STATUS ==========
  if (text === '📊 CHECK STATUS') {
    const status = user.status || 'pending';
    const statusEmoji = status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '⏳';
    const statusText = status === 'approved' ? 'APPROVED' : status === 'rejected' ? 'REJECTED' : 'PENDING';
    
    const statusMessage = 
`📊 *YOUR STATUS*

━━━━━━━━━━━━━━━━━━━

${statusEmoji} Status: ${statusText}

👤 Name: ${user.fullName}
📧 Email: ${user.email}
📱 Phone: ${user.phone}
🐦 Username: @${user.username}
👥 Subscribers: ${user.subscribers}
🔗 Channel: ${user.channelLink}

━━━━━━━━━━━━━━━━━━━`;

    let keyboard = { keyboard: [['📝 START REGISTRATION']], resize_keyboard: true };
    
    if (status === 'approved') {
      keyboard = { keyboard: [['💰 PROCEED TO PAYMENT'], ['📊 CHECK STATUS']], resize_keyboard: true };
    }
    
    return bot.sendMessage(chatId, statusMessage, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard 
    });
  }
  
  // ========== PROCEED TO PAYMENT ==========
  if (text === '💰 PROCEED TO PAYMENT') {
    if (user.status !== 'approved') {
      return bot.sendMessage(chatId, '❌ Please wait for admin approval first.');
    }
    
    const tx_ref = `tx-${chatId}-${Date.now()}`;
    
    try {
      const response = await axios.post(
        'https://api.chapa.co/v1/transaction/initialize',
        {
          amount: '100',
          currency: 'ETB',
          email: user.email,
          first_name: user.fullName,
          tx_ref: tx_ref,
          callback_url: `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}/verify`,
          return_url: `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}/`
        },
        {
          headers: {
            Authorization: `Bearer ${CHAPA_SECRET}`
          }
        }
      );
      
      user.tx_ref = tx_ref;
      
      const paymentMessage = 
`💰 *SECURE PAYMENT*

━━━━━━━━━━━━━━━━━━━

Amount: 100 ETB
Gateway: Chapa

Click below to pay:
${response.data.data.checkout_url}

━━━━━━━━━━━━━━━━━━━`;

      bot.sendMessage(chatId, paymentMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      bot.sendMessage(chatId, '❌ Payment error. Please try again.');
      console.error(error);
    }
  }
});

// ==================== CHANNEL REPLY HANDLER ====================

bot.on('message', async (msg) => {
  try {
    if (msg.chat && 
        msg.chat.id && 
        msg.chat.id.toString() === CHANNEL_ID.toString() && 
        msg.reply_to_message) {
      
      console.log('📨 Channel reply detected');
      
      const originalMessageId = msg.reply_to_message.message_id;
      const targetUserId = channelMessageMap[originalMessageId];
      
      if (targetUserId && users[targetUserId]) {
        const user = users[targetUserId];
        const adminName = msg.from.first_name || 'Admin';
        
        const forwardMessage = 
`✉️ *Message from Admin*

━━━━━━━━━━━━━━━━━━━

${msg.text || ''}

━━━━━━━━━━━━━━━━━━━
👤 Admin: ${adminName}`;

        await bot.sendMessage(targetUserId, forwardMessage, { parse_mode: 'Markdown' });
        
        await bot.sendMessage(
          CHANNEL_ID,
          `✅ Reply sent to ${user.fullName}`,
          { reply_to_message_id: msg.message_id }
        );
      } else {
        await bot.sendMessage(
          CHANNEL_ID,
          '❌ User not found',
          { reply_to_message_id: msg.message_id }
        );
      }
    }
  } catch (error) {
    console.error('Reply error:', error);
  }
});

// ==================== ADMIN APPROVAL ====================

bot.on('callback_query', async (query) => {
  try {
    const [action, userId] = query.data.split('_');
    const adminName = query.from.first_name || 'Admin';
    
    if (users[userId]) {
      users[userId].status = action === 'approve' ? 'approved' : 'rejected';
      users[userId].approvedBy = adminName;
      users[userId].approvedAt = new Date().toISOString();
    }
    
    // Update channel message
    const newStatus = action === 'approve' ? '✅ APPROVED' : '❌ REJECTED';
    const newText = query.message.text.replace(/⏳.*PENDING APPROVAL/, `${newStatus} by ${adminName}`);
    
    await bot.editMessageText(newText, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [] }
    });
    
    // Notify user
    if (action === 'approve') {
      await bot.sendMessage(
        userId,
        `✅ *APPROVED!*\n\nYour registration has been approved. Click below to pay.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['💰 PROCEED TO PAYMENT'], ['📊 CHECK STATUS']],
            resize_keyboard: true
          }
        }
      );
      
      await bot.sendMessage(
        CHANNEL_ID,
        `✅ User ${users[userId].fullName} approved by ${adminName}`
      );
      
    } else {
      await bot.sendMessage(
        userId,
        `❌ *REJECTED*\n\nYour registration has been rejected. Please contact support.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['📝 START REGISTRATION']],
            resize_keyboard: true
          }
        }
      );
    }
    
    bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('Callback error:', error);
  }
});

// ==================== PAYMENT VERIFICATION ====================

app.post('/verify', async (req, res) => {
  const { tx_ref } = req.body;
  
  try {
    const response = await axios.get(
      `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
      { headers: { Authorization: `Bearer ${CHAPA_SECRET}` } }
    );
    
    if (response.data.status === 'success') {
      const userId = Object.keys(users).find(id => users[id]?.tx_ref === tx_ref);
      
      if (userId) {
        users[userId].paymentStatus = 'completed';
        users[userId].paidAt = new Date().toISOString();
        
        await bot.sendMessage(
          userId,
          `🎉 *PAYMENT CONFIRMED!*\n\nWelcome to the platform!`,
          { parse_mode: 'Markdown' }
        );
        
        await bot.sendMessage(
          CHANNEL_ID,
          `💎 *NEW PAID MEMBER*\n\n👤 ${users[userId].fullName}\n💰 100 ETB`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

console.log('✅ Bot started successfully!');
console.log('📋 Registration flow: Name → Email → Phone → Username → Subscribers → Channel');
