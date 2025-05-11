<<<<<<< HEAD
// Connect to Socket.IO server
const socket = io();

// WebRTC configuration
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Global variables
let localStream;
let localPeerConnections = {};
let roomId;
let userName;
let isAudioEnabled = true;
let isVideoEnabled = true;
let startTime;
let timerInterval;

// DOM Elements
const landingPage = document.getElementById('landing-page');
const callInterface = document.getElementById('call-interface');
const createRoomModal = document.getElementById('create-room-modal');
const joinRoomModal = document.getElementById('join-room-modal');
const createCallBtn = document.getElementById('create-call-btn');
const joinCallBtn = document.getElementById('join-call-btn');
const startCallBtn = document.getElementById('start-call-btn');
const joinExistingCallBtn = document.getElementById('join-existing-call-btn');
const generateRoomIdBtn = document.getElementById('generate-room-id');
const copyRoomIdBtn = document.getElementById('copy-room-id');
const currentRoomIdSpan = document.getElementById('current-room-id');
const toggleAudioBtn = document.getElementById('toggle-audio');
const toggleVideoBtn = document.getElementById('toggle-video');
const shareScreenBtn = document.getElementById('share-screen');
const endCallBtn = document.getElementById('end-call');
const callTimer = document.querySelector('.call-timer');
const localVideo = document.getElementById('local');
const remoteVideo = document.getElementById('remote');
const closeButtons = document.querySelectorAll('.close-modal');

// Initialize application
function init() {
  attachEventListeners();
}

// Attach event listeners
function attachEventListeners() {
  createCallBtn.addEventListener('click', showCreateRoomModal);
  joinCallBtn.addEventListener('click', showJoinRoomModal);
  startCallBtn.addEventListener('click', createRoom);
  joinExistingCallBtn.addEventListener('click', joinRoom);
  generateRoomIdBtn.addEventListener('click', generateRoomId);
  copyRoomIdBtn.addEventListener('click', copyRoomId);
  toggleAudioBtn.addEventListener('click', toggleAudio);
  toggleVideoBtn.addEventListener('click', toggleVideo);
  shareScreenBtn.addEventListener('click', toggleScreenShare);
  endCallBtn.addEventListener('click', endCall);
  
  closeButtons.forEach(button => {
    button.addEventListener('click', () => {
      createRoomModal.style.display = 'none';
      joinRoomModal.style.display = 'none';
    });
  });
}

// Show Create Room Modal
function showCreateRoomModal() {
  createRoomModal.style.display = 'flex';
}

// Show Join Room Modal
function showJoinRoomModal() {
  joinRoomModal.style.display = 'flex';
}

// Generate Random Room ID
function generateRoomId() {
  const roomIdInput = document.getElementById('create-room-id');
  const randomRoomId = Math.random().toString(36).substring(2, 8);
  roomIdInput.value = randomRoomId;
}

// Copy Room ID to clipboard
function copyRoomId() {
  navigator.clipboard.writeText(roomId)
    .then(() => showNotification('Room ID copied to clipboard!'))
    .catch(err => console.error('Could not copy text: ', err));
}

// Create a new room
async function createRoom() {
  roomId = document.getElementById('create-room-id').value.trim();
  userName = document.getElementById('user-name').value.trim();
  
  if (!roomId || !userName) {
    showNotification('Please enter a room ID and your name');
    return;
  }
  
  try {
    await initLocalStream();
    socket.emit('create-room', { roomId, userName });
    enterCallInterface();
    createRoomModal.style.display = 'none';
    startCallTimer();
  } catch (error) {
    console.error('Error creating room:', error);
    showNotification('Could not access camera/microphone');
  }
}

// Join an existing room
async function joinRoom() {
  roomId = document.getElementById('join-room-id').value.trim();
  userName = document.getElementById('join-user-name').value.trim();
  
  if (!roomId || !userName) {
    showNotification('Please enter a room ID and your name');
    return;
  }
  
  try {
    await initLocalStream();
    socket.emit('join-room', { roomId, userName });
    enterCallInterface();
    joinRoomModal.style.display = 'none';
    startCallTimer();
  } catch (error) {
    console.error('Error joining room:', error);
    showNotification('Could not access camera/microphone');
  }
}

// Initialize local media stream
async function initLocalStream() {
  localStream = await navigator.mediaDevices.getUserMedia({ 
    video: true, 
    audio: true 
  });
  
  localVideo.srcObject = localStream;
}

// Enter call interface
function enterCallInterface() {
  landingPage.classList.add('hidden');
  callInterface.classList.remove('hidden');
  currentRoomIdSpan.textContent = roomId;
}

// Create and set up peer connection for a new user
async function createPeerConnection(userId, isInitiator) {
  const peerConnection = new RTCPeerConnection(configuration);
  localPeerConnections[userId] = peerConnection;
  
  // Add local tracks to the peer connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });
  
  // Set up ICE candidate handling
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        roomId,
        candidate: event.candidate,
        to: userId
      });
    }
  };
  
  // Handle receiving remote tracks
  peerConnection.ontrack = (event) => {
    // Create or get video element for this peer
    let peerVideo = document.getElementById(`remote-${userId}`);
    
    if (!peerVideo) {
      const videosContainer = document.querySelector('.videos-container');
      const videoWrapper = document.createElement('div');
      videoWrapper.className = 'video-wrapper remote-video-wrapper';
      
      peerVideo = document.createElement('video');
      peerVideo.id = `remote-${userId}`;
      peerVideo.autoplay = true;
      peerVideo.playsInline = true;
      
      const nameTag = document.createElement('div');
      nameTag.className = 'name-tag';
      nameTag.textContent = userId;
      nameTag.style.position = 'absolute';
      nameTag.style.bottom = '10px';
      nameTag.style.left = '10px';
      nameTag.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      nameTag.style.color = 'white';
      nameTag.style.padding = '5px 10px';
      nameTag.style.borderRadius = '4px';
      
      videoWrapper.appendChild(peerVideo);
      videoWrapper.appendChild(nameTag);
      videosContainer.appendChild(videoWrapper);
    }
    
    // Set the remote stream as the source for this video element
    if (peerVideo.srcObject !== event.streams[0]) {
      peerVideo.srcObject = event.streams[0];
    }
  };
  
  // Handle connection state changes
  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'disconnected' || 
        peerConnection.connectionState === 'failed') {
      removePeerVideo(userId);
      delete localPeerConnections[userId];
    }
  };
  
  // If this peer is the initiator, create and send an offer
  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    socket.emit('offer', {
      roomId,
      sdp: peerConnection.localDescription,
      to: userId
    });
  }
  
  return peerConnection;
}

// Remove a peer's video when they disconnect
function removePeerVideo(userId) {
  const peerVideo = document.getElementById(`remote-${userId}`);
  if (peerVideo) {
    const videoWrapper = peerVideo.parentElement;
    videoWrapper.remove();
  }
}

// Toggle audio
function toggleAudio() {
  isAudioEnabled = !isAudioEnabled;
  
  localStream.getAudioTracks().forEach(track => {
    track.enabled = isAudioEnabled;
  });
  
  toggleAudioBtn.innerHTML = isAudioEnabled ? 
    '<i class="fas fa-microphone"></i>' : 
    '<i class="fas fa-microphone-slash"></i>';
}

// Toggle video
function toggleVideo() {
  isVideoEnabled = !isVideoEnabled;
  
  localStream.getVideoTracks().forEach(track => {
    track.enabled = isVideoEnabled;
  });
  
  toggleVideoBtn.innerHTML = isVideoEnabled ? 
    '<i class="fas fa-video"></i>' : 
    '<i class="fas fa-video-slash"></i>';
}

// Toggle screen sharing
async function toggleScreenShare() {
  try {
    if (shareScreenBtn.classList.contains('active')) {
      // Switch back to camera
      localStream.getTracks().forEach(track => track.stop());
      
      const newStream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      localStream = newStream;
      localVideo.srcObject = localStream;
      
      // Replace tracks in all peer connections
      for (const userId in localPeerConnections) {
        const senders = localPeerConnections[userId].getSenders();
        const audioSender = senders.find(sender => sender.track?.kind === 'audio');
        const videoSender = senders.find(sender => sender.track?.kind === 'video');
        
        if (audioSender) {
          audioSender.replaceTrack(localStream.getAudioTracks()[0]);
        }
        
        if (videoSender) {
          videoSender.replaceTrack(localStream.getVideoTracks()[0]);
        }
      }
      
      shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
      shareScreenBtn.classList.remove('active');
    } else {
      // Switch to screen sharing
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true 
      });
      
      const audioTrack = localStream.getAudioTracks()[0];
      localStream.getTracks().forEach(track => track.stop());
      
      // Combine screen video with original audio
      localStream = new MediaStream([screenStream.getVideoTracks()[0]]);
      if (audioTrack) {
        localStream.addTrack(audioTrack);
      }
      
      localVideo.srcObject = localStream;
      
      // Replace tracks in all peer connections
      for (const userId in localPeerConnections) {
        const senders = localPeerConnections[userId].getSenders();
        const videoSender = senders.find(sender => sender.track?.kind === 'video');
        
        if (videoSender) {
          videoSender.replaceTrack(localStream.getVideoTracks()[0]);
        }
      }
      
      // Handle screen sharing stopping
      screenStream.getVideoTracks()[0].onended = () => {
        toggleScreenShare();
      };
      
      shareScreenBtn.innerHTML = '<i class="fas fa-camera"></i>';
      shareScreenBtn.classList.add('active');
    }
  } catch (error) {
    console.error('Error switching source:', error);
    showNotification('Could not switch video source');
  }
}

// End the call
function endCall() {
  socket.emit('leave-room', { roomId, userName });
  
  // Stop all tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  
  // Close all peer connections
  for (const userId in localPeerConnections) {
    localPeerConnections[userId].close();
  }
  localPeerConnections = {};
  
  stopCallTimer();
  
  // Return to landing page
  callInterface.classList.add('hidden');
  landingPage.classList.remove('hidden');
  
  // Remove all remote videos
  const remoteDivs = document.querySelectorAll('.remote-video-wrapper:not(:first-child)');
  remoteDivs.forEach(div => div.remove());
  
  // Reset the first remote video
  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
}

// Start call timer
function startCallTimer() {
  startTime = new Date();
  timerInterval = setInterval(updateCallTimer, 1000);
}

// Update call timer
function updateCallTimer() {
  const now = new Date();
  const diff = now - startTime;
  
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  callTimer.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Stop call timer
function stopCallTimer() {
  clearInterval(timerInterval);
  callTimer.textContent = '00:00:00';
}

// Display notification
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('fadeout');
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 3000);
}

// Socket.IO event handlers

socket.on('room-joined', ({ roomId: joinedRoomId, users }) => {
  showNotification(`You joined room: ${joinedRoomId}`);
  
  // Update participants count
  const participantsCount = document.getElementById('participants-count');
  if (participantsCount) {
    participantsCount.textContent = users.length;
  }
});

socket.on('user-joined', async ({ userId, userName }) => {
  showNotification(`${userName} joined the call`);
  
  // Update participants count
  const participantsCount = document.getElementById('participants-count');
  if (participantsCount) {
    const currentCount = parseInt(participantsCount.textContent) || 0;
    participantsCount.textContent = currentCount + 1;
  }
  
  // Create peer connection for the new user
  await createPeerConnection(userId, true);
});

// Make sure your ice-candidate handler matches the server event structure
socket.on('ice-candidate', async ({ from, candidate }) => {
  console.log(`Received ICE candidate from ${from}`);
  const peerConnection = localPeerConnections[from];
  if (peerConnection) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding received ice candidate', e);
    }
  }
});

// Add more debugging to the offer handler
socket.on('offer', async ({ from, sdp }) => {
  console.log(`Received offer from ${from}`);
  
  // Create a peer connection if one doesn't exist
  let peerConnection = localPeerConnections[from];
  if (!peerConnection) {
    peerConnection = await createPeerConnection(from, false);
  }
  
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    console.log(`Sending answer to ${from}`);
    socket.emit('answer', {
      roomId,
      sdp: peerConnection.localDescription,
      to: from
    });
  } catch (e) {
    console.error('Error handling offer:', e);
  }
});

// Add more debugging to the answer handler
socket.on('answer', async ({ from, sdp }) => {
  console.log(`Received answer from ${from}`);
  const peerConnection = localPeerConnections[from];
  if (peerConnection) {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log(`Connection with ${from} established successfully`);
    } catch (e) {
      console.error('Error setting remote description from answer:', e);
    }
  }
});

// Make sure your createPeerConnection function logs more details
async function createPeerConnection(userId, isInitiator) {
  console.log(`Creating peer connection with ${userId}, isInitiator: ${isInitiator}`);
  
  const peerConnection = new RTCPeerConnection(configuration);
  localPeerConnections[userId] = peerConnection;
  
  // Add local tracks to the peer connection
  localStream.getTracks().forEach(track => {
    console.log(`Adding track to peer connection: ${track.kind}`);
    peerConnection.addTrack(track, localStream);
  });
  
  // Set up ICE candidate handling
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log(`Sending ICE candidate to ${userId}`);
      socket.emit('ice-candidate', {
        roomId,
        candidate: event.candidate,
        to: userId
      });
    }
  };
  
  // Log connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log(`Connection state changed: ${peerConnection.connectionState}`);
    if (peerConnection.connectionState === 'disconnected' || 
        peerConnection.connectionState === 'failed') {
      removePeerVideo(userId);
      delete localPeerConnections[userId];
    }
  };
  
  // Handle ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    console.log(`ICE connection state: ${peerConnection.iceConnectionState}`);
  };
  
  // Handle receiving remote tracks
  peerConnection.ontrack = (event) => {
    console.log(`Received track from ${userId}: ${event.track.kind}`);
    
    // Create or get video element for this peer
    let peerVideo = document.getElementById(`remote-${userId}`);
    
    if (!peerVideo) {
      const videosContainer = document.querySelector('.videos-container');
      const videoWrapper = document.createElement('div');
      videoWrapper.className = 'video-wrapper remote-video-wrapper';
      
      peerVideo = document.createElement('video');
      peerVideo.id = `remote-${userId}`;
      peerVideo.autoplay = true;
      peerVideo.playsInline = true;
      
      const nameTag = document.createElement('div');
      nameTag.className = 'name-tag';
      nameTag.textContent = userId;
      nameTag.style.position = 'absolute';
      nameTag.style.bottom = '10px';
      nameTag.style.left = '10px';
      nameTag.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      nameTag.style.color = 'white';
      nameTag.style.padding = '5px 10px';
      nameTag.style.borderRadius = '4px';
      
      videoWrapper.appendChild(peerVideo);
      videoWrapper.appendChild(nameTag);
      videosContainer.appendChild(videoWrapper);
      
      console.log(`Created new video element for ${userId}`);
    }
    
    // Set the remote stream as the source for this video element
    if (peerVideo.srcObject !== event.streams[0]) {
      peerVideo.srcObject = event.streams[0];
      console.log(`Set video stream for ${userId}`);
    }
  };
  
  // If this peer is the initiator, create and send an offer
  if (isInitiator) {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      console.log(`Sending offer to ${userId}`);
      socket.emit('offer', {
        roomId,
        sdp: peerConnection.localDescription,
        to: userId
      });
    } catch (e) {
      console.error('Error creating offer:', e);
    }
  }
  
  return peerConnection;
}
// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
=======
const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
let peerConnection;


// STUN server for ICE candidates
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ],
};


// Start Call
async function startCall() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = stream;

    peerConnection = new RTCPeerConnection(config);
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', event.candidate);
      }
    };

    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);
  } catch (error) {
    console.error('Error starting call:', error);
  }
}


// End Call
function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }


  // Stop local video
  if (localVideo.srcObject) {
    localVideo.srcObject.getTracks().forEach(track => track.stop());
    localVideo.srcObject = null;
  }


  // Stop remote video
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    remoteVideo.srcObject = null;
  }


  // Notify the other user
  socket.emit('end-call');
  alert('Call Ended');
}


// Socket Events
socket.on('offer', async (offer) => {
  if (!peerConnection) startCall();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', answer);
});

socket.on('answer', async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async (candidate) => {
  await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});


// Handle End Call from Peer
socket.on('end-call', () => {
  endCall();
  alert('Call Ended by Peer');
});
>>>>>>> 26cb161 (Initial commit)
