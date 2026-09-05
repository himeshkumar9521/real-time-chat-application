import { useState, useRef, useEffect, useCallback } from "react";
import SideWindow from "./sideWindow";
import { IoSend } from "react-icons/io5";
export default function Chat({
  rooms = [],
  activeRoom,
  username,
  socket,
  room,
  onSelectRoom,
  onRoomCreated,
  onChangeRoom,
}) {
  const [message, setMessage] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [input, setInput] = useState("");
  const [onlineUsers, SetOnlineUsers] = useState([]);
  const bottomRef = useRef(null);
  const isTyping = useRef(false);

  useEffect(() => {
    if (!room) {
      setMessage([]);
      setTypingUsers([]);
      SetOnlineUsers([]);
    }
  }, [room?._id]);

  useEffect(() => {
    if (!room || !socket) {
      return;
    }
    socket.emit("room:join", { roomId: room._id, Username: username });
    const onMessage = (msg) => {
      if (msg.roomId !== room._id) {
        return;
      }
      setMessage((prev) => [...(prev || []), msg]);
      setTypingUsers((prev) => {
        (prev || []).filter((u) => u !== msg.SenderUsername);
      });
    };
    const onUsers = (users) => {
      SetOnlineUsers(users);
    };
    const onTyping = ({ username: u, isTyping: t }) => {
      setTypingUsers((prev) => {
        const currTypings = prev || [];
        t
          ? currTypings.includes(u)
            ? currTypings
            : [...currTypings, u]
          : currTypings.filter((x) => x !== u);
      });
    };

    socket.on("room:history", (msg) => {
      console.log("history", msg);
      setMessage(msg || []);
    });
    socket.on("message:new", onMessage);
    socket.on("room:users", onUsers);
    socket.on("typing:update", onTyping);

    return () => {
      socket.emit("room:leave", {
        roomId: room._id,
        Username: username,
      });
      socket.off("room:history", (msg) => {
        setMessage(msg);
      });
      socket.off("message:new", onMessage);
      socket.off("room:users", onUsers);
      socket.off("typing:update", onTyping);
    };
  }, [socket, room?._id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [message, typingUsers]);

  const stopTyping = useCallback(() => {
    if (isTyping.current && socket && room) {
      socket.emit("typing:stop", { roomId: room._id });
      isTyping.current = false;
    }
  }, [socket, room]);

  const handleInput = (e) => {
    console.log("Typing detected:", e.target.value);
    setInput(e.target.value);
    if (!socket || !room) return;
    if (!isTyping.current) {
      socket.emit("typing:start", { roomId: room._id });
      isTyping.current = true;
    }
    // clearTimeout(typingTimer.current);
    // typingTimer.current = setTimeout(stopTyping, 2000);
  };

  // const sendMessage = useCallback(() => {
  //   const text = input.trim();
  //   console.log("1. Button clicked, message is:", text);
  //   if (!text || !socket || !room) return;
  //   socket.emit("message:send", { roomId: room._id, content: text });
  //   setInput("");
  //   stopTyping();
  // }, [input, socket, room, stopTyping]);

  const sendMessage = useCallback(() => {
    const text = input.trim();

    // 🚨 DIAGNOSTIC LOG 🚨
    console.log("Trying to send:", {
      text: text,
      hasSocket: !!socket,
      hasRoom: !!room,
      roomId: room?._id,
    });

    if (!text || !socket || !room) {
      console.log("❌ Blocked from sending! Something is missing.");
      return;
    }

    console.log("✅ All good, emitting to server!");
    socket.emit("message:send", {
      roomId: room._id,
      content: text,
      username: username,
    });
    setInput("");
    stopTyping();
  }, [input, socket, room, stopTyping]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const grouped = groupMessages(message, username);

  function groupMessages(msg, me) {
    const groups = [];
    for (const Pmassage of msg) {
      const last = groups.at(-1);
      const gap = last
        ? new Date(Pmassage.createdAt) -
          new Date(last.messages.at(-1).createdAt)
        : Infinity;

      if (
        last &&
        last.senderUsername === Pmassage.senderUsername &&
        gap < 60_000
      ) {
        last.messages.push(Pmassage);
      } else {
        groups.push({
          senderUsername: Pmassage.senderUsername,
          isMe: Pmassage.senderUsername === me,
          messages: [Pmassage],
        });
      }
    }
    return groups;
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex justify-evenly items-center w-screen h-screen p-7 ">
      <div className="h-full w-[250px] mr-4 bg-gray-950 border-2 border-gray-800 rounded-2xl shadow-xl p-2 flex flex-col ">
        <SideWindow
          onSelectRoom={onSelectRoom}
          onRoomCreated={onRoomCreated}
          onChangeRoom={onChangeRoom}
          username={username}
          activeRoom={activeRoom}
          rooms={rooms}
        />
      </div>
      <div className="h-full  flex flex-col flex-1 bg-gray-950 border-2 border-gray-800 rounded-2xl shadow-xl p-2 overflow-hidden">
        {!room ? (
          <main className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center justify-center gap-4 text-[#72728a]">
              <svg width="64" height="64" viewBox="0 0 40 40" fill="none">
                <rect
                  width="40"
                  height="40"
                  rx="12"
                  fill="#6366f1"
                  opacity="0.15"
                />
                <path
                  d="M8 14C8 11.8 9.8 10 12 10H28C30.2 10 32 11.8 32 14V24C32 26.2 30.2 28 28 28H22L16 32V28H12C9.8 28 8 26.2 8 24V14Z"
                  fill="#6366f1"
                  opacity="0.5"
                />
              </svg>
              <h2 className="text-xl font-bold text-white">Select a room</h2>
              <p className="text-sm">
                Pick a room from the left to start chatting
              </p>
            </div>
          </main>
        ) : (
          <main className="flex-1 flex flex-col bg-[#0d0d12] overflow-hidden rounded-xl ">
            <header className="flex items-center justify-between px-6 py-4 border-b border-[#28283a] bg-[#16161e]/80 backdrop-blur-sm flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-[#28283a] px-3 py-1 rounded-lg text-[#72728a] font-bold">
                  #
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {room.name}
                  </h2>
                  <p className="text-[10px] text-green-400 font-medium tracking-wide uppercase">
                    {onlineUsers?.length-1 || 0} Online
                  </p>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4 [&::-webkit-scrollbar]:w-2
    [&::-webkit-scrollbar-track]:bg-gray-900
    [&::-webkit-scrollbar-thumb]:bg-gray-600
    [&::-webkit-scrollbar-thumb]:rounded-full">
              {grouped.map((group, gi) => (
                <div
                  key={gi}
                  className={`flex flex-col ${group.isMe ? "items-end" : "items-start"}`}>
                  {!group.isMe && (
                    <span className="text-[10px] font-bold text-[#72728a] ml-1 mb-1.5">
                      {group.senderUsername}
                    </span>
                  )}
                  <div className="flex flex-col gap-1">
                    {group.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`px-4 py-2.5 max-w-[320px] text-[14px] leading-relaxed shadow-sm ${group.isMe ? "bg-indigo-600 text-white rounded-2xl rounded-tr-sm break-words text-right" : "bg-[#1c1c27] text-gray-200 rounded-2xl rounded-tl-sm border border-[#28283a] break-words"}`}>
                        {msg.content}
                      </div>
                    ))}
                  </div>
                  <span className="text-[9px] text-[#b2b2ce] mt-1 px-1">
                    {fmtTime(group.messages.at(-1).createdAt)}
                  </span>
                </div>
              ))}
              {typingUsers?.length > 0 && (
                <div className="text-[#72728a] text-xs py-1 italic">
                  {typingUsers.join(", ")}{" "}
                  {typingUsers.length === 1 ? "is" : "are"} typing...
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 bg-[#0d0d12]">
              <div className="relative flex items-end gap-2 bg-[#16161e] border border-[#28283a] rounded-2xl p-1 shadow-2xl">
                <textarea
                  rows={1}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message #${room.name}...`}
                  className="flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-[#4a4a6a] outline-none resize-none max-h-32"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  className="mb-1 bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-500 disabled:bg-[#28283a] disabled:text-[#4a4a6a] transition-all">
                  <IoSend />
                </button>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
