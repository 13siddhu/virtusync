const urlParams = new URLSearchParams(window.location.search);
let recipientId = urlParams.get('recipientId'); // The user you want to call
let callerId = urlParams.get('callerId'); // Your own user ID
const audioOnly = urlParams.get('audioOnly') === 'true';

// Ensure the callerId is set. In a real application, you'd get this from a session.
// For this example, we'll assume it's passed in the URL.
if (!callerId) {
    console.error("Caller ID not provided. Cannot initiate call.");
    // Handle this case, maybe redirect back to profile page.
}

const socket = io({ query: { userId: callerId } });

let localStream;
let peerConnection;

const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: !audioOnly,
            audio: true
        });
        const localVideo = document.getElementById('local');
        if (localVideo) {
            localVideo.srcObject = localStream;
        }
    } catch (error) {
        console.error("Error accessing media devices.", error);
        alert("Failed to get local media stream. Please check your camera and microphone permissions.");
    }
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
                candidate: event.candidate,
                fromUserId: callerId // Add sender info for server
            });
        }
    };

    peerConnection.ontrack = (event) => {
        let remoteVideo = document.getElementById('remote');
        if (!remoteVideo) {
            // Create a new video element and a wrapper for it
            const remoteVideoWrapper = document.createElement('div');
            remoteVideoWrapper.className = 'video-wrapper remote-video-wrapper';

            remoteVideo = document.createElement('video');
            remoteVideo.id = 'remote';
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;

            const remoteVideoLabel = document.createElement('div');
            remoteVideoLabel.className = 'video-label';
            remoteVideoLabel.innerText = 'Peer';

            remoteVideoWrapper.appendChild(remoteVideo);
            remoteVideoWrapper.appendChild(remoteVideoLabel);

            document.getElementById('videos-container').appendChild(remoteVideoWrapper);
        }
        remoteVideo.srcObject = event.streams[0];
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
    // This script is now the callee
    if (!peerConnection) {
        recipientId = data.fromUserId;
        await startLocalStream(); // Start stream after receiving an offer
        createPeerConnection();
    }
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
        if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (e) {
        console.error('Error adding received ice candidate', e);
    }
});

// Start everything
(async () => {
    await startLocalStream();
    // Only make an offer if this page was opened as the caller
    // For the caller, `recipientId` is the person they are calling.
    // This checks if we are the one initiating the call by having a `recipientId`
    if (recipientId && callerId && recipientId !== callerId) {
        makeOffer();
    }
    // The callee just waits for the 'offer' event to be triggered by the server.
})();