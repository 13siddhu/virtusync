# VirtuSync

VirtuSync is a real-time video conferencing and chat application built using Node.js, Express, Socket.io, and WebRTC. It provides a simple and secure way for users to connect with each other through peer-to-peer video calls and instant messaging.

---

### 🚀 Live Demo

https://virtusync.onrender.com/  

---

### Features

* **Real-time Video Calls:** Powered by WebRTC, the application supports high-definition peer-to-peer video conferencing.
* **User Authentication:** Users can register and log in to the platform with a secure, bcrypt-hashed password system.
* **Direct Calls:** Users can initiate direct calls by sharing a unique room ID, or join a call by entering an existing room ID.
* **Real-time Chat:** The platform supports private messaging between users, with messages saved to a PostgreSQL database.
* **User Presence:** The application shows which users are currently online or offline.
* **Media Controls:** Users have controls to toggle their microphone and camera, and can also share their screen during a call.
* **Recent Contacts:** The chat interface displays a list of recent contacts for quick access to chat history.
* **Responsive UI:** The user interface is designed to be responsive, with mobile-friendly layouts for both chat and video calls.
* **Temporary Guest Access:** Users can access the direct call feature with a temporary ID without needing to register or log in.

---

### Technology Stack

* **Frontend:** HTML, CSS (Tailwind CSS for some pages), EJS (templating engine), JavaScript
* **Backend:** Node.js, Express.js
* **Real-time Communication:** Socket.io, WebRTC
* **Database:** PostgreSQL (with pg library)
* **Authentication:** Passport.js (passport-local), bcrypt for password hashing
* **Utilities:** uuid for generating temporary user IDs, dotenv for environment variables

---

### Getting Started

#### Prerequisites

* Node.js and npm installed
* PostgreSQL installed and running

#### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/13siddhu/virtusync
    cd virtusync
    ```
2.  Install the dependencies:
    ```bash
    npm install
    ```
3.  Set up your PostgreSQL database. Create a `users` table and a `messages` table.
    * `users` table schema: `id` (primary key), `email` (varchar), `password` (varchar).
    * `messages` table schema: `id` (primary key), `sender_id`, `recipient_id`, `message_text`, `timestamp`.
4.  Create a `.env` file in the root directory and add your database credentials and a session secret:
    ```env
    PG_USER=your_username
    PG_PASSWORD=your_password
    PG_HOST=localhost
    PG_PORT=5432
    PG_DATABASE=your_database_name
    SESSION_SECRET=a_random_string_for_session_secret
    ```
5.  Run the application:
    ```bash
    node index.js
    ```
6.  Open your browser and navigate to `http://localhost:3000`.

