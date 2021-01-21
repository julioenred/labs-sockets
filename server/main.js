require('dotenv').config();
var express = require('express');
var mysql = require('mysql');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "chat"
});

app.use(express.static('public'));

app.get('/', function (req, res) {
    res.status(200).send('hola pepe');
});

io.on('connection', function (socket) {
    console.log('alguien se conecto con sockets');
    con.connect(function (err) {
        con.query("SELECT * FROM users", function (err, result, fields) {
            socket.emit('users', result);
        });

        con.query("SELECT * FROM users", function (err, result, fields) {
            socket.emit('contacts', result);
        });

        // async_get_messages();

        con.query("SELECT * FROM groups", function (err, result, fields) {
            socket.emit('groups', result);
        });
    });

    socket.on('show-conversation', function (data) {
        async_get_messages(data, io);
    });

    socket.on('new-message', function (data) {
        insert_message(data);
        setTimeout(function () { async_get_messages(data, io); }, 100);
    });

    socket.on('new-group', function (data) {
        // messages.push(data);
        insert_group(data);
        con.connect(function (err) {
            con.query("SELECT * FROM groups", function (err, result, fields) {
                io.sockets.emit('groups', result);
            });
        });
    });
});

function insert_message(message) {
    con.connect(function (err) {
        var sql = `INSERT INTO messages (author_id, author, text, group_id, contact_id) 
                    VALUES (${message.author_id}, '${message.author}', '${message.text}', ${message.group_id}, ${message.contact_id})`;
        con.query(sql, function (err, result) {
            console.log(err);
            console.log("1 record inserted");
        });
    });
}

function insert_group(group) {
    con.connect(function (err) {
        var sql = `INSERT INTO groups (name) VALUES ('${group.groupname}')`;
        con.query(sql, function (err, result) {
            console.log("1 record inserted");
        });
    });
}

async function async_get_messages(data, io) {
    try {
        console.log('data en async');
        console.log(data);
        const messages = await get_messages(data);
        io.sockets.emit('conversation', messages);
    } catch (error) {
        console.log('trace');
        console.log(error.message);
    }
}

function get_messages(data) {
    if (data.contact_id != null) {
        var query = `SELECT * 
                    FROM messages 
                    where (author_id=${data.author_id} and contact_id=${data.contact_id})
                    or (author_id=${data.contact_id} and contact_id=${data.author_id})`;
    } else {
        var query = `SELECT * FROM messages where group_id=${data.group_id}`;
    }

    return new Promise((resolve, reject) => {
        con.query(query, function (err, result, fields) {
            resolve(result);
        });
    });
}



server.listen(process.env.PORT, function () {
    console.log("Listen on: " + process.env.PORT);
})