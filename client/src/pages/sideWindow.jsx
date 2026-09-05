import { useState, useRef, useEffect, useCallback } from "react";
import { FaRegEdit } from "react-icons/fa";
import { MdOutlineCreate } from "react-icons/md";
export default function SideWindow({
  onSelectRoom,
  onRoomCreated,
  username,
  activeRoom,
  rooms = [],
  onChangeUsername,
}) {
  console.log(rooms);
  const [creating, setCreating] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState("");

  const createRoom = async () => {
    // setCreating(true);
    name = roomName.trim();
    if (!name) {
      return setError("name is required");
      // setCreating(false);
    }
    try {
      const res = await fetch("http://localhost:3000/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name }),
      });

      const result = await res.json();
      if (!res.ok) {
        return setError("failed to create room");
      }
      onRoomCreated(result);
      setRoomName("");
      setCreating(false);
      setError("");
    } catch (err) {
      console.log(err);
      setError("Failed to create Room please try again!!");
    }
  };

  return (
    <>
      <div className="flex">
      <div className="m-2 shadow-xl">
        <button
          className="w-full p-2 bg-blue-600 rounded-xl hover:bg-blue-400 text-white text-center"
          onClick={() => {
            setCreating((v) => !v);
          }}>
          <MdOutlineCreate />
        </button>
      </div>
      <div className=" mr-10 m-3 flex-1 border-none shadow-xl rouned-xl flex justify-center items-center text-white">
        <span className="font-bold text-md">ROOMS</span>
      </div>
      </div>
      {creating && (
        <div className="m-3 border-none shadow-xl bg-indigo-950 rouned-xl flex flex-col justify-center items-center text-white rounded-xl">
          <input
            autoFocus
            className=" m-1 w-full p-2 text-white outline-none border-none rounded-xl"
            onKeyDown={(e) => {
              (e.key == "Enter")&& createRoom
            }} 
            onChange={(e) => {
              setRoomName(e.target.value);
              setError("");
            }}
          />
          <button
            className="p-2 rounded-xl rouneded-xl m-2 text-center bg-blue-600 hover:bg-blue-400 border-none shadow-xl" 
            onClick={createRoom}>
            Create
          </button>
          {error && <p className="text-red-400 text-md">{error}</p>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:w-2
    [&::-webkit-scrollbar-track]:bg-gray-900
    [&::-webkit-scrollbar-thumb]:bg-gray-600
    [&::-webkit-scrollbar-thumb]:rounded-full">
        {rooms.length === 0 && (
          <p className="text-white font-bold text-xl text-center mt-8">
            No room created Create one!?
          </p>
        )}
        {rooms.map((room) => (
          <button
            key={room._id}
            onClick={() => {
              console.log("👆 Clicked room:", room.name);
              onSelectRoom(room);
            }}
            className={`w-full flex items-center rounded-xl gap-2 p-3 text-sm text-white font-bold 
              ${
                activeRoom?._id === room?._id
                  ? "bg-blue-700 shadow-md"
                  : "hover:bg-indigo-950"
              }`}>
            <span className="text-white">#</span>
            <span className="m-2 text-white text-md ">{room.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 p-2 w-full rounded-xl bg-gray-900 flex items-center text-white">
        <span className="p-3 w-8 h-8 rounded-full border-1 border-gray-600 bg-black flex justify-center items-center font-bold">
          {username[0]?.toUpperCase()}
        </span>
        <span className="flex-1 m-2">{username}</span>
        <button
          onClick={() => {
            onChangeUsername;
          }}
          title="change Username"
          className="text-white hover:bg-indigo-950 m-2 p-2 rounded-lg">
          <FaRegEdit /> 
        </button>
      </div>
    </>
  );
}
