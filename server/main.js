require('dotenv').config();
var express = require('express');
var mysql = require('mysql');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var util = require('util');

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
        console.log(err);
        con.query("SELECT * FROM users", function (err, result, fields) {
            socket.emit('users', result);
        });

        con.query("SELECT * FROM users", function (err, result, fields) {
            socket.emit('contacts', result);
        });

        // async_get_messages();
    });

    socket.on('conversations-user', function (data) {
        // console.log(data.conversation_id);
        console.log('entra');
        var conversations_fetch = [];
        var conversations_db = function (callback) {
            var conversations_sql = `SELECT 
                    messages.id,
                    messages.user_id,
                    messages.text as message,
                    conversations.id as conversation_id,
                    users.name as user_sender_name
                    FROM conversations 
                    INNER JOIN messages on conversations.id = messages.conversation_id
                    INNER JOIN users on messages.user_id = users.id
                    where users.id = '${data.user_id}'
                    order by messages.id DESC;`;

            con.query(conversations_sql, function (err, conversations, fields) {
                for (var i = 0; i < conversations.length; i++) {
                    conversations_fetch.push(conversations[i]);
                }
                callback(null, conversations_fetch);
            });
        }

        conversations_db(function (err, conversations) {
            conversations_formatted = []
            for (let i = 0; i < conversations.length; i++) {
                if (i == 0) {
                    conversations_formatted.push(conversations[i]);
                }

                if ((i + 1 < conversations.length) && conversations[i].conversation_id != conversations[i + 1].conversation_id) {
                    conversations_formatted.push(conversations[i + 1]);
                }
            }

            console.log(conversations_formatted);
            io.emit('groups', conversations_formatted);
        });
    });

    socket.on('conversation-user', function (data) {
        // console.log(data.conversation_id);
        console.log('entra');

        var messages_sql = `SELECT 
                    messages.id as message_id,
                    messages.user_id,
                    messages.text as message,
                    users.name as user_name
                    FROM messages 
                    INNER JOIN conversations on conversations.id = messages.conversation_id
                    INNER JOIN users on messages.user_id = users.id
                    where conversations.id = '${data.conversation_id}'
                    order by messages.id DESC;`;

        con.query(messages_sql, function (err, messages, fields) {
            var messages_fetch = [];
            for (var i = 0; i < messages.length; i++) {
                messages_fetch.push(messages[i]);
            }

            console.log(messages_fetch);
            io.emit('messages', messages_fetch);
        });
    });

    socket.on('show-conversation', function (data) {
        async_get_messages(data, io);
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