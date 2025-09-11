import express from "express";
import { createServer } from 'http';
import { Server } from 'socket.io';
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import passport from "passport";
import { Strategy} from "passport-local";
import pg from "pg";
import session from "express-session";
import env from "dotenv";
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = createServer(app);
const io = new Server(server);
const saltrounds = 10;
const port = 3000;
env.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// --- UPDATED SESSION MIDDLEWARE CONFIGURATION ---
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    proxy: true, // This is crucial for Vercel
    cookie: {
      secure: true, // This ensures cookies are only sent over HTTPS
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(function(req, res, next) {
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.user = req.user;
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const db = new pg.Client({
  connectionString: process.env.DB_URL || `postgres://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}`,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect()
  .then(() => console.log("Database connected successfully."))
  .catch(err => console.error("Database connection error:", err));


const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  const userId = socket.handshake.query.userId;
  if (userId) {
    activeUsers.set(String(userId), socket.id);
    console.log(`User ${userId} is now active with socket ID ${socket.id}`);
    io.emit('active-users', Array.from(activeUsers.keys()));
  }

  socket.on('private-message', async (data) => {
    const { recipientId, message } = data;
    const senderId = socket.handshake.query.userId;
    console.log(`Received private message from ${senderId} to ${recipientId}: ${message}`);

    if (!senderId || !recipientId || !message) {
      console.error("Invalid message data received.");
      return;
    }
    
    try {
        const result = await db.query(
            "INSERT INTO messages (sender_id, recipient_id, message_text) VALUES ($1, $2, $3) RETURNING *",
            [senderId, recipientId, message]
        );
        const savedMessage = result.rows[0];
        console.log("Message saved to database:", savedMessage);

        const recipientSocketId = activeUsers.get(String(recipientId));

        if (recipientSocketId) {
            console.log(`Emitting message to recipient ${recipientId} on socket ${recipientSocketId}`);
            io.to(recipientSocketId).emit('chat-message', {
                fromUserId: senderId,
                message: savedMessage.message_text,
            });
        } else {
            console.log(`Recipient ${recipientId} is offline, message not emitted.`);
        }

        console.log(`Emitting message back to sender ${senderId} on socket ${socket.id}`);
        io.to(socket.id).emit('chat-message', {
            fromUserId: senderId,
            message: savedMessage.message_text,
        });

    } catch (err) {
        console.error("Error saving message to database:", err);
        io.to(socket.id).emit('status', 'Error sending message.');
    }
  });

  socket.on('call-ended-notification', async (data) => {
    const { roomId, fromUserId } = data;
    console.log(`Call ended in room ${roomId} by user ${fromUserId}.`);

    const roomSockets = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const otherUserSocketId = roomSockets.find(sId => sId !== socket.id);
    const otherUserId = Array.from(activeUsers.entries()).find(([uId, sId]) => sId === otherUserSocketId)?.[0];

    if (otherUserId) {
        const messageText = `Call with ${fromUserId} has ended.`;
        try {
            const result = await db.query(
                "INSERT INTO messages (sender_id, recipient_id, message_text) VALUES ($1, $2, $3) RETURNING *",
                [fromUserId, otherUserId, messageText]
            );
            const savedMessage = result.rows[0];
            console.log("'Call ended' message saved to database:", savedMessage);

            io.to(otherUserSocketId).emit('chat-message', {
                fromUserId: fromUserId,
                message: messageText,
            });
        } catch (err) {
            console.error("Error saving 'call ended' message:", err);
        }
    }
  });

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);

    const roomSockets = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    console.log(`Users in room ${roomId}:`, roomSockets);
    
    if (roomSockets.length > 1) {
      socket.to(roomId).emit('user-joined', { userId: socket.id });
    }
  });

  socket.on('signal', (data) => {
    socket.to(data.room).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
    console.log(`Forwarding signal from ${socket.id} in room ${data.room}`);
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room ${roomId}`);
    socket.to(roomId).emit('user-left', { userId: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const [roomId, roomSet] of Object.entries(io.sockets.adapter.rooms)) {
      if (roomSet.has(socket.id)) {
        socket.to(roomId).emit('user-left', { userId: socket.id });
        console.log(`User ${socket.id} removed from room ${roomId}`);
        break;
      }
    }
    for (let [id, sId] of activeUsers.entries()) {
      if (sId === socket.id) {
        activeUsers.delete(id);
        console.log(`User ${id} removed from active users.`);
        io.emit('active-users', Array.from(activeUsers.keys()));
        break;
      }
    }
  });
});

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get('/directcall', (req, res) => {
  let currentUser = req.user;
  let isTempUser = false;
  if (!currentUser) {
    currentUser = { id: uuidv4(), email: 'Guest' };
    isTempUser = true;
  }
  
  res.render("directcall.ejs", {
    currentUser,
    isTempUser
  });
});

app.get('/calling', (req, res) => {
    let currentUser = req.user;
    let isTempUser = false;
    if (!currentUser) {
        currentUser = { id: uuidv4(), email: 'Guest' };
        isTempUser = true;
    }
    const roomId = req.query.room || null;
    const audioOnly = req.query.audioOnly === 'true';

    if (!roomId) {
        return res.status(400).send("Room ID is required to join a call.");
    }
    
    res.render("calling.ejs", {
        currentUser,
        isTempUser,
        roomId,
        audioOnly
    });
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/api/search-user", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Unauthorized");
  }
  const { email, id } = req.query;
  if (!email && !id) {
    return res.status(400).send("Provide email or id to search.");
  }
  try {
    let result;
    if (email) {
      result = await db.query("SELECT id, email FROM users WHERE email = $1", [email]);
    } else {
      result = await db.query("SELECT id, email FROM users WHERE id = $1", [id]);
    }
    if (result.rows.length === 0) {
      return res.status(404).send("User not found.");
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error searching user in database:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/recent-contacts", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Unauthorized");
  }
  const currentUser = req.user.id;
  try {
    const result = await db.query(
      `SELECT DISTINCT
          CASE
            WHEN sender_id = $1 THEN recipient_id
            ELSE sender_id
          END AS contact_id
        FROM messages
        WHERE sender_id = $1 OR recipient_id = $1`,
      [currentUser]
    );
    const contactIds = result.rows.map(row => row.contact_id);
    if (contactIds.length === 0) return res.json([]);

    const usersResult = await db.query(
      `SELECT id, email FROM users WHERE id = ANY($1::int[])`,
      [contactIds]
    );
    res.json(usersResult.rows);
  } catch (err) {
    console.error("Error fetching recent contacts:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/chat-history", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Unauthorized");
  }
  const currentUser = req.user.id;
  const otherUserId = req.query.recipientId;
  if (!otherUserId) {
    return res.status(400).send("Recipient ID is required.");
  }
  try {
    const result = await db.query(
      `SELECT * FROM messages
       WHERE (sender_id = $1 AND recipient_id = $2)
       OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY timestamp ASC`,
      [currentUser, otherUserId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching chat history:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/profile", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("profile.ejs", { currentUser: req.user });
  } else {
    res.redirect("/login");
  }
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.post("/login",
  passport.authenticate("local", {
    successRedirect: "/profile",
    failureRedirect: "/login",
  })
);

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;
  try {
    const checkResult = await db.query("SELECT * from users WHERE email = $1", [email]);
    if (checkResult.rows.length > 0) {
      return res.redirect("/login");
    } else {
      bcrypt.hash(password, saltrounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password", err);
        } else {
          const result = await db.query("INSERT INTO users (email, password) VALUES ($1,$2) RETURNING id", [email, hash]);
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log("Success");
            res.redirect("/profile");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * from users WHERE email = $1", [username]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storeHashedPassword = user.password;
        bcrypt.compare(password, storeHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing password", err);
            return cb(err);
          } else {
            if (valid) {
              return cb(null, user);
            } else {
              return cb(null, false, { message: 'Incorrect password.' });
            }
          }
        });
      } else {
        return cb(null, false, { message: 'User not found.' });
      }
    } catch (err) {
      console.log(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

server.listen(process.env.PORT || port, () => {
  console.log(`Server running on port ${process.env.PORT || port}`);
});