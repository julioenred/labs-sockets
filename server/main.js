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
    database: "chat_v2"
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

        con.query("SELECT * FROM conversations", function (err, result, fields) {
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
        var sql = `INSERT INTO messages (user_id, conversation_id, text, state, media_url, type) 
                    VALUES (${message.user_id}, '${message.conversation_id}', '${message.text}', 0, '${message.media_url}', ${message.type})`;
        con.query(sql, function (err, result) {
            console.log(err);
            console.log("1 record inserted");
        });
    });
}

function insert_group(group) {
    insert_id = 0;
    console.log(group);
    con.connect(function (err) {
        var sql = `INSERT INTO conversations (name, is_group) VALUES ('${group.groupname}', 1)`;
        con.query(sql, function (err, result) {
            insert_id = result.insertId
            console.log("1 record inserted");

            group.users_id.map(function (user_id, index) {
                var sql = `INSERT INTO users_has_conversations (user_id, conversation_id) VALUES ('${user_id}', '${insert_id}')`;
                con.query(sql, function (err, result) {
                    result.insertId
                    console.log("1 record inserted");
                });
            }).join(" ");
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

    console.log(data);
    var query = `SELECT 
                    messages.id,
                    messages.text,
                    users.name as user_name
                    FROM messages 
                    INNER JOIN users on users.id = messages.user_id
                    where conversation_id = ${data.conversation_id}`;


    return new Promise((resolve, reject) => {
        con.query(query, function (err, result, fields) {
            console.log(err);
            resolve(result);
        });
    });
}



server.listen(process.env.PORT, function () {
    console.log("Listen on: " + process.env.PORT);
})