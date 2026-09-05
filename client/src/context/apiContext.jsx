import { createContext, useState } from "react";

export const apiContext = createContext();

// 1. Capitalized 'D' and removed 'async'
export const DataProvider = ({ children }) => {
  const [username, setUsername] = useState(
    () => sessionStorage.getItem("username") || "", // Lowercase 'u'
  );

  const handleSetUsername = (name) => {
    setUsername(name);
    sessionStorage.setItem("username", name); // Lowercase 'u' to match above
  };

  return (
    <apiContext.Provider
      value={{
        username,
        handleSetUsername,
      }}>
      {children}
    </apiContext.Provider>
  );
};
