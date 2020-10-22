var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
const config = require('./config.js');

var messages = [{
    id: 1,
    text: 'hello world',
    author: 'Julioenred'
}];

app.use(express.static('public'));

app.get('/', function (req, res) {
    res.status(200).send('hola pepe');
});

io.on('connection', function (socket) {
    console.log('alguien se conecto con sockets');
    socket.emit('messages', messages);

    socket.on('new-message', function (data) {
        messages.push(data);

        io.sockets.emit('messages', messages);
    });
});

server.listen(config.PORT, function () {
    console.log("Listen on: " + config.PORT);
})