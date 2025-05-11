import express from "express";
import { createServer } from 'http';
import { Server } from 'socket.io';
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from 'url';

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = 3000;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


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


app.get('/', (req, res) => {
  try {
    res.render('index');
  } catch (error) {
    console.error('Error rendering index page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/login', (req, res) => {
  // Handle the form submission here
  res.render('login.ejs');
});

app.post('/register', (req, res) => {
  // Handle the form submission here
  res.render('register');
});

app.get('/DirectCall', (req, res) => {
  res.render('DirectCall.ejs');
});

app.get('/start', (req, res) => {
  res.render('start.ejs');
});



// Start the server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
