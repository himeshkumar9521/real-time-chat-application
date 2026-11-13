import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiMessageCircle,
  FiPlus,
  FiSearch,
  FiUsers,
  FiHash,
  FiSend,
  FiLogOut,
  FiSettings,
  FiUserPlus,
  FiMenu,
  FiX,
  FiMessageSquare,
  FiEdit2,
  FiTrash2,
} from "react-icons/fi";

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose}>
            <FiX />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
const initials = (name = "U") => name.slice(0, 2).toUpperCase();
const roomTitle = (room, username) =>
  room?.type === "private"
    ? (room.members || []).find(
        (member) => member.toLowerCase() !== String(username).toLowerCase(),
      ) || room.name
    : room?.name || "Conversation";
const clock = (date) => {
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function ChatWorkspace({
  session,
  rooms,
  activeRoom,
  setActiveRoom,
  socket,
  onlineUsers,
  setOnlineUsers,
  onCreateGroup,
  onCreatePrivate,
  onSignOut,
  onChangeUsername,
  onDeleteAccount,
  onRemoveRoom,
  busy,
}) {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState("");
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [newName, setNewName] = useState(session.username);
  const [modalError, setModalError] = useState("");
  const [sending, setSending] = useState(false);
  const [roomActionBusy, setRoomActionBusy] = useState(false);
  const [roomActionError, setRoomActionError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const bottomRef = useRef(null);
  const typingRef = useRef(false);

  useEffect(() => {
    setNewName(session.username || "");
  }, [session.username]);
  useEffect(() => {
    setRoomActionError("");
  }, [activeRoom?._id]);
  const filtered = useMemo(
    () =>
      rooms.filter((room) => {
        const searchText =
          `${roomTitle(room, session.username)} ${room.name || ""}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      }),
    [rooms, query, session.username],
  );
  const roomOnline = Array.isArray(onlineUsers) ? onlineUsers : [];

  useEffect(() => {
    if (!socket || !activeRoom?._id) {
      setMessages([]);
      setTyping([]);
      setOnlineUsers([]);
      return;
    }
    setMessages([]);
    setTyping([]);
    const onHistory = (history) =>
      setMessages(Array.isArray(history) ? history : []);
    const onMessage = (message) => {
      if (String(message.roomId) === String(activeRoom._id))
        setMessages((prev) => [...prev, message]);
    };
    const onUsers = (users) =>
      setOnlineUsers(Array.isArray(users) ? users : []);
    const onTyping = ({ username, isTyping }) =>
      setTyping((prev) =>
        isTyping
          ? prev.includes(username)
            ? prev
            : [...prev, username]
          : prev.filter((x) => x !== username),
      );
    socket.emit("room:join", { roomId: activeRoom._id });
    socket.on("room:history", onHistory);
    socket.on("message:new", onMessage);
    socket.on("room:users", onUsers);
    socket.on("typing:update", onTyping);
    return () => {
      socket.emit("room:leave", { roomId: activeRoom._id });
      socket.off("room:history", onHistory);
      socket.off("message:new", onMessage);
      socket.off("room:users", onUsers);
      socket.off("typing:update", onTyping);
    };
  }, [socket, activeRoom?._id, setOnlineUsers]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);
  useEffect(() => {
    if (!socket || !activeRoom) return;
    const timer = setTimeout(() => {
      if (typingRef.current) {
        socket.emit("typing:stop", { roomId: activeRoom._id });
        typingRef.current = false;
      }
    }, 1300);
    return () => clearTimeout(timer);
  }, [draft, socket, activeRoom]);

  const send = (e) => {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || !socket || !activeRoom || sending) return;
    setSending(true);
    socket.emit("message:send", { roomId: activeRoom._id, content });
    setDraft("");
    if (typingRef.current) {
      socket.emit("typing:stop", { roomId: activeRoom._id });
      typingRef.current = false;
    }
    setSending(false);
  };
  const handleDraft = (e) => {
    setDraft(e.target.value);
    if (e.target.value.trim() && socket && activeRoom && !typingRef.current) {
      socket.emit("typing:start", { roomId: activeRoom._id });
      typingRef.current = true;
    }
  };
  const runModal = async (fn) => {
    setModalError("");
    try {
      await fn();
      setModal("");
      setGroupName("");
      setMembers("");
      setTargetUser("");
    } catch (e) {
      setModalError(e.message);
    }
  };
  const handleRoomAction = async () => {
    if (!activeRoom || activeRoom.type === "general" || roomActionBusy) return;
    const isPrivate = activeRoom.type === "private";
    const confirmation = isPrivate
      ? "Delete this private conversation for everyone in it? This cannot be undone."
      : "Leave this group? If two members remain, their room will become a private conversation.";
    if (!window.confirm(confirmation)) return;
    setRoomActionBusy(true);
    setRoomActionError("");
    try {
      await onRemoveRoom(activeRoom);
    } catch (error) {
      setRoomActionError(error.message || "Could not update this room");
    } finally {
      setRoomActionBusy(false);
    }
  };

  return (
    <div className="workspace">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-icon">
              <FiMessageCircle />
            </span>
            <span>chatter</span>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileOpen(false)}>
            <FiX />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-dot" />
          <span>PERSONAL WORKSPACE</span>
        </div>
        <button
          className="new-chat-button"
          onClick={() => {
            setModal("private");
            setMobileOpen(false);
          }}>
          <FiPlus /> New conversation
        </button>
        <div className="side-section">
          <div className="section-heading">
            <span>YOUR ROOMS</span>
            <button
              className="icon-button small"
              title="Create group"
              onClick={() => setModal("group")}>
              <FiPlus />
            </button>
          </div>
          <div className="room-list">
            {filtered.map((room) => (
              <button
                key={room._id}
                className={`room-item ${activeRoom?._id === room._id ? "active" : ""}`}
                onClick={() => {
                  setActiveRoom(room);
                  setMobileOpen(false);
                }}>
                <span className="room-symbol">
                  {room.type === "general" ? <FiHash /> : <FiUsers />}
                </span>
                <span className="room-name">
                  {roomTitle(room, session.username)}
                </span>
                {activeRoom?._id === room._id && (
                  <span className="active-dot" />
                )}
              </button>
            ))}
            {!filtered.length && (
              <p className="empty-side">
                {busy ? "Loading rooms…" : "No rooms found."}
              </p>
            )}
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="profile-row">
            <div className="avatar">{initials(session.username)}</div>
            <div className="profile-copy">
              <strong>{session.username}</strong>
              <span>Available</span>
            </div>
            <button
              className="icon-button"
              title="Account settings"
              onClick={() => setModal("settings")}>
              <FiSettings />
            </button>
          </div>
          <button className="logout-button" onClick={onSignOut}>
            <FiLogOut /> Sign out
          </button>
        </div>
      </aside>
      <main className="chat-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileOpen(true)}>
            <FiMenu />
          </button>
          <div className="topbar-title">
            <span className="topbar-mark">
              <FiMessageCircle />
            </span>
            <div>
              <strong>Messages</strong>
              <small>Your conversations in one place</small>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <FiSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search rooms"
              />
            </div>
            <div className="top-avatar">{initials(session.username)}</div>
          </div>
        </header>
        {!activeRoom ? (
          <div className="welcome-state">
            <div className="welcome-art">
              <div className="art-circle">
                <FiMessageCircle />
              </div>
              <span className="art-dot dot-one" />
              <span className="art-dot dot-two" />
            </div>
            <div className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</div>
            <h1>
              Make room for
              <br />
              <em>good conversations.</em>
            </h1>
            <p>
              Choose a room from the sidebar or start a new conversation to get
              things moving.
            </p>
            <div className="welcome-actions">
              <button
                className="primary-button"
                onClick={() => setModal("private")}>
                <FiUserPlus /> Start a conversation
              </button>
              <button
                className="secondary-button"
                onClick={() => setModal("group")}>
                <FiPlus /> Create a group
              </button>
            </div>
          </div>
        ) : (
          <section className="conversation">
            <div className="conversation-head">
              <div className="conversation-info">
                <div className="room-avatar">
                  {activeRoom.type === "general" ? <FiHash /> : <FiUsers />}
                </div>
                <div>
                  <h2>{roomTitle(activeRoom, session.username)}</h2>
                  <p>
                    <span className="status-dot" />
                    {activeRoom.type === "general"
                      ? "Everyone can join"
                      : `${roomOnline.length} online`}
                  </p>
                </div>
              </div>
              <div className="conversation-tools">
                <span className="secure-label">
                  <span /> Live chat
                </span>
                {activeRoom.type !== "general" && (
                  <button
                    type="button"
                    className="room-action-button"
                    onClick={handleRoomAction}
                    disabled={roomActionBusy}
                    title={
                      activeRoom.type === "private"
                        ? "Delete conversation"
                        : "Leave group"
                    }>
                    {activeRoom.type === "private" ? (
                      <FiTrash2 />
                    ) : (
                      <FiLogOut />
                    )}
                    <span>
                      {roomActionBusy
                        ? "Working…"
                        : activeRoom.type === "private"
                          ? "Delete conversation"
                          : "Leave group"}
                    </span>
                  </button>
                )}
              </div>
            </div>
            {roomActionError && (
              <div className="room-action-error" role="alert">
                {roomActionError}
              </div>
            )}
            <div className="message-area">
              <div className="day-divider">
                <span>YOUR CONVERSATION</span>
              </div>
              {messages.length === 0 && (
                <div className="message-empty">
                  <div className="empty-icon">
                    <FiMessageSquare />
                  </div>
                  <strong>This is the beginning</strong>
                  <p>Send a message to get the conversation started.</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const mine =
                  msg.senderUsername?.toLowerCase() ===
                  session.username.toLowerCase();
                const previous = messages[i - 1];
                const showName =
                  !mine &&
                  (!previous || previous.senderUsername !== msg.senderUsername);
                return (
                  <div
                    className={`message-row ${mine ? "mine" : ""}`}
                    key={msg.id || msg._id || `${msg.createdAt}-${i}`}>
                    {!mine && (
                      <div className="message-avatar">
                        {initials(msg.senderUsername || "?")}
                      </div>
                    )}
                    <div className="message-content">
                      {showName && (
                        <div className="sender-name">{msg.senderUsername}</div>
                      )}
                      <div className="message-bubble">{msg.content}</div>
                      <span className="message-time">
                        {clock(msg.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {typing.filter(
                (x) => x.toLowerCase() !== session.username.toLowerCase(),
              ).length > 0 && (
                <div className="typing-line">
                  <span className="typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {typing
                    .filter(
                      (x) => x.toLowerCase() !== session.username.toLowerCase(),
                    )
                    .join(", ")}{" "}
                  typing
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <form className="composer" onSubmit={send}>
              <div className="composer-box">
                <textarea
                  rows="1"
                  maxLength="5000"
                  value={draft}
                  onChange={handleDraft}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={`Message ${activeRoom.type === "general" ? "everyone" : roomTitle(activeRoom, session.username)}…`}
                />
                <div className="composer-bottom">
                  <span>Enter to send · Shift + Enter for new line</span>
                  <button
                    className="send-button"
                    type="submit"
                    disabled={!draft.trim()}>
                    <FiSend /> <span>Send</span>
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}
      </main>
      {modal === "group" && (
        <Modal
          title="Create a group"
          onClose={() => {
            setModal("");
            setModalError("");
          }}>
          <form
            className="modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              runModal(() =>
                onCreateGroup(
                  groupName.trim(),
                  members
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                ),
              );
            }}>
            <label>
              Group name
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. DesignTeam"
                pattern="[A-Za-z]{1,100}"
                required
              />
              <small>Letters only, no spaces or symbols.</small>
            </label>
            <label>
              Members
              <input
                value={members}
                onChange={(e) => setMembers(e.target.value)}
                placeholder="Alex, Sam"
              />
              <small>
                Enter existing usernames separated by commas. You are added
                automatically. Groups need at least 3 members including you.
              </small>
            </label>
            {modalError && <div className="form-alert error">{modalError}</div>}
            <button className="primary-button full">Create group</button>
          </form>
        </Modal>
      )}
      {modal === "private" && (
        <Modal
          title="Start a conversation"
          onClose={() => {
            setModal("");
            setModalError("");
          }}>
          <form
            className="modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                targetUser.trim().toLowerCase() ===
                session.username.toLowerCase()
              ) {
                setModalError("Enter another person's username, not your own.");
                return;
              }
              runModal(() => onCreatePrivate(targetUser.trim()));
            }}>
            <label>
              Username
              <input
                value={targetUser}
                onChange={(e) => setTargetUser(e.target.value)}
                placeholder="Enter an existing username"
                pattern="[A-Za-z]{2,30}"
                required
              />
              <small>
                Signed in as <strong>{session.username}</strong>. Enter a
                different member's exact username.
              </small>
            </label>
            {modalError && <div className="form-alert error">{modalError}</div>}
            <button className="primary-button full">Open conversation</button>
          </form>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          title="Account settings"
          onClose={() => {
            setModal("");
            setModalError("");
          }}>
          <div className="settings-form">
            <label>
              Change username
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                pattern="[A-Za-z]{2,30}"
                minLength="2"
                maxLength="30"
              />
            </label>
            <button
              className="primary-button full"
              onClick={() => runModal(() => onChangeUsername(newName.trim()))}>
              <FiEdit2 /> Save username
            </button>
            <div className="danger-zone">
              <strong>Delete account</strong>
              <p>
                This permanently deletes your account. This action cannot be
                undone.
              </p>
              <button
                className="danger-button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Permanently delete your account? This cannot be undone.",
                    )
                  )
                    runModal(onDeleteAccount);
                }}>
                <FiTrash2 /> Delete account
              </button>
            </div>
            {modalError && <div className="form-alert error">{modalError}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
