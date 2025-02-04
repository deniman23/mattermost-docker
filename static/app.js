let channelID;
let userToken;
const socket = io();

function login() {
    userToken = document.getElementById('user-token').value;
    channelID = document.getElementById('channel-id').value;

    if (userToken && channelID) {
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('chat-container').style.display = 'block';
        fetchMessages();
    } else {
        alert('Please enter both user token and channel ID.');
    }
}

function fetchMessages() {
    fetch(`/get_messages/${channelID}`)
        .then(response => response.json())
        .then(data => {
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.innerHTML = '';
            const posts = Object.values(data.posts).sort((a, b) => new Date(a.create_at) - new Date(b.create_at));
            for (const message of posts) {
                const messageElement = document.createElement('div');
                messageElement.className = 'message ' + (message.user_id === 'self' ? 'self' : 'other');
                const username = message.username || 'Unknown';
                messageElement.textContent = `${username}: ${message.message}`;
                messagesContainer.appendChild(messageElement);
            }
            // Прокрутка к последнему сообщению
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        })
        .catch(error => console.error('Error fetching messages:', error));
}

function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value;
    messageInput.value = '';

    fetch('/send_message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            token: userToken, // Используем токен пользователя из формы
            channel_id: channelID, // Используем ID канала из формы
            message: message
        })
    })
        .then(response => response.json())
        .then(data => {
            fetchMessages(); // Обновить сообщения после отправки нового
        })
        .catch(error => console.error('Error sending message:', error));
}

// Видео звонок
let localStream;
let peerConnection;

const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

function startVideoCall() {
    const videoCallContainer = document.getElementById('video-call');
    videoCallContainer.style.display = 'flex';

    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            devices.forEach(device => {
                console.log(`${device.kind}: ${device.label} id = ${device.deviceId}`);
            });
        })
        .catch(err => {
            console.log(`${err.name}: ${err.message}`);
        });

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            console.log('Access granted to media devices');
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = stream;
            localStream = stream;

            socket.emit('join', channelID);

            peerConnection = new RTCPeerConnection(servers);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    socket.emit('candidate', event.candidate);
                }
            };

            peerConnection.ontrack = event => {
                const remoteVideo = document.getElementById('remoteVideo');
                remoteVideo.srcObject = event.streams[0];
            };

            peerConnection.createOffer()
                .then(sdp => peerConnection.setLocalDescription(sdp))
                .then(() => {
                    socket.emit('offer', { type: 'offer', sdp: peerConnection.localDescription, channel: channelID });
                });

            // Отладка
            peerConnection.onconnectionstatechange = () => {
                console.log('Connection state: ', peerConnection.connectionState);
            };
        })
        .catch(error => {
            console.error('Error accessing media devices: ', error.name, error.message, error.stack);
            alert('Не удалось получить доступ к камере и микрофону. Пожалуйста, проверьте разрешения и настройки безопасности вашего браузера.');
        });
}


socket.on('offer', (data) => {
    if (!peerConnection) {
        peerConnection = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('candidate', event.candidate);
            }
        };

        peerConnection.ontrack = event => {
            const remoteVideo = document.getElementById('remoteVideo');
            remoteVideo.srcObject = event.streams[0];
        };
    }

    peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))
        .then(() => peerConnection.createAnswer())
        .then(sdp => peerConnection.setLocalDescription(sdp))
        .then(() => {
            socket.emit('answer', { type: 'answer', sdp: peerConnection.localDescription, channel: data.channel });
        });

    // Отладка
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state: ', peerConnection.connectionState);
    };
});

socket.on('answer', data => {
    peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

    // Отладка
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state: ', peerConnection.connectionState);
    };
});

socket.on('candidate', candidate => {
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => console.error('Error adding ICE candidate: ', error));
    }
});

window.onload = function() {
    // Оставляем пустым или добавляем начальную логику, если требуется
};
