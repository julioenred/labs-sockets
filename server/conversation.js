class Conversation {
    constructor(mysql) {
        this.con = mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
    }

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
}

module.exports = Conversation;