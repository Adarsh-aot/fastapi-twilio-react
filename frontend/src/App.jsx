import React, { useState, useRef, useEffect } from 'react';
import Video from 'twilio-video';

const VideoCall = () => {
  const [roomName, setRoomName] = useState('');
  const [identity, setIdentity] = useState('');
  const [room, setRoom] = useState(null);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [error, setError] = useState(null);

  const videoContainerRef = useRef(null);

  const joinRoom = async () => {
    // Reset previous states
    setError(null);
    setRemoteParticipants([]);

    try {
      // Fetch token from backend
      const response = await fetch(' https://4290-2401-4900-1cdf-3a3a-bdd1-75ec-61ad-506.ngrok-free.app/generate-token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_name: roomName, identity })
      });

      if (!response.ok) {
        throw new Error('Failed to generate token');
      }

      const { token } = await response.json();

      // Connect to Twilio Video Room
      const roomInstance = await Video.connect(token, {
        name: roomName,
        audio: true,
        video: { width: 640, height: 480 }
      });

      setRoom(roomInstance);
      setLocalParticipant(roomInstance.localParticipant);

      // Handle local participant tracks
      const localTracks = Array.from(roomInstance.localParticipant.tracks.values())
        .map(publication => publication.track)
        .filter(track => track !== null);

      localTracks.forEach(track => {
        if (videoContainerRef.current) {
          videoContainerRef.current.appendChild(track.attach());
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
      // Avoid duplicates
      if (!prevParticipants.includes(participant)) {
        return [...prevParticipants, participant];
      }
      return prevParticipants;
    });

    participant.on('trackSubscribed', track => {
      if (videoContainerRef.current) {
        videoContainerRef.current.appendChild(track.attach());
      }
    });
  };

  const handleParticipantDisconnected = (participant) => {
    setRemoteParticipants(prevParticipants => 
      prevParticipants.filter(p => p !== participant)
    );
  };

  const leaveRoom = () => {
    if (room) {
      room.disconnect();
      setRoom(null);
      setLocalParticipant(null);
      setRemoteParticipants([]);
      
      // Clear video container
      if (videoContainerRef.current) {
        videoContainerRef.current.innerHTML = '';
      }
    }
  };

  return (
    <div className="video-call-container">
      <h1>Twilio Video Call</h1>
      
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