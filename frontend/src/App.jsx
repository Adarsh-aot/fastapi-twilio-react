import React, { useState, useRef, useEffect } from 'react';
import Video from 'twilio-video';

const WS_URL = "ws://e165-202-88-244-71.ngrok-free.app/ws";

const VideoCall = () => {
  const [roomName, setRoomName] = useState('');
  const [identity, setIdentity] = useState('');
  const [room, setRoom] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isWebSocketReady, setIsWebSocketReady] = useState(false);
  const videoContainerRef = useRef(null);
  const activeParticipantsRef = useRef(new Map());
  const mediaRecordersRef = useRef(new Map());

  useEffect(() => {
    console.log("useEffect");
    return () => {
      // Cleanup on component unmount
      if (room) {
        handleRoomDisconnection(room);
      }
    };
  }, [room]);

  const setupWebSocket = (cb) => {
    console.log("setupWebSocket");
    const newSocket = new WebSocket(WS_URL);
    
    newSocket.onopen = () => {
      console.log("WebSocket connected");
      setIsWebSocketReady(true);
    };
    
    newSocket.onmessage = (event) => {
      console.log("Received WebSocket message:", event.data);
      handleWebSocketMessage(event);
    };
    
    newSocket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setIsWebSocketReady(false);
    };
    
    newSocket.onclose = () => {
      console.log("WebSocket closed");
      setIsWebSocketReady(false);
    };

    cb(newSocket);
  };

  const sendAudioToWebSocket = (audioTrack,_socket) => {
    try {
        const mediaStream = new MediaStream();
        mediaStream.addTrack(audioTrack.mediaStreamTrack);

        const options = { mimeType: "audio/webm" };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            throw new Error(`Unsupported MIME type: ${options.mimeType}`);
        }

        const mediaRecorder = new MediaRecorder(mediaStream, options);
        console.log(mediaRecorder);

        mediaRecorder.ondataavailable = (event) => {
            console.log("on data");
            if (event.data.size > 0) {
              console.log("event.data.size", event.data.size);
                console.log("Captured audio chunk", event.data);
                if (true) {
                    _socket?.send(event.data);
                    console.log("Audio data sent to WebSocket",socket);
                } else {
                    console.warn("WebSocket is not ready, cannot send data");
                }
            } else {
                console.warn("Captured audio data is empty");
            }
        };

        mediaRecorder.onerror = (error) => {
            console.error("MediaRecorder error:", error);
        };

        mediaRecorder.start(1000);  // Capture audio every second
        console.log("MediaRecorder started");

        return mediaRecorder;
    } catch (error) {
        console.error("Error in sendAudioToWebSocket:", error);
    }
};

  const handleTrackPublication = (trackPublication, participant,_socket) => {
    console.log("handleTrackPublication");
    try {
      if (trackPublication.track) {
        console.log("trackPublication.track", trackPublication.track);
        displayTrack(trackPublication.track, participant,_socket);
      }
      console.log("trackPublication hanleTrackPublication", trackPublication);

      trackPublication.on("subscribed", (track) => {
        console.log("track", track);
        displayTrack(track, participant,_socket)
    });
      console.log("handleTrackPublication on subscribed", trackPublication);
    } catch (error) {
      console.error("Error handling track publication:", error);
    }
  };

  const displayTrack = (track, participant,_socket) => {
    console.log("displayTrack");
    try {
      
      if (track.kind === 'audio') {
        console.log("track.kind", track.kind);
        const mediaRecorder = sendAudioToWebSocket(track,_socket);
        if (mediaRecorder) {
          console.log("mediaRecorder displayTrack Function", mediaRecorder);
          mediaRecordersRef.current.set(participant.identity, mediaRecorder);
        }
      }
    } catch (error) {
      console.error("Error displaying track:", error);
    }
  };

  const handleWebSocketMessage = (event) => {
    console.log("handleWebSocketMessage");
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'transcription') {
        displayTranscription(data);
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  };

  const displayTranscription = (transcription) => {
    console.log("displayTranscription");
    try {
      const participantDiv = document.getElementById(transcription.participant);
      if (participantDiv) {
        const transcriptionElement = document.createElement("p");
        transcriptionElement.textContent = transcription.text;
        participantDiv.appendChild(transcriptionElement);
      }
    } catch (error) {
      console.error("Error displaying transcription:", error);
    }
  };

  const handleRoomDisconnection = (currentRoom) => {
    console.log("handleRoomDisconnection");
    // Stop local participant tracks
    currentRoom.localParticipant.tracks.forEach(publication => {
      publication.track.stop();
      publication.unpublish();
    });

    // Stop media recorders
    mediaRecordersRef.current.forEach(mediaRecorder => {
      mediaRecorder.stop();
    });
    mediaRecordersRef.current.clear();

    // Close WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }

    // Disconnect from room
    currentRoom.disconnect();
    setRoom(null);
    setSocket(null);
    setIsWebSocketReady(false);
  };

  const joinRoom = async () => {
    console.log("joinRoom");
    try {
      // Generate token from backend
      const response = await fetch('https://e165-202-88-244-71.ngrok-free.app/api/generate-token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_name: roomName, identity })
      });

      if (!response.ok) throw new Error('Failed to generate token');

      const { token } = await response.json();

      // Connect to Twilio Video room
      const roomInstance = await Video.connect(token, {
        name: roomName,
        audio: true,
        video: { width: 640, height: 480 }
      });

      setRoom(roomInstance);

      // Set up WebSocket connection
      setupWebSocket((_socket)=>{
        console.log("Socket",_socket);
        // setSocket(_socket);
        console.log("roomInstance", roomInstance);

      // Attach local video tracks
      roomInstance.localParticipant.videoTracks.forEach(publication => {
        if (videoContainerRef.current) {
          videoContainerRef.current.appendChild(publication.track.attach());
        }
      });


      // Attach remote video tracks
      // Attach remote participants' video tracks
      roomInstance.on('participantConnected', participant => {
        participant.on('trackSubscribed', track => {
          if (track.kind === 'video' && videoContainerRef.current) {
            videoContainerRef.current.appendChild(track.attach());
          }
        });
      });

      console.log("Local participant joined:", roomInstance.localParticipant.identity);
      // local participant audio

      roomInstance.localParticipant.tracks.forEach(publication => {
        console.log("publication", publication);
        handleTrackPublication(publication, roomInstance.localParticipant,_socket);
      })
      // Handle remote participants
      roomInstance.participants.forEach(participant => {
        console.log(" participant", participant);
        

        participant.tracks.forEach(trackPublication => {
          console.log("trackPublication", trackPublication);  
          handleTrackPublication(trackPublication, participant,_socket);
        });

        participant.on("trackPublished", trackPublication => {
          handleTrackPublication(trackPublication, participant,_socket);
          console.log("Remote participant joined:", participant.identity);
        });
      });

      // Listen for new participants
      roomInstance.on('participantConnected', participant => {
        console.log("participant data", participant);
        

        participant.tracks.forEach(trackPublication => {
          console.log("Participant new connected  trackPublication", trackPublication);
          handleTrackPublication(trackPublication, participant,_socket);
        });

        participant.on("trackSubscribed", trackPublication => {
          
          console.log("participant trackPublication", trackPublication);
          handleTrackPublication(trackPublication, participant);
          console.log("Remote participant joined:", participant.identity);
        });
      });

      // Handle participant disconnections
      roomInstance.on('participantDisconnected', participant => {
        

        const mediaRecorder = mediaRecordersRef.current.get(participant.identity);
        if (mediaRecorder) {
          mediaRecorder.stop();
          mediaRecordersRef.current.delete(participant.identity);
        }
      });
      });
      

      

    } catch (err) {
      console.error('Error joining room:', err);
    }
  };

  const leaveRoom = () => {
    console.log("leaveRoom");
    if (room) {
      handleRoomDisconnection(room);
      if (videoContainerRef.current) {
        videoContainerRef.current.innerHTML = '';
      }
    }
  };

  return (
    <div>
      <h1>Video Call with Transcription</h1>
      <input
        type="text"
        placeholder="Room Name"
        value={roomName}
        onChange={(e) => setRoomName(e.target.value)}
        disabled={!!room}
      />
      <input
        type="text"
        placeholder="Your Name"
        value={identity}
        onChange={(e) => setIdentity(e.target.value)}
        disabled={!!room}
      />
      <button onClick={room ? leaveRoom : joinRoom} disabled={!roomName || !identity}>
        {room ? 'Leave Room' : 'Join Room'}
      </button>
      <div 
        ref={videoContainerRef} 
        style={{ 
          width: '100%', 
          height: 'auto', 
          marginTop: '20px', 
          display: 'flex', 
          flexWrap: 'wrap' 
        }} 
      />
    </div>
  );
};

export default VideoCall;

