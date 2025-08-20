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

app.use(
  session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
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
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});
db.connect();

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
    const recipientSocketId = activeUsers.get(String(recipientId));
    
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

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('chat-message', {
          id: savedMessage.id,
          fromUserId: senderId,
          message: savedMessage.message_text,
          timestamp: savedMessage.timestamp,
        });
      }
      io.to(socket.id).emit('chat-message', {
        id: savedMessage.id,
        fromUserId: senderId,
        message: savedMessage.message_text,
        timestamp: savedMessage.timestamp,
      });

    } catch (err) {
      console.error("Error saving message to database:", err);
      io.to(socket.id).emit('status', 'Error sending message.');
    }
  });

  // -----------------------------------------------------------------------------
  // ONE-ON-ONE WEBRTC SIGNALING
  // -----------------------------------------------------------------------------
  
  socket.on('offer', (data) => {
    const recipientSocketId = activeUsers.get(String(data.recipientId));
    const fromUserId = socket.handshake.query.userId;
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('offer', {
        fromUserId: fromUserId,
        offer: data.offer
      });
      console.log(`Offer from ${fromUserId} to ${data.recipientId}`);
    } else {
      io.to(socket.id).emit('status', `User ${data.recipientId} is offline.`);
    }
  });

  socket.on('answer', (data) => {
    const recipientSocketId = activeUsers.get(String(data.recipientId));
    const fromUserId = socket.handshake.query.userId;
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('answer', {
        fromUserId: fromUserId,
        answer: data.answer
      });
      console.log(`Answer from ${fromUserId} to ${data.recipientId}`);
    }
  });

  socket.on('ice-candidate', (data) => {
    const recipientSocketId = activeUsers.get(String(data.recipientId));
    const fromUserId = socket.handshake.query.userId;
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('ice-candidate', {
        fromUserId: fromUserId,
        candidate: data.candidate
      });
      console.log(`ICE candidate from ${fromUserId} to ${data.recipientId}`);
    }
  });

  socket.on('end-call', (data) => {
    const recipientSocketId = activeUsers.get(String(data.recipientId));
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('end-call');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
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
    console.error("Error searching user:", err);
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

app.get("/start-call/:recipientId", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    const { recipientId } = req.params;
    const { audioOnly, callerId } = req.query; 
    
    if (!recipientId || !callerId) {
        return res.status(400).send("Recipient ID and Caller ID are required.");
    }
    
    res.render("DirectCall.ejs", {
        recipientId,
        callerId,
        audioOnly: audioOnly === 'true',
        currentUser: req.user // FIX: Pass currentUser to the EJS template
    });
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

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});