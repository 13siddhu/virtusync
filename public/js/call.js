const urlParams = new URLSearchParams(window.location.search);
let recipientId = urlParams.get('recipientId'); // The user you want to call
let callerId = urlParams.get('callerId'); // Your own user ID
const audioOnly = urlParams.get('audioOnly') === 'true';

if (!callerId && window.currentUserId) callerId = window.currentUserId;

const socket = io({ query: { userId: callerId } });

let localStream;
let peerConnection;

const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

async function startLocalStream() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: !audioOnly,
        audio: true
    });
    const localVideo = document.getElementById('local');
    if (localVideo) localVideo.srcObject = localStream;
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && recipientId) {
            socket.emit('ice-candidate', {
                recipientId,
                candidate: event.candidate
            });
        }
    };

    peerConnection.ontrack = (event) => {
        let remote = document.getElementById('remote');
        if (!remote) {
            remote = document.createElement('video');
            remote.id = 'remote';
            remote.autoplay = true;
            remote.playsInline = true;
            document.getElementById('videos-container').appendChild(remote);
        }
        remote.srcObject = event.streams[0];
    };
}

async function makeOffer() {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', {
        recipientId,
        offer
    });
}

socket.on('offer', async (data) => {
    recipientId = data.fromUserId; // set recipientId to the caller for answer/ICE
    createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', {
        recipientId,
        answer
    });
});

socket.on('answer', async (data) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('ice-candidate', async (data) => {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
        console.error('Error adding received ice candidate', e);
    }
});

// Start everything
(async () => {
    await startLocalStream();
    // Only make an offer if this page was opened as the caller (not the callee)
    // For the caller, recipientId !== your own userId
    if (recipientId && callerId && recipientId !== callerId) {
        makeOffer();
    }
    // The callee just waits for the offer event
})();