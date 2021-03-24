require('dotenv').config();
const { promises } = require('dns');
var express = require('express');
var multer = require('multer');
var mysql = require('mysql');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var fs = require('fs');
var Conversation = require('./conversation.js');

var con = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

var storage = multer.diskStorage({
    destination: 'uploads/',
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

var upload = multer({ storage: storage });

var AWS = require('aws-sdk');

AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
});

const s3 = new AWS.S3();

app.use(express.static('public'));

app.post('/upload_media', upload.single('media'), function (req, res) {

    // console.log(req.file);
    var date = Date.now();
    var filename = date + '-' + req.file.filename;
    uploadFile(req.file.path, filename, res);

    res.status(200).send({ media_url: process.env.URL_BASE_MEDIA + filename });

});

function uploadFile(source, targetName, res) {

    console.log('preparing to upload...');

    fs.readFile(source, function (err, filedata) {
        if (!err) {
            const putParams = {
                Bucket: 'elsha.test',
                Key: targetName,
                Body: filedata
            };
            s3.putObject(putParams, function (err, data) {
                // if (err) {
                //     console.log('Could nor upload the file. Error :', err);
                //     return res.send({ success: false });
                // }
                // else {
                //     // fs.unlink(source);// Deleting the file from uploads folder(Optional).Do Whatever you prefer.
                //     console.log('Successfully uploaded the file');
                //     return res.send({ success: true });
                // }
            });
        }
        else {
            console.log({ 'err': err });
        }
    });
}

app.get('/attachments', function (req, res) {

    console.log('atta >>');
    console.log(req.query.conversation_id);
    var attachments_conversation_sql = `SELECT 
                                        media_url,
                                        metadata,
                                        type
                                        FROM messages
                                        WHERE conversation_id = ${req.query.conversation_id} and media_url <> '';`;

    con.query(attachments_conversation_sql, function (err, attachments, fields) {
        console.log(attachments);
        res.status(200).send(attachments);
    });
});

io.on('connection', function (socket) {
    console.log('alguien se conecto con sockets');
    con.connect(function (err) {
        // console.log(err);
        con.query("SELECT * FROM jhi_user", function (err, result, fields) {
            socket.emit('users', result);
        });

        con.query("SELECT * FROM jhi_user", function (err, result, fields) {
            socket.emit('contacts', result);
        });

        // async_get_messages();
    });

    socket.on('get-conversations-user', function (data) {
        get_conversations(data);
    });

    socket.on('add-users-to-conversation', function (data) {
        add_users_to_conversation(data)
    });

    socket.on('del-users-from-conversation', function (data) {
        del_users_from_conversation(data)
    });

    socket.on('get-messages-conversation', function (data) {
        get_messages(data);
    });

    socket.on('get-conversations-not-read', function (data) {
        get_conversations_not_read(data);
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
                        io.emit('conversation-created-user-id-' + group.creator_user_id, { conversation_id: data.get('conversation_id') });
                    });
                } else {
                    console.log('recovery-conversation-created-emit >>');
                    console.log({ conversation_id: data.get('conversation_id') });
                    io.emit('conversation-created-user-id-' + group.creator_user_id, { conversation_id: data.get('conversation_id') });
                }
            });
        } else {
            console.log('recovery-conversation-created-emit >>');
            console.log({ conversation_id: data.get('conversation_id') });
            io.emit('conversation-created-user-id-' + group.creator_user_id, { conversation_id: data.get('conversation_id') });
        }
    });

    socket.on('update-conversation', function (group) {
        update_group(group);
    });
});

function insert_group(group) {
    console.log('insert group data >>');
    console.log(group);
    insert_id = 0;
    if (group.is_group != 0) {
        con.connect(function (err) {
            var sql = `INSERT INTO conversations (name, is_group, creator_user_id, media_url) VALUES ('${group.group_name}', '${group.is_group}', '${group.creator_user_id}', '${group.media_url}')`;
            con.query(sql, function (err, result) {
                console.log('err >>');
                console.log(err);
                insert_id = result.insertId

                group.users_id.map(function (user_id, index) {
                    var sql = `INSERT INTO users_has_conversations (user_id, conversation_id, is_read) VALUES ('${user_id}', '${insert_id}', 1)`;
                    con.query(sql, function (err, result) {
                        result.insertId
                    });

                    var dt = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    var sql = `INSERT INTO messages (user_id, conversation_id, text, state, media_url, type, date, metadata) 
                    VALUES (${user_id}, '${insert_id}', '-#top-secret#-', 0, '', '3', '${dt}', '')`;
                    con.query(sql, function (err, result) {
                        console.log(err);

                        var sql = `INSERT INTO users_read_messages (user_id, message_id, is_read) 
                        VALUES (${user_id}, ${result.insertId}, 2)`;
                        con.query(sql, function (err, result) {
                            console.log("error >>");
                            console.log(err);
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

            var sql = `INSERT INTO conversations (name, is_group, creator_user_id, other_user_id, media_url) VALUES ('${group.groupname}', '${group.is_group}', '${group.creator_user_id}', '${other_user_id}', '${group.media_url}')`;
            con.query(sql, function (err, result) {
                console.log(err);
                insert_id = result.insertId

                group.users_id.map(function (user_id, index) {
                    var sql = `INSERT INTO users_has_conversations (user_id, conversation_id, is_read) VALUES ('${user_id}', '${insert_id}', 1)`;
                    con.query(sql, function (err, result) {
                        console.log("err >>");
                        console.log(err);
                    });

                    var dt = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    var sql = `INSERT INTO messages (user_id, conversation_id, text, state, media_url, type, date) 
                    VALUES (${user_id}, '${insert_id}', '-#top-secret#-', 0, '', 0, '${dt}')`;
                    con.query(sql, function (err, result) {
                        console.log("err >>");
                        console.log(err);

                        var sql = `INSERT INTO users_read_messages (user_id, message_id, is_read) 
                        VALUES (${user_id}, ${result.insertId}, 2)`;
                        con.query(sql, function (err, result) {
                            console.log("error >>");
                            console.log(err);
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
        get_users_conversations_and_emit_conversations(group.users_id);
    }, 300);

}

function update_group(group) {
    var update_group_sql = `UPDATE 
                            conversations
                            SET name='${group.group_name}', media_url='${group.media_url}'
                            where id = ${group.conversation_id};`

    con.query(update_group_sql, function (err, result) {
        console.log("error update group >>");
        console.log(err);
    });

    get_users_conversations_and_emit_conversations(group.users_id);
}

function get_users_conversations_and_emit_conversations(users_id) {
    users_id.map(function (user_id, index) {
        var conversations_fetch = [];
        var conversations_db = function (callback) {
            var conversations_sql = `SELECT 
                    conversations.id as conversation_id
                    FROM conversations 
                    INNER JOIN messages on conversations.id = messages.conversation_id
                    INNER JOIN users_has_conversations on users_has_conversations.user_id = messages.user_id
                    INNER JOIN jhi_user on messages.user_id = jhi_user.id
                    where jhi_user.id = '${user_id}'
                    group by conversations.id;`;

            con.query(conversations_sql, function (err, conversations, fields) {
                if (conversations.length == 0) {
                    callback(null, []);
                } else {
                    var where_in = '(';
                    for (let index = 0; index < conversations.length; index++) {
                        if (index == conversations.length - 1) {
                            where_in = where_in + conversations[index].conversation_id + ')';
                        }
                        else {
                            where_in = where_in + conversations[index].conversation_id + ',';
                        }
                    }

                    var conversations_sql = `SELECT 
                        conversations.id as conversation_id,
                        conversations.other_user_id,
                        conversations.creator_user_id,
                        messages.user_id,
                        conversations.id as img,
                        jhi_user.name as user_name,
                        jhi_user.name as from_user,
                        conversations.name as group_name,
                        messages.text as message,
                        messages.date,
                        users_has_conversations.is_read  
                        FROM conversations 
                        INNER JOIN messages on conversations.id = messages.conversation_id
                        INNER JOIN users_has_conversations on users_has_conversations.user_id = messages.user_id
                        INNER JOIN jhi_user on messages.user_id = jhi_user.id
                        where messages.conversation_id IN ${where_in}
                        order by messages.id DESC;`;

                    con.query(conversations_sql, function (err, conversations, fields) {

                        for (var i = 0; i < conversations.length; i++) {
                            if (conversations[i].creator_user_id != user_id) {
                                conversations[i].from_user = true;
                                var user_id = conversations[i].user_id;
                                conversations[i].user_id = conversations[i].other_user_id;
                                conversations[i].other_user_id = user_id;
                            } else {
                                conversations[i].from_user = false;
                            }

                            conversations_fetch.push(conversations[i]);
                        }
                        callback(null, conversations_fetch);
                    });
                }
            });
        }

        conversations_db(function (err, conversations) {
            conversations_formatted = [];
            conversations_id_added = [];
            var is_read = new Map();
            for (let i = 0; i < conversations.length; i++) {
                if (i == 0 && conversations[i].user_id == user_id && conversations[i].message != '-#top-secret#-') {
                    is_read.set(conversations[i].conversation_id, conversations[i].is_read);
                    conversations_id_added.push(conversations[i].conversation_id);
                }

                if ((i + 1 < conversations.length) && !conversations_id_added.includes(conversations[i + 1].conversation_id) && conversations[i + 1].user_id == user_id && conversations[i + 1].message != '-#top-secret#-') {
                    is_read.set(conversations[i + 1].conversation_id, conversations[i + 1].is_read);
                    conversations_id_added.push(conversations[i].conversation_id);
                }
            }

            conversations_id_added = [];
            for (let i = 0; i < conversations.length; i++) {
                if (i == 0) {
                    console.log('is_read status >>>>>>>>>>>>');
                    console.log(is_read);
                    console.log(is_read.get(conversations[i].conversation_id))

                    if (is_read.size == 0) {
                        conversations[i].is_read = 1;
                    } else {
                        conversations[i].is_read = is_read.get(conversations[i].conversation_id);
                    }
                    conversations_formatted.push(conversations[i]);
                    conversations_id_added.push(conversations[i].conversation_id);
                }

                if ((i + 1 < conversations.length) && !conversations_id_added.includes(conversations[i + 1].conversation_id)) {
                    console.log('is_read status >>>>>>>>>>>>');
                    console.log(is_read);
                    console.log(is_read.get(conversations[i].conversation_id))
                    if (is_read.size == 0) {
                        conversations[i + 1].is_read = 1;
                    } else {
                        conversations[i + 1].is_read = is_read.get(conversations[i + 1].conversation_id);
                    }
                    conversations_formatted.push(conversations[i + 1]);
                    conversations_id_added.push(conversations[i + 1].conversation_id);
                }
            }

            for (let index = 0; index < conversations_formatted.length; index++) {
                if (typeof conversations_formatted.is_read === 'undefined') {
                    conversations_formatted[index].is_read = 1;
                }
            }

            var string = JSON.stringify(conversations_formatted);
            var json = JSON.parse(string);
            console.log('conversations-user-id-' + user_id + ' >>');
            console.log(json);
            io.emit('conversations-user-id-' + user_id, json);
            if (typeof insert_id !== 'undefined') {
                io.emit('conversation-created-user-id-' + user_id, { conversation_id: insert_id });
            }
        });
    }).join(" ");
}

function add_users_to_conversation(data) {
    con.connect(function (err) {
        console.log('add-users-to-converstaion params >>');
        console.log(data);
        for (let i = 0; i < data.users_id.length; i++) {
            var sql = `INSERT INTO users_has_conversations (user_id, conversation_id, is_read) VALUES ('${data.users_id[i]}', '${data.conversation_id}', '1')`;
            con.query(sql, function (err, result) {
                console.log('err >>');
                console.log(err);

                var dt = new Date().toISOString().slice(0, 19).replace('T', ' ');
                var sql = `INSERT INTO messages (user_id, conversation_id, text, state, media_url, type, date) 
                VALUES (${data.users_id[i]}, '${data.conversation_id}', '-#top-secret#-', 0, '', 0, '${dt}')`;
                con.query(sql, function (err, result) {
                    console.log("err >>");
                    console.log(err);

                    var sql = `INSERT INTO users_read_messages (user_id, message_id, is_read) 
                    VALUES (${data.users_id[i]}, ${result.insertId}, 2)`;
                    con.query(sql, function (err, result) {
                        console.log("error >>");
                        console.log(err);
                    });
                });

            });

        }
        io.emit('users-added-to-conversation-' + data.conversation_id, { conversation_id: data.conversation_id });

    });
}

function del_users_from_conversation(data) {
    con.connect(function (err) {
        console.log('del-users-from-converstaion params >>');
        console.log(data);
        for (let i = 0; i < data.users_id.length; i++) {
            var sql = `DELETE FROM users_has_conversations WHERE user_id='${data.users_id[i]}' and conversation_id= '${data.conversation_id}'`;
            con.query(sql, function (err, result) {
                console.log('err >>');
                console.log(err);
            });

            console.log(data.users_id[i]);
            get_conversations({ user_id: data.users_id[i] });

        }
    });
}

function insert_message(message) {
    con.connect(function (err) {

        insert_id = 0;
        var dt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        var sql = `INSERT INTO messages (user_id, conversation_id, text, state, media_url, type, date, metadata) 
                    VALUES (${message.creator_user_id}, '${message.conversation_id}', '${message.message}', 0, '${message.media_url}', ${message.type}, '${dt}', '${message.metadata}')`;
        con.query(sql, function (err, result) {
            console.log("error >>");
            console.log(err);
            insert_id = result.insertId;

            var sql = `SELECT 
                    user_id
                    FROM users_has_conversations 
                    where users_has_conversations.conversation_id = '${message.conversation_id}';`;
            con.query(sql, function (err, result) {
                console.log("error >>");
                console.log(err);

                for (i = 0; i < result.length; i++) {
                    var sql = `INSERT INTO users_read_messages (user_id, message_id) 
                    VALUES (${result[i].user_id}, ${insert_id})`;
                    con.query(sql, function (err, result) {
                        console.log("error >>");
                        console.log(err);

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
            });

            var sql = `SELECT 
                    user_id
                    FROM users_has_conversations 
                    where users_has_conversations.conversation_id = '${message.conversation_id}';`;
            con.query(sql, function (err, result) {
                console.log("error >>");
                console.log(err);
                console.log("select user has conversations of users of conversation");
                console.log(result);

                for (var index = 0; index < result.length; index++) {
                    console.log('for >>');
                    console.log(result.length);
                    console.log(index);
                    get_conversations(result[index]);
                    get_conversations_not_read(result[index]);
                    setTimeout(() => { }, 400);
                }
            });
        });
    });
}

function get_messages(data) {
    console.log("users logged >>");
    console.log(data.user_id_request);
    console.log(data.creator_user_id);

    setTimeout(() => {
        get_messages_query(data).then(function (messages) {

            if (typeof data.user_id_request !== 'undefined') {
                user_id = data.user_id_request;
            }

            if (typeof data.creator_user_id !== 'undefined') {
                user_id = data.creator_user_id;
            }

            setTimeout(() => {
                get_messages_state(data).then(function (is_read) {
                    console.log('is_read >>');
                    console.log(is_read);
                    messages_formatted = [];

                    console.log('trace >>');
                    console.log(messages);

                    for (i = 0; i <= messages.get('messages').length; i++) {

                        if (i < messages.get('messages').length - 1 && messages.get('messages')[i].message_id != messages.get('messages')[i + 1].message_id) {
                            messages.get('messages')[i].state = is_read.get(messages.get('messages')[i].message_id);
                            if (messages.get('messages')[i].state === 'undefined') {
                                messages.get('messages')[i].state = 0
                            }
                            messages_formatted.push(messages.get('messages')[i]);

                        }

                        if (i == messages.get('messages').length) {
                            messages.get('messages')[i - 1].state = is_read.get(messages.get('messages')[i - 1].message_id);
                            if (messages.get('messages')[i - 1].state === 'undefined') {
                                messages.get('messages')[i - 1].state = 0
                            }
                            messages_formatted.push(messages.get('messages')[i - 1]);
                        }
                    }

                    messages_paged = [];
                    for (i = data.offset; i < data.offset + data.limit; i++) {
                        if (i < messages_formatted.length) {
                            messages_paged.push(messages_formatted[i]);
                        }
                    }

                    var messages_json = new Map();
                    messages_json.set('messages', messages_paged);
                    messages_json.set('users_id', messages.get('users_id'));

                    let jsonObject = {};

                    messages_json.forEach((value, key) => {
                        jsonObject[key] = value;
                    });

                    console.log('messages-conversation-' + data.conversation_id + ' >>');
                    console.log(jsonObject);
                    io.emit('messages-conversation-' + data.conversation_id, jsonObject);
                });

            }, 100);

        });
    }, 100);

}

async function get_messages_state(data) {
    return new Promise(function (resolve, reject) {
        const SENDED = 0;
        const RECEIVED = 1;
        const READ = 2;

        if (typeof data.user_id_request !== 'undefined') {
            user_id = data.user_id_request;
        }

        if (typeof data.creator_user_id !== 'undefined') {
            user_id = data.creator_user_id;
        }

        var messages_read_sql = `SELECT 
                    messages.id as message_id,
                    users_read_messages.user_id as user_id_read,
                    users_read_messages.is_read as state
                    FROM messages 
                    INNER JOIN conversations on conversations.id = messages.conversation_id
                    INNER JOIN jhi_user on messages.user_id = jhi_user.id
                    INNER JOIN users_read_messages on messages.id = users_read_messages.message_id
                    where conversations.id = '${data.conversation_id}' and messages.user_id = '${user_id}'
                    order by messages.id DESC;`;

        con.query(messages_read_sql, function (err, messages, fields) {
            var is_read = new Map();
            for (let i = 0; i < messages.length; i++) {
                if (i == 0) {
                    is_read.set(messages[i].message_id, READ);
                }

                if (messages[i].state != READ) {
                    is_read.set(messages[i].message_id, RECEIVED);
                }

                if (i < messages.length - 1 && messages[i].message_id != messages[i + 1].message_id) {
                    is_read.set(messages[i + 1].message_id, READ);
                }
            }

            resolve(is_read);
        });
    })
}

async function get_messages_query(data) {
    return new Promise(function (resolve, reject) {
        var messages_sql = `SELECT 
                    messages.id as message_id,
                    messages.user_id,
                    messages.text as message,
                    messages.date,
                    messages.media_url,
                    messages.metadata,
                    messages.type,
                    messages.state,
                    messages.state as from_user,
                    jhi_user.name as user_name,
                    users_read_messages.is_read as state
                    FROM messages 
                    INNER JOIN conversations on conversations.id = messages.conversation_id
                    INNER JOIN jhi_user on messages.user_id = jhi_user.id
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

            var users_id = [];
            messages.map(function (message, index) {
                users_id.push(message.user_id);
                if (message.user_id == user_id) {
                    message.from_user = false
                } else {
                    message.from_user = true;
                }

                messages[index] = message;
            });

            let users_id_filtered = users_id.filter((item, index) => {
                return users_id.indexOf(item) === index;
            });

            var sql = `SELECT 
                    user_id
                    FROM users_has_conversations 
                    where conversation_id = '${data.conversation_id}';`;
            con.query(sql, function (err, users, fields) {
                console.log('users >>');
                console.log(users);

                users_id_in_group = [];
                for (let index = 0; index < users.length; index++) {
                    users_id_in_group[index] = users[index].user_id;
                }

                var data_map = new Map();
                data_map.set('messages', messages);
                data_map.set('users_id', users_id_in_group);

                var sql = `UPDATE 
                    users_has_conversations
                    SET is_read=1
                    where users_has_conversations.conversation_id = '${data.conversation_id}' and 
                    users_has_conversations.user_id = '${user_id}';`;
                con.query(sql, function (err, result) {
                    console.log("error set read conversation >>");
                    console.log(err);
                });

                var sql = `UPDATE users_read_messages
                INNER JOIN messages on messages.id = users_read_messages.message_id
                INNER JOIN conversations on conversations.id = messages.conversation_id
                SET users_read_messages.is_read = 2
                where conversations.id = '${data.conversation_id}' and users_read_messages.user_id = '${user_id}';`;
                con.query(sql, function (err, result) {
                    console.log("error set read message >>");
                    console.log(err);
                });

                resolve(data_map);
            });


        });
    })
}

function get_conversations(data) {
    console.log('data get converstions >>');
    console.log(data);
    var conversations_fetch = [];
    var conversations_db = function (callback) {
        var conversations_sql = `SELECT 
                    conversation_id
                    FROM users_has_conversations 
                    where user_id = '${data.user_id}';`;

        con.query(conversations_sql, function (err, conversations, fields) {
            if (conversations.length == 0) {
                callback(null, []);
            } else {
                var where_in = '(';
                for (let index = 0; index < conversations.length; index++) {
                    if (index == conversations.length - 1) {
                        where_in = where_in + conversations[index].conversation_id + ')';
                    }
                    else {
                        where_in = where_in + conversations[index].conversation_id + ',';
                    }
                }

                var conversations_sql = `SELECT 
                    conversations.id as conversation_id,
                    conversations.other_user_id,
                    conversations.creator_user_id,
                    conversations.media_url,
                    messages.user_id,
                    conversations.id as img,
                    jhi_user.name as user_name,
                    jhi_user.name as from_user,
                    conversations.name as group_name,
                    messages.text as message,
                    messages.date,
                    users_has_conversations.is_read  
                    FROM conversations 
                    INNER JOIN messages on conversations.id = messages.conversation_id
                    INNER JOIN users_has_conversations on users_has_conversations.user_id = messages.user_id
                    INNER JOIN jhi_user on messages.user_id = jhi_user.id
                    where messages.conversation_id IN ${where_in}
                    order by messages.id DESC;`;

                con.query(conversations_sql, function (err, conversations, fields) {

                    for (var i = 0; i < conversations.length; i++) {
                        // if (conversations[i].creator_user_id != data.user_id) {
                        //     conversations[i].from_user = true;
                        //     var user_id = conversations[i].user_id;
                        //     if (conversations[i].other_user_id !== null) {
                        //         conversations[i].user_id = conversations[i].other_user_id;
                        //     }
                        //     conversations[i].other_user_id = user_id;
                        // } else {
                        //     conversations[i].from_user = false;
                        // }

                        conversations_fetch.push(conversations[i]);
                    }
                    callback(null, conversations_fetch);
                });
            }
        });
    }

    conversations_db(function (err, conversations) {
        conversations_formatted = [];
        conversations_id_added = [];
        var is_read = new Map();
        for (let i = 0; i < conversations.length; i++) {
            if (i == 0 && conversations[i].user_id == data.user_id) {
                is_read.set(conversations[i].conversation_id, conversations[i].is_read);
                conversations_id_added.push(conversations[i].conversation_id);
            }

            if ((i + 1 < conversations.length) && !conversations_id_added.includes(conversations[i + 1].conversation_id) && conversations[i + 1].user_id == data.user_id) {
                is_read.set(conversations[i + 1].conversation_id, conversations[i + 1].is_read);
                conversations_id_added.push(conversations[i].conversation_id);
            }
        }

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

        var users_has_conversations_sql = `SELECT 
                    *  
                    FROM users_has_conversations 
                    where users_has_conversations.user_id = ${data.user_id};`;

        con.query(users_has_conversations_sql, function (err, users_has_conversations, fields) {
            var is_read = new Map();
            for (let i = 0; i < users_has_conversations.length; i++) {
                is_read.set(users_has_conversations[i].conversation_id, users_has_conversations[i].is_read);

            }

            for (let i = 0; i < conversations_formatted.length; i++) {

                // console.log(users_has_conversations);
                if (conversations_formatted[i].creator_user_id != data.user_id) {
                    conversations_formatted[i].from_user = true;
                } else {
                    conversations_formatted[i].from_user = false;
                }

                conversations_formatted[i].is_read = is_read.get(conversations_formatted[i].conversation_id);

                // if (typeof conversations_formatted.is_read === 'undefined') {
                //     conversations_formatted[i].is_read = 1;
                // }
            }

            var string = JSON.stringify(conversations_formatted);
            var json = JSON.parse(string);
            console.log('conversations-user-id-' + data.user_id + ' >>');
            console.log(json);
            io.emit('conversations-user-id-' + data.user_id, json);

        });


    });
}

function get_conversations_not_read(data) {
    var messages_read_sql = `SELECT 
    *
    FROM users_has_conversations
    where users_has_conversations.user_id = '${data.user_id}'
    and users_has_conversations.is_read = 0;`;

    con.query(messages_read_sql, function (err, messages, fields) {
        console.log('conversations-not-read-user-id-' + data.user_id + ' >>');
        var json = { conversations_not_read: messages.length };
        console.log(json);
        io.emit('conversations-not-read-user-id-' + data.user_id, json);

    });
}

server.listen(process.env.PORT, function () {
    console.log("Listen on: " + process.env.PORT);
})