# Username rename behavior

The `/api/user/change-username` handler now updates only the authenticated account's references:

- its entries in room membership lists;
- `createdBy` metadata for rooms it created;
- its own historical `senderUsername` message labels;
- private-room lookup keys, which continue to be based on member usernames.

It intentionally does **not** change `room.name`. Room names are independent room metadata and remain stable when a member renames their account. The backend emits `rooms:updated` for affected current members so their room lists refresh.
