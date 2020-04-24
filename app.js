var http = require('http');
var express = require('express');
var app = express();
var mongo = require('mongodb');
var async = require('async');
var url = require('url');
const session = require('express-session');
const bodyParser = require('body-parser');
var nodemailer = require("nodemailer");
const formidable = require('formidable');

// var methodOverride = require('method-override');
// var cors = require('cors');
var server = http.createServer(app);
var io = require('socket.io').listen(server);

app.use(session({ secret: 'ssshhhhh', saveUninitialized: true, resave: true }));
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));

users = [];
connections = [];
history = [];
mongo.connect('mongodb://pssplnodechat.centralus.cloudapp.azure.com/mongochatform', { useUnifiedTopology: true }, function (err, db) { //for azure DB
  //mongo.connect('mongodb://localhost/mongochatform', { useUnifiedTopology: true }, function (err, db) {   //for run in local db

  //mongo.connect('mongodb+srv://vishal:12345@cluster0-ypqy8.azure.mongodb.net/test?retryWrites=true&w=majority', function (err, db) {
  // mongo.connect("mongodb://chatdbacc:s9fSQXscvwKCsCIBxYzhb2VfCoGXDBmOeZHp91i2jCfiJsC5mlEYKwzSjAKw3C2Wi4DqNngqskhVMtCJKxFxNw==@chatdbacc.documents.azure.com:10250/mean?ssl=true", function (err, db) {

  if (err) {
    throw err;
  }
  else (
    console.log('conn...')
  )

  console.log('MongoDB connected...');
  // Connect to Socket.io
  io.sockets.on('connection', function (socket) {

    //io.set('transports', ['websocket']);

    let chat = db.collection('chatss');
    let chats = db.collection('Messages');
    let Users = db.collection('Users');
    let userMessages = db.collection('User Messages')
    let userAgentMessages = db.collection('user-agent messages')

    io.sockets.emit('connectedUsers', users);

    connections.push(socket)  //push connection array
    console.log('Connected: %s sockets connected', connections.length)

    //#region  Database table

    Users.find().limit(1000).sort({ _id: 1 }).toArray(function (err, res) {
      if (err) {
        throw err;
      }
      // console.log(res, 'res')
      // Emit the messages
      socket.emit('output', res);

    });

    userAgentMessages.find().toArray(function (err, res) {
      if (err) {
        throw err;
      }
      // console.log(res, 'res')
      // Emit the messages
      socket.emit('userAgentMessages', res);

    });


    chats.find().toArray(function (err, res) {
      if (err) {
        throw err;
      }
      // Emit the messages
      socket.emit('output pmessages', res);

    });

    chat.find().toArray(function (err, res) {
      if (err) {
        throw err;
      }
      // Emit the messages
      socket.emit('all messages', res);
      //   io.emit('all messages', res);
    });

    userMessages.find().toArray(function (err, res) {
      if (err) {
        throw err;
      }
      // Emit the messages
      socket.emit('users messages', res);
      //   io.emit('all messages', res);
    });

    //#endregion

    //#region  User Login and Register

    socket.on('findUser', function (data) {

      Users.findOne({
        username: data.username
      }, function (err, user, res) {
        if (user === null) {
          socket.emit('my error', 'Some error happened');

          socket.on('disconnect', function (data) {

            for (let i = 0; i < users.length; i++) {

              if (users[i].Id === socket.id) {
                users.splice(i, 1);
              }
            }
            // users.splice(users.indexOf(socket.Name), 1);
            updateUsernames();
            connections.splice(connections.indexOf(socket), 1);
            console.log('Disconnected: %s sockets connected', connections.length);
          })
          //res.end("Login invalid");
          console.log(err)
        } else if (user.username === data.username && user.password === data.password && user.role === "admin") {
          // res.render('login');
          // res.sendFile(__dirname + '/adminclient.html');
          var destination = '/admin';
          socket.emit('redirect', destination);

        } else {
          console.log("Credentials wrong");
          // res.end("Login invalid");
          console.log(err)
          socket.on('disconnect', function (data) {

            for (let i = 0; i < users.length; i++) {

              if (users[i].Id === socket.id) {
                users.splice(i, 1);
              }
            }
            // users.splice(users.indexOf(socket.Name), 1);
            updateUsernames();
            connections.splice(connections.indexOf(socket), 1);
            console.log('Disconnected: %s sockets connected', connections.length);
          })
          socket.emit('my error', 'Some error happened');


        }
      });

    });

    socket.on('regiUser', function (data) {

      let username = data.username;
      let password = data.password;
      let role = data.role
      // Insert message
      Users.insert({ username: username, password: password, role: role }, function () {
        io.emit('regiOutput', [data]);

      });

    });

    //#endregion

    //#region Form details function

    socket.on('input', function (data) {

      let Name = data.Name;
      let Email = data.Email;
      let Number = data.Number;
      let Question = data.Question;
      users[Name] = data.userId;

      if (Name == '' || Email == '' || Number == '' || Question == '') {
        socket.emit('enter');
        // Send error status
        // sendStatus('Please enter a name and message');
      }

      else {
        // Insert message
        chat.insert({ Name: Name, Email: Email, Number: Number, Question: Question }, function () {
          io.emit('output', [data]);

        });
      }
      userMessages.insert({ Name: Name, Email: Email, Number: Number, Question: Question });
    });

    //#endregion

    //#region  User Message to Agent

    socket.on('nameandmessage', function (data) {

      let msg = data.msg;
      let Name = data.Name;
      let socketId = data.socketId;
      let timestamps = data.timestamps

      // Insert message
      chat.insert({ msg: msg, Name: Name, socketId: socketId, timestamps: timestamps }, function () {
        io.emit('all messages', [data]);
        io.emit('userAgentMessages', [data]);

      });
      userMessages.insert({ msg: msg, Name: Name, socketId: socketId, timestamps: timestamps });
      userAgentMessages.insert({ msg: msg, Name: Name, socketId: socketId, timestamps: timestamps });
    });

    //#endregion

    //#region  User Manage function

    socket.on('new user', function (data, callback) {
      console.log(data, 'new users')
      if (users.indexOf(data) != -1) {
        callback(false)
      }
      else {
        callback(true);
        socket.users = data;
        users.push({ "Name": socket.users, "Id": socket.id });
        //  users.push(socket.users)
        // users.push([socket.users,socket.id])
        // users.push(socket.username); // push only username
        //users.push(socket.id)
        io.sockets.emit('username', users)
        socket.broadcast.emit('username', users)
        updateUsernames();
      }
    });

    function updateUsernames() {
      io.sockets.emit('get users', users);
    }

    //#endregion

    //#region  Private Message

    socket.on('private-message', (data) => {

      let msg = data.msg;
      let msgTo = data.msgTo;
      let toId = data.toId;
      let timestamps = data.timestamps;

      // if (users[data.msgTo]) {
      if (data.toId) {
        //io.sockets.connected[users[data.Name].socket].emit("add-message", data);
        socket.join(data.msgTo, data.id);

        // Insert message
        chats.insert({ msg: msg, msgTo: msgTo, toId: toId, timestamps: timestamps }, function () {
          io.emit('output pmessages', [data]);
          io.emit('userAgentMessages', [data]);

          userAgentMessages.insert({ msg: msg, msgTo: msgTo, toId: toId, timestamps: timestamps })
        });

      } else {
        console.log("User does not exist: " + data.msgTo);
      }
    });

    //#endregion

    //typing

    socket.on('typing', function (data) {
      // console.log(data);
      socket.broadcast.emit('typing', data);
    });

    //#region  Delete record

    socket.on('clear', function (data) {
      // Remove all chats from collection
      chat.remove({}, function () {
        // Emit cleared
        socket.emit('cleared');
      });
    });

    //#endregion

    //#region  Disconnect Socket user

    socket.on('disconnect', function (data) {

      for (let i = 0; i < users.length; i++) {

        if (users[i].Id === socket.id) {
          users.splice(i, 1);
        }
      }
      // users.splice(users.indexOf(socket.Name), 1);
      updateUsernames();
      connections.splice(connections.indexOf(socket), 1);
      console.log('Disconnected: %s sockets connected', connections.length);
    })

    //#endregion

  })
})

//#region  Mail Task

var smtpTransport = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  auth: {
    user: "notification@prakashinfotech.com",
    pass: "P1$$p!#$%"
  }
});

app.get('/send', function (req, res) {

  var mailOptions = {
    from: "notifications@prakashinfotech.com",
    to: req.query.to,
    subject: req.query.subject,
    text: req.query.text,
  }

  smtpTransport.sendMail(mailOptions, function (error, response) {
    if (error) {
      console.log(error);
      res.end("error");
    } else {
      console.log("Message sent");
      res.end("sent");
    }
  });
});

//#endregion

//#region  Routes
var sess;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
})

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/login.html');
})

app.post('/loginPage', (req, res) => {
  sess = req.session;
  sess.username = req.body.username;
  res.end('done')
})

app.get('/admin', (req, res) => {
  //res.send('<h1>Welcome to Admin Portal<h1/>')
  sess = req.session;
  if (sess.username) {
    res.sendFile(__dirname + '/adminclient.html');
  } else {
    res.sendFile(__dirname + '/login.html');
  }
})

app.get('/test1', (req, res) => {
  res.sendFile(__dirname + '/test.html');
})

app.post('/api/upload', (req, res, next) => {
  console.log(req, 'req')
  console.log(res, 'res')

  const form = formidable({ multiples: true });

  // form.parse(req, (err, fields, files) => {
  //   if (err) {
  //     next(err);
  //     return;
  //   }
  //   res.json({ fields, files });
  // });
  form.on('fileBegin', function (name, file) {
    file.path = __dirname + '/uploads/' + file.name;
  });

  form.on('file', function (name, file) {
    console.log('Uploaded ' + file.name);
  });


});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return console.log(err);
    }
    res.redirect('/login');
  });

});

//#endregion

//#region  Lisening Port

const port = 4000;
server.listen(port, () => `Server running on port ${port}`);

console.log('Server running on 4000...')

//#endregion
