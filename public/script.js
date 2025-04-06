// DOM Elements
const landingPage = document.getElementById('landing-page');
const callInterface = document.getElementById('call-interface');
const createCallBtn = document.getElementById('create-call-btn');
const joinCallBtn = document.getElementById('join-call-btn');
const createRoomModal = document.getElementById('create-room-modal');
const joinRoomModal = document.getElementById('join-room-modal');
const generateRoomIdBtn = document.getElementById('generate-room-id');
const startCallBtn = document.getElementById('start-call-btn');
const joinExistingCallBtn = document.getElementById('join-existing-call-btn');
const endCallBtn = document.getElementById('end-call');
const toggleAudioBtn = document.getElementById('toggle-audio');
const toggleVideoBtn = document.getElementById('toggle-video');
const shareScreenBtn = document.getElementById('share-screen');
const copyRoomIdBtn = document.getElementById('copy-room-id');
const currentRoomIdDisplay = document.getElementById('current-room-id');
const localVideo = document.getElementById('local');
const remoteVideo = document.getElementById('remote');
const closeModalBtns = document.querySelectorAll('.close-modal');

// WebRTC and Socket Variables
const socket = io();
let pc;
let localStream;
let screenStream;
let isScreenSharing = false;
let isAudioEnabled = true;
let isVideoEnabled = true;
let callTimer;
let callSeconds = 0;
let currentRoom = '';

// Modal Management
createCallBtn.addEventListener('click', () => {
  createRoomModal.style.display = 'flex';
});

joinCallBtn.addEventListener('click', () => {
  joinRoomModal.style.display = 'flex';
});

closeModalBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    createRoomModal.style.display = 'none';
    joinRoomModal.style.display = 'none';
  });
});

// Generate Random Room ID
generateRoomIdBtn.addEventListener('click', () => {
  const randomId = Math.random().toString(36).substring(2, 8);
  document.getElementById('create-room-id').value = randomId;
});

// Start Call (Create Room)
startCallBtn.addEventListener('click', async () => {
  const roomId = document.getElementById('create-room-id').value.trim() || 
                 Math.random().toString(36).substring(2, 8);
  const userName = document.getElementById('user-name').value.trim() || 'User';
  
  await initializeCall(roomId, userName, true);
});

// Join Existing Call
joinExistingCallBtn.addEventListener('click', async () => {
  const roomId = document.getElementById('join-room-id').value.trim();
  const userName = document.getElementById('join-user-name').value.trim() || 'User';
  
  if (!roomId) {
    alert('Please enter a Room ID');
    return;
  }
  
  await initializeCall(roomId, userName, false);
});

// Initialize Call and Media
async function initializeCall(roomId, userName, isCreator) {
  try {
    // Get user media
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    
    // Display local video
    localVideo.srcObject = localStream;
    
    // Join room
    currentRoom = roomId;
    currentRoomIdDisplay.textContent = roomId;
    
    // Hide landing page, show call interface
    landingPage.style.display = 'none';
    createRoomModal.style.display = 'none';
    joinRoomModal.style.display = 'none';
    callInterface.classList.remove('hidden');
    
    // Start call timer
    startCallTimer();
    
    // Join the room via socket
    socket.emit('join', {
      room: roomId,
      userName: userName,
      isCreator: isCreator
    });
    
    // Set up socket event listeners
    setupSocketListeners(roomId);
    
  } catch (err) {
    console.error('Error initializing call:', err);
    alert('Could not access camera or microphone. Please check permissions.');
  }
}

// Set up WebRTC and Socket listeners
function setupSocketListeners(room) {
  // Handle when another user joins the room
  socket.on('user-joined', (userData) => {
    console.log('User joined:', userData);
    createPeerConnection(room);
    
    // Add all local tracks to the peer connection
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
    
    // Create and send offer if you're not the creator
    if (!userData.isCreator) {
      pc.createOffer()
        .then(offer => {
          pc.setLocalDescription(offer);
          socket.emit('offer', { offer, room });
        })
        .catch(err => console.error('Error creating offer:', err));
    }
  });
  
  // Handle receiving an offer
  socket.on('offer', (offerData) => {
    createPeerConnection(room);
    pc.setRemoteDescription(new RTCSessionDescription(offerData.offer))
      .then(() => {
        // Add local tracks
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
        
        // Create answer
        return pc.createAnswer();
      })
      .then(answer => {
        pc.setLocalDescription(answer);
        socket.emit('answer', { answer, room });
      })
      .catch(err => console.error('Error handling offer:', err));
  });
  
  // Handle receiving an answer
  socket.on('answer', (answerData) => {
    pc.setRemoteDescription(new RTCSessionDescription(answerData.answer))
      .catch(err => console.error('Error handling answer:', err));
  });
  
  // Handle ICE candidates
  socket.on('ice-candidate', (candidateData) => {
    pc.addIceCandidate(new RTCIceCandidate(candidateData.candidate))
      .catch(err => console.error('Error adding ICE candidate:', err));
  });

  // Handle user disconnect
  socket.on('user-disconnected', () => {
    showNotification('Remote user disconnected');
    remoteVideo.srcObject = null;
  });
}

// Create WebRTC Peer Connection
function createPeerConnection(room) {
  const servers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  pc = new RTCPeerConnection(servers);
  
  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', { 
        candidate: event.candidate, 
        room 
      });
    }
  };
  
  // Handle incoming tracks
  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    showNotification('Remote user connected');
  };
  
  // Connection state changes
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      showNotification('Connection lost with remote peer');
    }
  };
}

// Call Controls
toggleAudioBtn.addEventListener('click', () => {
  isAudioEnabled = !isAudioEnabled;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = isAudioEnabled;
  });
  
  toggleAudioBtn.innerHTML = isAudioEnabled ? 
    '<i class="fas fa-microphone"></i>' : 
    '<i class="fas fa-microphone-slash"></i>';
    
  toggleAudioBtn.style.backgroundColor = isAudioEnabled ? 
    'rgba(255, 255, 255, 0.1)' : 
    '#ef4444';
});

toggleVideoBtn.addEventListener('click', () => {
  isVideoEnabled = !isVideoEnabled;
  localStream.getVideoTracks().forEach(track => {
    track.enabled = isVideoEnabled;
  });
  
  toggleVideoBtn.innerHTML = isVideoEnabled ? 
    '<i class="fas fa-video"></i>' : 
    '<i class="fas fa-video-slash"></i>';
    
  toggleVideoBtn.style.backgroundColor = isVideoEnabled ? 
    'rgba(255, 255, 255, 0.1)' : 
    '#ef4444';
});

shareScreenBtn.addEventListener('click', async () => {
  try {
    if (!isScreenSharing) {
      // Start screen sharing
      screenStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true 
      });
      
      // Get the video sender
      const videoTrack = screenStream.getVideoTracks()[0];
      const senders = pc.getSenders();
      const videoSender = senders.find(sender => 
        sender.track && sender.track.kind === 'video'
      );
      
      // Replace the track
      if (videoSender) {
        videoSender.replaceTrack(videoTrack);
      }
      
      // Update local video display
      localVideo.srcObject = screenStream;
      
      // Listen for the end of screen sharing
      videoTrack.onended = () => {
        stopScreenSharing();
      };
      
      shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
      shareScreenBtn.style.backgroundColor = '#10b981';
      isScreenSharing = true;
      
    } else {
      stopScreenSharing();
    }
  } catch (err) {
    console.error('Error sharing screen:', err);
    showNotification('Screen sharing failed. Please try again.');
  }
});

function stopScreenSharing() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    
    // Replace screen track with camera track
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      const senders = pc.getSenders();
      const videoSender = senders.find(sender => 
        sender.track && sender.track.kind === 'video'
      );
      
      if (videoSender) {
        videoSender.replaceTrack(videoTrack);
      }
      
      // Update local video display
      localVideo.srcObject = localStream;
    }
    
    shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
    shareScreenBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    isScreenSharing = false;
  }
}

endCallBtn.addEventListener('click', () => {
  endCall();
});

copyRoomIdBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentRoom)
    .then(() => {
      showNotification('Room ID copied to clipboard');
    })
    .catch(err => {
      console.error('Failed to copy room ID:', err);
    });
});

// End call and clean up
function endCall() {
  if (pc) {
    pc.close();
    pc = null;
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
  }
  
  stopCallTimer();
  socket.emit('leave-room', { room: currentRoom });
  
  // Reset UI
  callInterface.classList.add('hidden');
  landingPage.style.display = 'block';
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
}

// Call timer
function startCallTimer() {
  callSeconds = 0;
  updateCallTimerDisplay();
  callTimer = setInterval(updateCallTimerDisplay, 1000);
}

function stopCallTimer() {
  if (callTimer) {
    clearInterval(callTimer);
  }
}

function updateCallTimerDisplay() {
  callSeconds++;
  const hours = Math.floor(callSeconds / 3600);
  const minutes = Math.floor((callSeconds % 3600) / 60);
  const seconds = callSeconds % 60;
  
  const timeDisplay = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
  
  document.querySelector('.call-timer').textContent = timeDisplay;
}

// Utility function to show notifications
function showNotification(message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  
  // Append to body
  document.body.appendChild(notification);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.classList.add('fadeout');
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 3000);
}

// Handle window beforeunload event to clean up
window.addEventListener('beforeunload', () => {
  if (currentRoom) {
    socket.emit('leave-room', { room: currentRoom });
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }
  }
});