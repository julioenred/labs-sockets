require('dotenv').config();
const { promises } = require('dns');
var express = require('express');
var mysql = require('mysql');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var util = require('util');
var Conversation = require('./conversation.js');

var con = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

app.use(express.static('public'));

app.get('/', function (req, res) {
    res.status(200).send('hola pepe');
});

io.on('connection', function (socket) {
    console.log('alguien se conecto con sockets');
    con.connect(function (err) {
        // console.log(err);
        con.query("SELECT * FROM users", function (err, result, fields) {
            socket.emit('users', result);
        });

        con.query("SELECT * FROM users", function (err, result, fields) {
            socket.emit('contacts', result);
        });

        // async_get_messages();
    });

    socket.on('get-conversations-user', function (data) {
        console.log('entra');
        console.log(data);
        var conversations_fetch = [];
        var conversations_db = function (callback) {
            var conversations_sql = `SELECT 
                    conversations.id as conversation_id,
                    conversations.other_user_id,
                    users.id as user_id,
                    conversations.name as img,
                    users.name as user_name,
                    users.name as from_user,
                    conversations.name as group_name,
                    messages.text as message,
                    messages.date,
                    users_has_conversations.is_read  
                    FROM conversations 
                    INNER JOIN messages on conversations.id = messages.conversation_id
                    INNER JOIN users_has_conversations on users_has_conversations.user_id = messages.user_id
                    INNER JOIN users on messages.user_id = users.id
                    where users.id = '${data.user_id}'
                    order by messages.id DESC;`;

            con.query(conversations_sql, function (err, conversations, fields) {
                for (var i = 0; i < conversations.length; i++) {
                    if (conversations[i].user_id == data.user_id) {
                        conversations[i].from_user = false;
                    } else {
                        conversations[i].from_user = true;
                    }

                    conversations_fetch.push(conversations[i]);
                }
                callback(null, conversations_fetch);
            });
        }

        conversations_db(function (err, conversations) {
            conversations_formatted = []
            conversations_id_added = [];
            for (let i = 0; i < conversations.length; i++) {
                if (i == 0) {
                    conversations_formatted.push(conversations[i]);
                    conversations_id_added.push(conversations[i].conversation_id);
                }

                if ((i + 1 < conversations.length) && !conversations_id_added.includes(conversations[i + 1].conversation_id)) {
                    conversations_formatted.push(conversations[i + 1]);
                    conversations_id_added.push(conversations[i + 1].conversation_id);
                }
            }

            console.log(conversations_formatted);
            var string = JSON.stringify(conversations_formatted);
            var json = JSON.parse(string);
            console.log(json);
            io.emit('conversations-user-id-' + data.user_id, json);
        });
    });

    socket.on('add-users-to-conversation', function (data) {
        add_users_to_conversation(data)
    });

    socket.on('get-messages-conversation', function (data) {
        get_messages(data);
    });

    socket.on('new-message', function (data) {
        insert_message(data);
        get_messages(data);
    });

    socket.on('new-conversation', function (group) {
        console.log('params >>');
        console.log(group);
        let conversation = new Conversation(mysql);

        var is_conversation_created = function (callback) {
            var conversations_sql = `SELECT * FROM conversations where creator_user_id = '${group.users_id[0]}' and other_user_id = '${group.users_id[1]}'`;

            con.query(conversations_sql, function (err, result, fields) {
                console.log('is_conversation_created_query >>');
                console.log(result);
                let response = new Map();
                if (result.length != 0) {
                    response.set("is_created", true);
                    response.set("conversation_id", result[0].id);
                } else {
                    response.set("is_created", false);
                    response.set("conversation_id", 0);
                }
                callback(null, response);
            });
        }

        var is_conversation_created_v2 = function (callback) {
            var conversations_sql = `SELECT * FROM conversations where creator_user_id = '${group.users_id[1]}' and other_user_id = '${group.users_id[0]}'`;

            con.query(conversations_sql, function (err, result, fields) {
                console.log('is_conversation_created_v2_query >>');
                console.log(result);
                let response = new Map();
                if (result.length != 0) {
                    response.set("is_created", true);
                    response.set("conversation_id", result[0].id);
                } else {
                    response.set("is_created", false);
                    response.set("conversation_id", 0);
                }
                callback(null, response);
            });
        }

        if (conversation.validate_individual_conversation(group)) {
            is_conversation_created(function (err, data) {
                console.log('is_conversation_created_if >>');
                console.log(data);
                if (!data.get('is_created')) {
                    is_conversation_created_v2(function (err, data) {
                        console.log('is_conversation_created_v2_id');
                        console.log(data);
                        if (!data.get('is_created')) {
                            console.log('conversacion creada');
                            insert_group(group);
                        }
                        io.emit('conversation-created-' + group.creator_user_id, { conversation_id: data.get('conversation_id') });
                    });
                } else {
                    console.log('recovery-conversation-created-emit >>');
                    console.log({ conversation_id: data.get('conversation_id') });
                    io.emit('conversation-created-' + group.creator_user_id, { conversation_id: data.get('conversation_id') });
                }
            });
        } else {
            console.log('recovery-conversation-created-emit >>');
            console.log({ conversation_id: data.get('conversation_id') });
            io.emit('conversation-created-' + group.creator_user_id, { conversation_id: data.get('conversation_id') });
        }
    });
});

function insert_group(group) {
    insert_id = 0;
    console.log('entra');
    if (group.is_group != 0) {
        con.connect(function (err) {
            var sql = `INSERT INTO conversations (name, is_group, creator_user_id) VALUES ('${group.group_name}', '${group.is_group}', '${group.creator_user_id}')`;
            con.query(sql, function (err, result) {
                console.log('err >>');
                console.log(err);
                insert_id = result.insertId
                console.log("1 record inserted");

                group.users_id.map(function (user_id, index) {
                    var sql = `INSERT INTO users_has_conversations (user_id, conversation_id) VALUES ('${user_id}', '${insert_id}')`;
                    con.query(sql, function (err, result) {
                        result.insertId
                        console.log("1 record inserted");
                    });

                    var dt = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    var sql = `INSERT INTO messages (user_id, conversation_id, text, state, media_url, type, date) 
                    VALUES (${user_id}, '${insert_id}', '-#top-secret#-', 0, '', '3', '${dt}')`;
                    con.query(sql, function (err, result) {
                        console.log("insert_top_secret_message >>");
                        console.log(err);
                        console.log(result.insertId);

                        var sql = `INSERT INTO users_read_messages (user_id, message_id, is_read) 
                        VALUES (${user_id}, ${result.insertId}, 2)`;
                        con.query(sql, function (err, result) {
                            console.log("error >>");
                            console.log(err);
                            console.log("insert in read");

                        });
                    });
                }).join(" ");
            });
        });
    } else {
        con.connect(function (err) {
            for (let i = 0; i < group.users_id.length; i++) {
                if (group.users_id[i] != group.creator_user_id) {
                    var other_user_id = group.users_id[i];
                }
            }

            var sql = `INSERT INTO conversations (name, is_group, creator_user_id, other_user_id) VALUES ('${group.groupname}', '${group.is_group}', '${group.creator_user_id}', '${other_user_id}')`;
            con.query(sql, function (err, result) {
                console.log(err);
                insert_id = result.insertId
                console.log("conversation created id >>");
                console.log(result.insertId);

                group.users_id.map(function (user_id, index) {
                    var sql = `INSERT INTO users_has_conversations (user_id, conversation_id) VALUES ('${user_id}', '${insert_id}')`;
                    con.query(sql, function (err, result) {
                        console.log("users_has_conversations id >>");
                        console.log(result.insertId);
                    });

                    var sql = `INSERT INTO messages (user_id, conversation_id, text, state, media_url, type) 
                    VALUES (${user_id}, '${insert_id}', '-#top-secret#-', 0, '', 0)`;
                    con.query(sql, function (err, result) {
                        console.log("insert_top_secret_message >>");
                        console.log(err);
                        console.log(result.insertId);

                        var sql = `INSERT INTO users_read_messages (user_id, message_id, is_read) 
                        VALUES (${user_id}, ${result.insertId}, 2)`;
                        con.query(sql, function (err, result) {
                            console.log("error >>");
                            console.log(err);
                            console.log("insert in read");

                        });
                    });


                }).join(" ");
            });
        });
    }

    setTimeout(() => {
        console.log('set_timeout_conversation_created_id >>');
        console.log(insert_id);
        console.log('users_id >>');
        console.log(group.users_id);
        group.users_id.map(function (user_id, index) {
            var conversations_fetch = [];
            var conversations_db = function (callback) {
                var conversations_sql = `SELECT 
                    conversations.id as conversation_id,
                    conversations.name as img,
                    users.name as user_name,
                    users.name as from_user,
                    conversations.name as group_name,
                    messages.text as message,
                    messages.date,
                    conversations.name as is_read 
                    FROM conversations 
                    INNER JOIN messages on conversations.id = messages.conversation_id
                    INNER JOIN users on messages.user_id = users.id
                    where users.id = '${user_id}'
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

                // console.log(conversations_formatted);
                var string = JSON.stringify(conversations_formatted);
                var json = JSON.parse(string);
                console.log('conversations-user-id-' + user_id + ' >>');
                console.log(json);
                io.emit('conversations-user-id-' + user_id, json);
                io.emit('conversation-created-user-id-' + user_id, { conversation_id: insert_id });
            });
        }).join(" ");
    }, 300);

}

function add_users_to_conversation(data) {
    con.connect(function (err) {
        console.log('add-users-to-converstaion params >>');
        console.log(data);
        for (let i = 0; i < data.users_id.length; i++) {
            var sql = `INSERT INTO users_has_conversations (user_id, conversation_id, is_read) VALUES ('${data.users_id[i]}', '${data.conversation_id}', '0')`;
            con.query(sql, function (err, result) {
                console.log(err);

                var sql = `INSERT INTO messages (user_id, conversation_id, text, state, media_url, type) 
                VALUES (${data.users_id[i]}, '${data.conversation_id}', '-#top-secret#-', 0, '', 0)`;
                con.query(sql, function (err, result) {
                    console.log("insert_top_secret_message >>");
                    console.log(err);
                    console.log(result.insertId);

                    var sql = `INSERT INTO users_read_messages (user_id, message_id, is_read) 
                    VALUES (${data.users_id[i]}, ${result.insertId}, 2)`;
                    con.query(sql, function (err, result) {
                        console.log("error >>");
                        console.log(err);
                        console.log("insert in read");

                    });
                });

            });

        }
        io.emit('users-added-to-conversation-' + data.conversation_id, { conversation_id: data.conversation_id });

    });
}

function insert_message(message) {
    con.connect(function (err) {

        insert_id = 0;
        var dt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        var sql = `INSERT INTO messages (user_id, conversation_id, text, state, media_url, type, date) 
                    VALUES (${message.creator_user_id}, '${message.conversation_id}', '${message.message}', 0, '${message.media_url}', ${message.type}, '${dt}')`;
        con.query(sql, function (err, result) {
            console.log("error >>");
            console.log(err);
            console.log("mensaje creado");
            insert_id = result.insertId;

            var sql = `SELECT 
                    user_id
                    FROM users_has_conversations 
                    where users_has_conversations.conversation_id = '${message.conversation_id}';`;
            con.query(sql, function (err, result) {
                console.log("error >>");
                console.log(err);
                console.log("select user has conversations");

                for (i = 0; i < result.length; i++) {
                    var sql = `INSERT INTO users_read_messages (user_id, message_id) 
                    VALUES (${result[i].user_id}, ${insert_id})`;
                    con.query(sql, function (err, result) {
                        console.log("error >>");
                        console.log(err);
                        console.log("insert in read");

                    });
                }
            });

            var sql = `UPDATE 
                    users_has_conversations
                    SET is_read=0
                    where users_has_conversations.conversation_id = '${message.conversation_id}';`;
            con.query(sql, function (err, result) {
                console.log("error set read message >>");
                console.log(err);
                console.log("message not read");
            });
        });
    });
}

function get_messages(data) {
    setTimeout(() => {
        get_messages_query(data).then(function (messages) {
            const SENDED = 0;
            const RECEIVED = 1;
            const READ = 2;

            messages_formatted = [];
            console.log('messages >>');
            console.log(messages);
            state = READ;
            for (i = 0; i <= messages.length; i++) {
                if (messages[i + 1] != undefined && messages[i].state != READ) {
                    state = RECEIVED;
                }

                if (i < messages.length - 1 && messages[i].message_id != messages[i + 1].message_id) {
                    messages[i].state = state;
                    messages_formatted.push(messages[i]);
                    state = READ;
                }

                if (i == messages.length) {
                    messages[i - 1].state = state;
                    console.log(messages[i - 1]);
                    messages_formatted.push(messages[i - 1]);
                    state = READ;
                }
            }

            messages_paged = [];
            for (i = data.offset; i < data.offset + data.limit; i++) {
                if (i < messages_formatted.length) {
                    messages_paged.push(messages_formatted[i]);
                }
            }

            console.log('messages_formatted >>');
            console.log(messages_paged);
            io.emit('messages-conversation-' + data.conversation_id, messages_paged);
        });
    }, 300);

}

async function get_messages_query(data) {
    return new Promise(function (resolve, reject) {
        var messages_sql = `SELECT 
                    messages.id as message_id,
                    messages.user_id,
                    messages.text as message,
                    messages.date,
                    messages.media_url,
                    messages.type,
                    messages.state,
                    messages.state as from_user,
                    users.name as user_name,
                    users_read_messages.is_read as state
                    FROM messages 
                    INNER JOIN conversations on conversations.id = messages.conversation_id
                    INNER JOIN users on messages.user_id = users.id
                    INNER JOIN users_read_messages on messages.id = users_read_messages.message_id
                    where conversations.id = '${data.conversation_id}'
                    order by messages.id DESC;`;

        con.query(messages_sql, function (err, messages, fields) {
            if (typeof data.user_id_request !== 'undefined') {
                user_id = data.user_id_request;
            }

            if (typeof data.creator_user_id !== 'undefined') {
                user_id = data.creator_user_id;
            }

            messages.map(function (message, index) {
                if (message.user_id == user_id) {
                    message.from_user = false
                } else {
                    message.from_user = true;
                }

                messages[index] = message;
            });

            var sql = `UPDATE 
                    users_has_conversations
                    SET is_read=1
                    where users_has_conversations.conversation_id = '${data.conversation_id}' and 
                    users_has_conversations.user_id = '${user_id}';`;
            con.query(sql, function (err, result) {
                console.log("error set read message >>");
                console.log(err);
                console.log("message read");
            });


            resolve(messages);
        });
    })
}

server.listen(process.env.PORT, function () {
    console.log("Listen on: " + process.env.PORT);
})