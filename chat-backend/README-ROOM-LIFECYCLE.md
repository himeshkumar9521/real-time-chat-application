# Room lifecycle and identity rules

- Every request/socket acts as the account in the **Bearer token of that tab**. The shared cookie is only a fallback, and the frontend keeps its token in `sessionStorage` (per tab), so logging in as another user in another tab can no longer make this tab act as them.
- Sockets re-read the account's current username on every join/send, so renames never cause messages to be attributed to the wrong name.
- `private`: any member can delete it; it is removed for both people.
- `group`: needs at least 3 members. If a member leaves and fewer than 3 would remain, the group is deleted for everyone (no conversion to private).
- Leaving a group also removes your live sockets from the room channel (no more messages/typing events).
- Deleting an account deletes its private chats, leaves all groups (small groups are deleted), relabels its old messages "Deleted user" and disconnects its sockets, so a new user re-using the name inherits nothing.
- The reserved name "General" cannot be used for groups.
- On startup the server repairs old data: unknown members are dropped, groups under 3 members and private rooms without exactly 2 members are removed.
