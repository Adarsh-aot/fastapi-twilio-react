import React, { useState, useRef } from 'react';
import Video from 'twilio-video';

const VideoCall = () => {
  const [roomName, setRoomName] = useState('');
  const [identity, setIdentity] = useState('');
  const [room, setRoom] = useState(null);
  const videoContainerRef = useRef(null);

  const joinRoom = async () => {
    try {
      const response = await fetch('http://localhost:8001/generate-token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_name: roomName, identity })
      });

      if (!response.ok) throw new Error('Failed to generate token');

      const { token } = await response.json();
      const roomInstance = await Video.connect(token, {
        name: roomName,
        audio: true,
        video: { width: 640, height: 480 }
      });

      setRoom(roomInstance);

      // Attach local video tracks
      roomInstance.localParticipant.videoTracks.forEach(publication => {
        if (videoContainerRef.current) {
          videoContainerRef.current.appendChild(publication.track.attach());
        }
      });

      // Attach remote participants' video tracks
      roomInstance.on('participantConnected', participant => {
        participant.on('trackSubscribed', track => {
          if (track.kind === 'video' && videoContainerRef.current) {
            videoContainerRef.current.appendChild(track.attach());
          }
        });
      });

      roomInstance.on('participantDisconnected', participant => {
        participant.videoTracks.forEach(publication => {
          if (publication.track) publication.track.detach().forEach(el => el.remove());
        });
      });
    } catch (err) {
      console.error('Error joining room:', err);
    }
  };

  const leaveRoom = () => {
    if (room) {
      room.disconnect();
      setRoom(null);
      if (videoContainerRef.current) {
        videoContainerRef.current.innerHTML = '';
      }
    }
  };

  return (
    <div>
      <h1>Video Call</h1>
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
      <div ref={videoContainerRef} style={{ width: '100%', height: 'auto', marginTop: '20px' }} />
    </div>
  );
};

export default VideoCall;
