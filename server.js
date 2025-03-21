const http = require('http');
const fs = require('fs');
const ejs = require('ejs');

function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

function compare(str1, str2) {
  if (str1.length != str2.length) {
    return false
  }

  var same = true;
  for (var i = 0; i < str1.length; i++) {
    if (str1[i] != str2[i]) {
      same = false;
    }
  }
  return same;
}

function getRoom(password) {
  var roomName = "";
  config['rooms'].forEach(room => {
    if (compare(password, room['password'])) {
      roomName = room['name'];
    }
  });
  return roomName;
}

const app = http.createServer(function (req, res) {
  if (req.url === '/') {
    if (req.headers.authorization) {
      // Parse login and password from headers
      const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
      const [username, pw] = Buffer.from(b64auth, 'base64').toString().split(':');
      if (getRoom(pw)) {
        const template = fs.readFileSync('index.html', 'utf8');
        const html = ejs.render(template, {username: username, password: pw});
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }
    }
  }

  // Access denied
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="401"' });
  res.end('Authentication required.');
}).listen(2025);

const io = require('socket.io')(app);

var roomsToIdsToUsername = {};

io.sockets.on('connection', (socket) => {
  socket.on('create or join', (pw, username) => {
    const room = getRoom(pw);
    if (!room) {
      return;
    }
    if (!roomsToIdsToUsername[room]) {
      roomsToIdsToUsername[room] = {};
    }
    const idsToUsername = roomsToIdsToUsername[room];
    while (Object.values(idsToUsername).includes(username) || username.length == 0) {
      username += 'a';
    }
    const roomObj = io.sockets.adapter.rooms.get(room);
    const numClients = roomObj ? roomObj.size : 0;
    idsToUsername[socket.id] = username;

    socket.emit('assigned username', username);

    if (numClients === 0){
      socket.join(room);
      socket.emit('empty', username);
    } else {
      io.sockets.in(room).emit('join', username);
      socket.join(room);
    }
  });

  socket.on('local offer', (pw, remoteUsername, offer) => {
    const room = getRoom(pw);
    if (!room) {
      return;
    }
    const idsToUsername = roomsToIdsToUsername[room];
    const localUsername = idsToUsername[socket.id];
    io.sockets.in(room).emit('remote offer', remoteUsername, localUsername, offer);
  });

  socket.on('remote offer', (pw, forUsername, offer) => {
    const room = getRoom(pw);
    if (!room) {
      return;
    }
    const idsToUsername = roomsToIdsToUsername[room];
    const fromUsername = idsToUsername[socket.id];
    io.sockets.in(room).emit('offer response', forUsername, fromUsername, offer);
  });

  socket.on('send ice candidate', (pw, forUsername, candidate) => {
    const room = getRoom(pw);
    if (!room) {
      return;
    }
    const idsToUsername = roomsToIdsToUsername[room];
    const fromUsername = idsToUsername[socket.id];
    io.sockets.in(room).emit('recv ice candidate', forUsername, fromUsername, candidate);
  });

  socket.on('disconnect', () => {
    for (const room in roomsToIdsToUsername) {
      if (roomsToIdsToUsername[room][socket.id]) {
        io.sockets.in(room).emit('leave', roomsToIdsToUsername[room][socket.id]);
        delete roomsToIdsToUsername[room][socket.id];
        break;
      }
    }
  });
});
