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
import session  from "express-session";
import env from "dotenv";


const app = express();
const server = createServer(app);
const io = new Server(server);
const saltrounds =10;
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
  saveUninitialized :true,
})
);


app.use(passport.initialize());
app.use(passport.session());


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

//database connection establishment
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect(); //database connected

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Signaling Events
  socket.on('offer', (data) => socket.broadcast.emit('offer', data));
  socket.on('answer', (data) => socket.broadcast.emit('answer', data));
  socket.on('ice-candidate', (data) => socket.broadcast.emit('ice-candidate', data));
  
  // End Call Event
  socket.on('end-call', () => socket.broadcast.emit('end-call'));

  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});


// Routes


app.get("/", (req, res) => {
  res.render("index.ejs");
})

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register",(req, res) => {
  res.render("register.ejs");
});

app.get("/DirectCall", (req, res) => {
  res.render("DirectCall.ejs");
});

app.get("/start", (req, res) => {
  res.render("start.ejs");
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
    successRedirect: "/start.ejs",               // need to find the after login page
    failureRedirect:"/login",
  })
);

//register 
app.post("/register",async(req,res)=>{
  //console.log(req.body.username);
  //console.log(req.body.password);
  const email = req.body.username;
  const password = req.body.password;

  try{
    const checkResult = await db.query("SELECT * from users WHERE email = $1",[
      email,
    ]);
    if(checkResult.rows.length>0){
      return res.redirect("/login");
    }else{
      bcrypt.hash(password,saltrounds,async(err,hash)=>{
        if(err){
          console.error("Error hashing password" , err);
        }else{
          const result = await db.query("INSERT INTO users (email,password) VALUES ($1,$2)",[
            email,
            hash
          ]);
          const user = result.rows[0];
          req.login(user,(err)=>{
            console.log("Success");
            //res.redirect("/login");
          });
        }
      });
    }
  }catch (err){
    console.log(err);
  }
});

passport.use(
  new Strategy(async function verify(username,password,cb){
    try{
      const result = await db.query("SELECT * from users WHERE email = $1",[
        username,
      ]);
      if(result.rows.length>0){
        const user = result.rows[0];
        const storeHashedPassword = user.password;
        bcrypt.compare(password,storeHashedPassword,(err,valid)=>{
          if(err){
            console.error("Error comparing password" , err);
            return cb(err);
          } else{
            if(valid){
              return cb(null,user);
            }else{
              return cb(null,user);
            }
          }
        });
      }else{
        return cb("user not found");
      }
    }catch(err){
      console.log(err);
    }
  })
);

passport.serializeUser((user,cb)=>{
  cb(null,user);
});

passport.deserializeUser((user,cb)=>{
  cb(null,user);
});


// Start the server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
