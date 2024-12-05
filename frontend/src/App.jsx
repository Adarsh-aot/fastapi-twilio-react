import React, { useState, useRef, useEffect } from 'react';
import Video from 'twilio-video';

const VideoCall = () => {
  const [roomName, setRoomName] = useState('');
  const [identity, setIdentity] = useState('');
  const [room, setRoom] = useState(null);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [error, setError] = useState(null);
  const [transcription, setTranscription] = useState('');

  const videoContainerRef = useRef(null);
  const socketRef = useRef(null);
  const combinedMediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const prevTextRef = useRef('');

  const WS_URL = 'wss://api.aiscribe.quipohealth.com/ws';

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    };
  }, []);

  const setupWebSocket = () => {
    socketRef.current = new WebSocket(WS_URL);
    
    socketRef.current.onopen = () => {
      console.log('WebSocket connected');
      startRecording();
    };

    socketRef.current.onmessage = (event) => {
      const data = event.data;
      prevTextRef.current += data;
      setTranscription(prevTextRef.current);
    };

    socketRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  const startRecording = () => {
    if (!combinedMediaStreamRef.current) {
      console.error('No combined stream available to record');
      return;
    }

    const options = { mimeType: 'audio/webm' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.error(`Unsupported MIME type: ${options.mimeType}`);
      return;
    }

    mediaRecorderRef.current = new MediaRecorder(combinedMediaStreamRef.current, options);

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0 && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(event.data);
      }
    };

    mediaRecorderRef.current.start(1000);
  };

  const captureLocalMicrophone = async () => {
    try {
      const localMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      if (!combinedMediaStreamRef.current) {
        combinedMediaStreamRef.current = new MediaStream();
      }
      
      localMediaStream.getAudioTracks().forEach(track => 
        combinedMediaStreamRef.current.addTrack(track)
      );
    } catch (error) {
      console.error('Error capturing local microphone:', error);
    }
  };

  const addRemoteAudioToStream = (audioTrack) => {
    if (!combinedMediaStreamRef.current) {
      combinedMediaStreamRef.current = new MediaStream();
    }
    
    combinedMediaStreamRef.current.addTrack(audioTrack.mediaStreamTrack);
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      startRecording();
    }
  };

  const joinRoom = async () => {
    setError(null);
    setRemoteParticipants([]);

    try {
      const response = await fetch('https://d071-202-88-244-71.ngrok-free.app/generate-token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_name: roomName, identity })
      });

      if (!response.ok) {
        throw new Error('Failed to generate token');
      }

      const { token } = await response.json();

      const roomInstance = await Video.connect(token, {
        name: roomName,   
        audio: true,
        video: { width: 640, height: 480 }
      });

      setRoom(roomInstance);
      setLocalParticipant(roomInstance.localParticipant);

      // Setup WebSocket for transcription
      setupWebSocket();

      // Capture local microphone
      await captureLocalMicrophone();

      // Handle local tracks
      const localTracks = Array.from(roomInstance.localParticipant.tracks.values())
        .map(publication => publication.track)
        .filter(track => track !== null);

      localTracks.forEach(track => {
        if (videoContainerRef.current) {
          videoContainerRef.current.appendChild(track.attach());
        }
        
        if (track.kind === 'audio') {
          addRemoteAudioToStream(track);
        }
      });

      // Handle remote participants
      roomInstance.participants.forEach(handleParticipant);
      roomInstance.on('participantConnected', handleParticipant);
      roomInstance.on('participantDisconnected', handleParticipantDisconnected);

    } catch (err) {
      console.error('Error joining room:', err);
      setError(err.message);
    }
  };

  const handleParticipant = (participant) => {
    setRemoteParticipants(prevParticipants => {
      if (!prevParticipants.includes(participant)) {
        return [...prevParticipants, participant];
      }
      return prevParticipants;
    });

    participant.on('trackSubscribed', track => {
      if (track.kind === 'audio') {
        addRemoteAudioToStream(track);
        console.log('Remote audio track added' + track);
      }

      if (videoContainerRef.current) {
        videoContainerRef.current.appendChild(track.attach());
      }
    });

    participant.tracks.forEach(publication => {
      if (publication.isSubscribed && publication.track.kind === 'audio') {
        addRemoteAudioToStream(publication.track);
      }
    });
  };

  const handleParticipantDisconnected = (participant) => {
    setRemoteParticipants(prevParticipants => 
      prevParticipants.filter(p => p !== participant)
    );

    participant.tracks.forEach(publication => {
      if (publication.track && publication.track.kind === 'audio') {
        const track = publication.track.mediaStreamTrack;
        const streamTracks = combinedMediaStreamRef.current?.getTracks() || [];
        const matchingTrack = streamTracks.find(t => t.id === track.id);
        if (matchingTrack) {
          combinedMediaStreamRef.current.removeTrack(matchingTrack);
        }
      }
    });

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      startRecording();
    }
  };

  const leaveRoom = () => {
    if (room) {
      room.disconnect();
      
      if (socketRef.current) {
        socketRef.current.close();
      }

      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }

      setRoom(null);
      setLocalParticipant(null);
      setRemoteParticipants([]);
      
      if (videoContainerRef.current) {
        videoContainerRef.current.innerHTML = '';
      }
      
      setTranscription('');
      prevTextRef.current = '';
      combinedMediaStreamRef.current = null;
    }
  };

  return (
    <div className="video-call-container">
      <h1>Twilio Video Call with Transcription</h1>
      
      {error && (
        <div className="error-message" style={{ color: 'red' }}>
          {error}
        </div>
      )}

      <div className="input-section">
        <input
          type="text"
          placeholder="Room Name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          disabled={room !== null}
        />
        <input
          type="text"
          placeholder="Your Name"
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          disabled={room !== null}
        />
        
        {!room ? (
          <button 
            onClick={joinRoom} 
            disabled={!roomName || !identity}
          >
            Join Room
          </button>
        ) : (
          <button onClick={leaveRoom}>
            Leave Room
          </button>
        )}
      </div>

      <div 
        ref={videoContainerRef} 
        className="video-container"
        style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          justifyContent: 'center', 
          gap: '10px',
          marginTop: '20px',
          width: '100%', 
          maxWidth: '800px', 
          margin: '0 auto' 
        }}
      >
        {/* Video tracks will be appended here */}
      </div>

      {room && (
        <div className="transcription-section">
          <h3>Transcription</h3>
          <div 
            className="transcription-text"
            style={{
              border: '1px solid #ccc',
              padding: '10px',
              marginTop: '10px',
              height: '200px',
              overflowY: 'auto',
              backgroundColor: '#f9f9f9'
            }}
          >
            {transcription}
          </div>
        </div>
      )}

      {room && (
        <div className="participant-info">
          <p>Connected to Room: {roomName}</p>
          <p>Local Participant: {identity}</p>
          <p>Remote Participants: {remoteParticipants.length}</p>
        </div>
      )}
    </div>
  );
};

export default VideoCall;
