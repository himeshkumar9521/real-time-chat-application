import "./App.css";
import Welcome from "./pages/welcome";
import Chat from "./pages/chatPage";
import { io } from "socket.io-client";
import { useState, useEffect, useContext } from "react";
import { apiContext } from "./context/apiContext";

function App() {
  const { username, handleSetUsername } = useContext(apiContext);
  const [socket, setSocket] = useState(null);
  const [activeRoom, setActiveRoom] = useState(null); // Changed to lowercase 'a'
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState([]);

  // Moved your rooms fetch here since setRooms is in this file
  useEffect(() => {
    console.log("Fetching rooms from backend...");
    fetch("http://localhost:3000/api/rooms")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        console.log("Backend responded with:", data);
        setRooms(list);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []); // Run once on mount

  useEffect(() => {
    if (!username) {
      return;
    }
    const s = io("http://localhost:3000", {
      transports: ["polling", "websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    s.on("connect", () => {
      setConnected(true);
    });
    s.on("disconnect", () => {
      setConnected(false);
    });
    s.on("connect_error", (e) => {
      console.log("socket Errror", e.message);
    });

    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, [username]);

  const handleSelectRoom = (room) => {
    const s = socket;
    if (!s || activeRoom?._id === room._id) {
      return;
    }
    setActiveRoom(room);
    s.emit("room:join", { roomId: room._id, username });
  };

  const handleRoomCreated = (room) => {
    setRooms((prev) =>
      prev.find((r) => r._id === room._id) ? prev : [...prev, room],
    );
    handleSelectRoom(room);
  };

  if (!username) return <Welcome onSubmit={handleSetUsername} />;

  return (
    <div>
      {!connected && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black text-center text-sm font-semibold py-1.5">
          Connecting to server…
        </div>
      )}
      <Chat
        rooms={rooms}
        activeRoom={activeRoom}
        username={username}
        onSelectRoom={handleSelectRoom}
        onRoomCreated={handleRoomCreated}
        onChangeUsername={() => {
          sessionStorage.removeItem("username");
          handleSetUsername(""); // Fixed: use handleSetUsername instead of setUsername
          setRooms([]);
          setActiveRoom(null);
        }}
        room={activeRoom}
        socket={socket}
      />
    </div>
  );
}

export default App;
