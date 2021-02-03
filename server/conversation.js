class Conversation {
    constructor() { }

    validate_individual_conversation(group) {
        if (group.is_group == 0) {
            if (group.users_id.length != 2) {
                return false
            }

            if (!group.users_id.includes(group.creator_user_id)) {
                return false;
            }
        }

        return true;
    }

    insert_group(group) {
        insert_id = 0;
        console.log(group);
        con.connect(function (err) {
            var sql = `SELECT * FROM conversations where creator_user_id = '${group.creator_user_id}' and other_user_id = '${group.other_user_id}'`;



            var sql = `INSERT INTO conversations (name, is_group, creator_user_id) VALUES ('${group.groupname}', '${group.is_group}', '${group.creator_user_id}')`;
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
}

module.exports = Conversation;