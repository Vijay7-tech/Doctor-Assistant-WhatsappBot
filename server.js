import dotenv from "dotenv";
dotenv.config(); // ✅ MUST BE FIRST

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import mongoose from "mongoose";

const app = express();
app.use(bodyParser.json());

// ============================
// 🔐 ENV VARIABLES
// ============================
const TOKEN = process.env.TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = "my_verify_token"; // same in Meta

// 🔍 DEBUG (REMOVE LATER)
console.log("MONGO_URI:", process.env.MONGO_URI);

// ============================
// 🌐 CONNECT MONGODB (ATLAS)
// ============================
mongoose.set("strictQuery", true);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Atlas connected ✅"))
  .catch(err => console.log("Mongo Error ❌", err));

// ============================
// 📦 SCHEMA
// ============================
const bookingSchema = new mongoose.Schema({
  name: String,
  date: String,
  time: String,
  phone: String,
});

const Booking = mongoose.model("Booking", bookingSchema);

// ============================
// 🧠 USER STATE
// ============================
const userState = {};
const userData = {};

// ============================
// ✅ WEBHOOK VERIFY (GET)
// ============================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified ✅");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
});

// ============================
// 📩 RECEIVE MESSAGE (POST)
// ============================
app.post("/webhook", async (req, res) => {
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;

    if (!value?.messages) return res.sendStatus(200);

    const message = value.messages[0];
    const from = message.from;

    if (message.type !== "text") return res.sendStatus(200);

    let text = message.text.body.toLowerCase().trim();
    let reply = "";

    // ============================
    // 🤖 MENU
    // ============================
    if (text === "hi" || text === "hello") {
      userState[from] = "menu";

      reply = `👋 Welcome!

Choose an option:
1️⃣ Book Appointment 🏥
2️⃣ Services 💊
3️⃣ Contact 📞`;
    }

    // ============================
    // 🏥 BOOKING FLOW
    // ============================
    else if (text === "1") {
      userState[from] = "ask_name";
      reply = "📝 Enter your name:";
    }

    else if (userState[from] === "ask_name") {
      userData[from] = { name: text };
      userState[from] = "ask_date";
      reply = "📅 Enter date (e.g., 15 April):";
    }

    else if (userState[from] === "ask_date") {
      userData[from].date = text;
      userState[from] = "ask_time";
      reply = "⏰ Enter time (e.g., 5 PM):";
    }

    else if (userState[from] === "ask_time") {
      userData[from].time = text;
      userData[from].phone = from;

      // 💾 SAVE TO MONGODB
      await Booking.create(userData[from]);

      // 🔥 SEND TO GOOGLE SHEET
      await axios.post(
        "https://script.google.com/macros/s/AKfycby0Jfzsd1rNUUfZT6i-zV4PKRW-RiY81v47zpkggcv1oRtPmdMwz7fkAdWo9leeZn0c/exec",
        userData[from]
      );

      const { name, date, time } = userData[from];

      reply = `✅ Booking Confirmed!

👤 Name: ${name}
📅 Date: ${date}
⏰ Time: ${time}

🏥 We will contact you soon!`;

      userState[from] = "done";
    }

    // ============================
    // 💊 SERVICES
    // ============================
    else if (text === "2") {
      reply = `💊 Our Services:

• General Checkup
• Dental Care
• Heart Specialist
• Emergency Care`;
    }

    // ============================
    // 📞 CONTACT
    // ============================
    else if (text === "3") {
      reply = `📞 Contact Us:

Phone: +91 9876543210
Address: Madurai Clinic`;
    }

    // ============================
    // ❌ INVALID
    // ============================
    else {
      reply = "❌ Invalid option.\nType *hi* to start again.";
    }

    // ============================
    // 📤 SEND MESSAGE
    // ============================
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.log("❌ ERROR:", error.response?.data || error.message);
    res.sendStatus(200);
  }
});

// ============================
// 🚀 START SERVER
// ============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});