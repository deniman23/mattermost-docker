from flask import Flask, request, jsonify, render_template
import requests
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

base_url = 'http://localhost'  # URL вашего сервера Mattermost
admin_token = 'a1fdhjidqidnze8ms8d1ofecao'  # Ваш персональный токен администратора

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/send_message', methods=['POST'])
def send_message():
    data = request.json
    user_token = data['token']  # Получаем токен пользователя из запроса
    channel_id = data['channel_id']
    message = data['message']

    post_url = f'{base_url}/api/v4/posts'
    post_data = {
        'channel_id': channel_id,
        'message': message
    }
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {user_token}'  # Используем токен пользователя для аутентификации
    }

    response = requests.post(post_url, headers=headers, json=post_data)
    return jsonify(response.json()), response.status_code

@app.route('/create_user', methods=['POST'])
def create_user():
    data = request.json

    if not data or 'email' not in data or 'username' not in data or 'password' not in data:
        return jsonify({'error': 'Invalid request. Missing required fields.'}), 400

    user_data = {
        'email': data['email'],
        'username': data['username'],
        'password': data['password'],
        'first_name': data.get('first_name', ''),
        'last_name': data.get('last_name', '')
    }

    create_user_url = f'{base_url}/api/v4/users'
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {admin_token}'  # Используем токен администратора для создания пользователя
    }
    response = requests.post(create_user_url, headers=headers, json=user_data)

    if response.status_code == 201:
        return jsonify(response.json()), 201
    else:
        return jsonify({'error': 'Failed to create user'}), response.status_code

@app.route('/get_messages/<channel_id>', methods=['GET'])
def get_messages(channel_id):
    messages_url = f'{base_url}/api/v4/channels/{channel_id}/posts'
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {admin_token}'  # Используем токен администратора для получения сообщений
    }
    response = requests.get(messages_url, headers=headers)
    if response.status_code == 200:
        data = response.json()
        posts = data['posts']
        user_ids = list(set([post['user_id'] for post in posts.values()]))

        # Получаем данные пользователей
        users_url = f'{base_url}/api/v4/users/ids'
        user_data_response = requests.post(users_url, headers=headers, json=user_ids)
        user_data = {user['id']: user for user in user_data_response.json()}

        # Обрабатываем сообщения и добавляем имена пользователей
        for post in posts.values():
            post['username'] = post.get('username') or user_data.get(post['user_id'], {}).get('username', 'Unknown')
            if post['type'] == 'system_leave_channel':
                post['username'] = post['props'].get('username', 'Unknown')

        return jsonify(data)
    else:
        return 'Failed to get messages', response.status_code

@app.route('/video_call')
def video_call():
    return render_template('video_call.html')

@app.route('/auth', methods=['POST'])
def get_token():
    data = request.json

    if not data or 'login_id' not in data or 'password' not in data:
        return jsonify({'error': 'Invalid request. Missing required fields.'}), 400

    login_data = {
        'login_id': data['login_id'],
        'password': data['password']
    }

    login_url = f'{base_url}/api/v4/users/login'
    response = requests.post(login_url, json=login_data)

    if response.status_code == 200:
        user_token = response.headers['Token']
        return jsonify({'token': user_token}), 200
    else:
        return jsonify({'error': 'Failed to authenticate'}), response.status_code

@socketio.on('join')
def handle_join(data):
    join_room(data)
    emit('joined', {'room': data})

@socketio.on('offer')
def handle_offer(data):
    room = data['channel']
    emit('offer', data, room=room, include_self=False)

@socketio.on('answer')
def handle_answer(data):
    room = data['channel']
    emit('answer', data, room=room, include_self=False)

@socketio.on('candidate')
def handle_candidate(data):
    room = data['channel']
    emit('candidate', data, room=room, include_self=False)

if __name__ == '__main__':
    socketio.run(app, debug=True)
