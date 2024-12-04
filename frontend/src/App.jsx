import React, { useState, useRef, useEffect } from "react";
import Video from "twilio-video";

const WS_URL = `wss://api.aiscribe.quipohealth.com/ws`;

const VideoCall = () => {
  const [roomName, setRoomName] = useState("");
  const [identity, setIdentity] = useState("");
  const [room, setRoom] = useState(null);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const videoContainerRef = useRef(null);

  const audioRecorders = useRef(new Map());

  const joinRoom = async () => {
    setError(null);
    setRemoteParticipants([]);

    try {
      const response = await fetch("https://1262-106-222-238-176.ngrok-free.app/generate-token/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_name: roomName, identity }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate token");
      }

      const { token } = await response.json();

      const roomInstance = await Video.connect(token, {
        name: roomName,
        audio: true,
        video: { width: 640, height: 480 },
      });

      setRoom(roomInstance);
      setLocalParticipant(roomInstance.localParticipant);

      const localTracks = Array.from(
        roomInstance.localParticipant.tracks.values()
      )
        .map((publication) => publication.track)
        .filter((track) => track !== null);

      localTracks.forEach((track) => {
        if (videoContainerRef.current) {
          videoContainerRef.current.appendChild(track.attach());
        }
      });

      roomInstance.participants.forEach(handleParticipant);
      roomInstance.on("participantConnected", handleParticipant);
      roomInstance.on("participantDisconnected", handleParticipantDisconnected);

      const webSocket = new WebSocket(WS_URL);
      webSocket.onopen = () => console.log("WebSocket connected");
      webSocket.onclose = () => console.log("WebSocket closed");
      webSocket.onerror = (err) => console.error("WebSocket error:", err);

      setSocket(webSocket);
    } catch (err) {
      console.error("Error joining room:", err);
      setError(err.message);
    }
  };

  const handleParticipant = (participant) => {
    setRemoteParticipants((prev) => {
      if (!prev.includes(participant)) {
        return [...prev, participant];
      }
      return prev;
    });

    participant.on("trackSubscribed", (track) => {
      if (track.kind === "audio") {
        const recorder = sendAudioToWebSocket(track, participant.identity);
        audioRecorders.current.set(participant.identity, recorder);
      }

      if (videoContainerRef.current) {
        videoContainerRef.current.appendChild(track.attach());
      }
    });

    participant.on("trackUnsubscribed", (track) => {
      if (track.kind === "audio") {
        const recorder = audioRecorders.current.get(participant.identity);
        if (recorder) {
          recorder.stop();
          audioRecorders.current.delete(participant.identity);
        }
      }
    });
  };

  const sendAudioToWebSocket = (audioTrack, participantId) => {
    const mediaStream = new MediaStream();
    mediaStream.addTrack(audioTrack.mediaStreamTrack);

    const options = { mimeType: "audio/webm" };
    const mediaRecorder = new MediaRecorder(mediaStream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && socket?.readyState === WebSocket.OPEN) {
        socket.send(event.data);
        console.log(`Sent audio data for ${participantId}`);
      }
    };

    mediaRecorder.onerror = (error) => {
      console.error(`Error in MediaRecorder for ${participantId}:`, error);
    };

    mediaRecorder.start(1000);
    return mediaRecorder;
  };

  const handleParticipantDisconnected = (participant) => {
    setRemoteParticipants((prev) =>
      prev.filter((p) => p !== participant)
    );

    const recorder = audioRecorders.current.get(participant.identity);
    if (recorder) {
      recorder.stop();
      audioRecorders.current.delete(participant.identity);
    }
  };

  const leaveRoom = () => {
    if (room) {
      room.disconnect();
      setRoom(null);
      setLocalParticipant(null);
      setRemoteParticipants([]);

      if (videoContainerRef.current) {
        videoContainerRef.current.innerHTML = "";
      }

      audioRecorders.current.forEach((recorder) => recorder.stop());
      audioRecorders.current.clear();

      if (socket?.readyState === WebSocket.OPEN) {
        socket.close();
        setSocket(null);
      }
    }
  };

  return (
    <div className="video-call-container">
      <h1>Twilio Video Call</h1>

      {error && (
        <div className="error-message" style={{ color: "red" }}>
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
          <button onClick={joinRoom} disabled={!roomName || !identity}>
            Join Room
          </button>
        ) : (
          <button onClick={leaveRoom}>Leave Room</button>
        )}
      </div>

      <div
        ref={videoContainerRef}
        className="video-container"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "10px",
          marginTop: "20px",
          width: "100%",
          maxWidth: "800px",
          margin: "0 auto",
        }}
      ></div>

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
