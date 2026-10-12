BRIGHTWORKS — COMPLETE WEBSITE + BACKEND
========================================

Contents
- public/index.html, public/style.css, public/script.js: premium hacker website
- server.js: serves the website and pairing/status API from one Node.js server
- bot.js: WhatsApp connection and starter dot commands
- .env: local configuration template (private)
- .env.example: configuration template
- package.json: dependencies and start command
- .gitignore: excludes secrets and session data

SETUP
1. Download and extract this ZIP.
2. On a Node.js 20+ host, upload the project files/folder.
3. Set PORTAL_KEY in .env to a long, unique private secret.
4. Install dependencies with: npm install
5. Start with: npm start
6. Open the host's HTTPS URL. The site and /api endpoints are served from the same origin.
7. Pair using a WhatsApp account you own or are authorized to connect.

IMPORTANT SECURITY
- Never commit .env, auth/, or WhatsApp session credentials to GitHub.
- .gitignore helps protect secrets locally, but check the GitHub file list before committing.
- Do not publish the private PORTAL_KEY in frontend code. Enter it in the website's key field when needed.
- Use HTTPS in production and keep Node.js/dependencies updated.
- The bot starter includes .help, .menu, .ping, .alive, .rank, and .setrank.
- Add administrator permission checks to .setrank before using in a public group.
- WhatsApp/Baileys behavior can change; test the bot on your host and review the library's current guidance.
- GitHub Pages cannot run server.js. Host the complete project on a Node.js host instead.
