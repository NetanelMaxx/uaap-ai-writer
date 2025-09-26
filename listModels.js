// listModels.js
import fetch from "node-fetch"; // install via npm i node-fetch if not present

const API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    console.log("Available models:", data);
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
