import { useState } from "react";

export default function Welcome({ onSubmit }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");

  const Handler = (e) => {
    e.preventDefault();

    const name = value.trim();
    if (!name) {
      return setErr("userName is required");
    }
    if (name < 2) {
      return setErr("userName must contain atleast 2 letters");
    }
    if (name > 20) {
      return setErr("userName must contain atMost 20 letters");
    }

    onSubmit(name);
  };

  return (
    <div className="w-screen h-screen text-white flex justify-center items-center">
      <div className="bg-gray-900 rounded-3xl shadow-xl p-5 w-[340px]">
        <h1 className="font-bold lg:text-2xl mg:text-xl m-4">
          Friends Are Just a Msg. Away.
        </h1>
        <form className="m-4" onSubmit={Handler}>
          <label className="text-lg font-semibold">Username :-</label>
          <br></br>
          <input
            onChange={(e) => {
              setValue(e.target.value);
              setErr("");
            }}
            type="text"
            autoFocus
            className="p-1 border-2 border-white rounded-xl"></input>
          <div className="p-2 flex justify-center items-center">
            <button
              type="submit"
              className="m-2 p-3 bg-blue-700 text-md rounded-md border-none">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
