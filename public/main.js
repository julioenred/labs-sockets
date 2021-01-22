// var socket = io.connect('http://ec2-18-194-88-69.eu-central-1.compute.amazonaws.com', {
//     'foreceNew': true
// });

// https://gist.github.com/companje/b95e735650f1cd2e2a41 -> socket and img

var socket = io.connect('http://localhost:8888', {
    'foreceNew': true
});


socket.on('users', function (data) {
    render_users(data);
});

socket.on('contacts', function (data) {
    render_contacts(data);
});

socket.on('conversation', function (data) {
    render_messages(data);
});

socket.on('groups', function (data) {
    render_groups(data);
});

function render_messages(data) {
    console.log(data);
    var html = data.map(function (elem, index) {
        return (
            `<div>
                <strong>${elem.user_name}</strong>:
                <em>${elem.text}</em>
            </div>`
        )
    }).join(" ");

    document.getElementById('conversation').innerHTML = html;
}

function render_groups(data) {
    console.log(data);
    var html = data.map(function (elem, index) {
        return (
            `<div id=conversation-${elem.id} class='group' onclick="set(${elem.id})">
                <strong>Conversacion</strong>:
                <em>${elem.name}</em>
            </div>`
        )
    }).join(" ");

    document.getElementById('groups').innerHTML = html;
}

function render_users(data) {
    var html = data.map(function (elem, index) {
        return (
            `<div id=user-${elem.id} class='user' onclick="set(${elem.id}, '${elem.name}', 'user')">
                <strong>User</strong>:
                <em>${elem.name}</em>
            </div>`
        )
    }).join(" ");

    document.getElementById('users').innerHTML = html;
}

function render_contacts(data) {
    var html = data.map(function (elem, index) {
        return (
            `<div id=contact-${elem.id} class='contact' onclick="set(${elem.id}, '${elem.name}', 'contact')">
                <strong>Contact</strong>:
                <em>${elem.name}</em>
            </div>`
        )
    }).join(" ");

    document.getElementById('contacts').innerHTML = html;
}

function addGroup(e) {
    var payload = {
        groupname: document.getElementById('groupname').value,
        users_id: [1, 2, 3]
    };

    console.log(payload);

    socket.emit('new-group', payload);
    return false;
}

function addMessage(e) {
    author_id = localStorage.getItem('user');
    author = localStorage.getItem('username');
    text = document.getElementById('text').value;
    group_id = localStorage.getItem('group');
    contact_id = localStorage.getItem('contact');

    if (contact_id != undefined && group_id != undefined) {
        group_id = undefined;
    }

    var payload = {
        author_id: author_id,
        author: author,
        text: text,
        group_id: group_id,
        contact_id: contact_id
    };

    socket.emit('new-message', payload);
    return false;
}

function setConversation() {
    var payload = {
        conversation_id: localStorage.getItem('conversation_id'),
    };

    socket.emit('show-conversation', payload);
    return false;
}

function set(conversation_id) {
    localStorage.setItem('conversation_id', conversation_id);

    var els = document.querySelectorAll('.conversation-' + conversation_id)
    for (var i = 0; i < els.length; i++) {
        els[i].classList.remove('active')
    }

    var element = document.getElementById(`conversation-${conversation_id}`);
    element.classList.add("active");

    setConversation();
}

function clean_local_storage() {
    localStorage.clear();
}