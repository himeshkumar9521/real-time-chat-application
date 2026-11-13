import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, getToken, socketUrl } from "./api";
import AuthScreen from "./components/AuthScreen";
import ChatWorkspace from "./components/ChatWorkspace";
import { FiMessageCircle } from "react-icons/fi";

export default function App() {
  const [session, setSession] = useState(() => {
    const raw = sessionStorage.getItem("chat_user");
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(getToken);
  const [socket, setSocket] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const signIn = useCallback((data) => {
    const user = data.user;
    if (data.jwtToken) sessionStorage.setItem("chat_token", data.jwtToken);
    sessionStorage.setItem("chat_user", JSON.stringify(user));
    setToken(data.jwtToken || getToken());
    setSession(user);
    setAuthReady(true);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/api/user/logout", { method: "POST" });
    } catch {
      /* clear local session even if offline */
    }
    sessionStorage.removeItem("chat_token");
    sessionStorage.removeItem("chat_user");
    setToken("");
    setSession(null);
    setRooms([]);
    setActiveRoom(null);
    setOnlineUsers([]);
    if (socket) socket.disconnect();
    setSocket(null);
  }, [socket]);

  useEffect(() => {
    let cancelled = false;
    if (!session || !token) {
      setAuthReady(true);
      return () => {
        cancelled = true;
      };
    }
    setAuthReady(false);
    api("/api/user/me")
      .then((result) => {
        if (cancelled) return;
        const verifiedUser = result.user;
        sessionStorage.setItem("chat_user", JSON.stringify(verifiedUser));
        setSession(verifiedUser);
        setAuthReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        sessionStorage.removeItem("chat_token");
        sessionStorage.removeItem("chat_user");
        setToken("");
        setSession(null);
        setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!authReady || !session || !token) return;
    let cancelled = false;
    const loadRooms = async () => {
      setBusy(true);
      try {
        await api("/api/rooms/general", { method: "POST" });
        const list = await api("/api/rooms");
        if (!cancelled) {
          setRooms(Array.isArray(list) ? list : []);
          setActiveRoom((current) =>
            current ? list.find((r) => r._id === current._id) || null : null,
          );
        }
      } catch (error) {
        if (!cancelled) setNotice(error.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    loadRooms();
    return () => {
      cancelled = true;
    };
  }, [authReady, session, token]);

  useEffect(() => {
    if (!authReady || !session || !token) return;
    const client = io(socketUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
    });
    client.on("connect_error", (error) =>
      setNotice(error.message || "Could not connect to chat server"),
    );
    client.on("room:error", (error) =>
      setNotice(error?.message || "Room error"),
    );
    client.on("message:error", (error) =>
      setNotice(error?.message || "Message error"),
    );
    client.on("connect", () => setNotice(""));
    setSocket(client);
    return () => {
      client.disconnect();
      setSocket(null);
    };
  }, [authReady, session, token]);

  const refreshRooms = useCallback(async () => {
    const list = await api("/api/rooms");
    const nextRooms = Array.isArray(list) ? list : [];
    setRooms(nextRooms);
    setActiveRoom((current) =>
      current
        ? nextRooms.find((room) => String(room._id) === String(current._id)) ||
          null
        : null,
    );
    return nextRooms;
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleRoomsChanged = () => {
      refreshRooms().catch((error) => setNotice(error.message));
    };
    const handleRoomDeleted = () => setNotice("This conversation was deleted.");
    socket.on("rooms:updated", handleRoomsChanged);
    socket.on("rooms:removed", handleRoomsChanged);
    socket.on("room:deleted", handleRoomDeleted);
    return () => {
      socket.off("room:deleted", handleRoomDeleted);
      socket.off("rooms:updated", handleRoomsChanged);
      socket.off("rooms:removed", handleRoomsChanged);
    };
  }, [socket, refreshRooms]);

  const createGroup = async (name, members) => {
    const room = await api("/api/rooms/group", {
      method: "POST",
      body: JSON.stringify({ name, members }),
    });
    await refreshRooms();
    setActiveRoom(room);
    return room;
  };

  const createPrivate = async (username) => {
    const result = await api("/api/rooms/private", {
      method: "POST",
      body: JSON.stringify({ user2: username }),
    });
    const room = result.room || result;
    await refreshRooms();
    setActiveRoom(room);
    return room;
  };

  const removeRoom = async (room) => {
    const result = await api(`/api/rooms/${encodeURIComponent(room._id)}`, {
      method: "DELETE",
    });
    await refreshRooms();
    setNotice(
      result.message ||
        (room.type === "private"
          ? "Conversation deleted"
          : "You left the group"),
    );
    return result;
  };

  const changeUsername = async (newUsername) => {
    const result = await api("/api/user/change-username", {
      method: "POST",
      body: JSON.stringify({ newUsername }),
    });
    const updated = { ...session, username: result.username || newUsername };
    sessionStorage.setItem("chat_user", JSON.stringify(updated));
    setSession(updated);
    // Username changes also update membership labels returned by the API.
    // Refresh local room objects so private-room titles update only where
    // this account is the other participant; stored room names stay stable.
    await refreshRooms();
    return result;
  };

  const deleteAccount = async () => {
    await api("/api/user/deleteUser", { method: "POST" });
    sessionStorage.removeItem("chat_token");
    sessionStorage.removeItem("chat_user");
    setToken("");
    setSession(null);
    setRooms([]);
    setActiveRoom(null);
    if (socket) socket.disconnect();
  };

  if (!authReady) {
    return <div className="auth-loading">Loading your secure workspace…</div>;
  }
  if (!session || !token) {
    return <AuthScreen onAuthenticated={signIn} />;
  }

  return (
    <div className="app-shell">
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      <ChatWorkspace
        session={session}
        rooms={rooms}
        activeRoom={activeRoom}
        setActiveRoom={setActiveRoom}
        socket={socket}
        onlineUsers={onlineUsers}
        setOnlineUsers={setOnlineUsers}
        onCreateGroup={createGroup}
        onCreatePrivate={createPrivate}
        onSignOut={signOut}
        onChangeUsername={changeUsername}
        onDeleteAccount={deleteAccount}
        onRemoveRoom={removeRoom}
        busy={busy}
      />
    </div>
  );
}
