# 🌌 NebulaShare

**A highly secure, Peer-to-Peer (P2P) File Sharing & Chat application built with React, Vite, and WebRTC.**

NebulaShare allows users to instantly connect, chat, and share files directly across devices without routing data through a central server. It features a modern glassmorphism UI and an integrated AI Assistant.

## ✨ Key Features
* **🔒 True P2P Architecture:** Powered by PeerJS and WebRTC. Files and chats go directly from browser to browser.
* **🛡️ Zero Server Storage:** Files are stored only in RAM and discarded automatically. Nothing is ever saved on a database.
* **✅ Secure File Permissions:** Enterprise-grade "Accept/Reject" workflow for incoming files to prevent malware downloads.
* **🤖 Integrated AI Assistant:** Built-in Google Gemini AI to help users within the chat room.
* **🌐 Cross-Platform & Incognito Safe:** Fallback storage mechanisms ensure the app works flawlessly on strict browsers, Incognito mode, and across different OS via Google STUN servers.
* **⚡ Blazing Fast:** Built on Vite + React + TypeScript for maximum performance.

## 🛠️ Tech Stack
* **Frontend:** React 18, TypeScript, Vite, CSS (Glassmorphism UI)
* **Networking:** PeerJS (WebRTC), Custom STUN Configuration
* **AI Integration:** Google Gemini API (`gemini-1.5-flash-8b`)

## 🚀 How to Run Locally

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Sk-Abubakar/NebulaShare.git](https://github.com/Sk-Abubakar/NebulaShare.git)
   cd NebulaShare
2.**Install dependencies:**

npm install 
or use bun install

3.**Set up Environment Variables:**
Create a .env file in the root directory and add your keys:

VITE_ADMIN_PASSWORD=your_secure_password

VITE_ADMIN_SESSION_SALT=any_random_string

VITE_GEMINI_API_KEY=your_google_gemini_api_key

4.**Start the Development Server:**

npm run dev
or use bun run dev

   
